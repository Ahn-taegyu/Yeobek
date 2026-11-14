begin;

insert into public.app_policies(key,value) values
    ('signup_network_send_per_minute',10),
    ('signup_network_send_per_hour',60),
    ('signup_network_verify_per_minute',60),
    ('signup_network_verify_per_hour',300),
    ('signup_email_send_per_hour',5),
    ('signup_email_verify_per_hour',10)
on conflict (key) do nothing;

create table yeoback_private.signup_attempts (
    id bigint generated always as identity primary key,
    network_hash bytea not null check (octet_length(network_hash) = 32),
    email_hash bytea not null check (octet_length(email_hash) = 32),
    request_id uuid not null,
    kind text not null check (kind in ('signup','resend','verify')),
    attempted_at timestamptz not null default clock_timestamp()
);
create index signup_attempts_network_time on yeoback_private.signup_attempts(network_hash,attempted_at);
create index signup_attempts_email_time on yeoback_private.signup_attempts(email_hash,attempted_at);
create index signup_attempts_cleanup on yeoback_private.signup_attempts(attempted_at,id);
revoke all on yeoback_private.signup_attempts from public,anon,authenticated,service_role;

create function public.consume_signup_budget(p_network_hash text,p_email_hash text,p_request_id uuid,p_kind text)
returns void language plpgsql security definer set search_path = '' as $$
declare
    network bytea;
    email bytea;
    network_lock bigint;
    email_lock bigint;
    attempted_now timestamptz;
    verifying boolean := p_kind = 'verify';
    budget_kind text := case when verifying then 'verify' else 'send' end;
    network_minute bigint;
    network_hour bigint;
    email_hour bigint;
begin
    if p_network_hash is null or p_network_hash !~ '^[0-9a-fA-F]{64}$'
        or p_email_hash is null or p_email_hash !~ '^[0-9a-fA-F]{64}$'
        or p_request_id is null or p_kind is null or p_kind not in ('signup','resend','verify') then
        raise exception 'Invalid signup attempt' using errcode = '22023';
    end if;
    network := decode(p_network_hash,'hex');
    email := decode(p_email_hash,'hex');
    network_lock := hashtextextended('yeobek:signup-network:' || encode(network,'hex'),0);
    email_lock := hashtextextended('yeobek:signup-email:' || encode(email,'hex'),0);

    -- Lock both identities in key order, then take the time and count committed attempts.
    perform pg_advisory_xact_lock(least(network_lock,email_lock));
    perform pg_advisory_xact_lock(greatest(network_lock,email_lock));
    attempted_now := clock_timestamp();

    select count(*) filter (where attempted_at > attempted_now - interval '1 minute'),count(*)
        into network_minute,network_hour from yeoback_private.signup_attempts
        where network_hash = network and attempted_at > attempted_now - interval '1 hour'
            and (kind = 'verify') = verifying;
    select count(*) into email_hour from yeoback_private.signup_attempts
        where email_hash = email and attempted_at > attempted_now - interval '1 hour'
            and (kind = 'verify') = verifying;

    if network_minute >= yeoback_private.policy_integer('signup_network_' || budget_kind || '_per_minute')
        or network_hour >= yeoback_private.policy_integer('signup_network_' || budget_kind || '_per_hour')
        or email_hour >= yeoback_private.policy_integer('signup_email_' || budget_kind || '_per_hour') then
        raise exception 'Signup attempt limit reached' using errcode = 'P1040';
    end if;

    -- A caller-supplied request ID cannot replay a provider call without debit.
    insert into yeoback_private.signup_attempts(network_hash,email_hash,request_id,kind,attempted_at)
        values (network,email,p_request_id,p_kind,attempted_now);
end;
$$;
revoke all on function public.consume_signup_budget(text,text,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.consume_signup_budget(text,text,uuid,text) to service_role;

create function public.get_signup_verification_identity(p_email text,p_signup_request_id uuid)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare
    normalized_email text := lower(btrim(p_email));
    pending_user uuid;
begin
    if normalized_email is null or normalized_email = '' or char_length(p_email) > 254
        or p_signup_request_id is null then
        raise exception 'Invalid signup verification identity' using errcode = '22023';
    end if;

    -- Only the trusted signup flow can tag a pending Auth account in app metadata.
    select u.id into pending_user from auth.users u
    where lower(u.email) = normalized_email and u.email_confirmed_at is null
        and u.deleted_at is null and u.is_anonymous is not true
        and u.raw_app_meta_data->>'provider' = 'email'
        and u.raw_app_meta_data->>'yeobek_signup_request_id' = p_signup_request_id::text;
    return pending_user;
end;
$$;
revoke all on function public.get_signup_verification_identity(text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_signup_verification_identity(text,uuid) to service_role;

create or replace function public.purge_expired()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
    result := yeoback_private.purge_expired();
    delete from yeoback_private.visitor_network_requests where (network_hash,session_hash,request_id) in (
        select network_hash,session_hash,request_id from yeoback_private.visitor_network_requests
        where reserved_at<date_trunc('day',statement_timestamp(),'UTC')-interval '1 day'
        order by reserved_at limit 1000 for update skip locked
    );
    delete from yeoback_private.signup_attempts where id in (
        select id from yeoback_private.signup_attempts
        where attempted_at < statement_timestamp() - interval '48 hours'
        order by attempted_at,id limit 1000 for update skip locked
    );
    return result;
end;
$$;

commit;
