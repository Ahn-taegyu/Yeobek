begin;

insert into public.app_policies(key, value) values ('job_lease_seconds', 180);

create or replace function yeoback_private.artwork_json(a public.artworks) returns jsonb
language sql stable strict set search_path = '' as $$
    select jsonb_build_object(
        'id', a.id, 'exhibition_id', a.exhibition_id, 'number', a.number, 'title', a.title,
        'creation_year', a.creation_year, 'medium', a.medium, 'dimensions', a.dimensions,
        'image_material_id', a.image_material_id, 'state', a.state, 'revision', a.revision,
        'created_at', a.created_at, 'updated_at', a.updated_at, 'document', yeoback_private.document_json(d),
        'narration_draft', a.narration_draft
    ) from public.knowledge_documents d where d.owner_id = a.owner_id and d.artwork_id = a.id;
$$;

create table public.ai_jobs (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null,
    artwork_id uuid not null,
    document_id uuid not null,
    request_id uuid not null,
    expected_revision integer not null,
    expected_document_revision integer not null,
    kind text not null default 'narration' check (kind = 'narration'),
    strategy text not null check (strategy in ('single', 'best_of_two')),
    attempt integer not null default 1,
    status text not null default 'running' check (status in ('running', 'succeeded', 'abstained', 'failed', 'cancelled')),
    routing text not null default 'none' check (routing in ('author', 'operator', 'none')),
    result_code text,
    result jsonb,
    source_fingerprint jsonb not null,
    source_ids jsonb not null,
    lease_until timestamptz not null,
    expires_at timestamptz not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (owner_id, id),
    foreign key (owner_id, artwork_id) references public.artworks(owner_id, id)
);

create table public.ai_job_attempts (
    owner_id uuid not null,
    job_id uuid not null,
    attempt integer not null,
    request_id uuid not null,
    reserved_at timestamptz not null default statement_timestamp(),
    completed_at timestamptz,
    completion_fingerprint bytea,
    result_code text,
    duration_ms integer,
    usage jsonb,
    steps jsonb,
    primary key (job_id, attempt),
    unique (owner_id, request_id),
    foreign key (owner_id, job_id) references public.ai_jobs(owner_id, id) on delete cascade
);
create index ai_job_attempts_owner_time on public.ai_job_attempts(owner_id, reserved_at);

alter table public.ai_jobs enable row level security;
alter table public.ai_job_attempts enable row level security;
revoke all on public.ai_jobs, public.ai_job_attempts from public, anon, authenticated, service_role;

-- A stable RFC 9562 UUIDv8 derived from the complete versioned source identity.
create function yeoback_private.narration_source_id(p_doc uuid, p_section text, p_revision integer)
returns uuid language sql immutable strict set search_path = '' as $$
    select (substr(h,1,8) || '-' || substr(h,9,4) || '-8' || substr(h,14,3)
        || '-8' || substr(h,18,3) || '-' || substr(h,21,12))::uuid
    from (select encode(sha256(convert_to(jsonb_build_array('yeobek:narration-source:v1',
        p_doc, p_section, p_revision)::text, 'UTF8')), 'hex') as h) hash;
$$;

-- Lock the live scope before its documents. The caller holds these locks through
-- reservation/completion; section membership and revisions come from the same read.
create function yeoback_private.narration_inputs(p_owner uuid, p_artwork_id uuid, p_edit boolean default false)
returns jsonb language plpgsql set search_path = '' as $$
declare
    scope uuid[] := yeoback_private.subject_scope(p_owner, 'artwork', p_artwork_id);
    artwork_revision integer;
    target public.knowledge_documents%rowtype;
    sources jsonb := '[]';
    fingerprint jsonb := '[]';
    row record;
    used_chars integer := 0;
    section_chars integer;
