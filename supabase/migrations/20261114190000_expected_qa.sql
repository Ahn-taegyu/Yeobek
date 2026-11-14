begin;

insert into public.app_policies(key,value) values
    ('expected_qa_artwork_max',3),('expected_qa_exhibition_max',5),('training_batch_artworks_max',30)
on conflict (key) do nothing;

alter table public.ai_jobs add column qa_exhibition_id uuid,
    add foreign key (owner_id,qa_exhibition_id) references public.exhibitions(owner_id,id),
    add foreign key (owner_id,qa_exhibition_id,artwork_id) references public.artworks(owner_id,exhibition_id,id);

do $migration$
declare existing_shape text;
begin
    select pg_get_expr(conbin,conrelid) into strict existing_shape from pg_catalog.pg_constraint
    where conrelid = 'public.ai_jobs'::regclass and conname = 'ai_jobs_kind_shape' and contype = 'c';
    alter table public.ai_jobs drop constraint ai_jobs_kind_shape;
    execute format($constraint$alter table public.ai_jobs add constraint ai_jobs_kind_shape check (
        ((%s) and qa_exhibition_id is null)
        or (kind in ('expected_qa','preview_answer','qa_rewrite')
            and num_nonnulls(qa_exhibition_id,document_id,expected_revision,expected_document_revision) = 4
            and expected_revision > 0 and expected_document_revision > 0
            and num_nonnulls(strategy,audio_approval_id,voice_config_version,voice_fingerprint,automation_event_id) = 0)
    )$constraint$,existing_shape);
end;
$migration$;
alter table public.ai_job_attempts add column qa_mock boolean;

create table yeoback_private.qa_item_versions (
    id uuid not null,
    version integer not null check (version > 0),
    owner_id uuid not null,
    exhibition_id uuid not null,
    artwork_id uuid,
    origin text not null check (origin in ('expected','rewrite','gap')),
    source_job_id uuid not null,
    source_attempt integer not null check (source_attempt > 0),
    question text not null check (char_length(question) between 1 and 500 and question ~ '[^[:space:]]'),
    answer text not null check (char_length(answer) between 1 and 600 and answer ~ '[^[:space:]]'),
    content_hash bytea not null check (octet_length(content_hash) = 32),
    source_fingerprint jsonb not null,
    citations jsonb not null check (jsonb_typeof(citations) = 'array'),
    state text not null default 'draft' check (state in ('draft','approved','withdrawn')),
    evidence_pins jsonb not null default '[]' check (jsonb_typeof(evidence_pins) = 'array'),
    mock boolean not null,
    created_at timestamptz not null default statement_timestamp(),
    approved_at timestamptz,
    withdrawn_at timestamptz,
    primary key (id,version),
    foreign key (owner_id,exhibition_id) references public.exhibitions(owner_id,id),
    foreign key (owner_id,exhibition_id,artwork_id) references public.artworks(owner_id,exhibition_id,id),
    check (state <> 'approved' or approved_at is not null),
    check ((state = 'withdrawn') = (withdrawn_at is not null))
);
create index qa_versions_scope on yeoback_private.qa_item_versions(owner_id,exhibition_id,artwork_id,created_at desc);
revoke all on yeoback_private.qa_item_versions from public,anon,authenticated,service_role;

create or replace function yeoback_private.assert_ai_quota(p_owner uuid)
returns void language plpgsql set search_path = '' as $$
declare day_start timestamptz := date_trunc('day',statement_timestamp(),'UTC');
begin
    if (select count(*) from public.ai_job_attempts a join public.ai_jobs j on j.id = a.job_id
        where a.owner_id = p_owner and j.kind in ('narration','audio','expected_qa','preview_answer','qa_rewrite')
        and a.reserved_at >= day_start and a.reserved_at < day_start + interval '24 hours')
        >= yeoback_private.policy_integer('author_jobs_per_day') then
        raise exception 'Daily author job limit reached' using errcode = 'P1004';
    end if;
end;
$$;

create function yeoback_private.qa_scope(p_owner uuid,p_exhibition uuid,p_artwork uuid)
returns uuid[] language plpgsql stable set search_path = '' as $$
declare scope uuid[];
begin
    scope := yeoback_private.subject_scope(p_owner,case when p_artwork is null then 'exhibition' else 'artwork' end,
        coalesce(p_artwork,p_exhibition));
    if scope[2] is distinct from p_exhibition then raise exception 'Subject not found' using errcode = 'P0002'; end if;
    return scope;
