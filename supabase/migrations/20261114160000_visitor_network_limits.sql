begin;

-- Provisional shared-network settings; tune for venue NATs after measurement.
insert into public.app_policies(key,value) values
    ('visitor_network_requests_per_minute',30),
    ('visitor_network_requests_per_day',200);

create table yeoback_private.visitor_network_requests (
    network_hash bytea not null check(octet_length(network_hash)=32),
    session_hash bytea not null check(octet_length(session_hash)=32),
    request_id uuid not null,
    exhibition_id uuid not null,
    kind text not null check(kind in ('question','transcription','reply_audio')),
    reserved_at timestamptz not null default clock_timestamp(),
    primary key(network_hash,session_hash,request_id)
);
create index visitor_network_requests_time on yeoback_private.visitor_network_requests(network_hash,reserved_at);
create index visitor_network_requests_cleanup on yeoback_private.visitor_network_requests(reserved_at);
revoke all on yeoback_private.visitor_network_requests from public,anon,authenticated,service_role;

create function public.consume_visitor_network_budget(p_network_hash text,p_session_hash text,
    p_exhibition_id uuid,p_request_id uuid,p_kind text)
returns void language plpgsql security definer set search_path = '' as $$
declare
    network bytea := yeoback_private.visitor_hash(p_network_hash);
    sid bytea := yeoback_private.visitor_hash(p_session_hash);
    previous yeoback_private.visitor_network_requests%rowtype;
    current_time_at timestamptz;
begin
    if p_request_id is null or p_exhibition_id is null or p_kind is null
        or p_kind not in ('question','transcription','reply_audio') then
        raise exception 'Invalid visitor network request' using errcode='22023';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('yeobek:visitor-network:' || p_network_hash,0));
    perform yeoback_private.visitor_public_lock(p_exhibition_id);
    select * into previous from yeoback_private.visitor_network_requests
        where network_hash=network and session_hash=sid and request_id=p_request_id;
    if found then
        if previous.exhibition_id<>p_exhibition_id or previous.kind<>p_kind then
            raise exception 'Request ID already used with different input' using errcode='P1005';
        end if;
        return;
    end if;
    current_time_at := clock_timestamp();
    if (select count(*) from yeoback_private.visitor_network_requests
            where network_hash=network and reserved_at>current_time_at-interval '1 minute')
            >= yeoback_private.policy_integer('visitor_network_requests_per_minute')
        or (select count(*) from yeoback_private.visitor_network_requests
            where network_hash=network and reserved_at>=date_trunc('day',current_time_at,'UTC'))
            >= yeoback_private.policy_integer('visitor_network_requests_per_day') then
        raise exception 'Visitor network limit reached' using errcode='P1010';
    end if;
    insert into yeoback_private.visitor_network_requests(network_hash,session_hash,request_id,exhibition_id,kind,reserved_at)
        values(network,sid,p_request_id,p_exhibition_id,p_kind,current_time_at);
end;
$$;
revoke all on function public.consume_visitor_network_budget(text,text,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.consume_visitor_network_budget(text,text,uuid,uuid,text) to service_role;

-- Retain the existing purge response shape. Schedule registration remains W7.
alter function public.purge_expired() set schema yeoback_private;
revoke all on function yeoback_private.purge_expired() from public,anon,authenticated,service_role;
create function public.purge_expired()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
    result := yeoback_private.purge_expired();
    delete from yeoback_private.visitor_network_requests where (network_hash,session_hash,request_id) in (
        select network_hash,session_hash,request_id from yeoback_private.visitor_network_requests
        where reserved_at<date_trunc('day',statement_timestamp(),'UTC')-interval '1 day'
        order by reserved_at limit 1000 for update skip locked
    );
    return result;
end;
$$;
revoke all on function public.purge_expired() from public,anon,authenticated,service_role;
grant execute on function public.purge_expired() to service_role;
commit;
