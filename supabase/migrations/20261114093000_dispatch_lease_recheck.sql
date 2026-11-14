begin;

-- Consent/policy checks may wait for another transaction. Do not release a
-- send permit after the lease elapsed while holding the message row lock.
create or replace function public.check_outbound_dispatch(p_id uuid,p_attempt uuid,p_mock boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    m public.outbound_messages%rowtype;
    blocked text;
begin
    select * into m from public.outbound_messages where id = p_id and state = 'sending' and send_attempt = p_attempt
        and mock = p_mock and dispatch_checked_at is null and lease_until > clock_timestamp() for update;
    if not found then return null; end if;
    blocked := yeoback_private.outbound_blocker(m);
    if blocked is not null then
        update public.outbound_messages set state = case when blocked = 'POLICY_CHANGED' then 'draft' else 'suppressed' end,
            result_code = blocked,approved_by = null,approved_at = null,revision = revision + 1,
            send_attempt = null,lease_until = null where id = m.id;
        return null;
    end if;
    if m.lease_until <= clock_timestamp() then
        update public.outbound_messages set state = 'failed',result_code = 'DISPATCH_LEASE_EXPIRED',
            lease_until = null,revision = revision + 1 where id = m.id;
        return null;
    end if;
    update public.outbound_messages set dispatch_checked_at = clock_timestamp()
        where id = m.id returning * into m;
    return yeoback_private.outbound_dispatch_json(m);
end;
$$;
commit;