end;
$$;

create function yeoback_private.qa_inputs(p_owner uuid,p_exhibition uuid,p_artwork uuid)
returns jsonb language plpgsql set search_path = '' as $$
declare
    scope uuid[] := yeoback_private.qa_scope(p_owner,p_exhibition,p_artwork);
    target public.knowledge_documents%rowtype;
    exhibition_revision integer;
    artwork_revision integer;
    documents jsonb := '[]';
    sources jsonb := '[]';
    item record;
    excerpt text;
    excerpt_limit integer := least(2000,yeoback_private.policy_integer('evidence_body_chars'));
    used_chars integer := 0;
begin
    perform 1 from public.artist_profiles where owner_id = p_owner and id = scope[1] for share;
    select revision into exhibition_revision from public.exhibitions where owner_id = p_owner and id = p_exhibition
        and deleted_at is null for share;
    if not found then raise exception 'Subject not found' using errcode = 'P0002'; end if;
    if p_artwork is not null then
        select revision into artwork_revision from public.artworks where owner_id = p_owner and id = p_artwork
            and deleted_at is null for share;
        if not found then raise exception 'Subject not found' using errcode = 'P0002'; end if;
    end if;
    for item in select d.id,d.revision from public.knowledge_documents d where d.owner_id = p_owner
        and (d.artist_id = scope[1] or d.exhibition_id = p_exhibition or d.artwork_id = p_artwork)
        order by case d.subject_type when 'artwork' then 0 when 'exhibition' then 1 else 2 end for share
    loop
        documents := documents || jsonb_build_array(jsonb_build_array(item.id,item.revision));
    end loop;
    select * into strict target from public.knowledge_documents d where d.owner_id = p_owner
        and (d.artwork_id = p_artwork or (p_artwork is null and d.exhibition_id = p_exhibition));
    for item in select d.id,d.revision,d.subject_type,s.value->>'id' as section_id,s.value->>'body' as body
        from public.knowledge_documents d cross join lateral jsonb_array_elements(d.sections) s
        where d.owner_id = p_owner and (d.artist_id = scope[1] or d.exhibition_id = p_exhibition or d.artwork_id = p_artwork)
        order by case d.subject_type when 'artwork' then 0 when 'exhibition' then 1 else 2 end,s.value->>'id'
    loop
        exit when jsonb_array_length(sources) >= 12 or used_chars = 8000;
        excerpt := btrim(left(btrim(item.body),least(excerpt_limit,8000 - used_chars)));
        if excerpt is null or excerpt !~ '[^[:space:]]' then continue; end if;
        used_chars := used_chars + char_length(excerpt);
        sources := sources || jsonb_build_array(jsonb_build_object(
            'id',yeoback_private.narration_source_id(item.id,item.section_id,item.revision),
            'version',item.revision,'body',excerpt,'scope',item.subject_type,'sourceLabel',item.section_id,
            'sourceDocumentId',item.id,'sectionId',item.section_id,
            'bodyHash',encode(sha256(convert_to(excerpt,'UTF8')),'hex')));
    end loop;
    return jsonb_build_object('fingerprint',jsonb_build_array(exhibition_revision,artwork_revision,documents,
        (select coalesce(jsonb_agg(s->'bodyHash'),'[]') from jsonb_array_elements(sources) s)),
        'context',jsonb_build_object('ownerId',p_owner,'scope',target.subject_type,'exhibitionId',p_exhibition,
            'artworkId',p_artwork,'documentId',target.id,'revision',coalesce(artwork_revision,exhibition_revision),
            'documentRevision',target.revision,'sources',sources));
end;
$$;

create function yeoback_private.qa_job_json(job public.ai_jobs)
returns jsonb language sql stable strict set search_path = '' as $$
    select yeoback_private.ai_job_json(job) - 'strategy' || jsonb_build_object('exhibitionId',job.qa_exhibition_id,
        'scope',case when job.artwork_id is null then 'exhibition' else 'artwork' end);
$$;

create function yeoback_private.qa_worker_context(inputs jsonb)
returns jsonb language sql immutable strict set search_path = '' as $$
    select (inputs->'context') || jsonb_build_object('sources',coalesce(jsonb_agg(s - array['sourceDocumentId','sectionId','bodyHash']),'[]'))
    from jsonb_array_elements(inputs->'context'->'sources') s;
$$;

