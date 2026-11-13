begin;

alter table public.ai_jobs add column mock boolean not null default false;

create or replace function yeoback_private.ai_job_json(p_job public.ai_jobs)
returns jsonb language sql stable strict set search_path = '' as $$
    select jsonb_build_object('id', p_job.id, 'artworkId', p_job.artwork_id, 'documentId', p_job.document_id,
        'requestId', p_job.request_id, 'kind', p_job.kind, 'attempt', p_job.attempt,
        'status', case when timed_out then 'failed' else p_job.status end,
        'routing', case when timed_out then 'operator' else p_job.routing end,
        'resultCode', case when timed_out then 'REQUEST_TIMEOUT' else p_job.result_code end,
        'expectedRevision', p_job.expected_revision,
        'expectedDocumentRevision', p_job.expected_document_revision, 'strategy', p_job.strategy,
        'result', p_job.result, 'mock', p_job.mock, 'createdAt', p_job.created_at, 'updatedAt', p_job.updated_at, 'expiresAt', p_job.expires_at)
    from (select p_job.status = 'running' and p_job.lease_until <= statement_timestamp() as timed_out) lease;
$$;

create or replace function public.complete_ai_job(p_owner uuid, p_job_id uuid, p_attempt integer, p_result jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
<<completion>>
declare
    job public.ai_jobs%rowtype;
    inputs jsonb;
    selected jsonb := p_result->'selected';
    status text;
    routing text := 'none';
    result_code text;
    result jsonb;
    reason text := p_result->>'reason';
    fingerprint bytea := sha256(convert_to(coalesce(p_result, 'null'::jsonb)::text, 'UTF8'));
    saved_fingerprint bytea;
begin
    if p_attempt is null then raise exception 'Invalid attempt' using errcode = '22023'; end if;
    select * into job from public.ai_jobs where owner_id = p_owner and id = p_job_id for update;
    if not found or job.expires_at <= statement_timestamp() then
        raise exception 'Job not found' using errcode = 'P0002';
    end if;
    perform yeoback_private.subject_scope(p_owner, 'artwork', job.artwork_id);
    if p_attempt <> job.attempt then return yeoback_private.ai_job_json(job); end if;
    if job.status <> 'running' then
        select completion_fingerprint into saved_fingerprint from public.ai_job_attempts
            where job_id = job.id and attempt = job.attempt;
        if saved_fingerprint is distinct from fingerprint then
            raise exception 'Job attempt completed with different result' using errcode = 'P1006';
        end if;
        return yeoback_private.ai_job_json(job);
    end if;
    if job.lease_until <= statement_timestamp() then return yeoback_private.ai_job_json(job); end if;

    inputs := yeoback_private.narration_inputs(p_owner, job.artwork_id);
    if inputs->'fingerprint' is distinct from job.source_fingerprint then
        status := 'failed';
        result_code := 'REVISION_CONFLICT';
        routing := 'author';
    elsif p_result->>'status' = 'selected' and reason = 'passed' then
        if jsonb_typeof(selected) is distinct from 'object'
            or jsonb_typeof(selected->'answer') is distinct from 'string'
            or nullif(btrim(selected->>'answer'), '') is null or char_length(selected->>'answer') > 2000
            or jsonb_typeof(selected->'citations') is distinct from 'array' then
            raise exception 'Invalid narration candidate' using errcode = '22023';
        end if;
        if jsonb_array_length(selected->'citations') not between 1 and 12
            or exists (select 1 from jsonb_array_elements(selected->'citations') c
                where jsonb_typeof(c) <> 'string' or not job.source_ids @> jsonb_build_array(c))
            or (select count(distinct c) from jsonb_array_elements(selected->'citations') c)
                <> jsonb_array_length(selected->'citations') then
            raise exception 'Invalid narration citations' using errcode = '22023';
        end if;
        if selected ? 'followUpQuestions' then
            if jsonb_typeof(selected->'followUpQuestions') is distinct from 'array' then
                raise exception 'Invalid follow-up questions' using errcode = '22023';
            end if;
            if jsonb_array_length(selected->'followUpQuestions') > 3
                or exists (select 1 from jsonb_array_elements(selected->'followUpQuestions') q
                    where jsonb_typeof(q) <> 'string' or char_length(q #>> '{}') > 200
                        or (q #>> '{}') !~ '[^[:space:]]') then
                raise exception 'Invalid follow-up questions' using errcode = '22023';
            end if;
        end if;
        status := 'succeeded';
        result_code := 'OK';
        result := jsonb_build_object('selected', jsonb_strip_nulls(jsonb_build_object(
            'answer', selected->'answer', 'citations', selected->'citations',
            'followUpQuestions', selected->'followUpQuestions')),
            'overTarget', char_length(selected->>'answer') > 600,
            'mock', job.mock or coalesce(p_result->'mock' = 'true'::jsonb, false));
    elsif p_result->>'status' = 'abstained' and reason in (
        'invalid_request', 'unavailable', 'invalid_context', 'stale_context', 'insufficient_evidence', 'clarify',
        'generation_failed', 'invalid_candidate', 'judge_failed', 'below_threshold', 'cancelled', 'timeout'
    ) then
        status := case
            when reason = 'cancelled' then 'cancelled'
            when reason in ('insufficient_evidence', 'clarify', 'below_threshold') then 'abstained'
            else 'failed' end;
        routing := p_result->>'routing';
        result_code := p_result->>'resultCode';
        if routing is null or routing not in ('author', 'operator', 'none')
            or result_code is null or result_code !~ '^[A-Z][A-Z0-9_]{0,63}$' then
            raise exception 'Invalid job outcome' using errcode = '22023';
        end if;
    else
        raise exception 'Invalid job result' using errcode = '22023';
    end if;

    update public.ai_jobs set status = completion.status, routing = completion.routing,
        result_code = completion.result_code, result = completion.result,
        mock = job.mock or coalesce(p_result->'mock' = 'true'::jsonb, false), updated_at = statement_timestamp()
        where id = job.id returning * into job;
    update public.ai_job_attempts set completed_at = statement_timestamp(), result_code = job.result_code,
        completion_fingerprint = fingerprint,
        duration_ms = case when (p_result->>'elapsedMs') ~ '^[0-9]{1,8}$' then (p_result->>'elapsedMs')::integer end,
        usage = case when jsonb_typeof(p_result->'usage') = 'array' and octet_length(p_result->>'usage') <= 16384
            then p_result->'usage' end,
        steps = case when jsonb_typeof(p_result->'steps') = 'array' and octet_length(p_result->>'steps') <= 16384
            then p_result->'steps' end
        where job_id = job.id and attempt = job.attempt;
    return yeoback_private.ai_job_json(job);
end;
$$;

create function public.reserve_ai_job(p_owner uuid, p_request_id uuid, p_artwork_id uuid,
    p_expected_revision integer, p_expected_document_revision integer, p_strategy text, p_mock boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    reservation jsonb;
    job public.ai_jobs%rowtype;
begin
    reservation := public.reserve_ai_job(p_owner, p_request_id, p_artwork_id,
        p_expected_revision, p_expected_document_revision, p_strategy);
    if not (reservation->>'claimed')::boolean then return reservation; end if;
    update public.ai_jobs set mock = coalesce(p_mock, false)
        where id = (reservation#>>'{job,id}')::uuid and owner_id = p_owner returning * into job;
    return jsonb_build_object('job', yeoback_private.ai_job_json(job), 'claimed', true);
end;
$$;

create function public.retry_ai_job(p_owner uuid, p_job_id uuid, p_request_id uuid,
    p_expected_attempt integer, p_mock boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    reservation jsonb;
    job public.ai_jobs%rowtype;
begin
    reservation := public.retry_ai_job(p_owner, p_job_id, p_request_id, p_expected_attempt);
    if not (reservation->>'claimed')::boolean then return reservation; end if;
    update public.ai_jobs set mock = coalesce(p_mock, false)
        where id = p_job_id and owner_id = p_owner returning * into job;
    return jsonb_build_object('job', yeoback_private.ai_job_json(job), 'claimed', true);
end;
$$;

revoke all on function public.reserve_ai_job(uuid, uuid, uuid, integer, integer, text, boolean),
    public.retry_ai_job(uuid, uuid, uuid, integer, boolean) from public, anon, authenticated, service_role;
grant execute on function public.reserve_ai_job(uuid, uuid, uuid, integer, integer, text, boolean),
    public.retry_ai_job(uuid, uuid, uuid, integer, boolean) to service_role;

commit;
