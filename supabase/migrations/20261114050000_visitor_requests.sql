begin;

alter table public.api_requests
    add column id uuid not null default gen_random_uuid() unique,
    add column input_hash bytea,
    add column mock boolean not null default false,
    add column result jsonb,
    add column failure_code text,
    add column steps jsonb,
    add column lease_until timestamptz;
-- The answer TTL is now controlled by app_policies.
do $$
declare constraint_name text;
begin
    select conname into strict constraint_name from pg_catalog.pg_constraint
    where conrelid = 'public.api_requests'::regclass and contype = 'c'
      and pg_catalog.pg_get_constraintdef(oid) like '%expires_at%01:00:00%';
    execute format('alter table public.api_requests drop constraint %I',constraint_name);
end;
$$;
alter table public.api_requests add constraint api_requests_positive_expiry check (expires_at > created_at);
revoke all on public.api_requests from public,anon,authenticated,service_role;

-- Keep quota accounting separate from short-lived answers. These rows contain
-- no answer, question, or session secret.
create table public.visitor_quota_events (
    session_hash bytea not null,
    exhibition_id uuid not null references public.exhibitions(id),
    reserved_at timestamptz not null
);
create index visitor_quota_exhibition_time on public.visitor_quota_events(exhibition_id,reserved_at);
create index visitor_quota_session_time on public.visitor_quota_events(session_hash,reserved_at);
alter table public.visitor_quota_events enable row level security;
revoke all on public.visitor_quota_events from public,anon,authenticated,service_role;

create table public.qa_gaps (
    id uuid primary key default gen_random_uuid(),
    exhibition_id uuid not null,
    artwork_id uuid not null,
    publication_id uuid not null,
    publication_version integer not null,
    question text not null,
    question_key text not null,
    occurrences integer not null default 1,
    status text not null default 'open' check (status in ('open','answered','dismissed')),
    created_at timestamptz not null default statement_timestamp(),
    expires_at timestamptz not null,
    foreign key (exhibition_id,artwork_id,publication_id) references public.publications(exhibition_id,artwork_id,id)
);
create unique index qa_gaps_open_question on public.qa_gaps(publication_id,question_key) where status = 'open';
create index qa_gaps_exhibition_expiry on public.qa_gaps(exhibition_id,expires_at);
alter table public.qa_gaps enable row level security;
revoke all on public.qa_gaps from public,anon,authenticated,service_role;

create function yeoback_private.visitor_hash(p_hash text)
returns bytea language plpgsql immutable set search_path = '' as $$
begin
    if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then
        raise exception 'Invalid visitor hash' using errcode = '22023';
    end if;
    return decode(p_hash,'hex');
end;
$$;

create function yeoback_private.visitor_envelope(r public.api_requests,p_claimed boolean)
returns jsonb language sql stable set search_path = '' as $$
    select jsonb_build_object('id',r.id,'claimed',p_claimed,'status',case r.state when 'ready' then 'succeeded' else r.state end,
        'result',r.result,'failureCode',r.failure_code,'mock',r.mock,'expiresAt',r.expires_at);
$$;

create function yeoback_private.visitor_public_lock(p_exhibition_id uuid,p_require_public boolean default true)
returns void language plpgsql set search_path = '' as $$
declare owner uuid;
begin
    select owner_id into owner from public.exhibitions where id = p_exhibition_id;
    if not found then raise exception 'Exhibition not found' using errcode = 'P0002'; end if;
    perform yeoback_private.lock_publication(owner);
    if p_require_public and not exists (select 1 from yeoback_private.public_artworks(p_exhibition_id)) then
        raise exception 'Exhibition not found' using errcode = 'P0002';
    end if;
end;
$$;

