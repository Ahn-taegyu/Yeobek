begin;

alter table public.ai_jobs drop constraint ai_jobs_kind_shape,
    add constraint ai_jobs_kind_shape check (
        (kind in ('narration','audio') and automation_event_id is null
            and num_nonnulls(artwork_id,document_id,expected_revision,expected_document_revision) = 4
            and (
                (kind = 'narration' and strategy is not null
                    and num_nonnulls(audio_approval_id,voice_config_version,voice_fingerprint) = 0)
                or (kind = 'audio' and strategy is null
                    and num_nonnulls(audio_approval_id,voice_config_version,voice_fingerprint) = 3
                    and octet_length(voice_fingerprint) = 32)
            ))
        or (kind = 'organize' and document_id is not null and expected_document_revision > 0
            and expected_document_revision is not null
            and num_nonnulls(artwork_id,expected_revision,strategy,automation_event_id,
                audio_approval_id,voice_config_version,voice_fingerprint) = 0)
        or (kind in ('automation_notify','automation_support','automation_gap_digest','automation_triage',
            'automation_briefing','automation_intake') and automation_event_id is not null
            and num_nonnulls(artwork_id,document_id,expected_revision,expected_document_revision,
                strategy,audio_approval_id,voice_config_version,voice_fingerprint) = 0
            and source_fingerprint = '{}' and source_ids = '[]' and result is null)
    ),
    add column proposal_expires_at timestamptz,
    add constraint ai_jobs_proposal_expiry_shape check ((kind = 'organize') = (proposal_expires_at is not null));

create or replace function yeoback_private.assert_ai_quota(p_owner uuid)
returns void language plpgsql set search_path = '' as $$
declare day_start timestamptz := date_trunc('day',statement_timestamp(),'UTC');
begin
    if (select count(*) from public.ai_job_attempts a join public.ai_jobs j on j.id = a.job_id
        where a.owner_id = p_owner and j.kind in ('narration','audio','organize')
        and a.reserved_at >= day_start and a.reserved_at < day_start + interval '24 hours')
        >= yeoback_private.policy_integer('author_jobs_per_day') then
        raise exception 'Daily author job limit reached' using errcode = 'P1004';
    end if;
end;
$$;

create table public.knowledge_proposals (
    id uuid primary key references public.ai_jobs(id),
    owner_id uuid not null references auth.users(id),
    document_id uuid not null references public.knowledge_documents(id),
    target_revision integer not null check (target_revision > 0),
    proposal jsonb not null,
    before_sections jsonb not null,
    before_source_refs jsonb not null,
    context_fingerprint bytea not null,
    expires_at timestamptz not null,
    applied_revision integer check (applied_revision >= target_revision),
    created_at timestamptz not null default statement_timestamp()
);
create table public.knowledge_document_history (
    document_id uuid not null references public.knowledge_documents(id),
    owner_id uuid not null references auth.users(id),
    revision integer not null check (revision > 0),
    proposal_id uuid not null unique references public.knowledge_proposals(id),
    sections jsonb not null,
    source_refs jsonb not null,
    created_at timestamptz not null default statement_timestamp(),
    primary key(document_id,revision)
);
alter table public.knowledge_proposals enable row level security;
alter table public.knowledge_document_history enable row level security;
revoke all on public.knowledge_proposals,public.knowledge_document_history from public,anon,authenticated,service_role;

-- Lock parents in the same direction as edits, then documents ancestor-first.
-- Lock the target for update at application time to avoid a lock upgrade.
create function yeoback_private.organize_inputs(p_owner uuid,p_document_id uuid,p_apply boolean default false)
returns jsonb language plpgsql set search_path = '' as $$
declare
    target public.knowledge_documents%rowtype;
    scope uuid[];
    source_row record;
    candidate record;
    sources jsonb := '[]';
    used_chars integer := 0;