create function yeoback_private.reserve_qa_job(p_owner uuid,p_request_id uuid,p_exhibition_id uuid,p_artwork_id uuid,
    p_expected_revision integer,p_expected_document_revision integer,p_mock boolean,p_kind text)
returns jsonb language plpgsql set search_path = '' as $$
declare
    job public.ai_jobs%rowtype;
    replay public.ai_job_attempts%rowtype;
    inputs jsonb;
    context jsonb;
begin
    if num_nulls(p_owner,p_request_id,p_exhibition_id,p_expected_revision,p_expected_document_revision,p_mock) <> 0
        or p_kind is null or p_kind not in ('expected_qa','preview_answer','qa_rewrite') then
        raise exception 'Invalid Q&A job input' using errcode = '22023';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('yeobek:ai-jobs:' || p_owner::text,0));
    perform yeoback_private.qa_scope(p_owner,p_exhibition_id,p_artwork_id);
    select * into replay from public.ai_job_attempts where owner_id = p_owner and request_id = p_request_id;
    if found then
        select * into strict job from public.ai_jobs where id = replay.job_id and owner_id = p_owner;
        if replay.attempt <> 1 or job.kind <> p_kind or job.qa_exhibition_id is distinct from p_exhibition_id
            or job.artwork_id is distinct from p_artwork_id or job.expected_revision <> p_expected_revision
            or job.expected_document_revision <> p_expected_document_revision or replay.qa_mock is distinct from p_mock then
            raise exception 'Request ID already used with different input' using errcode = 'P1005';
        end if;
        if job.expires_at <= statement_timestamp() then raise exception 'Job not found' using errcode = 'P0002'; end if;
        return jsonb_build_object('job',yeoback_private.qa_job_json(job),'claimed',false,'context',null);
    end if;

    perform yeoback_private.assert_ai_quota(p_owner);
    inputs := yeoback_private.qa_inputs(p_owner,p_exhibition_id,p_artwork_id);
    context := inputs->'context';
    if (context->>'revision')::integer <> p_expected_revision
        or (context->>'documentRevision')::integer <> p_expected_document_revision then
        raise exception 'Q&A source revision conflict' using errcode = '40001';
    end if;
    insert into public.ai_jobs(owner_id,qa_exhibition_id,artwork_id,document_id,request_id,expected_revision,
        expected_document_revision,kind,source_fingerprint,source_ids,mock,lease_until,expires_at)
    values (p_owner,p_exhibition_id,p_artwork_id,(context->>'documentId')::uuid,p_request_id,p_expected_revision,
        p_expected_document_revision,p_kind,inputs->'fingerprint',
        (select coalesce(jsonb_agg(s->'id'),'[]') from jsonb_array_elements(context->'sources') s),p_mock,
        clock_timestamp() + yeoback_private.policy_integer('job_lease_seconds') * interval '1 second',
        clock_timestamp() + yeoback_private.policy_integer('job_retention_days') * interval '1 day')
    returning * into job;
    insert into public.ai_job_attempts(owner_id,job_id,attempt,request_id,qa_mock)
        values (p_owner,job.id,job.attempt,p_request_id,p_mock);
    return jsonb_build_object('job',yeoback_private.qa_job_json(job),'claimed',true,'context',yeoback_private.qa_worker_context(inputs));
end;
$$;

create function public.reserve_expected_qa_job(p_owner uuid,p_request_id uuid,p_exhibition_id uuid,p_artwork_id uuid,
    p_expected_revision integer,p_expected_document_revision integer,p_mock boolean)
returns jsonb language sql security definer set search_path = '' as $$
    select yeoback_private.reserve_qa_job(p_owner,p_request_id,p_exhibition_id,p_artwork_id,p_expected_revision,
        p_expected_document_revision,p_mock,'expected_qa');
$$;

create function yeoback_private.retry_qa_job(p_owner uuid,p_job_id uuid,p_request_id uuid,p_expected_attempt integer,
    p_mock boolean,p_kind text)
returns jsonb language plpgsql set search_path = '' as $$
declare
    job public.ai_jobs%rowtype;
    replay public.ai_job_attempts%rowtype;
    inputs jsonb;
