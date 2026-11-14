begin;

-- Accept direct text providers in the existing execution records.
create or replace function public.record_visitor_execution(p_session_hash text,p_id uuid,p_steps jsonb,p_usage jsonb,p_elapsed_ms integer)
returns void language plpgsql security definer set search_path = '' as $$
declare
    sid bytea := yeoback_private.visitor_hash(p_session_hash);
    request_row public.api_requests%rowtype;
    call jsonb;
    token jsonb;
    payload jsonb;
begin
    select * into request_row from public.api_requests
        where session_hash = sid and id = p_id and expires_at > statement_timestamp() for update;
    if not found then raise exception 'Visitor request not found' using errcode = 'P0002'; end if;
    if request_row.state not in ('ready','failed') then
        raise exception 'Visitor execution is not complete' using errcode = 'P1011';
    end if;
    perform yeoback_private.validate_visitor_steps(p_steps);
    if p_elapsed_ms is null or p_elapsed_ms not between 0 and 300000
        or jsonb_typeof(p_usage) is distinct from 'array' then
        raise exception 'Invalid visitor execution metadata' using errcode = '22023';
    end if;
    if jsonb_array_length(p_usage) > 8 then
        raise exception 'Invalid visitor execution metadata' using errcode = '22023';
    end if;
    for call in select value from jsonb_array_elements(p_usage) loop
        if jsonb_typeof(call) is distinct from 'object'
            or call - array['provider','model','mock','usage'] <> '{}'
            or coalesce(call->>'provider','') not in ('liner','openai','typecast','exaone','mock','gemini','groq')
            or jsonb_typeof(call->'model') is distinct from 'string'
            or coalesce(call->>'model','') !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$'
            or (call ? 'mock' and jsonb_typeof(call->'mock') is distinct from 'boolean')
            or (call ? 'usage' and jsonb_typeof(call->'usage') is distinct from 'object') then
            raise exception 'Invalid visitor execution metadata' using errcode = '22023';
        end if;
        if call ? 'usage' then
            if (call->'usage') - array['inputTokens','outputTokens','totalTokens'] <> '{}' then
                raise exception 'Invalid visitor execution metadata' using errcode = '22023';
            end if;
            for token in select value from jsonb_each(call->'usage') loop
                if jsonb_typeof(token) is distinct from 'number'
                    or token::text !~ '^[0-9]{1,16}$' then
                    raise exception 'Invalid visitor execution metadata' using errcode = '22023';
                end if;
                if (token::text)::numeric > 9007199254740991 then
                    raise exception 'Invalid visitor execution metadata' using errcode = '22023';
                end if;
            end loop;
        end if;
    end loop;
    payload := jsonb_build_object('calls',p_usage,'elapsedMs',p_elapsed_ms);
    if request_row.usage <> '{}' then
        if request_row.usage is distinct from payload or request_row.steps is distinct from p_steps then
            raise exception 'Visitor execution already recorded' using errcode = 'P1011';
        end if;
        return;
    end if;
    update public.api_requests set usage = payload,steps = p_steps where id = request_row.id;
end;
$$;

