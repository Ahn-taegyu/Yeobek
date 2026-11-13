begin;

insert into public.app_policies(key,value) values ('visitor_audio_cache_requests_per_minute',60);

create or replace function public.load_visitor_answer(p_session_hash text,p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare answer public.api_requests%rowtype;
begin
    select r.* into answer from public.api_requests r
    where r.session_hash = yeoback_private.visitor_hash(p_session_hash)
        and r.id = p_id and r.kind = 'question' and r.state = 'ready'
        and exists (select 1 from yeoback_private.public_artworks(r.exhibition_id) p
            where r.publication_id is null or p.id = r.publication_id);
    if not found then return null; end if;
    if answer.expires_at <= statement_timestamp() then
        raise exception 'Visitor request expired' using errcode = 'P1012';
    end if;
    return answer.result;
end;
$$;

create index visitor_reply_audio_session_time on public.api_requests(session_hash,created_at)
    where kind = 'reply_audio';

alter function public.reserve_visitor_voice(text,uuid,uuid,text,text,boolean,uuid,text) set schema yeoback_private;
revoke all on function yeoback_private.reserve_visitor_voice(text,uuid,uuid,text,text,boolean,uuid,text)
    from public,anon,authenticated,service_role;
create function public.reserve_visitor_voice(p_session_hash text,p_exhibition_id uuid,p_request_id uuid,p_input_hash text,
    p_kind text,p_mock boolean,p_answer_id uuid default null,p_voice_fingerprint text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    sid bytea := yeoback_private.visitor_hash(p_session_hash);
    source_row public.api_requests%rowtype;
    checked_at timestamptz;
begin
    -- Only new cache aliases use the extra budget. Ordinary claims and
    -- existing IDs retain the original validation and charging behavior.
    if p_kind = 'reply_audio' and p_request_id is not null and p_mock is not null
        and p_answer_id is not null and p_voice_fingerprint ~ '^[0-9a-f]{64}$'
        and p_input_hash ~ '^[0-9a-f]{64}$' then
        perform pg_advisory_xact_lock(hashtextextended('yeobek:visitor-session:' || p_session_hash,0));
        perform yeoback_private.visitor_public_lock(p_exhibition_id);
        if not exists (select 1 from public.api_requests where session_hash = sid and request_id = p_request_id) then
            checked_at := clock_timestamp();
            source_row := yeoback_private.visitor_voice_source(sid,p_exhibition_id,p_answer_id);
            if source_row.id is not null and source_row.expires_at > checked_at and exists (
                select 1 from public.api_requests r where r.session_hash = sid and r.source_answer_id = p_answer_id
                    and r.kind = 'reply_audio' and r.state = 'ready'
                    and r.voice_fingerprint = decode(p_voice_fingerprint,'hex') and r.mock = p_mock
                    and r.expires_at > checked_at
            ) and (select count(*) from public.api_requests r where r.session_hash = sid
                and r.kind = 'reply_audio' and r.created_at > checked_at - interval '1 minute')
                >= yeoback_private.policy_integer('visitor_audio_cache_requests_per_minute') then
                raise exception 'Visitor request limit reached' using errcode = 'P1010';
            end if;
        end if;
    end if;
    return yeoback_private.reserve_visitor_voice(p_session_hash,p_exhibition_id,p_request_id,p_input_hash,
        p_kind,p_mock,p_answer_id,p_voice_fingerprint);
end;
$$;
revoke all on function public.reserve_visitor_voice(text,uuid,uuid,text,text,boolean,uuid,text)
    from public,anon,authenticated,service_role;
grant execute on function public.reserve_visitor_voice(text,uuid,uuid,text,text,boolean,uuid,text) to service_role;

commit;