begin
    if num_nulls(p_owner,p_job_id,p_request_id,p_expected_attempt,p_mock) <> 0 or p_expected_attempt < 1 then
        raise exception 'Invalid Q&A retry input' using errcode = '22023';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('yeobek:ai-jobs:' || p_owner::text,0));
    select * into job from public.ai_jobs where owner_id = p_owner and id = p_job_id and kind = p_kind for update;
    if not found or job.expires_at <= clock_timestamp() then raise exception 'Job not found' using errcode = 'P0002'; end if;
    perform yeoback_private.qa_scope(p_owner,job.qa_exhibition_id,job.artwork_id);
    select * into replay from public.ai_job_attempts where owner_id = p_owner and request_id = p_request_id;
    if found then
        if replay.job_id <> p_job_id or replay.attempt - 1 <> p_expected_attempt or replay.qa_mock is distinct from p_mock then
            raise exception 'Request ID already used with different input' using errcode = 'P1005';
        end if;
        return jsonb_build_object('job',yeoback_private.qa_job_json(job),'claimed',false,'context',null);
    end if;
    if job.attempt <> p_expected_attempt or job.status not in ('failed','cancelled','running')
        or (job.status = 'running' and job.lease_until > clock_timestamp()) then
        raise exception 'Job attempt cannot be retried' using errcode = 'P1006';
    end if;
    perform yeoback_private.assert_ai_quota(p_owner);
    inputs := yeoback_private.qa_inputs(p_owner,job.qa_exhibition_id,job.artwork_id);
    if inputs->'fingerprint' is distinct from job.source_fingerprint then
        raise exception 'Q&A source revision conflict' using errcode = '40001';
    end if;
    if job.status = 'running' then
        update public.ai_job_attempts set completed_at = statement_timestamp(),result_code = 'REQUEST_TIMEOUT'
            where job_id = job.id and attempt = job.attempt;
    end if;
    update public.ai_jobs set attempt = job.attempt + 1,status = 'running',routing = 'none',result_code = null,
        result = null,mock = p_mock,lease_until = clock_timestamp() + yeoback_private.policy_integer('job_lease_seconds') * interval '1 second',
        expires_at = clock_timestamp() + yeoback_private.policy_integer('job_retention_days') * interval '1 day',
        updated_at = statement_timestamp() where id = job.id returning * into job;
    insert into public.ai_job_attempts(owner_id,job_id,attempt,request_id,qa_mock)
        values (p_owner,job.id,job.attempt,p_request_id,p_mock);
    return jsonb_build_object('job',yeoback_private.qa_job_json(job),'claimed',true,'context',yeoback_private.qa_worker_context(inputs));
end;
$$;

create function public.retry_expected_qa_job(p_owner uuid,p_job_id uuid,p_request_id uuid,p_expected_attempt integer,p_mock boolean)
returns jsonb language sql security definer set search_path = '' as $$
    select yeoback_private.retry_qa_job(p_owner,p_job_id,p_request_id,p_expected_attempt,p_mock,'expected_qa');
$$;