create function public.reserve_visitor_request(p_session_hash text,p_exhibition_id uuid,p_request_id uuid,
    p_input_hash text,p_mock boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    sid bytea := yeoback_private.visitor_hash(p_session_hash);
    fingerprint bytea := yeoback_private.visitor_hash(p_input_hash);
    row public.api_requests%rowtype;
    reserved_now timestamptz;
    utc_day timestamptz;
begin
    if p_request_id is null or p_mock is null then raise exception 'Invalid visitor request' using errcode = '22023'; end if;
    -- Serialize even if an identical request ID is submitted to two exhibitions.
    perform pg_advisory_xact_lock(hashtextextended('yeobek:visitor-session:' || p_session_hash,0));
    perform yeoback_private.visitor_public_lock(p_exhibition_id);
    select * into row from public.api_requests where session_hash = sid and request_id = p_request_id for update;
    if found then
        if row.exhibition_id <> p_exhibition_id or row.input_hash is distinct from fingerprint then
            raise exception 'Request ID already used with different input' using errcode = 'P1005';
        end if;
        if row.expires_at <= statement_timestamp() then raise exception 'Visitor request expired' using errcode = 'P1012'; end if;
        if row.state = 'running' and row.lease_until <= statement_timestamp() then
            update public.api_requests set state = 'failed',failure_code = 'REQUEST_TIMEOUT',updated_at = statement_timestamp()
                where id = row.id returning * into row;
        end if;
        if row.state = 'ready' and row.publication_id is not null and not exists (
            select 1 from yeoback_private.public_artworks(p_exhibition_id) p where p.id = row.publication_id
        ) then raise exception 'Publication changed' using errcode = '40001'; end if;
        return yeoback_private.visitor_envelope(row,false);
    end if;
    reserved_now := clock_timestamp();
    utc_day := date_trunc('day',reserved_now,'UTC');
    if (select count(*) from public.visitor_quota_events where session_hash = sid and reserved_at > reserved_now - interval '1 minute')
            >= yeoback_private.policy_integer('visitor_requests_per_minute')
        or (select count(*) from public.visitor_quota_events where exhibition_id = p_exhibition_id
        and reserved_at >= utc_day and reserved_at < utc_day + interval '24 hours')
            >= yeoback_private.policy_integer('exhibition_requests_per_day') then
        raise exception 'Visitor request limit reached' using errcode = 'P1010';
    end if;
    insert into public.api_requests(session_hash,request_id,exhibition_id,kind,state,input_hash,mock,lease_until,created_at,expires_at)
        values (sid,p_request_id,p_exhibition_id,'question','running',fingerprint,p_mock,
            reserved_now + interval '120 seconds',reserved_now,
            reserved_now + yeoback_private.policy_integer('answer_ttl_seconds') * interval '1 second')
        returning * into row;
    insert into public.visitor_quota_events values (sid,p_exhibition_id,reserved_now);
    return yeoback_private.visitor_envelope(row,true);
end;
$$;

create function yeoback_private.validate_visitor_steps(p_steps jsonb)
returns void language plpgsql immutable set search_path = '' as $$
begin
    if jsonb_typeof(p_steps) is distinct from 'array' or jsonb_array_length(p_steps) > 20 or
        exists (select 1 from jsonb_array_elements(p_steps) step where jsonb_typeof(step) <> 'object' or
            step - array['id','status','reason','elapsedMs'] <> '{}' or
            coalesce(step->>'id','') !~ '^[a-z][a-z_.]{0,63}$' or
            coalesce(step->>'status','') not in ('done','skipped','failed') or
            (step ? 'reason' and coalesce(step->>'reason','') !~ '^[a-z][a-z0-9_]{0,63}$') or
            case when jsonb_typeof(step->'elapsedMs') = 'number'
                then (step->>'elapsedMs')::numeric not between 0 and 300000
                else true end)
        then raise exception 'Invalid visitor steps' using errcode = '22023'; end if;
end;
$$;

create function public.complete_visitor_request(p_session_hash text,p_id uuid,p_result jsonb,
    p_failure_code text default null,p_steps jsonb default '[]')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    sid bytea := yeoback_private.visitor_hash(p_session_hash);
    row public.api_requests%rowtype;
    exhibition uuid;
    ref jsonb := p_result->'publication';
    pub public.publications%rowtype;
begin
    select exhibition_id into exhibition from public.api_requests where session_hash = sid and id = p_id;
    if not found then raise exception 'Visitor request not found' using errcode = 'P0002'; end if;
    -- Use the same ordering as reserve; the publication lock is shared with pause/revoke.
    perform yeoback_private.visitor_public_lock(exhibition,false);
    select * into row from public.api_requests where session_hash = sid and id = p_id for update;
    if not found then raise exception 'Visitor request not found' using errcode = 'P0002'; end if;
    if row.expires_at <= statement_timestamp() then raise exception 'Visitor request expired' using errcode = 'P1012'; end if;
    if row.state <> 'running' then
        if row.failure_code is not distinct from p_failure_code and
            (row.result - 'gapRecorded') is not distinct from p_result then
            if row.publication_id is not null and not exists (
                select 1 from yeoback_private.public_artworks(exhibition) p where p.id = row.publication_id
            ) then raise exception 'Publication changed' using errcode = '40001'; end if;
            return yeoback_private.visitor_envelope(row,false);
        end if;
        raise exception 'Visitor request already completed' using errcode = 'P1011';
    end if;
    if row.lease_until <= statement_timestamp() then
        update public.api_requests set state = 'failed',failure_code = 'REQUEST_TIMEOUT',updated_at = statement_timestamp()
            where id = row.id returning * into row;
        return yeoback_private.visitor_envelope(row,false);
    end if;
    perform yeoback_private.validate_visitor_steps(p_steps);
    if p_failure_code is not null then
        if p_result is not null or p_failure_code !~ '^[A-Z][A-Z0-9_]{0,63}$' then
            raise exception 'Invalid visitor failure' using errcode = '22023';
        end if;
        update public.api_requests set state = 'failed',failure_code = p_failure_code,steps = p_steps,
            updated_at = statement_timestamp() where id = row.id returning * into row;
        return yeoback_private.visitor_envelope(row,false);
    end if;
    if jsonb_typeof(p_result) is distinct from 'object' or
        p_result - array['answerId','requestId','contextSequence','inputMode','outputMode','answer',
            'citations','outcome','publication','source','mock'] <> '{}' or
        not p_result ?& array['answerId','requestId','contextSequence','inputMode','outputMode','answer',
            'citations','outcome','publication','source','mock'] or
        (p_result->>'answerId') is distinct from row.id::text or
        (p_result->>'requestId') is distinct from row.request_id::text or
        jsonb_typeof(p_result->'contextSequence') is distinct from 'number' or
        coalesce(p_result->>'contextSequence','') !~ '^[0-9]{1,16}$' or
        (p_result->>'contextSequence')::numeric > 9007199254740991 or
        coalesce(p_result->>'inputMode','') not in ('text','voice') or
        coalesce(p_result->>'outputMode','') not in ('text','voice') or
        coalesce(p_result->>'outcome','') not in ('answered','clarify','insufficient_evidence') or
        coalesce(p_result->>'source','') not in ('approved_narration','generated','fixed') or
        p_result->'mock' is distinct from to_jsonb(row.mock) or
        jsonb_typeof(p_result->'answer') is distinct from 'string' or
        coalesce(p_result->>'answer','') !~ '[^[:space:]]' or
        char_length(p_result->>'answer') > (case when p_result->>'source' = 'approved_narration' then 2000 else 600 end) or
        jsonb_typeof(p_result->'citations') is distinct from 'array'
        then raise exception 'Invalid visitor result' using errcode = '22023'; end if;
    if jsonb_array_length(p_result->'citations') > 12 or
        (p_result->>'outcome' = 'answered') <> (jsonb_array_length(p_result->'citations') > 0) or
        (p_result->>'outcome' = 'answered') = (p_result->>'source' = 'fixed') or
        (select count(distinct item) from jsonb_array_elements(p_result->'citations') item)
            <> jsonb_array_length(p_result->'citations')
        then raise exception 'Invalid visitor citations' using errcode = '22023'; end if;
    if ref = 'null'::jsonb then
        if p_result->>'outcome' <> 'clarify' then raise exception 'Publication required' using errcode = '22023'; end if;
        if not exists (select 1 from yeoback_private.public_artworks(exhibition)) then
            update public.api_requests set state = 'failed',failure_code = 'CONTENT_CHANGED',steps = p_steps,
                updated_at = statement_timestamp() where id = row.id returning * into row;
            return yeoback_private.visitor_envelope(row,false);
        end if;
    else
        if jsonb_typeof(ref) is distinct from 'object' or
            not ref ?& array['exhibitionId','artworkId','publicationId','version'] or
            ref - array['exhibitionId','artworkId','publicationId','version'] <> '{}' or
            jsonb_typeof(ref->'artworkId') is distinct from 'string' or
            jsonb_typeof(ref->'publicationId') is distinct from 'string' or
            jsonb_typeof(ref->'version') is distinct from 'number' or
            (ref->>'exhibitionId') is distinct from exhibition::text then
            raise exception 'Invalid visitor publication' using errcode = '22023';
        end if;
        select * into pub from yeoback_private.public_artworks(exhibition) p
            where p.id::text = ref->>'publicationId' and p.artwork_id::text = ref->>'artworkId'
                and to_jsonb(p.version) = ref->'version';
        if not found then
            update public.api_requests set state = 'failed',failure_code = 'CONTENT_CHANGED',steps = p_steps,
                updated_at = statement_timestamp() where id = row.id returning * into row;
            return yeoback_private.visitor_envelope(row,false);
        end if;
        if exists (select 1 from jsonb_array_elements(p_result->'citations') item
            where jsonb_typeof(item) <> 'string' or not exists (
                select 1 from jsonb_array_elements(pub.evidence->'items') e where e->'id' = item
            )) then raise exception 'Invalid visitor citations' using errcode = '22023'; end if;
        if p_result->>'source' = 'approved_narration' and (
            pub.narration_text is distinct from p_result->>'answer' or p_result->'citations' is distinct from (
                select jsonb_agg(c->'id' order by ord) from jsonb_array_elements(pub.narration_citations) with ordinality t(c,ord)
            )
        ) then raise exception 'Invalid approved narration' using errcode = '22023'; end if;
    end if;
    update public.api_requests set state = 'ready',result = p_result,steps = p_steps,
        artwork_id = pub.artwork_id,publication_id = pub.id,updated_at = statement_timestamp()
        where id = row.id returning * into row;
    return yeoback_private.visitor_envelope(row,false);
end;
$$;

create function public.record_visitor_steps(p_session_hash text,p_id uuid,p_steps jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare sid bytea := yeoback_private.visitor_hash(p_session_hash);
begin
    perform yeoback_private.validate_visitor_steps(p_steps);
    update public.api_requests set steps = p_steps
        where session_hash = sid and id = p_id and expires_at > statement_timestamp();
    if not found then raise exception 'Visitor request not found' using errcode = 'P0002'; end if;
end;
$$;

create function public.load_visitor_answer(p_session_hash text,p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
    select r.result from public.api_requests r
    where r.session_hash = yeoback_private.visitor_hash(p_session_hash)
        and r.id = p_id and r.state = 'ready' and r.expires_at > statement_timestamp()
        and exists (select 1 from yeoback_private.public_artworks(r.exhibition_id) p
            where r.publication_id is null or p.id = r.publication_id);
$$;

create function public.record_gap(p_session_hash text,p_request_id uuid,p_question text,p_enabled boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
    sid bytea := yeoback_private.visitor_hash(p_session_hash);
    row public.api_requests%rowtype;
    exhibition uuid;
    normalized text;
begin
    if p_enabled is not true then return false; end if;
    normalized := btrim(regexp_replace(p_question,'[[:space:]]+',' ','g'));
    if normalized is null or char_length(normalized) not between 1 and 500 or char_length(p_question) > 500 then
        raise exception 'Invalid gap question' using errcode = '22023';
    end if;
    select exhibition_id into exhibition from public.api_requests where session_hash = sid and request_id = p_request_id;
    if not found then return false; end if;
    perform yeoback_private.visitor_public_lock(exhibition,false);
    select * into row from public.api_requests where session_hash = sid and request_id = p_request_id for update;
    if not found or row.state <> 'ready' or row.expires_at <= statement_timestamp()
        or row.result->>'outcome' is distinct from 'insufficient_evidence' or row.publication_id is null
        or not exists (select 1 from yeoback_private.public_artworks(exhibition) p where p.id = row.publication_id)
        then return false; end if;
    if row.result->'gapRecorded' = 'true'::jsonb then return true; end if;
    delete from public.qa_gaps where publication_id = row.publication_id and question_key = lower(normalized)
        and status = 'open' and expires_at <= statement_timestamp();
    insert into public.qa_gaps(exhibition_id,artwork_id,publication_id,publication_version,question,question_key,expires_at)
    values (exhibition,row.artwork_id,row.publication_id,(row.result#>>'{publication,version}')::integer,
        normalized,lower(normalized),statement_timestamp() + yeoback_private.policy_integer('gap_retention_days') * interval '1 day')
    on conflict (publication_id,question_key) where status = 'open'
        do update set occurrences = public.qa_gaps.occurrences + 1;
    update public.api_requests set result = row.result || '{"gapRecorded":true}'::jsonb where id = row.id;
    return true;
end;
$$;

create function yeoback_private.gap_json(g public.qa_gaps)
returns jsonb language sql stable strict set search_path = '' as $$
    select jsonb_build_object('id',g.id,'exhibitionId',g.exhibition_id,'artworkId',g.artwork_id,
        'publicationId',g.publication_id,'publicationVersion',g.publication_version,'question',g.question,
        'count',g.occurrences,'status',g.status,'createdAt',g.created_at,'expiresAt',g.expires_at);
$$;

create function public.list_gaps(p_owner uuid,p_exhibition_id uuid,p_enabled boolean)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
    if p_enabled is not true then raise exception 'Not found' using errcode = 'P0002'; end if;
    perform yeoback_private.subject_scope(p_owner,'exhibition',p_exhibition_id);
    return coalesce((select jsonb_agg(yeoback_private.gap_json(g) order by g.created_at desc,g.id)
        from public.qa_gaps g where g.exhibition_id = p_exhibition_id and g.expires_at > statement_timestamp()),'[]');
end;
$$;

create function public.dismiss_gap(p_owner uuid,p_id uuid,p_enabled boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare gap public.qa_gaps%rowtype;
begin
    if p_enabled is not true then raise exception 'Not found' using errcode = 'P0002'; end if;
    perform yeoback_private.lock_publication(p_owner);
    select g.* into gap from public.qa_gaps g join public.exhibitions e on e.id = g.exhibition_id
        where g.id = p_id and e.owner_id = p_owner and e.deleted_at is null
            and g.expires_at > statement_timestamp() for update of g;
    if not found then raise exception 'Gap not found' using errcode = 'P0002'; end if;
    if gap.status = 'open' then
        update public.qa_gaps set status = 'dismissed' where id = gap.id returning * into gap;
    end if;
    return yeoback_private.gap_json(gap);
end;
$$;

create function yeoback_private.answer_previous_gaps()
returns trigger language plpgsql set search_path = '' as $$
begin
    if new.active_publication_id is not null and old.active_publication_id is distinct from new.active_publication_id then
        update public.qa_gaps set status = 'answered'
        where artwork_id = new.id and status = 'open' and publication_id <> new.active_publication_id;
    end if;
    return new;
end;
$$;
create trigger answer_previous_gaps after update of active_publication_id on public.artworks
    for each row execute function yeoback_private.answer_previous_gaps();

create function public.purge_expired()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare answers integer; gaps integer; jobs integer;
begin
    delete from public.api_requests where expires_at <= statement_timestamp();
    get diagnostics answers = row_count;
    delete from public.qa_gaps where expires_at <= statement_timestamp();
    get diagnostics gaps = row_count;
    delete from public.ai_jobs where expires_at <= statement_timestamp();
    get diagnostics jobs = row_count;
    delete from public.visitor_quota_events
    where reserved_at < date_trunc('day',statement_timestamp(),'UTC') - interval '1 minute';
    return jsonb_build_object('answers',answers,'gaps',gaps,'jobs',jobs);
end;
$$;

revoke all on function yeoback_private.visitor_hash(text),yeoback_private.visitor_envelope(public.api_requests,boolean),
    yeoback_private.visitor_public_lock(uuid,boolean),yeoback_private.validate_visitor_steps(jsonb),yeoback_private.gap_json(public.qa_gaps),yeoback_private.answer_previous_gaps(),
    public.reserve_visitor_request(text,uuid,uuid,text,boolean),public.complete_visitor_request(text,uuid,jsonb,text,jsonb),
    public.record_visitor_steps(text,uuid,jsonb),public.load_visitor_answer(text,uuid),public.record_gap(text,uuid,text,boolean),public.list_gaps(uuid,uuid,boolean),
    public.dismiss_gap(uuid,uuid,boolean),public.purge_expired() from public,anon,authenticated,service_role;
grant execute on function public.reserve_visitor_request(text,uuid,uuid,text,boolean),
    public.complete_visitor_request(text,uuid,jsonb,text,jsonb),public.record_visitor_steps(text,uuid,jsonb),public.load_visitor_answer(text,uuid),
    public.record_gap(text,uuid,text,boolean),public.purge_expired(),
    public.list_gaps(uuid,uuid,boolean),public.dismiss_gap(uuid,uuid,boolean) to service_role;
commit;
