begin;

alter table public.api_requests add column source_answer_id uuid,add column voice_fingerprint bytea;
create index visitor_reply_audio_cache on public.api_requests(session_hash,source_answer_id,voice_fingerprint,mock,expires_at)
    where kind = 'reply_audio' and state = 'ready';

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('visitor-audio','visitor-audio',false,8388608,array['audio/mpeg']);
create policy visitor_audio_no_direct_access on storage.objects as restrictive
    for all to anon,authenticated using (bucket_id <> 'visitor-audio') with check (bucket_id <> 'visitor-audio');

create table public.visitor_audio_assets (
    id uuid primary key,
    storage_key text not null unique,
    cleanup_after timestamptz,
    cleanup_claimed boolean not null default false
);
create index visitor_audio_cleanup_due on public.visitor_audio_assets(cleanup_after,id) where cleanup_after is not null;
alter table public.visitor_audio_assets enable row level security;
revoke all on public.visitor_audio_assets from public,anon,authenticated,service_role;

-- Guard the existing question entry point against collisions with voice IDs.
alter function public.reserve_visitor_request(text,uuid,uuid,text,boolean) set schema yeoback_private;
revoke all on function yeoback_private.reserve_visitor_request(text,uuid,uuid,text,boolean) from public,anon,authenticated,service_role;
create function public.reserve_visitor_request(p_session_hash text,p_exhibition_id uuid,p_request_id uuid,p_input_hash text,p_mock boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare sid bytea := yeoback_private.visitor_hash(p_session_hash);
begin
    perform pg_advisory_xact_lock(hashtextextended('yeobek:visitor-session:' || p_session_hash,0));
    perform yeoback_private.visitor_public_lock(p_exhibition_id);
    if exists (select 1 from public.api_requests where session_hash = sid and request_id = p_request_id and kind <> 'question') then
        raise exception 'Request ID already used with different input' using errcode = 'P1005';
    end if;
    return yeoback_private.reserve_visitor_request(p_session_hash,p_exhibition_id,p_request_id,p_input_hash,p_mock);
end;
$$;

alter function public.complete_visitor_request(text,uuid,jsonb,text,jsonb) set schema yeoback_private;
revoke all on function yeoback_private.complete_visitor_request(text,uuid,jsonb,text,jsonb) from public,anon,authenticated,service_role;
create function public.complete_visitor_request(p_session_hash text,p_id uuid,p_result jsonb,
    p_failure_code text default null,p_steps jsonb default '[]')
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
    if not exists (select 1 from public.api_requests where session_hash = yeoback_private.visitor_hash(p_session_hash)
        and id = p_id and kind = 'question') then raise exception 'Visitor request not found' using errcode = 'P0002'; end if;
    return yeoback_private.complete_visitor_request(p_session_hash,p_id,p_result,p_failure_code,p_steps);
end;
$$;

create function yeoback_private.visitor_voice_source(p_sid bytea,p_exhibition uuid,p_answer_id uuid)
returns public.api_requests language sql stable set search_path = '' as $$
    select r.* from public.api_requests r where r.session_hash = p_sid and r.id = p_answer_id and r.kind = 'question'
        and r.exhibition_id = p_exhibition and r.state = 'ready' and r.expires_at > statement_timestamp()
        and r.publication_id is not null
        and exists (select 1 from yeoback_private.public_artworks(p_exhibition) p where p.id = r.publication_id);
$$;

create function public.reserve_visitor_voice(p_session_hash text,p_exhibition_id uuid,p_request_id uuid,p_input_hash text,
    p_kind text,p_mock boolean,p_answer_id uuid default null,p_voice_fingerprint text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    sid bytea := yeoback_private.visitor_hash(p_session_hash);
    fingerprint bytea := yeoback_private.visitor_hash(p_input_hash);
    voice bytea;
    request_row public.api_requests%rowtype;
    source_row public.api_requests%rowtype;
    cached public.api_requests%rowtype;
    reserved_now timestamptz;
    utc_day timestamptz;
    expiry timestamptz;
begin
    if p_request_id is null or p_mock is null or p_kind is null or p_kind not in ('transcription','reply_audio')
        or (p_kind = 'transcription' and (p_answer_id is not null or p_voice_fingerprint is not null))
        or (p_kind = 'reply_audio' and (p_answer_id is null or p_voice_fingerprint is null)) then
        raise exception 'Invalid visitor voice request' using errcode = '22023';
    end if;
    if p_kind = 'reply_audio' then voice := yeoback_private.visitor_hash(p_voice_fingerprint); end if;
    perform pg_advisory_xact_lock(hashtextextended('yeobek:visitor-session:' || p_session_hash,0));
    perform yeoback_private.visitor_public_lock(p_exhibition_id);
    select * into request_row from public.api_requests where session_hash = sid and request_id = p_request_id for update;
    if found then
        if request_row.kind <> p_kind or request_row.exhibition_id <> p_exhibition_id
            or request_row.input_hash is distinct from fingerprint or request_row.mock is distinct from p_mock
            or request_row.source_answer_id is distinct from p_answer_id or request_row.voice_fingerprint is distinct from voice then
            raise exception 'Request ID already used with different input' using errcode = 'P1005';
        end if;
        if request_row.expires_at <= clock_timestamp() then raise exception 'Visitor request expired' using errcode = 'P1012'; end if;
        if p_kind = 'reply_audio' then
            source_row := yeoback_private.visitor_voice_source(sid,p_exhibition_id,p_answer_id);
            if source_row.id is null then raise exception 'Visitor answer not found' using errcode = 'P0002'; end if;
        end if;
        if request_row.state = 'running' and request_row.lease_until <= clock_timestamp() then
            update public.api_requests set state = 'failed',failure_code = 'REQUEST_TIMEOUT',updated_at = statement_timestamp()
                where id = request_row.id returning * into request_row;
        end if;
        return yeoback_private.visitor_envelope(request_row,false);
    end if;

    reserved_now := clock_timestamp();
    expiry := reserved_now + yeoback_private.policy_integer('answer_ttl_seconds') * interval '1 second';
    if p_kind = 'reply_audio' then
        source_row := yeoback_private.visitor_voice_source(sid,p_exhibition_id,p_answer_id);
        if source_row.id is null or source_row.expires_at <= reserved_now then
            raise exception 'Visitor answer not found' using errcode = 'P0002';
        end if;
        select * into cached from public.api_requests where session_hash = sid and source_answer_id = p_answer_id
            and kind = 'reply_audio' and state = 'ready' and voice_fingerprint = voice and mock = p_mock
            and expires_at > reserved_now order by expires_at desc,id limit 1;
        expiry := least(expiry,source_row.expires_at);
        if found then
            insert into public.api_requests(session_hash,request_id,exhibition_id,kind,state,input_hash,mock,source_answer_id,
                voice_fingerprint,created_at,expires_at,artwork_id,publication_id,result)
            values (sid,p_request_id,p_exhibition_id,p_kind,'ready',fingerprint,p_mock,p_answer_id,voice,reserved_now,
                least(expiry,cached.expires_at),source_row.artwork_id,source_row.publication_id,cached.result) returning * into request_row;
            return yeoback_private.visitor_envelope(request_row,false);
        end if;
    end if;
    utc_day := date_trunc('day',reserved_now,'UTC');
    if (select count(*) from public.visitor_quota_events where session_hash = sid and reserved_at > reserved_now - interval '1 minute')
            >= yeoback_private.policy_integer('visitor_requests_per_minute')
        or (select count(*) from public.visitor_quota_events where exhibition_id = p_exhibition_id
            and reserved_at >= utc_day and reserved_at < utc_day + interval '24 hours')
            >= yeoback_private.policy_integer('exhibition_requests_per_day') then
        raise exception 'Visitor request limit reached' using errcode = 'P1010';
    end if;
    insert into public.api_requests(session_hash,request_id,exhibition_id,kind,state,input_hash,mock,source_answer_id,
        voice_fingerprint,lease_until,created_at,expires_at,artwork_id,publication_id)
    values (sid,p_request_id,p_exhibition_id,p_kind,'running',fingerprint,p_mock,p_answer_id,voice,
        reserved_now + interval '120 seconds',reserved_now,expiry,source_row.artwork_id,source_row.publication_id)
    returning * into request_row;
    insert into public.visitor_quota_events values (sid,p_exhibition_id,reserved_now);
    if p_kind = 'reply_audio' then
        insert into public.visitor_audio_assets(id,storage_key,cleanup_after)
            values (request_row.id,'requests/' || request_row.id || '.mp3',greatest(expiry,request_row.lease_until) + interval '3 minutes');
    end if;
    return yeoback_private.visitor_envelope(request_row,true);
end;
$$;

create function public.complete_visitor_voice(p_session_hash text,p_id uuid,p_result jsonb,p_failure_code text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    sid bytea := yeoback_private.visitor_hash(p_session_hash);
    exhibition uuid;
    request_row public.api_requests%rowtype;
    source_row public.api_requests%rowtype;
    asset public.visitor_audio_assets%rowtype;
    metadata jsonb;
begin
    select exhibition_id into exhibition from public.api_requests
        where session_hash = sid and id = p_id and kind in ('transcription','reply_audio');
    if not found then raise exception 'Visitor request not found' using errcode = 'P0002'; end if;
    perform yeoback_private.visitor_public_lock(exhibition,false);
    select * into request_row from public.api_requests where session_hash = sid and id = p_id for update;
    if not found then raise exception 'Visitor request not found' using errcode = 'P0002'; end if;
    if request_row.expires_at <= clock_timestamp() then raise exception 'Visitor request expired' using errcode = 'P1012'; end if;
    if request_row.state <> 'running' then
        if request_row.failure_code is distinct from p_failure_code or request_row.result is distinct from p_result then
            raise exception 'Visitor request already completed' using errcode = 'P1011';
        end if;
        if request_row.state = 'ready' and (not exists (select 1 from yeoback_private.public_artworks(exhibition))
            or (request_row.kind = 'reply_audio' and (yeoback_private.visitor_voice_source(sid,exhibition,request_row.source_answer_id)).id is null))
            then raise exception 'Publication changed' using errcode = '40001'; end if;
        return yeoback_private.visitor_envelope(request_row,false);
    end if;
    if request_row.lease_until <= clock_timestamp() then
        p_failure_code := 'REQUEST_TIMEOUT';
        p_result := null;
    end if;
    if p_failure_code is not null then
        if p_result is not null or p_failure_code !~ '^[A-Z][A-Z0-9_]{0,63}$' then
            raise exception 'Invalid visitor voice failure' using errcode = '22023';
        end if;
    else
        if request_row.kind = 'reply_audio' then
            source_row := yeoback_private.visitor_voice_source(sid,exhibition,request_row.source_answer_id);
        end if;
        if not exists (select 1 from yeoback_private.public_artworks(exhibition))
            or (request_row.kind = 'reply_audio' and source_row.id is null) then
            p_failure_code := 'CONTENT_CHANGED';
            p_result := null;
        elsif jsonb_typeof(p_result) is distinct from 'object' or p_result->'mock' is distinct from to_jsonb(request_row.mock) then
            raise exception 'Invalid visitor voice result' using errcode = '22023';
        elsif request_row.kind = 'transcription' then
            if p_result - array['requestId','transcript','mock'] <> '{}'
                or p_result->>'requestId' is distinct from request_row.request_id::text
                or jsonb_typeof(p_result->'transcript') is distinct from 'string'
                or coalesce(p_result->>'transcript','') !~ '[^[:space:]]' or char_length(p_result->>'transcript') > 4000 then
                raise exception 'Invalid visitor transcript' using errcode = '22023';
            end if;
        else
            select * into asset from public.visitor_audio_assets where id = request_row.id and not cleanup_claimed for share;
            if not found then raise exception 'Visitor audio object unavailable' using errcode = 'P1002'; end if;
            if p_result - array['storageKey','contentHash','byteSize','contentType','textHash','mock','publication'] <> '{}'
                or p_result->>'storageKey' is distinct from asset.storage_key
                or p_result->>'contentType' is distinct from 'audio/mpeg'
                or p_result->>'textHash' is distinct from encode(sha256(convert_to(source_row.result->>'answer','UTF8')),'hex')
                or p_result->'publication' is distinct from source_row.result->'publication'
                or coalesce(p_result->>'contentHash','') !~ '^[0-9a-f]{64}$'
                or jsonb_typeof(p_result->'byteSize') is distinct from 'number'
                or coalesce(p_result->>'byteSize','') !~ '^[1-9][0-9]{0,6}$' then
                raise exception 'Invalid visitor audio metadata' using errcode = '22023';
            end if;
            if (p_result->>'byteSize')::integer > 8388608 then
                raise exception 'Invalid visitor audio metadata' using errcode = '22023';
            end if;
            select o.metadata into metadata from storage.objects o
                where o.bucket_id = 'visitor-audio' and o.name = asset.storage_key for share;
            if not found or metadata->>'mimetype' is distinct from 'audio/mpeg'
                or metadata->>'size' is distinct from p_result->>'byteSize' then
                raise exception 'Visitor audio object unavailable' using errcode = 'P1002';
            end if;
        end if;
    end if;
    update public.api_requests set state = case when p_failure_code is null then 'ready' else 'failed' end,
        result = p_result,failure_code = p_failure_code,updated_at = statement_timestamp()
    where id = request_row.id returning * into request_row;
    return yeoback_private.visitor_envelope(request_row,false);
end;
$$;

create function public.load_visitor_voice(p_session_hash text,p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
    select r.result from public.api_requests r where r.session_hash = yeoback_private.visitor_hash(p_session_hash)
        and r.id = p_id and r.kind in ('transcription','reply_audio') and r.state = 'ready'
        and r.expires_at > statement_timestamp()
        and exists (select 1 from yeoback_private.public_artworks(r.exhibition_id))
        and (r.kind = 'transcription' or (yeoback_private.visitor_voice_source(r.session_hash,r.exhibition_id,r.source_answer_id)).id is not null);
$$;

-- The question loader must not expose a speech object key.
create or replace function public.load_visitor_answer(p_session_hash text,p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
    select r.result from public.api_requests r
    where r.session_hash = yeoback_private.visitor_hash(p_session_hash)
        and r.id = p_id and r.kind = 'question' and r.state = 'ready' and r.expires_at > statement_timestamp()
        and exists (select 1 from yeoback_private.public_artworks(r.exhibition_id) p
            where r.publication_id is null or p.id = r.publication_id);
$$;

create function public.list_visitor_audio_cleanup(p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
    if p_limit is null or p_limit not between 1 and 100 then
        raise exception 'Invalid visitor audio cleanup limit' using errcode = '22023';
    end if;
    return (with due as (
        select a.id from public.visitor_audio_assets a where a.cleanup_after <= statement_timestamp()
            order by a.cleanup_after,a.id limit p_limit for update skip locked
    ), claimed as (
        update public.visitor_audio_assets a set cleanup_claimed = true from due d where d.id = a.id
        returning a.id,a.storage_key,a.cleanup_after
    ) select coalesce(jsonb_agg(jsonb_build_object('id',id,'storageKey',storage_key) order by cleanup_after,id),'[]') from claimed);
end;
$$;

create function public.complete_visitor_audio_cleanup(p_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare asset public.visitor_audio_assets%rowtype;
begin
    select * into asset from public.visitor_audio_assets where id = p_id for update;
    if not found then return true; end if;
    if not asset.cleanup_claimed or asset.cleanup_after > statement_timestamp()
        or exists (select 1 from storage.objects where bucket_id = 'visitor-audio' and name = asset.storage_key)
        then return false; end if;
    delete from public.visitor_audio_assets where id = p_id;
    return true;
end;
$$;

revoke all on function public.reserve_visitor_request(text,uuid,uuid,text,boolean),
    public.complete_visitor_request(text,uuid,jsonb,text,jsonb),yeoback_private.visitor_voice_source(bytea,uuid,uuid),
    public.reserve_visitor_voice(text,uuid,uuid,text,text,boolean,uuid,text),public.complete_visitor_voice(text,uuid,jsonb,text),
    public.load_visitor_voice(text,uuid),public.list_visitor_audio_cleanup(integer),public.complete_visitor_audio_cleanup(uuid)
    from public,anon,authenticated,service_role;
grant execute on function public.reserve_visitor_request(text,uuid,uuid,text,boolean),
    public.complete_visitor_request(text,uuid,jsonb,text,jsonb),public.reserve_visitor_voice(text,uuid,uuid,text,text,boolean,uuid,text),
    public.complete_visitor_voice(text,uuid,jsonb,text),public.load_visitor_voice(text,uuid),public.list_visitor_audio_cleanup(integer),
    public.complete_visitor_audio_cleanup(uuid) to service_role;

commit;