begin
    perform 1 from public.artist_profiles where owner_id = p_owner and id = scope[1] for share;
    perform 1 from public.exhibitions where owner_id = p_owner and id = scope[2] and deleted_at is null for share;
    if not found then raise exception 'Subject not found' using errcode = 'P0002'; end if;
    if p_edit then
        select revision into artwork_revision from public.artworks
            where owner_id = p_owner and id = p_artwork_id and deleted_at is null for no key update;
    else
        select revision into artwork_revision from public.artworks
            where owner_id = p_owner and id = p_artwork_id and deleted_at is null for share;
    end if;
    if not found then raise exception 'Subject not found' using errcode = 'P0002'; end if;

    for row in
        select d.* from public.knowledge_documents d where d.owner_id = p_owner
            and (d.artist_id = scope[1] or d.exhibition_id = scope[2] or d.artwork_id = scope[3])
        order by case d.subject_type when 'artwork' then 0 when 'exhibition' then 1 else 2 end for share
    loop
        fingerprint := fingerprint || jsonb_build_array(jsonb_build_array(row.id, row.revision));
    end loop;

    select * into strict target from public.knowledge_documents where owner_id = p_owner and artwork_id = p_artwork_id;
    for row in
        select d.id, d.subject_type, d.subject_id, d.revision, s.value->>'id' as section_id, s.value->>'body' as body
        from public.knowledge_documents d cross join lateral jsonb_array_elements(d.sections) s
        where d.owner_id = p_owner and (d.artist_id = scope[1] or d.exhibition_id = scope[2] or d.artwork_id = scope[3])
        order by case d.subject_type when 'artwork' then 0 when 'exhibition' then 1 else 2 end, s.value->>'id'
    loop
        section_chars := char_length(row.body);
        if section_chars is null or section_chars = 0 or used_chars + section_chars > 8000
            or jsonb_array_length(sources) >= 12 then continue; end if;
        used_chars := used_chars + section_chars;
        sources := sources || jsonb_build_array(jsonb_build_object(
            'id', yeoback_private.narration_source_id(row.id, row.section_id, row.revision),
            'owner_id', p_owner, 'artist_id', scope[1], 'subject_type', row.subject_type,
            'subject_id', row.subject_id, 'exhibition_id', case when row.subject_type <> 'artist' then scope[2] end,
            'revision', row.revision, 'text', row.body,
            'ref', case when row.id = target.id then
                jsonb_build_object('kind', 'direct', 'section_id', row.section_id)
            else jsonb_build_object('kind', 'document', 'section_id', 'description',
                'source_document_id', row.id, 'source_section_id', row.section_id, 'source_revision', row.revision)
            end));
    end loop;

    return jsonb_build_object('fingerprint', jsonb_build_array(artwork_revision, fingerprint),
        'artwork_revision', artwork_revision, 'document_id', target.id, 'document_revision', target.revision,
        'context', jsonb_build_object('document_id', target.id, 'owner_id', p_owner, 'artist_id', scope[1],
            'subject_id', p_artwork_id, 'subject_type', 'artwork', 'exhibition_id', scope[2],
            'revision', target.revision, 'sections', target.sections, 'source_refs', target.source_refs, 'sources', sources));
end;
$$;

-- Only known contract keys are camelized. This walks JSON returned by the
-- database, never provider-supplied metadata or an arbitrary visitor payload.
create function yeoback_private.narration_camelize(p_value jsonb)
returns jsonb language sql immutable strict set search_path = '' as $$
    select case jsonb_typeof(p_value)
        when 'array' then (select coalesce(jsonb_agg(yeoback_private.narration_camelize(value) order by ord), '[]')
            from jsonb_array_elements(p_value) with ordinality x(value,ord))
        when 'object' then (select coalesce(jsonb_object_agg(case key
            when 'owner_id' then 'ownerId' when 'artist_id' then 'artistId'
            when 'subject_id' then 'subjectId' when 'subject_type' then 'subjectType'
            when 'exhibition_id' then 'exhibitionId' when 'document_id' then 'documentId'
            when 'source_refs' then 'sourceRefs' when 'section_id' then 'sectionId'
            when 'source_document_id' then 'sourceDocumentId' when 'source_section_id' then 'sourceSectionId'
            when 'source_revision' then 'sourceRevision' when 'material_id' then 'materialId'
            when 'page_start' then 'pageStart' when 'page_end' then 'pageEnd' else key end,
            yeoback_private.narration_camelize(value)), '{}') from jsonb_each(p_value))
        else p_value end;