begin
    select * into target from public.knowledge_documents where id = p_document_id and owner_id = p_owner;
    if not found then raise exception 'Knowledge document not found' using errcode = 'P0002'; end if;
    scope := yeoback_private.subject_scope(p_owner,target.subject_type,target.subject_id);
    perform 1 from public.artist_profiles where id = scope[1] and owner_id = p_owner for share;
    if not found then raise exception 'Subject not found' using errcode = 'P0002'; end if;
    if scope[2] is not null then
        perform 1 from public.exhibitions where id = scope[2] and owner_id = p_owner and deleted_at is null for share;
        if not found then raise exception 'Subject not found' using errcode = 'P0002'; end if;
    end if;
    if scope[3] is not null then
        perform 1 from public.artworks where id = scope[3] and owner_id = p_owner and deleted_at is null for share;
        if not found then raise exception 'Subject not found' using errcode = 'P0002'; end if;
    end if;
    perform 1 from public.knowledge_documents d where d.owner_id = p_owner and d.id <> target.id
        and (d.artist_id = scope[1] or d.exhibition_id = scope[2] or d.artwork_id = scope[3])
        order by case d.subject_type when 'artist' then 0 else 1 end for share;
    if p_apply then
        select * into target from public.knowledge_documents where id = p_document_id and owner_id = p_owner for update;
    else
        select * into target from public.knowledge_documents where id = p_document_id and owner_id = p_owner for share;
    end if;
    if not found then raise exception 'Knowledge document not found' using errcode = 'P0002'; end if;
    for source_row in
        select d.id,d.subject_type,d.subject_id,d.revision,s.value->>'id' as section_id,s.value->>'body' as body
        from public.knowledge_documents d cross join lateral jsonb_array_elements(d.sections) s
        where d.owner_id = p_owner and (d.artist_id = scope[1] or d.exhibition_id = scope[2] or d.artwork_id = scope[3])
        order by case d.subject_type when 'artwork' then 0 when 'exhibition' then 1 else 2 end,s.value->>'id'
    loop
        if source_row.body is null or source_row.body !~ '[^[:space:]]' or char_length(source_row.body) > 5000
            or used_chars + char_length(source_row.body) > 8000 or jsonb_array_length(sources) >= 12 then continue; end if;
        used_chars := used_chars + char_length(source_row.body);
        sources := sources || jsonb_build_array(jsonb_build_object(
            'id',yeoback_private.narration_source_id(source_row.id,source_row.section_id,source_row.revision),
            'owner_id',p_owner,'artist_id',scope[1],'subject_type',source_row.subject_type,'subject_id',source_row.subject_id,
            'exhibition_id',case when source_row.subject_type <> 'artist' then scope[2] end,
            'revision',source_row.revision,'text',source_row.body,
            'ref',case when source_row.id = target.id then
                jsonb_build_object('kind','direct','section_id',source_row.section_id)
            else jsonb_build_object('kind','document','section_id',source_row.section_id,
                'source_document_id',source_row.id,'source_section_id',source_row.section_id,'source_revision',source_row.revision)
            end));
    end loop;
    return yeoback_private.narration_camelize(jsonb_build_object('document_id',target.id,'owner_id',p_owner,
        'artist_id',scope[1],'subject_id',target.subject_id,'subject_type',target.subject_type,
        'exhibition_id',scope[2],'revision',target.revision,'sections',target.sections,
        'source_refs',target.source_refs,'sources',sources));
end;
$$;

create function public.get_organize_context(p_document_id uuid)
returns jsonb language sql security definer set search_path = '' as $$
    select yeoback_private.organize_inputs(yeoback_private.require_owner(),p_document_id);
$$;

