begin;

-- Successful organization proposals outlive the short-lived job ledger.
-- Keep immutable proposal IDs/history; snapshot mock provenance before detaching.
alter table public.knowledge_proposals add column mock boolean;
update public.knowledge_proposals p set mock=j.mock from public.ai_jobs j where j.id=p.id;
alter table public.knowledge_proposals alter column mock set not null;
alter table public.knowledge_proposals drop constraint knowledge_proposals_id_fkey;
alter table public.knowledge_proposals add column payload_purged_at timestamptz;
create index knowledge_proposals_pending_expiry on public.knowledge_proposals(expires_at,id)
    where applied_revision is null and payload_purged_at is null;

create or replace function yeoback_private.organize_plan(p_context jsonb,p_selection jsonb,p_pins jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare
    allowed text[] := array(select c.section_id from yeoback_private.knowledge_section_catalog c
        where subject_type = p_context->>'subjectType');
    section_limit integer;
    sections jsonb := p_context->'sections';
    refs jsonb := p_context->'sourceRefs';
    seen_sections text[] := '{}';
    seen_sources text[] := '{}';
    choice jsonb;
    v_section_id text;
    source_id text;
    source_row jsonb;
    pin jsonb;
    ref jsonb;
    next_refs jsonb;
    combined text;
    section_index integer;
begin
    if jsonb_typeof(p_selection) is distinct from 'object' or p_selection - 'sections' <> '{}'
        or jsonb_typeof(p_selection->'sections') is distinct from 'array'
        or jsonb_typeof(p_pins) is distinct from 'array' then
        raise exception 'Invalid organization selection' using errcode = '22023';
    end if;
    if jsonb_array_length(p_selection->'sections') not between 1 and least(cardinality(allowed),12) or jsonb_array_length(p_pins) not between 1 and 12 then
        raise exception 'Invalid organization selection' using errcode = '22023';
    end if;
    for choice in select value from jsonb_array_elements(p_selection->'sections') loop
        v_section_id := choice->>'id';
        if jsonb_typeof(choice) is distinct from 'object' or choice - array['id','sourceIds'] <> '{}'
            or v_section_id is null or not v_section_id = any(allowed) or v_section_id = any(seen_sections)
            or jsonb_typeof(choice->'sourceIds') is distinct from 'array' then
            raise exception 'Invalid organization selection' using errcode = '22023';
        end if;
        if jsonb_array_length(choice->'sourceIds') not between 1 and 12 then
            raise exception 'Invalid organization selection' using errcode = '22023';
        end if;
        seen_sections := array_append(seen_sections,v_section_id);
        select coalesce(jsonb_agg(value order by ordinality),'[]') into refs
        from jsonb_array_elements(refs) with ordinality where value->>'sectionId' <> v_section_id;
        next_refs := '[]';
        combined := null;
        for source_id in select value from jsonb_array_elements_text(choice->'sourceIds') loop
            select value into source_row from jsonb_array_elements(p_context->'sources') where value->>'id' = source_id;
            if source_row is null or source_id = any(seen_sources) then
                raise exception 'Invalid or unavailable organization source' using errcode = '22023';
            end if;
            pin := p_pins->cardinality(seen_sources);
            if jsonb_typeof(pin) is distinct from 'object' or pin - array['id','revision','hash'] <> '{}'
                or pin->'id' is distinct from source_row->'id' or pin->'revision' is distinct from source_row->'revision'
                or jsonb_typeof(pin->'hash') is distinct from 'string' or pin->>'hash' !~ '^[a-f0-9]{64}$' then
                raise exception 'Invalid organization source pin' using errcode = '22023';
            end if;
            seen_sources := array_append(seen_sources,source_id);
            combined := concat_ws(E'\n\n',combined,source_row->>'text');
            ref := (source_row->'ref') || jsonb_build_object('sectionId',v_section_id);
            if not next_refs @> jsonb_build_array(ref) then next_refs := next_refs || jsonb_build_array(ref); end if;
        end loop;
        select c.max_length into strict section_limit from yeoback_private.knowledge_section_catalog c
            where c.subject_type = p_context->>'subjectType' and c.section_id = v_section_id;
        if char_length(combined) > section_limit then raise exception 'Organized section is too long' using errcode = '22023'; end if;
        select (ordinality-1)::integer into section_index from jsonb_array_elements(sections) with ordinality
        where value->>'id' = v_section_id;
        if found then
            sections := jsonb_set(sections,array[section_index::text],jsonb_build_object('id',v_section_id,'body',combined));
        else
            sections := sections || jsonb_build_array(jsonb_build_object('id',v_section_id,'body',combined));
        end if;
        refs := refs || next_refs;
    end loop;
    if cardinality(seen_sources) <> jsonb_array_length(p_pins) or jsonb_array_length(refs) > 24 then
        raise exception 'Invalid organization sources' using errcode = '22023';
    end if;
    return jsonb_build_object('sections',sections,'sourceRefs',refs);
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
            or coalesce(call->>'provider','') not in ('liner','openai','typecast','exaone','mock')
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

create or replace function public.load_proposal(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    owner uuid := yeoback_private.require_owner();
    p public.knowledge_proposals%rowtype;
begin
    select * into p from public.knowledge_proposals where id = p_id and owner_id = owner;
    if not found then raise exception 'Knowledge proposal not found' using errcode = 'P0002'; end if;
    perform yeoback_private.organize_inputs(owner,p.document_id);
    if p.applied_revision is null and p.expires_at <= clock_timestamp() then
        raise exception 'Knowledge proposal expired' using errcode = 'P1008';
    end if;
    return jsonb_build_object('proposal',p.proposal || jsonb_build_object('appliedRevision',p.applied_revision),
        'before',jsonb_build_object('sections',p.before_sections,'sourceRefs',p.before_source_refs,'revision',p.target_revision),
        'mock',p.mock);
end;
$$;

create or replace function yeoback_private.assert_ai_quota(p_owner uuid)
returns void language plpgsql set search_path = '' as $$
declare day_start timestamptz := date_trunc('day',statement_timestamp(),'UTC');
begin
    if (select count(*) from public.ai_job_attempts a join public.ai_jobs j on j.id = a.job_id
        where a.owner_id = p_owner and j.kind in ('narration','audio','organize','expected_qa','preview_answer','qa_rewrite')
        and a.reserved_at >= day_start and a.reserved_at < day_start + interval '24 hours')
        >= yeoback_private.policy_integer('author_jobs_per_day') then
        raise exception 'Daily author job limit reached' using errcode = 'P1004';
    end if;
end;
$$;

-- Preserve all existing cleanup layers and the public response shape.
alter function public.purge_expired() rename to purge_expired_before_knowledge_proposals;
alter function public.purge_expired_before_knowledge_proposals() set schema yeoback_private;
revoke all on function yeoback_private.purge_expired_before_knowledge_proposals()
    from public,anon,authenticated,service_role;
create function public.purge_expired()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
    -- Retain only a tombstone for expired, unapplied proposals so owner GET/apply
    -- keep returning PROPOSAL_EXPIRED. Applied proposals and history survive.
    update public.knowledge_proposals set proposal='{}',before_sections='[]',before_source_refs='[]',
        payload_purged_at=statement_timestamp()
    where id in (select id from public.knowledge_proposals
        where applied_revision is null and payload_purged_at is null and expires_at<=statement_timestamp()
        order by expires_at,id limit 1000 for update skip locked);
    result := yeoback_private.purge_expired_before_knowledge_proposals();
    return result;
end;
$$;
revoke all on function public.purge_expired() from public,anon,authenticated,service_role;
grant execute on function public.purge_expired() to service_role;

commit;