$$;

create function public.get_narration_context(p_artwork_id uuid)
returns jsonb language sql security definer set search_path = '' as $$
    select yeoback_private.narration_camelize(
        yeoback_private.narration_inputs(yeoback_private.require_owner(), p_artwork_id)->'context');
$$;

create function yeoback_private.ai_job_json(p_job public.ai_jobs)
returns jsonb language sql stable strict set search_path = '' as $$
    select jsonb_build_object('id', p_job.id, 'artworkId', p_job.artwork_id, 'documentId', p_job.document_id,
        'requestId', p_job.request_id, 'kind', p_job.kind, 'attempt', p_job.attempt,
        'status', case when timed_out then 'failed' else p_job.status end,
        'routing', case when timed_out then 'operator' else p_job.routing end,
        'resultCode', case when timed_out then 'REQUEST_TIMEOUT' else p_job.result_code end,
        'expectedRevision', p_job.expected_revision,
        'expectedDocumentRevision', p_job.expected_document_revision, 'strategy', p_job.strategy,
        'result', p_job.result, 'createdAt', p_job.created_at, 'updatedAt', p_job.updated_at, 'expiresAt', p_job.expires_at)
    from (select p_job.status = 'running' and p_job.lease_until <= statement_timestamp() as timed_out) lease;
$$;

create function yeoback_private.assert_ai_quota(p_owner uuid)
returns void language plpgsql set search_path = '' as $$
declare
    day_start timestamptz := date_trunc('day', statement_timestamp(), 'UTC');
begin
    if (select count(*) from public.ai_job_attempts where owner_id = p_owner
        and reserved_at >= day_start and reserved_at < day_start + interval '24 hours')
        >= yeoback_private.policy_integer('author_jobs_per_day') then
        raise exception 'Daily author job limit reached' using errcode = 'P1004';
    end if;
end;
$$;

create function public.reserve_ai_job(p_owner uuid, p_request_id uuid, p_artwork_id uuid,
    p_expected_revision integer, p_expected_document_revision integer, p_strategy text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    job public.ai_jobs%rowtype;
    inputs jsonb;
    existing_attempt integer;
begin
    if p_owner is null or p_request_id is null or p_artwork_id is null or p_expected_revision is null
        or p_expected_document_revision is null or p_strategy is null or p_strategy not in ('single', 'best_of_two') then
        raise exception 'Invalid job input' using errcode = '22023';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('yeobek:ai-jobs:' || p_owner::text, 0));
    perform yeoback_private.subject_scope(p_owner, 'artwork', p_artwork_id);

    select a.attempt into existing_attempt from public.ai_job_attempts a
        where a.owner_id = p_owner and a.request_id = p_request_id;
    if found then
        select j.* into strict job from public.ai_jobs j join public.ai_job_attempts a on a.job_id = j.id
            where a.owner_id = p_owner and a.request_id = p_request_id;
        if existing_attempt <> 1 or job.artwork_id <> p_artwork_id or job.expected_revision <> p_expected_revision
            or job.expected_document_revision <> p_expected_document_revision or job.strategy <> p_strategy then
            raise exception 'Request ID already used with different input' using errcode = 'P1005';
        end if;
        if job.expires_at <= statement_timestamp() then raise exception 'Job not found' using errcode = 'P0002'; end if;
        return jsonb_build_object('job', yeoback_private.ai_job_json(job), 'claimed', false);
    end if;

    perform yeoback_private.assert_ai_quota(p_owner);
    inputs := yeoback_private.narration_inputs(p_owner, p_artwork_id);
    if (inputs->>'artwork_revision')::integer <> p_expected_revision
        or (inputs->>'document_revision')::integer <> p_expected_document_revision then
        raise exception 'Narration source revision conflict' using errcode = '40001';
    end if;

    insert into public.ai_jobs(owner_id, artwork_id, document_id, request_id, expected_revision,
        expected_document_revision, strategy, source_fingerprint, source_ids, lease_until, expires_at)
    values (p_owner, p_artwork_id, (inputs->>'document_id')::uuid, p_request_id, p_expected_revision,
        p_expected_document_revision, p_strategy, inputs->'fingerprint',
        (select coalesce(jsonb_agg(s->'id'), '[]') from jsonb_array_elements(inputs->'context'->'sources') s),
        statement_timestamp() + yeoback_private.policy_integer('job_lease_seconds') * interval '1 second',
        statement_timestamp() + yeoback_private.policy_integer('job_retention_days') * interval '1 day')
    returning * into job;
    insert into public.ai_job_attempts(owner_id, job_id, attempt, request_id)
        values (p_owner, job.id, job.attempt, p_request_id);
    return jsonb_build_object('job', yeoback_private.ai_job_json(job), 'claimed', true);