-- Rebuild selected text and references from the canonical DB context.
-- The candidate hashes are JS-format compatibility data, not DB authority.
create function yeoback_private.organize_plan(p_context jsonb,p_selection jsonb,p_pins jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare
    allowed text[] := case p_context->>'subjectType' when 'artist' then array['bio','practice']
        when 'exhibition' then array['introduction','theme'] else array['description','notes'] end;
    sections jsonb := p_context->'sections';
    refs jsonb := p_context->'sourceRefs';
    seen_sections text[] := '{}';
    seen_sources text[] := '{}';
    choice jsonb;
    section_id text;
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
    if jsonb_array_length(p_selection->'sections') not between 1 and 2 or jsonb_array_length(p_pins) not between 1 and 12 then
        raise exception 'Invalid organization selection' using errcode = '22023';
    end if;
    for choice in select value from jsonb_array_elements(p_selection->'sections') loop
        section_id := choice->>'id';
        if jsonb_typeof(choice) is distinct from 'object' or choice - array['id','sourceIds'] <> '{}'
            or section_id is null or not section_id = any(allowed) or section_id = any(seen_sections)
            or jsonb_typeof(choice->'sourceIds') is distinct from 'array' then
            raise exception 'Invalid organization selection' using errcode = '22023';
        end if;
        if jsonb_array_length(choice->'sourceIds') not between 1 and 12 then
            raise exception 'Invalid organization selection' using errcode = '22023';
        end if;
        seen_sections := array_append(seen_sections,section_id);
        select coalesce(jsonb_agg(value order by ordinality),'[]') into refs
        from jsonb_array_elements(refs) with ordinality where value->>'sectionId' <> section_id;
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
            ref := (source_row->'ref') || jsonb_build_object('sectionId',section_id);
            if not next_refs @> jsonb_build_array(ref) then next_refs := next_refs || jsonb_build_array(ref); end if;
        end loop;
        if char_length(combined) > 5000 then raise exception 'Organized section is too long' using errcode = '22023'; end if;
        select (ordinality-1)::integer into section_index from jsonb_array_elements(sections) with ordinality
        where value->>'id' = section_id;
        if found then
            sections := jsonb_set(sections,array[section_index::text],jsonb_build_object('id',section_id,'body',combined));
        else
            sections := sections || jsonb_build_array(jsonb_build_object('id',section_id,'body',combined));
        end if;
        refs := refs || next_refs;
    end loop;
    if cardinality(seen_sources) <> jsonb_array_length(p_pins) or jsonb_array_length(refs) > 24 then
        raise exception 'Invalid organization sources' using errcode = '22023';
    end if;
    return jsonb_build_object('sections',sections,'sourceRefs',refs);
end;
$$;

create function yeoback_private.organize_reservation(job public.ai_jobs,claimed boolean)
returns jsonb language sql stable set search_path = '' as $$
    select jsonb_build_object('job',yeoback_private.ai_job_json(job),'claimed',claimed,
        'proposalExpiresAt',floor(extract(epoch from job.proposal_expires_at)*1000)::bigint);
$$;

create function public.reserve_organize_job(p_owner uuid,p_request_id uuid,p_document_id uuid,
    p_expected_document_revision integer,p_mock boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    job public.ai_jobs%rowtype;
    replay public.ai_job_attempts%rowtype;
    context jsonb;
    reserved_at timestamptz;
begin
    if p_owner is null or p_request_id is null or p_document_id is null
        or p_expected_document_revision is null or p_expected_document_revision < 1 or p_mock is null then
        raise exception 'Invalid organization job input' using errcode = '22023';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('yeobek:ai-jobs:' || p_owner::text,0));
    select * into replay from public.ai_job_attempts where owner_id = p_owner and request_id = p_request_id;
    if found then
        select * into strict job from public.ai_jobs where id = replay.job_id for share;
        if replay.attempt <> 1 or job.kind <> 'organize' or job.document_id is distinct from p_document_id
            or job.expected_document_revision is distinct from p_expected_document_revision or job.mock <> p_mock then
            raise exception 'Request ID already used with different input' using errcode = 'P1005';
        end if;
        if job.expires_at <= clock_timestamp() then raise exception 'Job not found' using errcode = 'P0002'; end if;
        perform yeoback_private.organize_inputs(p_owner,job.document_id);
        return yeoback_private.organize_reservation(job,false);
    end if;
    perform yeoback_private.assert_ai_quota(p_owner);
    context := yeoback_private.organize_inputs(p_owner,p_document_id);
    if context->'revision' is distinct from to_jsonb(p_expected_document_revision) then
        raise exception 'Knowledge document revision conflict' using errcode = '40001';
    end if;
    reserved_at := clock_timestamp();
    insert into public.ai_jobs(owner_id,request_id,kind,document_id,expected_document_revision,
        source_fingerprint,source_ids,lease_until,expires_at,mock,proposal_expires_at)
    values(p_owner,p_request_id,'organize',p_document_id,p_expected_document_revision,
        to_jsonb(encode(sha256(convert_to(context::text,'UTF8')),'hex')),
        (select coalesce(jsonb_agg(value->'id' order by ordinality),'[]')
         from jsonb_array_elements(context->'sources') with ordinality),
        reserved_at + yeoback_private.policy_integer('job_lease_seconds') * interval '1 second',
        reserved_at + yeoback_private.policy_integer('job_retention_days') * interval '1 day',p_mock,
        reserved_at + yeoback_private.policy_integer('proposal_ttl_seconds') * interval '1 second')
    returning * into job;
    insert into public.ai_job_attempts(owner_id,job_id,attempt,request_id,reserved_at)
    values(p_owner,job.id,job.attempt,p_request_id,reserved_at);
    return yeoback_private.organize_reservation(job,true);
end;
$$;

create function public.retry_organize_job(p_owner uuid,p_job_id uuid,p_request_id uuid,p_expected_attempt integer,p_mock boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    job public.ai_jobs%rowtype;
    replay public.ai_job_attempts%rowtype;
    context jsonb;
    reserved_at timestamptz;
begin
    if p_owner is null or p_job_id is null or p_request_id is null
        or p_expected_attempt is null or p_expected_attempt < 1 or p_mock is null then
        raise exception 'Invalid organization retry input' using errcode = '22023';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('yeobek:ai-jobs:' || p_owner::text,0));
    select * into job from public.ai_jobs where id = p_job_id and owner_id = p_owner and kind = 'organize' for update;
    if not found or job.expires_at <= clock_timestamp() then raise exception 'Job not found' using errcode = 'P0002'; end if;
    select * into replay from public.ai_job_attempts where owner_id = p_owner and request_id = p_request_id;
    if found then
        if replay.job_id <> job.id or replay.attempt - 1 <> p_expected_attempt or job.mock <> p_mock then
            raise exception 'Request ID already used with different input' using errcode = 'P1005';
        end if;
        perform yeoback_private.organize_inputs(p_owner,job.document_id);
        return yeoback_private.organize_reservation(job,false);
    end if;
    if job.mock <> p_mock or job.attempt <> p_expected_attempt or job.status not in ('failed','cancelled','running')
        or (job.status = 'running' and job.lease_until > clock_timestamp()) then
        raise exception 'Job attempt cannot be retried' using errcode = 'P1006';
    end if;
    perform yeoback_private.assert_ai_quota(p_owner);
    context := yeoback_private.organize_inputs(p_owner,job.document_id);
    if to_jsonb(encode(sha256(convert_to(context::text,'UTF8')),'hex')) is distinct from job.source_fingerprint then
        raise exception 'Knowledge source revision conflict' using errcode = '40001';
    end if;
    reserved_at := clock_timestamp();
    if job.status = 'running' then
        update public.ai_job_attempts set completed_at = reserved_at,result_code = 'REQUEST_TIMEOUT'
        where job_id = job.id and attempt = job.attempt;
    end if;
    update public.ai_jobs set attempt = attempt + 1,status = 'running',routing = 'none',result_code = null,result = null,
        lease_until = reserved_at + yeoback_private.policy_integer('job_lease_seconds') * interval '1 second',
        expires_at = reserved_at + yeoback_private.policy_integer('job_retention_days') * interval '1 day',
        proposal_expires_at = reserved_at + yeoback_private.policy_integer('proposal_ttl_seconds') * interval '1 second',
        updated_at = reserved_at where id = job.id returning * into job;
    insert into public.ai_job_attempts(owner_id,job_id,attempt,request_id,reserved_at)
    values(p_owner,job.id,job.attempt,p_request_id,reserved_at);
    return yeoback_private.organize_reservation(job,true);
end;
$$;

create or replace function public.get_ai_job(p_job_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    owner uuid := yeoback_private.require_owner();
    job public.ai_jobs%rowtype;
begin
    select * into job from public.ai_jobs where owner_id = owner and id = p_job_id and kind in ('narration','audio','organize');
    if not found or job.expires_at <= statement_timestamp() then
        raise exception 'Job not found' using errcode = 'P0002';
    end if;
    if job.kind = 'organize' then
        perform yeoback_private.organize_inputs(owner,job.document_id);
    else
        perform yeoback_private.subject_scope(owner,'artwork',job.artwork_id);
    end if;
    return yeoback_private.ai_job_json(job);
end;
$$;

create function public.complete_organize_job(p_owner uuid,p_job_id uuid,p_attempt integer,p_result jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    job public.ai_jobs%rowtype;
    candidate jsonb := p_result->'proposal';
    result_code text := p_result->>'resultCode';
    routing text := p_result->>'routing';
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
        or result_code is null or result_code !~ '^[A-Z][A-Z0-9_]{0,63}$'
        or routing is null or routing not in ('author','operator','none')
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
        if result_code = 'OK' then raise exception 'Invalid organization outcome' using errcode = '22023'; end if;
        state := case when result_code = 'REQUEST_CANCELLED' then 'cancelled'
            when result_code = 'EVIDENCE_REQUIRED' then 'abstained'
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
            result_code := 'REVISION_CONFLICT';
            routing := 'author';
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
                or result_code <> 'OK' or routing <> 'none' then
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
                before_sections,before_source_refs,context_fingerprint,expires_at)
            values(job.id,p_owner,job.document_id,job.expected_document_revision,candidate,context->'sections',
                context->'sourceRefs',context_digest,job.proposal_expires_at);
            state := 'succeeded';
            receipt := jsonb_build_object('proposalId',job.id,'mock',job.mock);
        end if;
    end if;
    update public.ai_jobs set status = state,routing = complete_organize_job.routing,
        result_code = complete_organize_job.result_code,result = receipt,updated_at = clock_timestamp()
    where id = job.id returning * into job;
    update public.ai_job_attempts set completed_at = clock_timestamp(),result_code = job.result_code,
        completion_fingerprint = fingerprint,duration_ms = (p_result->>'elapsedMs')::integer,
        usage = p_result->'usage',steps = p_result->'steps'
    where job_id = job.id and attempt = job.attempt;
    return yeoback_private.ai_job_json(job);
end;
$$;

create function public.load_proposal(p_id uuid)
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
        'mock',(select mock from public.ai_jobs where id = p.id));
end;
$$;

create function public.commit_proposal(p_id uuid,p_reviewed boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    owner uuid := yeoback_private.require_owner();
    p public.knowledge_proposals%rowtype;
    target public.knowledge_documents%rowtype;
    context jsonb;
    saved jsonb;
    refs jsonb;
    applied integer;
begin
    if p_reviewed is not true then raise exception 'Knowledge proposal review is required' using errcode = '22023'; end if;
    select * into p from public.knowledge_proposals where id = p_id and owner_id = owner for update;
    if not found then raise exception 'Knowledge proposal not found' using errcode = 'P0002'; end if;
    if p.applied_revision is not null then
        perform yeoback_private.organize_inputs(owner,p.document_id);
        return jsonb_build_object('documentRevision',p.applied_revision);
    end if;
    if p.expires_at <= clock_timestamp() then raise exception 'Knowledge proposal expired' using errcode = 'P1008'; end if;
    context := yeoback_private.organize_inputs(owner,p.document_id,true);
    if p.expires_at <= clock_timestamp() then raise exception 'Knowledge proposal expired' using errcode = 'P1008'; end if;
    if context->'revision' is distinct from to_jsonb(p.target_revision)
        or sha256(convert_to(context::text,'UTF8')) is distinct from p.context_fingerprint then
        raise exception 'Knowledge source revision conflict' using errcode = '40001';
    end if;
    select * into strict target from public.knowledge_documents where id = p.document_id and owner_id = owner;
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'kind',value->'kind','section_id',value->'sectionId','source_document_id',value->'sourceDocumentId',
        'source_section_id',value->'sourceSectionId','source_revision',value->'sourceRevision',
        'material_id',value->'materialId','page_start',value->'pageStart','page_end',value->'pageEnd')) order by ordinality),'[]')
    into refs from jsonb_array_elements(p.proposal->'sourceRefs') with ordinality;
    saved := yeoback_private.save_document(owner,target.subject_type,target.subject_id,p.target_revision,p.proposal->'sections',refs);
    applied := (saved->>'revision')::integer;
    if applied <> target.revision then
        insert into public.knowledge_document_history(document_id,owner_id,revision,proposal_id,sections,source_refs)
        values(target.id,owner,target.revision,p.id,target.sections,target.source_refs);
    end if;
    update public.knowledge_proposals set applied_revision = applied where id = p.id;
    return jsonb_build_object('documentRevision',applied);
