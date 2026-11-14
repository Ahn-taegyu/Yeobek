begin;
create or replace function public.check_notification_dispatch(p_id uuid,p_attempt uuid,p_mock boolean,p_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare run yeoback_private.notification_runner%rowtype;
    permit jsonb;
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
    permit:=public.check_outbound_dispatch(p_id,p_attempt,p_mock);
    if permit is not null and run.lease_until<=clock_timestamp() then
        perform public.complete_outbound_message(p_id,p_attempt,'failed',null,'RUN_LEASE_EXPIRED');
        return null;
    end if;
    return permit;
end;
$$;
commit;
