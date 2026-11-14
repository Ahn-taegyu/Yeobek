begin;

create table yeoback_private.channel_token_apps (
    app_id text primary key
);

create table yeoback_private.channel_token_claims (
    app_id text not null references yeoback_private.channel_token_apps,
    claim uuid not null,
    reserved_at timestamptz not null,
    primary key (app_id, claim)
);

create table yeoback_private.channel_token_cache (
    app_id text not null references yeoback_private.channel_token_apps,
    channel_id text not null,
    sealed text check (octet_length(sealed) between 1 and 32768),
    expires_at timestamptz,
    lease_claim uuid,
    lease_started_at timestamptz,
    primary key (app_id, channel_id),
    check ((sealed is null) = (expires_at is null)),
    check ((lease_claim is null) = (lease_started_at is null))
);

revoke all on yeoback_private.channel_token_apps, yeoback_private.channel_token_claims,
    yeoback_private.channel_token_cache from public, anon, authenticated, service_role;

create function public.claim_channel_token(p_app_id text, p_channel_id text, p_claim uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    cache yeoback_private.channel_token_cache%rowtype;
    checked_at timestamptz;
begin
    if p_app_id is null or p_app_id !~ '^[A-Za-z0-9_-]{1,200}$'
        or p_channel_id is null or p_channel_id !~ '^[A-Za-z0-9_-]{1,200}$'
        or p_claim is null then
        raise exception 'Invalid channel token claim' using errcode = '22023';
    end if;

    insert into yeoback_private.channel_token_apps (app_id) values (p_app_id)
    on conflict do nothing;

    -- Claim and completion both lock the app before inspecting channel state.
    perform 1 from yeoback_private.channel_token_apps where app_id = p_app_id for update;

    select * into cache from yeoback_private.channel_token_cache
    where app_id = p_app_id and channel_id = p_channel_id;
    checked_at := clock_timestamp();

    if cache.expires_at > checked_at + interval '60 seconds' then
        return jsonb_build_object('state', 'cached', 'sealed', cache.sealed);
    end if;

    -- Each app retains at most ten reservations and rejects repeated claims within the quota window.
    delete from yeoback_private.channel_token_claims
    where app_id = p_app_id and reserved_at <= checked_at - interval '30 minutes';

    if cache.lease_started_at + interval '30 seconds' > checked_at
        or exists (
            select 1 from yeoback_private.channel_token_claims
            where app_id = p_app_id and claim = p_claim
        ) then
        return jsonb_build_object('state', 'busy');
    end if;

    if (
        select count(*) from yeoback_private.channel_token_claims where app_id = p_app_id
    ) >= 10 then
        return jsonb_build_object('state', 'limited');
    end if;

    insert into yeoback_private.channel_token_claims (app_id, claim, reserved_at)
    values (p_app_id, p_claim, checked_at);

    insert into yeoback_private.channel_token_cache (app_id, channel_id, lease_claim, lease_started_at)
    values (p_app_id, p_channel_id, p_claim, checked_at)
    on conflict (app_id, channel_id) do update
    set lease_claim = excluded.lease_claim, lease_started_at = excluded.lease_started_at;

    return jsonb_build_object('state', 'refresh', 'sealed', cache.sealed);
end;
$$;

create function public.complete_channel_token(
    p_app_id text, p_channel_id text, p_claim uuid, p_sealed text, p_expires_in integer
)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
    if p_app_id is null or p_app_id !~ '^[A-Za-z0-9_-]{1,200}$'
        or p_channel_id is null or p_channel_id !~ '^[A-Za-z0-9_-]{1,200}$'
        or p_claim is null or p_sealed is null or octet_length(p_sealed) not between 1 and 32768
        or p_expires_in is null or p_expires_in not between 1 and 31536000 then
        raise exception 'Invalid channel token completion' using errcode = '22023';
    end if;

    perform 1 from yeoback_private.channel_token_apps where app_id = p_app_id for update;
    if not found then return false; end if;

    update yeoback_private.channel_token_cache
    set sealed = p_sealed, expires_at = lease_started_at + make_interval(secs => p_expires_in),
        lease_claim = null, lease_started_at = null
    where app_id = p_app_id and channel_id = p_channel_id and lease_claim = p_claim
        and lease_started_at + interval '30 seconds' > clock_timestamp()
        and lease_started_at + make_interval(secs => p_expires_in) > clock_timestamp();
    return found;
end;
$$;

revoke all on function public.claim_channel_token(text, text, uuid),
    public.complete_channel_token(text, text, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.claim_channel_token(text, text, uuid),
    public.complete_channel_token(text, text, uuid, text, integer) to service_role;

commit;