end;
$$;

create function public.list_document_history(p_document_id uuid,p_before_revision integer,p_limit integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare owner uuid := yeoback_private.require_owner();
begin
    if p_limit is null or p_limit not between 1 and 50 or p_before_revision < 1 then
        raise exception 'Invalid knowledge history page' using errcode = '22023';
    end if;
    perform yeoback_private.organize_inputs(owner,p_document_id);
    return (
        with page as (
            select *,row_number() over(order by revision desc) as n from public.knowledge_document_history
            where owner_id = owner and document_id = p_document_id and (p_before_revision is null or revision < p_before_revision)
            order by revision desc limit p_limit + 1
        )
        select jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object('proposalId',proposal_id,
            'revision',revision,'sections',sections,'sourceRefs',yeoback_private.narration_camelize(source_refs),
            'createdAt',created_at) order by revision desc) filter(where n <= p_limit),'[]'),
            'nextBeforeRevision',case when count(*) > p_limit then min(revision) filter(where n <= p_limit) end) from page
    );
end;
$$;

revoke all on function yeoback_private.organize_inputs(uuid,uuid,boolean),yeoback_private.organize_plan(jsonb,jsonb,jsonb),
    yeoback_private.organize_reservation(public.ai_jobs,boolean),
    public.get_organize_context(uuid),public.load_proposal(uuid),public.commit_proposal(uuid,boolean),
    public.list_document_history(uuid,integer,integer),public.reserve_organize_job(uuid,uuid,uuid,integer,boolean),
    public.retry_organize_job(uuid,uuid,uuid,integer,boolean),public.complete_organize_job(uuid,uuid,integer,jsonb)
    from public,anon,authenticated,service_role;
grant execute on function public.get_organize_context(uuid),public.load_proposal(uuid),public.commit_proposal(uuid,boolean),
    public.list_document_history(uuid,integer,integer) to authenticated;
grant execute on function public.reserve_organize_job(uuid,uuid,uuid,integer,boolean),
    public.retry_organize_job(uuid,uuid,uuid,integer,boolean),public.complete_organize_job(uuid,uuid,integer,jsonb) to service_role;
commit;

