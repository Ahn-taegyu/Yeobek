begin;

create or replace function yeoback_private.complete_automation_event(p_id uuid,p_attempt integer,p_state text,p_result_code text,p_outbound jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    e public.automation_events%rowtype;
    policy public.automation_policies%rowtype;
    outbound_state text;
    category text := p_outbound->>'category';
    channel text := p_outbound->>'channel';
    fingerprint bytea := sha256(convert_to(jsonb_build_array(p_state,p_result_code,p_outbound)::text,'UTF8'));
begin
    select * into e from public.automation_events where id = p_id for update;
    if not found then raise exception 'Not found' using errcode = 'P0002'; end if;
    if e.state <> 'running' and e.attempt = p_attempt and e.completion_fingerprint = fingerprint then
        return yeoback_private.automation_event_json(e);
    end if;
    if e.state <> 'running' or e.attempt is distinct from p_attempt or e.lease_until <= clock_timestamp() then
        raise exception 'Automation attempt is not active' using errcode = '40001';
    end if;
    if p_state is null or p_state not in ('processed','escalated','failed','suppressed') or p_result_code is null
        or (p_state = 'suppressed' and p_outbound is not null)
        or p_result_code !~ '^[A-Z][A-Z0-9_]{0,63}$' then
        raise exception 'Invalid automation result' using errcode = '22023';
    end if;
    select * into strict policy from public.automation_policies where kind = e.kind for share;
    if policy.mode = 'off' then
        p_state := 'suppressed';
        p_result_code := 'POLICY_OFF';
    elsif p_outbound is not null then
        -- For support, destinationId must come from a server-owned verified
        -- inbox record. The binding below authenticates the user, not the chat.
        if p_state <> 'processed' or e.owner_id is null or jsonb_typeof(p_outbound) is distinct from 'object'
            or p_outbound - array['category','channel','body','bindingScope','bindingId','destinationId'] <> '{}'
            or jsonb_typeof(p_outbound->'body') is distinct from 'string'
            or coalesce(channel,'') not in ('mail','support')
            or (channel = 'mail' and (e.kind not in ('notify','gap_digest')
                or coalesce(category,'') not in ('transactional','marketing')
                or p_outbound ?| array['bindingScope','bindingId','destinationId']))
            or (channel = 'support' and (e.kind <> 'support' or coalesce(category,'') not in ('usage','status')
                or not exists (select 1 from public.automation_bindings b where b.provider = 'channeltalk' and b.enabled
                    and b.owner_id = e.owner_id and b.provider_scope = p_outbound->>'bindingScope'
                    and b.external_id = p_outbound->>'bindingId'))) then
            raise exception 'Invalid automation outbox payload' using errcode = '22023';
        end if;
        outbound_state := case when policy.mode = 'auto' and category <> 'marketing'
            and category = any(policy.allowed_categories) then 'approved' else 'draft' end;
        insert into public.outbound_messages(event_id,owner_id,channel,category,body,binding_scope,binding_id,destination_id,
            state,policy_revision,mock)
        values(e.id,e.owner_id,channel,category,p_outbound->>'body',p_outbound->>'bindingScope',p_outbound->>'bindingId',
            p_outbound->>'destinationId',outbound_state,policy.revision,e.mock);
    end if;
    update public.automation_events set state = p_state,result_code = p_result_code,lease_until = null,completion_fingerprint = fingerprint
        where id = e.id returning * into e;
    return yeoback_private.automation_event_json(e);
end;
$$;

alter function yeoback_private.outbound_blocker(public.outbound_messages) rename to outbound_notification_base;
create function yeoback_private.outbound_blocker(m public.outbound_messages)
returns text language plpgsql set search_path = '' as $$
declare
    event_row public.automation_events%rowtype;
    signal public.automation_notify_signals%rowtype;
    exhibit public.exhibitions%rowtype;
    blocked text;
begin
    blocked := yeoback_private.outbound_notification_base(m);
    if blocked is not null then return blocked; end if;
    select * into strict event_row from public.automation_events where id = m.event_id;
    if event_row.exhibition_id is not null and not exists (
        select 1 from public.exhibitions where id = event_row.exhibition_id and owner_id = event_row.owner_id and deleted_at is null
    ) then return 'TARGET_CHANGED'; end if;
    if event_row.kind = 'notify' then
        select * into signal from public.automation_notify_signals where dedupe_key = event_row.dedupe_key;
        if found then
            select * into exhibit from public.exhibitions where id = signal.exhibition_id;
            if signal.expires_at <= clock_timestamp() or not coalesce(yeoback_private.notification_target_current(signal,exhibit),false) then
                return 'TARGET_CHANGED';
            end if;
        elsif event_row.dedupe_key ~ '^(exhibition_created|draft_ready|published):[0-9a-f-]{36}:[0-9]+$' then
            -- Runtime-originated notifications always require a source signal.
            return 'TARGET_CHANGED';
        end if;
    end if;
    return null;
end;
$$;
revoke all on function yeoback_private.outbound_blocker(public.outbound_messages)
    from public,anon,authenticated,service_role;

create function public.claim_notification_outbound(p_limit integer,p_mock boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    m public.outbound_messages%rowtype;
    claimed jsonb := '[]';
    blocked text;
begin
    if p_limit is null or p_limit not between 1 and 100 or p_mock is null then
        raise exception 'Invalid dispatch claim' using errcode = '22023';
    end if;
    for m in select o.* from public.outbound_messages o join public.automation_events e on e.id = o.event_id
        where e.kind = 'notify' and o.channel = 'mail' and o.mock = p_mock and (o.state = 'approved' or (o.state = 'sending' and o.lease_until <= statement_timestamp()))
        order by o.created_at,o.id limit p_limit for update of o skip locked
    loop
        if m.state = 'sending' then
            update public.outbound_messages set state = 'unknown',result_code = 'AMBIGUOUS_TRANSPORT',revision = revision + 1,
                lease_until = null where id = m.id;
        else
            blocked := yeoback_private.outbound_blocker(m);
            if blocked is not null then
                update public.outbound_messages set state = case when blocked = 'POLICY_CHANGED' then 'draft' else 'suppressed' end,
                    result_code = blocked,approved_by = null,approved_at = null,revision = revision + 1 where id = m.id;
            else
                update public.outbound_messages set state = 'sending',send_attempt = gen_random_uuid(),dispatch_checked_at = null,revision = revision + 1,
                    lease_until = statement_timestamp() + yeoback_private.policy_integer('automation_dispatch_lease_seconds') * interval '1 second' where id = m.id returning * into m;
                claimed := claimed || jsonb_build_array(jsonb_build_object('id',m.id,'attempt',m.send_attempt,'mock',m.mock));
            end if;
        end if;
    end loop;
    return claimed;
end;
$$;

revoke all on function public.claim_notification_outbound(integer,boolean) from public,anon,authenticated,service_role;
grant execute on function public.claim_notification_outbound(integer,boolean) to service_role;
commit;
