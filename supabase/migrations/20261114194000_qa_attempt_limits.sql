begin;

alter table public.ai_job_attempts add column qa_max_items integer check (qa_max_items between 1 and 5);

create function yeoback_private.expected_qa_limit(p_artwork_id uuid)
returns integer language sql stable set search_path = '' as $$
    select case when p_artwork_id is null then least(5,yeoback_private.policy_integer('expected_qa_exhibition_max'))
        else least(3,yeoback_private.policy_integer('expected_qa_artwork_max')) end::integer;
$$;

-- Requests already reserved by the preceding deployment receive a bound before any new
-- worker can complete them. New claims store the policy in their attempt row transaction.
update public.ai_job_attempts a set qa_max_items = yeoback_private.expected_qa_limit(j.artwork_id)
from public.ai_jobs j where j.id = a.job_id and j.kind = 'expected_qa'
    and a.attempt = j.attempt and j.status = 'running';

create function yeoback_private.qa_claim_context(p_inputs jsonb,p_limit integer)
returns jsonb language sql immutable set search_path = '' as $$
    select yeoback_private.qa_worker_context(p_inputs)
        || case when p_limit is null then '{}'::jsonb else jsonb_build_object('maxItems',p_limit) end;
$$;


create or replace function yeoback_private.reserve_qa_job(p_owner uuid,p_request_id uuid,p_exhibition_id uuid,p_artwork_id uuid,
    p_expected_revision integer,p_expected_document_revision integer,p_mock boolean,p_kind text)
returns jsonb language plpgsql set search_path = '' as $$
declare
    job public.ai_jobs%rowtype;
    replay public.ai_job_attempts%rowtype;
    inputs jsonb;
    context jsonb;
    max_items integer;
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
    if p_kind = 'expected_qa' then max_items := yeoback_private.expected_qa_limit(job.artwork_id); end if;
    insert into public.ai_job_attempts(owner_id,job_id,attempt,request_id,qa_mock,qa_max_items)
        values (p_owner,job.id,job.attempt,p_request_id,p_mock,max_items);
    return jsonb_build_object('job',yeoback_private.qa_job_json(job),'claimed',true,'context',yeoback_private.qa_claim_context(inputs,max_items));
end;
$$;

create or replace function yeoback_private.retry_qa_job(p_owner uuid,p_job_id uuid,p_request_id uuid,p_expected_attempt integer,
    p_mock boolean,p_kind text)
returns jsonb language plpgsql set search_path = '' as $$
declare
    job public.ai_jobs%rowtype;
    replay public.ai_job_attempts%rowtype;
    inputs jsonb;
    max_items integer;
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
    if job.expires_at <= clock_timestamp() then raise exception 'Job not found' using errcode = 'P0002'; end if;
    if job.status = 'running' then
        update public.ai_job_attempts set completed_at = statement_timestamp(),result_code = 'REQUEST_TIMEOUT'
            where job_id = job.id and attempt = job.attempt;
    end if;
    update public.ai_jobs set attempt = job.attempt + 1,status = 'running',routing = 'none',result_code = null,
        result = null,mock = p_mock,lease_until = clock_timestamp() + yeoback_private.policy_integer('job_lease_seconds') * interval '1 second',
        expires_at = clock_timestamp() + yeoback_private.policy_integer('job_retention_days') * interval '1 day',
        updated_at = statement_timestamp() where id = job.id returning * into job;
    if p_kind = 'expected_qa' then max_items := yeoback_private.expected_qa_limit(job.artwork_id); end if;
    insert into public.ai_job_attempts(owner_id,job_id,attempt,request_id,qa_mock,qa_max_items)
        values (p_owner,job.id,job.attempt,p_request_id,p_mock,max_items);
    return jsonb_build_object('job',yeoback_private.qa_job_json(job),'claimed',true,'context',yeoback_private.qa_claim_context(inputs,max_items));
end;
$$;

