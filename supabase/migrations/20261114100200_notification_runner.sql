begin;
insert into public.app_policies(key,value) values
    ('automation_batch_signals',50),('automation_batch_events',3),('automation_batch_dispatch',5);
create table yeoback_private.notification_runner(
    mock boolean primary key,
    token uuid,
    lease_until timestamptz,
    mail_after timestamptz not null default '-infinity'
);
insert into yeoback_private.notification_runner(mock) values(false),(true);
revoke all on yeoback_private.notification_runner from public,anon,authenticated,service_role;

create function public.acquire_notification_run(p_token uuid,p_mock boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
    if p_token is null or p_mock is null then raise exception 'Invalid run' using errcode='22023'; end if;
    update yeoback_private.notification_runner set token=p_token,lease_until=clock_timestamp()+interval '120 seconds'
        where mock=p_mock and (lease_until is null or lease_until<=clock_timestamp());
    if not found then return null; end if;
    return jsonb_build_object('signals',least(100,yeoback_private.policy_integer('automation_batch_signals')),
        'events',least(100,yeoback_private.policy_integer('automation_batch_events')),
        'dispatch',least(100,yeoback_private.policy_integer('automation_batch_dispatch')));
end;
$$;
create function public.release_notification_run(p_token uuid,p_mock boolean)
returns void language sql security definer set search_path = '' as $$
    update yeoback_private.notification_runner set token=null,lease_until=null where mock=p_mock and token=p_token;
$$;

-- A runner has at most one in-flight message. Space grants from the previous
-- completed transport, not from a permit that may precede a delayed send.
create function public.check_notification_dispatch(p_id uuid,p_attempt uuid,p_mock boolean,p_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare run yeoback_private.notification_runner%rowtype;
begin
    select * into run from yeoback_private.notification_runner where mock=p_mock and token=p_token
        and lease_until>clock_timestamp() for update;
    if not found then return null; end if;
    if not exists(select 1 from public.outbound_messages m join public.automation_events e on e.id=m.event_id
        where m.id=p_id and e.kind='notify' and m.channel='mail') then return null; end if;
    if run.mail_after>clock_timestamp() then
        update public.outbound_messages set state='approved',send_attempt=null,lease_until=null,revision=revision+1
        where id=p_id and send_attempt=p_attempt and mock=p_mock and state='sending' and dispatch_checked_at is null;
        return null;
    end if;
    return public.check_outbound_dispatch(p_id,p_attempt,p_mock);
end;
$$;
create function public.complete_notification_dispatch(p_id uuid,p_attempt uuid,p_status text,p_provider_id text,p_result_code text,
    p_mock boolean,p_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
    perform 1 from yeoback_private.notification_runner where mock=p_mock and token=p_token for update;
    if not found then raise exception 'Run is no longer active' using errcode='40001'; end if;
    if not exists(select 1 from public.outbound_messages m join public.automation_events e on e.id=m.event_id
        where m.id=p_id and m.mock=p_mock and e.kind='notify' and m.channel='mail') then
        raise exception 'Not found' using errcode='P0002';
    end if;
    result:=public.complete_outbound_message(p_id,p_attempt,p_status,p_provider_id,p_result_code);
    update yeoback_private.notification_runner set mail_after=clock_timestamp()+interval '334 milliseconds' where mock=p_mock;
    return result;
end;
$$;
revoke all on function public.acquire_notification_run(uuid,boolean),public.release_notification_run(uuid,boolean),
    public.check_notification_dispatch(uuid,uuid,boolean,uuid),
    public.complete_notification_dispatch(uuid,uuid,text,text,text,boolean,uuid) from public,anon,authenticated,service_role;
grant execute on function public.acquire_notification_run(uuid,boolean),public.release_notification_run(uuid,boolean),
    public.check_notification_dispatch(uuid,uuid,boolean,uuid),
    public.complete_notification_dispatch(uuid,uuid,text,text,text,boolean,uuid) to service_role;
commit;