end;
$$;

create function public.retry_ai_job(p_owner uuid, p_job_id uuid, p_request_id uuid, p_expected_attempt integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    job public.ai_jobs%rowtype;
    replay public.ai_job_attempts%rowtype;
    inputs jsonb;
begin
    if p_owner is null or p_job_id is null or p_request_id is null or p_expected_attempt is null then
        raise exception 'Invalid retry input' using errcode = '22023';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('yeobek:ai-jobs:' || p_owner::text, 0));
    select * into job from public.ai_jobs where owner_id = p_owner and id = p_job_id for update;
    if not found or job.expires_at <= statement_timestamp() then
        raise exception 'Job not found' using errcode = 'P0002';
    end if;
    perform yeoback_private.subject_scope(p_owner, 'artwork', job.artwork_id);
    select * into replay from public.ai_job_attempts where owner_id = p_owner and request_id = p_request_id;
    if found then
        if replay.job_id <> job.id or replay.attempt - 1 <> p_expected_attempt or replay.attempt = 1 then
            raise exception 'Request ID already used with different input' using errcode = 'P1005';
        end if;
        return jsonb_build_object('job', yeoback_private.ai_job_json(job), 'claimed', false);
    end if;
    if job.attempt <> p_expected_attempt or job.status not in ('failed', 'cancelled', 'running')
        or (job.status = 'running' and job.lease_until > statement_timestamp()) then
        raise exception 'Job attempt cannot be retried' using errcode = 'P1006';
    end if;
    perform yeoback_private.assert_ai_quota(p_owner);
    inputs := yeoback_private.narration_inputs(p_owner, job.artwork_id);
    if inputs->'fingerprint' is distinct from job.source_fingerprint then
        raise exception 'Narration source revision conflict' using errcode = '40001';
    end if;

    if job.status = 'running' then
        update public.ai_job_attempts set completed_at = statement_timestamp(), result_code = 'REQUEST_TIMEOUT'
            where job_id = job.id and attempt = job.attempt;
    end if;
    update public.ai_jobs set attempt = job.attempt + 1, status = 'running', routing = 'none',
        result_code = null, result = null, lease_until = statement_timestamp() + yeoback_private.policy_integer('job_lease_seconds') * interval '1 second',
        expires_at = statement_timestamp() + yeoback_private.policy_integer('job_retention_days') * interval '1 day',
        updated_at = statement_timestamp()
        where id = job.id returning * into job;
    insert into public.ai_job_attempts(owner_id, job_id, attempt, request_id)
        values (p_owner, job.id, job.attempt, p_request_id);
    return jsonb_build_object('job', yeoback_private.ai_job_json(job), 'claimed', true);