create or replace function public.complete_expected_qa_job(p_owner uuid,p_job_id uuid,p_attempt integer,p_result jsonb)
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
    if job.expires_at <= clock_timestamp() then raise exception 'Job not found' using errcode = 'P0002'; end if;
    if job.lease_until <= clock_timestamp() then
        return yeoback_private.finish_qa_attempt(job,'failed','REQUEST_TIMEOUT','operator',null,p_result);
    end if;
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
    select qa_max_items into strict limit_count from public.ai_job_attempts
    where job_id = job.id and attempt = p_attempt;
    if limit_count is null then raise exception 'Q&A attempt limit unavailable' using errcode = 'P1003'; end if;
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

create or replace function public.complete_preview_answer(p_owner uuid,p_answer_id uuid,p_attempt integer,p_result jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    job public.ai_jobs%rowtype;
    question text;
    inputs jsonb;
    result_status text := p_result->>'status';
    result_code text := p_result->>'resultCode';
    routing text := coalesce(p_result->>'routing','none');
    completed jsonb;
begin
    if p_attempt is null or jsonb_typeof(p_result) is distinct from 'object' then
        raise exception 'Invalid preview result' using errcode = '22023';
    end if;
    select * into job from public.ai_jobs where owner_id = p_owner and id = p_answer_id and kind = 'preview_answer' for update;
    if not found or job.expires_at <= clock_timestamp() then raise exception 'Preview answer not found' using errcode = 'P0002'; end if;
    perform yeoback_private.qa_scope(p_owner,job.qa_exhibition_id,job.artwork_id);
    select r.question into strict question from yeoback_private.qa_job_requests r where r.job_id = job.id;
    if p_attempt <> job.attempt or (job.status = 'running' and job.lease_until <= clock_timestamp()) then
        return yeoback_private.qa_preview_json(job,question);
    end if;
    if job.status <> 'running' then
        if not exists (select 1 from public.ai_job_attempts where job_id = job.id and attempt = p_attempt
            and completion_fingerprint = sha256(convert_to(p_result::text,'UTF8'))) then
            raise exception 'Job attempt completed with different result' using errcode = 'P1006';
        end if;
        return yeoback_private.qa_preview_json(job,question);
    end if;
    inputs := yeoback_private.qa_inputs(p_owner,job.qa_exhibition_id,job.artwork_id);
    if job.expires_at <= clock_timestamp() then raise exception 'Job not found' using errcode = 'P0002'; end if;
    if job.lease_until <= clock_timestamp() then
        return yeoback_private.finish_qa_attempt(job,'failed','REQUEST_TIMEOUT','operator',null,p_result)
            || jsonb_build_object('question',question);
    end if;
    if inputs->'fingerprint' is distinct from job.source_fingerprint then
        completed := yeoback_private.finish_qa_attempt(job,'failed','REVISION_CONFLICT','author',null,p_result);
    elsif result_status in ('abstained','failed','cancelled') and result_code ~ '^[A-Z][A-Z0-9_]{0,63}$'
        and routing in ('author','operator','none') then
        completed := yeoback_private.finish_qa_attempt(job,result_status,result_code,routing,null,p_result);
    elsif result_status = 'succeeded' then
        perform yeoback_private.qa_candidate_citations(jsonb_build_object('question',question,
            'answer',p_result->'answer','citations',p_result->'citations'),inputs);
        completed := yeoback_private.finish_qa_attempt(job,'succeeded','OK','none',
            jsonb_build_object('answer',p_result->'answer','citations',p_result->'citations',
                'mock',job.mock or coalesce(p_result->'mock' = 'true'::jsonb,false)),p_result);
    else
        raise exception 'Invalid preview result' using errcode = '22023';
    end if;
    return completed || jsonb_build_object('question',question);
end;
$$;

create or replace function yeoback_private.qa_review_target(p_owner uuid,p_kind text,p_id uuid,p_version integer)
returns jsonb language plpgsql set search_path = '' as $$
declare
    job public.ai_jobs%rowtype;
    item yeoback_private.qa_item_versions%rowtype;
    question text;
begin
    if p_kind = 'gap' then
        raise exception 'Gap Q&A conversion is unavailable' using errcode = 'P0002';
    end if;
    if p_id is null or p_kind is null or p_kind not in ('preview','qa')
        or (p_kind = 'qa' and (p_version is null or p_version < 1))
        or (p_kind <> 'qa' and p_version is not null) then
        raise exception 'Invalid Q&A review target' using errcode = '22023';
    end if;
    if p_kind = 'preview' then
        select * into job from public.ai_jobs where id = p_id and owner_id = p_owner and kind = 'preview_answer'
            and status = 'succeeded' and expires_at > statement_timestamp();
        if not found then raise exception 'Preview answer not found' using errcode = 'P0002'; end if;
        select r.question into strict question from yeoback_private.qa_job_requests r where r.job_id = job.id;
        return jsonb_build_object('exhibitionId',job.qa_exhibition_id,'artworkId',job.artwork_id,
            'question',question,'previousAnswer',job.result->'answer','mock',job.mock);
    elsif p_kind = 'qa' then
        select * into item from yeoback_private.qa_item_versions where owner_id = p_owner and id = p_id
            order by version desc limit 1;
        if not found then raise exception 'Q&A item not found' using errcode = 'P0002'; end if;
        if item.version <> p_version or item.state = 'withdrawn' then
            raise exception 'Q&A version conflict' using errcode = '40001';
        end if;
        return jsonb_build_object('exhibitionId',item.exhibition_id,'artworkId',item.artwork_id,
            'question',item.question,'previousAnswer',item.answer,'mock',item.mock);
    end if;
end;
$$;

create or replace function public.create_qa_correction_evidence(p_target_kind text,p_target_id uuid,p_target_version integer,
    p_request_id uuid,p_source_label text,p_source_body text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    owner uuid := yeoback_private.require_owner();
    target jsonb;
    evidence jsonb;
    prior yeoback_private.qa_correction_evidence%rowtype;
    fingerprint bytea := sha256(convert_to(jsonb_build_array(p_target_kind,p_target_id,p_target_version,
        p_source_label,p_source_body)::text,'UTF8'));
    artwork_id uuid;
    created_evidence_id uuid;
begin
    if p_target_kind = 'gap' then
        raise exception 'Gap Q&A conversion is unavailable' using errcode = 'P0002';
    end if;
    if p_request_id is null then raise exception 'Invalid Q&A correction request' using errcode = '22023'; end if;
    perform yeoback_private.lock_publication(owner);
    select * into prior from yeoback_private.qa_correction_evidence where owner_id = owner and request_id = p_request_id;
    if found then
        if prior.input_hash <> fingerprint then raise exception 'Request ID already used with different input' using errcode = 'P1005'; end if;
        return (select yeoback_private.evidence_json(e) from public.evidence_items e
            where e.id = prior.evidence_id and e.version = prior.evidence_version);
    end if;
    target := yeoback_private.qa_review_target(owner,p_target_kind,p_target_id,p_target_version);
    artwork_id := (target->>'artworkId')::uuid;
    evidence := public.upsert_evidence((target->>'exhibitionId')::uuid,artwork_id,
        case when artwork_id is null then 'exhibition' else 'artwork' end,
        p_source_label,p_source_body,'{"kind":"direct"}',null,null);
    created_evidence_id := (evidence->>'id')::uuid;
    insert into yeoback_private.qa_correction_evidence(owner_id,request_id,target_kind,target_id,target_version,
        target_recheck_publication_id,evidence_id,evidence_version,input_hash)
    values (owner,p_request_id,p_target_kind,p_target_id,p_target_version,(target->>'recheckPublicationId')::uuid,
        created_evidence_id,(evidence->>'version')::integer,fingerprint);
    return evidence;
end;
$$;

create or replace function public.reserve_qa_rewrite_job(p_owner uuid,p_request_id uuid,p_target_kind text,p_target_id uuid,
    p_target_version integer,p_instruction text,p_evidence_pins jsonb,p_mock boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    prior public.ai_jobs%rowtype;
    saved yeoback_private.qa_job_requests%rowtype;
    target jsonb;
    inputs jsonb;
    sources jsonb;
    pins jsonb;
    reservation jsonb;
    exhibition uuid;
    artwork uuid;
begin
    if p_target_kind = 'gap' then
        raise exception 'Gap Q&A conversion is unavailable' using errcode = 'P0002';
    end if;
    if num_nulls(p_owner,p_request_id,p_instruction,p_mock) <> 0
        or char_length(p_instruction) not between 1 and 2000 or p_instruction !~ '[^[:space:]]'
        or jsonb_typeof(p_evidence_pins) is distinct from 'array' then
        raise exception 'Invalid Q&A rewrite request' using errcode = '22023';
    end if;
    select coalesce(jsonb_agg(value order by value),'[]') into pins from jsonb_array_elements(p_evidence_pins);
    perform pg_advisory_xact_lock(hashtextextended('yeobek:ai-jobs:' || p_owner::text,0));
    select j.* into prior from public.ai_jobs j join public.ai_job_attempts a on a.job_id = j.id
        where a.owner_id = p_owner and a.request_id = p_request_id;
    if found then
        select * into saved from yeoback_private.qa_job_requests where job_id = prior.id;
        if saved.target_kind is distinct from p_target_kind or saved.target_id is distinct from p_target_id
            or saved.target_version is distinct from p_target_version or saved.instruction is distinct from p_instruction
            or saved.rewrite_sources is distinct from pins then
            raise exception 'Request ID already used with different input' using errcode = 'P1005';
        end if;
        return yeoback_private.reserve_qa_job(p_owner,p_request_id,prior.qa_exhibition_id,prior.artwork_id,
            prior.expected_revision,prior.expected_document_revision,p_mock,'qa_rewrite');
    end if;
    perform yeoback_private.lock_publication(p_owner);
    target := yeoback_private.qa_review_target(p_owner,p_target_kind,p_target_id,p_target_version);
    if p_mock is false and target->'mock' = 'true'::jsonb then
        raise exception 'Mock answer cannot be rewritten in live mode' using errcode = 'P1002';
    end if;
    exhibition := (target->>'exhibitionId')::uuid;
    artwork := (target->>'artworkId')::uuid;
    inputs := yeoback_private.qa_inputs(p_owner,exhibition,artwork);
    sources := yeoback_private.qa_rewrite_sources(p_owner,exhibition,artwork,pins);
    reservation := yeoback_private.reserve_qa_job(p_owner,p_request_id,exhibition,artwork,
        (inputs#>>'{context,revision}')::integer,(inputs#>>'{context,documentRevision}')::integer,p_mock,'qa_rewrite');
    insert into yeoback_private.qa_job_requests(job_id,question,target_kind,target_id,target_version,instruction,
        previous_answer,rewrite_sources,target_recheck_publication_id)
    values ((reservation#>>'{job,id}')::uuid,target->>'question',p_target_kind,p_target_id,p_target_version,p_instruction,
        target->>'previousAnswer',pins,(target->>'recheckPublicationId')::uuid) returning * into saved;
    return jsonb_set(reservation,'{context}',yeoback_private.qa_rewrite_context(inputs,sources,saved))
        || jsonb_build_object('job',reservation->'job' || jsonb_build_object('targetKind',saved.target_kind,
            'targetId',saved.target_id,'targetVersion',saved.target_version));
end;
$$;

create or replace function public.retry_qa_rewrite_job(p_owner uuid,p_job_id uuid,p_request_id uuid,p_expected_attempt integer,p_mock boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    job public.ai_jobs%rowtype;
    saved yeoback_private.qa_job_requests%rowtype;
    target jsonb;
    inputs jsonb;
    reservation jsonb;
    sources jsonb;
begin
    perform pg_advisory_xact_lock(hashtextextended('yeobek:ai-jobs:' || p_owner::text,0));
    perform yeoback_private.lock_publication(p_owner);
    if exists (select 1 from public.ai_jobs j join yeoback_private.qa_job_requests r on r.job_id = j.id
        where j.owner_id = p_owner and j.id = p_job_id and j.kind = 'qa_rewrite' and r.target_kind = 'gap') then
        raise exception 'Gap Q&A conversion is unavailable' using errcode = 'P0002';
    end if;
    reservation := yeoback_private.retry_qa_job(p_owner,p_job_id,p_request_id,p_expected_attempt,p_mock,'qa_rewrite');
    if reservation->'claimed' = 'false'::jsonb then return reservation; end if;
    select * into strict job from public.ai_jobs where id = p_job_id;
    select * into strict saved from yeoback_private.qa_job_requests where job_id = p_job_id;
    target := yeoback_private.qa_review_target(p_owner,saved.target_kind,saved.target_id,saved.target_version);
    if p_mock is false and target->'mock' = 'true'::jsonb then
        raise exception 'Mock answer cannot be rewritten in live mode' using errcode = 'P1002';
    end if;
    if (target->>'recheckPublicationId')::uuid is distinct from saved.target_recheck_publication_id then
        raise exception 'Gap publication changed' using errcode = '40001';
    end if;
    inputs := yeoback_private.qa_inputs(p_owner,job.qa_exhibition_id,job.artwork_id);
    sources := yeoback_private.qa_rewrite_sources(p_owner,job.qa_exhibition_id,job.artwork_id,saved.rewrite_sources);
    return jsonb_set(reservation,'{context}',yeoback_private.qa_rewrite_context(inputs,sources,saved));
end;
$$;

create or replace function public.complete_qa_rewrite_job(p_owner uuid,p_job_id uuid,p_attempt integer,p_result jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    job public.ai_jobs%rowtype;
    saved yeoback_private.qa_job_requests%rowtype;
    target jsonb;
    inputs jsonb;
    sources jsonb;
    candidate jsonb;
    citations jsonb;
    item_id uuid;
    item_version integer;
    origin text;
    result_status text := p_result->>'status';
    result_code text := p_result->>'resultCode';
    routing text := coalesce(p_result->>'routing','none');
    result_mock boolean;
begin
    if p_attempt is null or jsonb_typeof(p_result) is distinct from 'object' then
        raise exception 'Invalid Q&A rewrite result' using errcode = '22023';
    end if;
    perform yeoback_private.lock_publication(p_owner);
    select * into job from public.ai_jobs where owner_id = p_owner and id = p_job_id and kind = 'qa_rewrite' for update;
    if not found or job.expires_at <= clock_timestamp() then raise exception 'Job not found' using errcode = 'P0002'; end if;
    perform yeoback_private.qa_scope(p_owner,job.qa_exhibition_id,job.artwork_id);
    if p_attempt <> job.attempt or (job.status = 'running' and job.lease_until <= clock_timestamp()) then
        return yeoback_private.qa_job_json(job);
    end if;
    if job.status <> 'running' then
        if not exists (select 1 from public.ai_job_attempts where job_id = job.id and attempt = p_attempt
            and completion_fingerprint = sha256(convert_to(p_result::text,'UTF8'))) then
            raise exception 'Job attempt completed with different result' using errcode = 'P1006';
        end if;
        return yeoback_private.qa_job_json(job);
    end if;
    inputs := yeoback_private.qa_inputs(p_owner,job.qa_exhibition_id,job.artwork_id);
    if job.expires_at <= clock_timestamp() then raise exception 'Job not found' using errcode = 'P0002'; end if;
    if job.lease_until <= clock_timestamp() then
        return yeoback_private.finish_qa_attempt(job,'failed','REQUEST_TIMEOUT','operator',null,p_result);
    end if;
    if inputs->'fingerprint' is distinct from job.source_fingerprint then
        return yeoback_private.finish_qa_attempt(job,'failed','REVISION_CONFLICT','author',null,p_result);
    end if;
    if result_status in ('abstained','failed','cancelled') and result_code ~ '^[A-Z][A-Z0-9_]{0,63}$'
        and routing in ('author','operator','none') then
        return yeoback_private.finish_qa_attempt(job,result_status,result_code,routing,null,p_result);
    end if;
    if result_status is distinct from 'succeeded' or jsonb_typeof(p_result->'items') is distinct from 'array' then
        raise exception 'Invalid Q&A rewrite result' using errcode = '22023';
    end if;
    if jsonb_array_length(p_result->'items') <> 1 then
        raise exception 'Rewrite must return exactly one Q&A item' using errcode = '22023';
    end if;
    select * into strict saved from yeoback_private.qa_job_requests where job_id = p_job_id;
    begin
        target := yeoback_private.qa_review_target(p_owner,saved.target_kind,saved.target_id,saved.target_version);
        sources := yeoback_private.qa_rewrite_sources(p_owner,job.qa_exhibition_id,job.artwork_id,saved.rewrite_sources);
    exception when sqlstate 'P0002' or sqlstate 'P1002' or sqlstate '40001' or sqlstate 'P1001' then
        return yeoback_private.finish_qa_attempt(job,'failed','REVISION_CONFLICT','author',null,p_result);
    end;
    if (target->>'recheckPublicationId')::uuid is distinct from saved.target_recheck_publication_id then
        return yeoback_private.finish_qa_attempt(job,'failed','REVISION_CONFLICT','author',null,p_result);
    end if;
    if job.expires_at <= clock_timestamp() then raise exception 'Job not found' using errcode = 'P0002'; end if;
    if job.lease_until <= clock_timestamp() then
        return yeoback_private.finish_qa_attempt(job,'failed','REQUEST_TIMEOUT','operator',null,p_result);
    end if;
    candidate := p_result#>'{items,0}';
    if candidate->>'question' is distinct from saved.question then
        raise exception 'Rewrite must preserve the original question' using errcode = '22023';
    end if;
    citations := yeoback_private.qa_candidate_citations(candidate,jsonb_set(inputs,'{context,sources}',sources));
    if saved.target_kind = 'qa' then
        item_id := saved.target_id;
        item_version := saved.target_version + 1;
    else
        item_id := gen_random_uuid();
        item_version := 1;
    end if;
    origin := case when saved.target_kind = 'gap' then 'gap' else 'rewrite' end;
    result_mock := job.mock or coalesce(p_result->'mock' = 'true'::jsonb,false);
    insert into yeoback_private.qa_item_versions(id,version,owner_id,exhibition_id,artwork_id,origin,
        source_job_id,source_attempt,question,answer,content_hash,source_fingerprint,citations,mock)
    values (item_id,item_version,p_owner,job.qa_exhibition_id,job.artwork_id,origin,job.id,job.attempt,saved.question,
        candidate->>'answer',sha256(convert_to(jsonb_build_array(saved.question,candidate->>'answer')::text,'UTF8')),
        job.source_fingerprint,citations,result_mock);
    insert into yeoback_private.qa_rewrite_provenance(item_id,item_version,target_kind,target_id,target_version,
        target_recheck_publication_id,instruction,previous_answer)
    values (item_id,item_version,saved.target_kind,saved.target_id,saved.target_version,saved.target_recheck_publication_id,
        saved.instruction,saved.previous_answer);
    return yeoback_private.finish_qa_attempt(job,'succeeded','OK','none',
        jsonb_build_object('itemIds',jsonb_build_array(item_id),'mock',result_mock),p_result);
end;
$$;

revoke all on function yeoback_private.expected_qa_limit(uuid),yeoback_private.qa_claim_context(jsonb,integer)
    from public,anon,authenticated,service_role;

commit;
