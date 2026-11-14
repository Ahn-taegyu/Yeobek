begin;

-- Drafts and history have separate cursor views so completed traffic cannot hide pending work.
create function public.list_outbox_page(p_limit integer default 50,p_before uuid default null,p_state text default 'draft')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare cursor_row public.outbound_messages%rowtype;
begin
    perform yeoback_private.require_operator();
    if p_limit is null or p_limit not between 1 and 100 or p_state is null
        or p_state not in ('all','draft','approved','sending','accepted','unknown','rejected','suppressed','failed') then
        raise exception 'Invalid outbox page' using errcode = '22023';
    end if;
    if p_before is not null then
        select * into cursor_row from public.outbound_messages where id = p_before;
        if not found then raise exception 'Outbox cursor not found' using errcode = 'P0002'; end if;
    end if;
    return (with page as (
        select m.*,row_number() over(order by m.created_at desc,m.id desc) rn
        from public.outbound_messages m join public.automation_events e on e.id = m.event_id
        where (p_state = 'all' or m.state = p_state)
            and (p_state <> 'draft' or (e.expires_at > statement_timestamp()
                and (e.exhibition_id is null or exists(select 1 from public.exhibitions x
                    where x.id = e.exhibition_id and x.owner_id = e.owner_id and x.deleted_at is null))))
            and (p_before is null or (m.created_at,m.id) < (cursor_row.created_at,cursor_row.id))
        order by m.created_at desc,m.id desc limit p_limit + 1
    ) select jsonb_build_object(
        'items',coalesce((select jsonb_agg(yeoback_private.outbox_json(m) order by p.rn)
            from page p join public.outbound_messages m on m.id = p.id where p.rn <= p_limit),'[]'),
        'nextCursor',case when exists(select 1 from page where rn > p_limit)
            then (select id from page where rn = p_limit) end));
end;
$$;

alter function public.decide_outbox(uuid,integer,boolean) set schema yeoback_private;
revoke all on function yeoback_private.decide_outbox(uuid,integer,boolean) from public,anon,authenticated,service_role;
create function public.decide_outbox(p_id uuid,p_expected_revision integer,p_approve boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.outbound_messages%rowtype;
begin
    perform yeoback_private.require_operator();
    select * into m from public.outbound_messages where id = p_id for update;
    if not found then raise exception 'Not found' using errcode = 'P0002'; end if;
    if p_approve and exists(select 1 from public.automation_events e where e.id = m.event_id
        and (e.expires_at <= clock_timestamp() or (e.exhibition_id is not null and not exists(
            select 1 from public.exhibitions x where x.id = e.exhibition_id and x.owner_id = e.owner_id and x.deleted_at is null)))) then
        raise exception 'Outbox review unavailable' using errcode = 'P1031';
    end if;
    return yeoback_private.decide_outbox(p_id,p_expected_revision,p_approve);
end;
$$;

-- Preserve the original policy/consent check and add current exhibition availability.
alter function yeoback_private.outbound_blocker(public.outbound_messages) rename to outbound_policy_blocker;
create function yeoback_private.outbound_blocker(m public.outbound_messages)
returns text language plpgsql set search_path = '' as $$
begin
    if exists(select 1 from public.automation_events e where e.id = m.event_id and e.exhibition_id is not null
        and not exists(select 1 from public.exhibitions x where x.id = e.exhibition_id
            and x.owner_id = e.owner_id and x.deleted_at is null)) then return 'TARGET_UNAVAILABLE'; end if;
    return yeoback_private.outbound_policy_blocker(m);
end;
$$;

revoke all on function public.list_outbox_page(integer,uuid,text),public.decide_outbox(uuid,integer,boolean),
    yeoback_private.outbound_blocker(public.outbound_messages) from public,anon,authenticated,service_role;
grant execute on function public.list_outbox_page(integer,uuid,text),public.decide_outbox(uuid,integer,boolean) to authenticated;
commit;