create or replace function public.complete_organize_job(p_owner uuid,p_job_id uuid,p_attempt integer,p_result jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    job public.ai_jobs%rowtype;
    candidate jsonb := p_result->'proposal';
    v_result_code text := p_result->>'resultCode';
    v_routing text := p_result->>'routing';
    context jsonb;
    plan jsonb;
    state text;
    receipt jsonb;
    fingerprint bytea;
    prior bytea;
    context_digest bytea;
    call jsonb;
    token jsonb;
begin
    select * into job from public.ai_jobs where id = p_job_id and owner_id = p_owner and kind = 'organize' for update;
    if not found or job.expires_at <= clock_timestamp() then raise exception 'Job not found' using errcode = 'P0002'; end if;
    if p_attempt is distinct from job.attempt then raise exception 'Job attempt is no longer active' using errcode = '40001'; end if;
    if jsonb_typeof(p_result) is distinct from 'object' or octet_length(p_result::text) > 200000
        or p_result - array['proposal','resultCode','routing','usage','steps','elapsedMs','mock'] <> '{}'
        or p_result->'mock' is distinct from to_jsonb(job.mock)
        or v_result_code is null or v_result_code !~ '^[A-Z][A-Z0-9_]{0,63}$'
        or v_routing is null or v_routing not in ('author','operator','none')
        or jsonb_typeof(p_result->'usage') is distinct from 'array'
        or jsonb_typeof(p_result->'elapsedMs') is distinct from 'number'
        or p_result->>'elapsedMs' !~ '^[0-9]{1,6}$'
        or candidate is null or jsonb_typeof(candidate) not in ('object','null') then
        raise exception 'Invalid organization outcome' using errcode = '22023';
    end if;
    fingerprint := sha256(convert_to(p_result::text,'UTF8'));
    if job.status <> 'running' then
        select completion_fingerprint into prior from public.ai_job_attempts where job_id = job.id and attempt = job.attempt;
        if prior is distinct from fingerprint then
            raise exception 'Job attempt completed with different result' using errcode = 'P1006';
        end if;
        return yeoback_private.ai_job_json(job);
    end if;
    if job.lease_until <= clock_timestamp() then raise exception 'Job attempt is no longer active' using errcode = '40001'; end if;
    perform yeoback_private.validate_visitor_steps(p_result->'steps');
    if (p_result->>'elapsedMs')::integer > 300000 or jsonb_array_length(p_result->'usage') > 8 then
        raise exception 'Invalid organization usage' using errcode = '22023';
    end if;
    for call in select value from jsonb_array_elements(p_result->'usage') loop
        if jsonb_typeof(call) is distinct from 'object' or call - array['provider','model','mock','usage'] <> '{}'
            or coalesce(call->>'provider','') not in ('liner','openai','typecast','exaone','mock','gemini','groq')
            or jsonb_typeof(call->'model') is distinct from 'string'
            or coalesce(call->>'model','') !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$'
            or (call ? 'mock' and call->'mock' is distinct from to_jsonb(job.mock))
            or (call ? 'usage' and jsonb_typeof(call->'usage') is distinct from 'object') then
            raise exception 'Invalid organization usage' using errcode = '22023';
        end if;
        if call ? 'usage' then
            if (call->'usage') - array['inputTokens','outputTokens','totalTokens'] <> '{}' then
                raise exception 'Invalid organization usage' using errcode = '22023';
            end if;
            for token in select value from jsonb_each(call->'usage') loop
                if jsonb_typeof(token) is distinct from 'number' or token::text !~ '^[0-9]{1,16}$'
                    or (token::text)::numeric > 9007199254740991 then
                    raise exception 'Invalid organization usage' using errcode = '22023';
                end if;
            end loop;
        end if;
    end loop;
    if candidate = 'null'::jsonb then
        if v_result_code = 'OK' then raise exception 'Invalid organization outcome' using errcode = '22023'; end if;
        state := case when v_result_code = 'REQUEST_CANCELLED' then 'cancelled'
            when v_result_code = 'EVIDENCE_REQUIRED' then 'abstained'
            else 'failed' end;
    else
        begin
            context := yeoback_private.organize_inputs(p_owner,job.document_id);
        exception when no_data_found then
            context := null;
        end;
        context_digest := sha256(convert_to(context::text,'UTF8'));
        if to_jsonb(encode(context_digest,'hex')) is distinct from job.source_fingerprint then
            state := 'failed';
            v_result_code := 'REVISION_CONFLICT';
            v_routing := 'author';
        else
            if candidate - array['id','ownerId','documentId','targetRevision','pluginVersion','expiresAt',
                'selection','sourcePins','sections','sourceRefs','appliedRevision'] <> '{}'
                or candidate->'id' is distinct from to_jsonb(job.id)
                or candidate->'ownerId' is distinct from to_jsonb(p_owner)
                or candidate->'documentId' is distinct from to_jsonb(job.document_id)
                or candidate->'targetRevision' is distinct from to_jsonb(job.expected_document_revision)
                or candidate->'expiresAt' is distinct from to_jsonb(floor(extract(epoch from job.proposal_expires_at)*1000)::bigint)
                or candidate->'appliedRevision' is distinct from 'null'::jsonb
                or jsonb_typeof(candidate->'pluginVersion') is distinct from 'string'
                or candidate->>'pluginVersion' !~ '^[A-Za-z0-9][A-Za-z0-9._+@:-]{0,127}$'
                or v_result_code <> 'OK' or v_routing <> 'none' then
                raise exception 'Invalid organization proposal' using errcode = '22023';
            end if;
            if job.proposal_expires_at <= clock_timestamp() then
                raise exception 'Knowledge proposal expired' using errcode = 'P1008';
            end if;
            plan := yeoback_private.organize_plan(context,candidate->'selection',candidate->'sourcePins');
            if (candidate->'sections',candidate->'sourceRefs') is distinct from (plan->'sections',plan->'sourceRefs') then
                raise exception 'Proposal does not match selected sources' using errcode = '22023';
            end if;
            if job.lease_until <= clock_timestamp() then raise exception 'Job attempt is no longer active' using errcode = '40001'; end if;
            insert into public.knowledge_proposals(id,owner_id,document_id,target_revision,proposal,
                before_sections,before_source_refs,context_fingerprint,expires_at,mock)
            values(job.id,p_owner,job.document_id,job.expected_document_revision,candidate,context->'sections',
                context->'sourceRefs',context_digest,job.proposal_expires_at,job.mock);
            state := 'succeeded';
            receipt := jsonb_build_object('proposalId',job.id,'mock',job.mock);
        end if;
    end if;
    update public.ai_jobs set status = state,routing = v_routing,
        result_code = v_result_code,result = receipt,updated_at = clock_timestamp()
    where id = job.id returning * into job;
    update public.ai_job_attempts set completed_at = clock_timestamp(),result_code = job.result_code,
        completion_fingerprint = fingerprint,duration_ms = (p_result->>'elapsedMs')::integer,
        usage = p_result->'usage',steps = p_result->'steps'
    where job_id = job.id and attempt = job.attempt;
    return yeoback_private.ai_job_json(job);
end;
$$;

commit;