create function public.get_expected_qa_job(p_job_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    owner uuid := yeoback_private.require_owner();
    job public.ai_jobs%rowtype;
begin
    select * into job from public.ai_jobs where owner_id = owner and id = p_job_id and kind = 'expected_qa';
    if not found or job.expires_at <= statement_timestamp() then raise exception 'Job not found' using errcode = 'P0002'; end if;
    perform yeoback_private.qa_scope(owner,job.qa_exhibition_id,job.artwork_id);
    return yeoback_private.qa_job_json(job);
end;
$$;

create function yeoback_private.finish_qa_attempt(p_job public.ai_jobs,p_status text,p_code text,p_routing text,
    p_result jsonb,p_response jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare job public.ai_jobs%rowtype;
begin
    update public.ai_jobs set status = p_status,result_code = p_code,routing = p_routing,result = p_result,
        mock = p_job.mock or coalesce(p_response->'mock' = 'true'::jsonb,false),updated_at = statement_timestamp()
    where id = p_job.id returning * into job;
    update public.ai_job_attempts set completed_at = statement_timestamp(),result_code = p_code,
        completion_fingerprint = sha256(convert_to(p_response::text,'UTF8')),
        duration_ms = case when (p_response->>'elapsedMs') ~ '^[0-9]{1,8}$' then (p_response->>'elapsedMs')::integer end,
        usage = case when jsonb_typeof(p_response->'usage') = 'array' and octet_length(p_response->>'usage') <= 16384
            then p_response->'usage' end,
        steps = case when jsonb_typeof(p_response->'steps') = 'array' and octet_length(p_response->>'steps') <= 16384
            then p_response->'steps' end
    where job_id = p_job.id and attempt = p_job.attempt;
    return yeoback_private.qa_job_json(job);
end;
$$;

create function yeoback_private.qa_candidate_citations(p_candidate jsonb,p_inputs jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare citations jsonb;
begin
    if jsonb_typeof(p_candidate) is distinct from 'object'
        or p_candidate - array['question','answer','citations'] <> '{}'
        or jsonb_typeof(p_candidate->'question') is distinct from 'string'
        or jsonb_typeof(p_candidate->'answer') is distinct from 'string'
        or (p_candidate->>'question') !~ '[^[:space:]]' or char_length(p_candidate->>'question') > 500
        or (p_candidate->>'answer') !~ '[^[:space:]]' or char_length(p_candidate->>'answer') > 600
        or jsonb_typeof(p_candidate->'citations') is distinct from 'array' then
        raise exception 'Invalid Q&A candidate' using errcode = '22023';
    end if;
    if jsonb_array_length(p_candidate->'citations') not between 1 and 12 then
        raise exception 'Invalid Q&A citations' using errcode = '22023';
    end if;
    select coalesce(jsonb_agg(source - 'body' order by source->>'id'),'[]') into citations
    from jsonb_array_elements(p_inputs->'context'->'sources') source
    where p_candidate->'citations' @> jsonb_build_array(source->'id');
    if jsonb_array_length(citations) <> jsonb_array_length(p_candidate->'citations') then
        raise exception 'Invalid Q&A citations' using errcode = '22023';
    end if;
    return citations;
end;
$$;

create function public.complete_expected_qa_job(p_owner uuid,p_job_id uuid,p_attempt integer,p_result jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    job public.ai_jobs%rowtype;
    inputs jsonb;
    item jsonb;
    citations jsonb;
    item_id uuid;
    item_ids jsonb := '[]';
    result_status text := p_result->>'status';
    result_code text := p_result->>'resultCode';
    result_routing text := coalesce(p_result->>'routing','none');
    limit_count integer;
    result_mock boolean;
begin
    if p_attempt is null or jsonb_typeof(p_result) is distinct from 'object' then
        raise exception 'Invalid Q&A job result' using errcode = '22023';
    end if;
    select * into job from public.ai_jobs where owner_id = p_owner and id = p_job_id and kind = 'expected_qa' for update;
    if not found or job.expires_at <= clock_timestamp() then raise exception 'Job not found' using errcode = 'P0002'; end if;
    perform yeoback_private.qa_scope(p_owner,job.qa_exhibition_id,job.artwork_id);
    if p_attempt <> job.attempt then return yeoback_private.qa_job_json(job); end if;
    if job.status <> 'running' then
        if not exists (select 1 from public.ai_job_attempts where job_id = job.id and attempt = p_attempt
            and completion_fingerprint = sha256(convert_to(p_result::text,'UTF8'))) then
            raise exception 'Job attempt completed with different result' using errcode = 'P1006';
        end if;
        return yeoback_private.qa_job_json(job);
    end if;
    if job.lease_until <= clock_timestamp() then return yeoback_private.qa_job_json(job); end if;

    inputs := yeoback_private.qa_inputs(p_owner,job.qa_exhibition_id,job.artwork_id);
    if inputs->'fingerprint' is distinct from job.source_fingerprint then
        return yeoback_private.finish_qa_attempt(job,'failed','REVISION_CONFLICT','author',null,p_result);
    end if;
    if result_status in ('abstained','failed','cancelled') and result_code ~ '^[A-Z][A-Z0-9_]{0,63}$'
        and result_routing in ('author','operator','none') then
        return yeoback_private.finish_qa_attempt(job,result_status,result_code,result_routing,null,p_result);
    end if;
    if result_status is distinct from 'succeeded' or jsonb_typeof(p_result->'items') is distinct from 'array' then
        raise exception 'Invalid Q&A job result' using errcode = '22023';
    end if;
    if jsonb_array_length(p_result->'items') = 0 then
        return yeoback_private.finish_qa_attempt(job,'abstained','EVIDENCE_REQUIRED','author',null,p_result);
    end if;
    limit_count := case when job.artwork_id is null then least(5,yeoback_private.policy_integer('expected_qa_exhibition_max'))
        else least(3,yeoback_private.policy_integer('expected_qa_artwork_max')) end;
    if jsonb_array_length(p_result->'items') > limit_count then
        raise exception 'Too many Q&A candidates' using errcode = '22023';
    end if;
    result_mock := job.mock or coalesce(p_result->'mock' = 'true'::jsonb,false);
    for item in select value from jsonb_array_elements(p_result->'items') loop
        citations := yeoback_private.qa_candidate_citations(item,inputs);
        item_id := gen_random_uuid();
        insert into yeoback_private.qa_item_versions(id,version,owner_id,exhibition_id,artwork_id,origin,
            source_job_id,source_attempt,question,answer,content_hash,source_fingerprint,citations,mock)
        values (item_id,1,p_owner,job.qa_exhibition_id,job.artwork_id,'expected',job.id,job.attempt,
            item->>'question',item->>'answer',sha256(convert_to(jsonb_build_array(item->>'question',item->>'answer')::text,'UTF8')),
            job.source_fingerprint,citations,result_mock);
        item_ids := item_ids || jsonb_build_array(item_id);
    end loop;
    return yeoback_private.finish_qa_attempt(job,'succeeded','OK','none',
        jsonb_build_object('itemIds',item_ids,'mock',result_mock),p_result);
end;
$$;

create function yeoback_private.qa_item_json(item yeoback_private.qa_item_versions)
returns jsonb language sql stable strict set search_path = '' as $$
    select jsonb_build_object('id',item.id,'version',item.version,'exhibitionId',item.exhibition_id,'artworkId',item.artwork_id,
        'scope',case when item.artwork_id is null then 'exhibition' else 'artwork' end,'origin',item.origin,
        'sourceJobId',item.source_job_id,'sourceAttempt',item.source_attempt,'question',item.question,'answer',item.answer,
        'contentHash',encode(item.content_hash,'hex'),'citations',item.citations,'state',item.state,'evidencePins',item.evidence_pins,
        'mock',item.mock,'createdAt',item.created_at,'approvedAt',item.approved_at,'withdrawnAt',item.withdrawn_at);
$$;

create function public.list_qa_items(p_exhibition_id uuid,p_artwork_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare owner uuid := yeoback_private.require_owner();
begin
    perform yeoback_private.qa_scope(owner,p_exhibition_id,p_artwork_id);
    return coalesce((select jsonb_agg(yeoback_private.qa_item_json(q) order by q.created_at desc,q.id,q.version desc)
        from yeoback_private.qa_item_versions q where q.owner_id = owner and q.exhibition_id = p_exhibition_id
            and q.artwork_id is not distinct from p_artwork_id),'[]');
end;
$$;

create function public.approve_qa_item(p_item_id uuid,p_expected_version integer,p_evidence_pins jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    owner uuid := yeoback_private.require_owner();
    item yeoback_private.qa_item_versions%rowtype;
    pin jsonb;
    evidence public.evidence_items%rowtype;
    matched jsonb;
    matched_ids jsonb := '[]';
    pins jsonb;
begin
    if jsonb_typeof(p_evidence_pins) is distinct from 'array' then
        raise exception 'Invalid Q&A approval pins' using errcode = '22023';
    end if;
    if jsonb_array_length(p_evidence_pins) not between 1 and 12 then
        raise exception 'Invalid Q&A approval pins' using errcode = '22023';
    end if;
    perform yeoback_private.lock_publication(owner);
    select * into item from yeoback_private.qa_item_versions where owner_id = owner and id = p_item_id
        order by version desc limit 1 for update;
    if not found then raise exception 'Q&A item not found' using errcode = 'P0002'; end if;
    perform yeoback_private.qa_scope(owner,item.exhibition_id,item.artwork_id);
    if item.version is distinct from p_expected_version then raise exception 'Q&A version conflict' using errcode = '40001'; end if;
    select jsonb_agg(value order by value) into pins from jsonb_array_elements(p_evidence_pins);
    if item.state = 'approved' and item.evidence_pins = pins then return yeoback_private.qa_item_json(item); end if;
    if item.state <> 'draft' then raise exception 'Q&A item cannot be approved' using errcode = '40001'; end if;
    if item.source_fingerprint is distinct from (yeoback_private.qa_inputs(owner,item.exhibition_id,item.artwork_id)->'fingerprint') then
        raise exception 'Q&A source revision conflict' using errcode = '40001';
    end if;
    for pin in select value from jsonb_array_elements(pins) loop
        if jsonb_typeof(pin) is distinct from 'object' or pin - array['id','version'] <> '{}'
            or jsonb_typeof(pin->'id') is distinct from 'string' or jsonb_typeof(pin->'version') is distinct from 'number' then
            raise exception 'Invalid Q&A approval pin' using errcode = '22023';
        end if;
        select * into evidence from public.evidence_items e where e.owner_id = owner and e.exhibition_id = item.exhibition_id
            and (e.artwork_id is null or e.artwork_id = item.artwork_id)
            and e.id = (pin->>'id')::uuid and e.version = (pin->>'version')::integer for share;
        if not found or not yeoback_private.evidence_is_current(evidence) then
            raise exception 'Q&A evidence is unavailable' using errcode = 'P1002';
        end if;
        select c into matched from jsonb_array_elements(item.citations) c
        where c->>'bodyHash' = encode(evidence.content_hash,'hex') and c->>'scope' = evidence.scope
            and ((evidence.source_kind = 'document' and c->>'sourceDocumentId' = evidence.source_document_id::text
                and c->>'sectionId' = evidence.source_section_id and (c->>'version')::integer = evidence.source_revision)
                or (c->>'evidenceId' = evidence.id::text and (c->>'version')::integer = evidence.version));
        if not found or matched_ids @> jsonb_build_array(matched->'id') then
            raise exception 'Q&A approval pins must match cited sources' using errcode = '22023';
        end if;
        matched_ids := matched_ids || jsonb_build_array(matched->'id');
    end loop;
    if jsonb_array_length(matched_ids) <> jsonb_array_length(item.citations) then
        raise exception 'Q&A approval pins must match cited sources' using errcode = '22023';
    end if;
    update yeoback_private.qa_item_versions set state = 'approved',approved_at = statement_timestamp(),evidence_pins = pins
    where id = item.id and version = item.version returning * into item;
    return yeoback_private.qa_item_json(item);
exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Invalid Q&A approval pin' using errcode = '22023';
end;
$$;

create function public.withdraw_qa_item(p_item_id uuid,p_expected_version integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    owner uuid := yeoback_private.require_owner();
    item yeoback_private.qa_item_versions%rowtype;
begin
    perform yeoback_private.lock_publication(owner);
    select * into item from yeoback_private.qa_item_versions where owner_id = owner and id = p_item_id
        and version = p_expected_version for update;
    if not found then raise exception 'Q&A item version not found' using errcode = 'P0002'; end if;
    perform yeoback_private.qa_scope(owner,item.exhibition_id,item.artwork_id);
    if item.state <> 'withdrawn' then
        update yeoback_private.qa_item_versions set state = 'withdrawn',withdrawn_at = statement_timestamp()
        where id = item.id and version = item.version returning * into item;
    end if;
    return yeoback_private.qa_item_json(item);
end;
$$;

revoke all on function yeoback_private.qa_scope(uuid,uuid,uuid),yeoback_private.qa_inputs(uuid,uuid,uuid),
    yeoback_private.qa_job_json(public.ai_jobs),yeoback_private.qa_worker_context(jsonb),
    yeoback_private.reserve_qa_job(uuid,uuid,uuid,uuid,integer,integer,boolean,text),
    yeoback_private.retry_qa_job(uuid,uuid,uuid,integer,boolean,text),
    yeoback_private.finish_qa_attempt(public.ai_jobs,text,text,text,jsonb,jsonb),
    yeoback_private.qa_candidate_citations(jsonb,jsonb),yeoback_private.qa_item_json(yeoback_private.qa_item_versions),
    public.reserve_expected_qa_job(uuid,uuid,uuid,uuid,integer,integer,boolean),
    public.retry_expected_qa_job(uuid,uuid,uuid,integer,boolean),public.complete_expected_qa_job(uuid,uuid,integer,jsonb),
    public.get_expected_qa_job(uuid),public.list_qa_items(uuid,uuid),public.approve_qa_item(uuid,integer,jsonb),
    public.withdraw_qa_item(uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.reserve_expected_qa_job(uuid,uuid,uuid,uuid,integer,integer,boolean),
    public.retry_expected_qa_job(uuid,uuid,uuid,integer,boolean),public.complete_expected_qa_job(uuid,uuid,integer,jsonb) to service_role;
grant execute on function public.get_expected_qa_job(uuid),public.list_qa_items(uuid,uuid),
    public.approve_qa_item(uuid,integer,jsonb),public.withdraw_qa_item(uuid,integer) to authenticated;

commit;