end;
$$;

create function public.complete_ai_job(p_owner uuid, p_job_id uuid, p_attempt integer, p_result jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
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
            'mock', coalesce(p_result->'mock' = 'true'::jsonb, false));
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

    update public.ai_jobs set status = complete_ai_job.status, routing = complete_ai_job.routing,
        result_code = complete_ai_job.result_code, result = complete_ai_job.result, updated_at = statement_timestamp()
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

create function public.get_ai_job(p_job_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    owner uuid := yeoback_private.require_owner();
    job public.ai_jobs%rowtype;
begin
    select * into job from public.ai_jobs where owner_id = owner and id = p_job_id;
    if not found or job.expires_at <= statement_timestamp() then
        raise exception 'Job not found' using errcode = 'P0002';
    end if;
    perform yeoback_private.subject_scope(owner, 'artwork', job.artwork_id);
    return yeoback_private.ai_job_json(job);
end;
$$;

create function public.save_narration_draft(p_artwork_id uuid, p_expected_revision integer, p_text text,
    p_source_job_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    owner uuid := yeoback_private.require_owner();
    artwork public.artworks%rowtype;
    job public.ai_jobs%rowtype;
    inputs jsonb;
begin
    if p_expected_revision is null or (p_text is not null and char_length(p_text) > 2000) then
        raise exception 'Invalid narration draft' using errcode = '22023';
    end if;
    if p_source_job_id is not null then
        select * into job from public.ai_jobs where owner_id = owner and id = p_source_job_id
            and artwork_id = p_artwork_id and status = 'succeeded' and expires_at > statement_timestamp() for share;
        if not found then raise exception 'Job not found' using errcode = 'P0002'; end if;
        if p_text is distinct from job.result->'selected'->>'answer' then
            raise exception 'Draft does not match selected candidate' using errcode = '22023';
        end if;
    end if;
    inputs := yeoback_private.narration_inputs(owner, p_artwork_id, true);
    if (inputs->>'artwork_revision')::integer <> p_expected_revision
        or (p_source_job_id is not null and inputs->'fingerprint' is distinct from job.source_fingerprint) then
        raise exception 'Narration revision conflict' using errcode = '40001';
    end if;
    update public.artworks a set narration_draft = p_text, revision = a.revision + 1, updated_at = statement_timestamp()
        where owner_id = owner and id = p_artwork_id and a.revision = p_expected_revision
        returning a.* into artwork;
    if not found then raise exception 'Narration revision conflict' using errcode = '40001'; end if;
    return yeoback_private.artwork_json(artwork);
end;
$$;

revoke all on function yeoback_private.narration_source_id(uuid, text, integer),
    yeoback_private.narration_inputs(uuid, uuid, boolean), yeoback_private.narration_camelize(jsonb),
    yeoback_private.ai_job_json(public.ai_jobs), yeoback_private.assert_ai_quota(uuid)
    from public, anon, authenticated, service_role;
revoke all on function public.reserve_ai_job(uuid, uuid, uuid, integer, integer, text),
    public.retry_ai_job(uuid, uuid, uuid, integer), public.complete_ai_job(uuid, uuid, integer, jsonb),
    public.get_ai_job(uuid), public.get_narration_context(uuid), public.save_narration_draft(uuid, integer, text, uuid)
    from public, anon, authenticated, service_role;
grant execute on function public.reserve_ai_job(uuid, uuid, uuid, integer, integer, text),
    public.retry_ai_job(uuid, uuid, uuid, integer), public.complete_ai_job(uuid, uuid, integer, jsonb)
    to service_role;
grant execute on function public.get_ai_job(uuid), public.get_narration_context(uuid),
    public.save_narration_draft(uuid, integer, text, uuid) to authenticated;

commit;
