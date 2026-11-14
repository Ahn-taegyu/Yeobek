begin;

create table yeoback_private.training_batches (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null,
    exhibition_id uuid not null,
    request_id uuid not null,
    expected_revision integer not null,
    include_exhibition_qa boolean not null,
    exhibition_name text not null,
    artist_name text,
    expires_at timestamptz not null,
    unique (owner_id,request_id),
    foreign key (owner_id,exhibition_id) references public.exhibitions(owner_id,id)
);
create index training_batches_expiry on yeoback_private.training_batches(expires_at,id);

create table yeoback_private.training_targets (
    id uuid primary key default gen_random_uuid(),
    batch_id uuid not null references yeoback_private.training_batches(id) on delete cascade,
    position integer not null,
    kind text not null check (kind in ('narration','expected_qa')),
    artwork_id uuid references public.artworks(id),
    target_name text not null,
    expected_revision integer not null,
    expected_document_revision integer not null,
    source_fingerprint jsonb not null,
    job_id uuid unique,
    unique (batch_id,position),
    check (kind <> 'narration' or artwork_id is not null)
);
revoke all on yeoback_private.training_batches,yeoback_private.training_targets from public,anon,authenticated,service_role;

create function yeoback_private.training_batch_json(p_batch yeoback_private.training_batches)
returns jsonb language sql stable strict set search_path = '' as $$
    select jsonb_build_object('id',p_batch.id,'exhibitionId',p_batch.exhibition_id,'exhibitionName',p_batch.exhibition_name,
        'artistName',coalesce(p_batch.artist_name,'작가'),'status',case
            when bool_or(state = 'running') then 'running'
            when bool_and(state = 'queued') then 'queued'
            when bool_or(state = 'queued') then 'running'
            else 'completed' end,
        'targets',jsonb_agg(jsonb_build_object('id',id,'kind',kind,
            'scope',case when artwork_id is null then 'exhibition' else 'artwork' end,'artworkId',artwork_id,
            'targetName',target_name,'jobId',case when attempt is not null then job_id end,
            'status',state,'attempt',attempt,'resultCode',result_code) order by position))
    from (
        select t.*,j.attempt,case when t.job_id is null then 'queued'
            when j.id is null or j.expires_at <= statement_timestamp() or
                (j.status = 'running' and j.lease_until <= statement_timestamp()) then 'failed'
            else j.status end as state,
            case when t.job_id is not null and (j.id is null or j.expires_at <= statement_timestamp()) then 'JOB_EXPIRED'
                when j.status = 'running' and j.lease_until <= statement_timestamp() then 'REQUEST_TIMEOUT'
                else j.result_code end as result_code
        from yeoback_private.training_targets t left join public.ai_jobs j on j.id = t.job_id
        where t.batch_id = p_batch.id
    ) targets;
$$;

create function public.create_training_batch(p_owner uuid,p_exhibition_id uuid,p_request_id uuid,
    p_expected_revision integer,p_include_exhibition_qa boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    scope uuid[] := yeoback_private.qa_scope(p_owner,p_exhibition_id,null);
    exhibition public.exhibitions%rowtype;
    batch yeoback_private.training_batches%rowtype;
    artist_name text;
    target record;
    inputs jsonb;
    target_position integer := 0;
    artwork_count integer;
begin
    if num_nulls(p_request_id,p_expected_revision,p_include_exhibition_qa) <> 0 or p_expected_revision < 1 then
        raise exception 'Invalid training batch input' using errcode = '22023';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('yeobek:ai-jobs:' || p_owner::text,0));
    perform yeoback_private.lock_publication(p_owner);
    select * into batch from yeoback_private.training_batches where owner_id = p_owner and request_id = p_request_id;
    if found then
        if batch.exhibition_id <> p_exhibition_id or batch.expected_revision <> p_expected_revision
            or batch.include_exhibition_qa <> p_include_exhibition_qa then
            raise exception 'Request ID already used with different input' using errcode = 'P1005';
        end if;
        if batch.expires_at <= statement_timestamp() then raise exception 'Training batch not found' using errcode = 'P0002'; end if;
        return yeoback_private.training_batch_json(batch);
    end if;
    select display_name into artist_name from public.artist_profiles where owner_id = p_owner and id = scope[1] for share;
    -- An exhibition update lock freezes the live artwork membership during manifest creation.
    select * into exhibition from public.exhibitions where owner_id = p_owner and id = p_exhibition_id
        and deleted_at is null for update;
    if not found then raise exception 'Subject not found' using errcode = 'P0002'; end if;
    if exhibition.revision <> p_expected_revision then raise exception 'Exhibition revision conflict' using errcode = '40001'; end if;
    select count(*) into artwork_count from public.artworks where owner_id = p_owner and exhibition_id = p_exhibition_id
        and deleted_at is null;
    if artwork_count = 0 and not p_include_exhibition_qa then
        raise exception 'Training batch requires a target' using errcode = '22023';
    end if;
    if artwork_count > least(30,yeoback_private.policy_integer('training_batch_artworks_max')) then
        raise exception 'Training batch has too many artworks' using errcode = '22023';
    end if;

    insert into yeoback_private.training_batches(owner_id,exhibition_id,request_id,expected_revision,include_exhibition_qa,
        exhibition_name,artist_name,expires_at)
    values (p_owner,p_exhibition_id,p_request_id,p_expected_revision,p_include_exhibition_qa,
        coalesce(exhibition.title,'제목 없는 전시'),artist_name,
        clock_timestamp() + yeoback_private.policy_integer('job_retention_days') * interval '1 day') returning * into batch;
    if p_include_exhibition_qa then
        inputs := yeoback_private.qa_inputs(p_owner,p_exhibition_id,null);
        insert into yeoback_private.training_targets(batch_id,position,kind,target_name,expected_revision,
            expected_document_revision,source_fingerprint)
        values (batch.id,target_position,'expected_qa',batch.exhibition_name,p_expected_revision,
            (inputs#>>'{context,documentRevision}')::integer,inputs->'fingerprint');
        target_position := target_position + 1;
    end if;
    for target in select id,coalesce(title,'제목 없는 작품') as name from public.artworks
        where owner_id = p_owner and exhibition_id = p_exhibition_id and deleted_at is null
        order by coalesce(draft_number,number),id
    loop
        inputs := yeoback_private.narration_inputs(p_owner,target.id);
        insert into yeoback_private.training_targets(batch_id,position,kind,artwork_id,target_name,expected_revision,
            expected_document_revision,source_fingerprint)
        values (batch.id,target_position,'narration',target.id,target.name,(inputs->>'artwork_revision')::integer,
            (inputs->>'document_revision')::integer,inputs->'fingerprint');
        inputs := yeoback_private.qa_inputs(p_owner,p_exhibition_id,target.id);
        insert into yeoback_private.training_targets(batch_id,position,kind,artwork_id,target_name,expected_revision,
            expected_document_revision,source_fingerprint)
        values (batch.id,target_position + 1,'expected_qa',target.id,target.name,(inputs#>>'{context,revision}')::integer,
            (inputs#>>'{context,documentRevision}')::integer,inputs->'fingerprint');
        target_position := target_position + 2;
    end loop;
    return yeoback_private.training_batch_json(batch);
end;
$$;

create function public.get_training_batch(p_batch_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
    owner uuid := yeoback_private.require_owner();
    batch yeoback_private.training_batches%rowtype;
begin
    select * into batch from yeoback_private.training_batches where owner_id = owner and id = p_batch_id
        and expires_at > statement_timestamp();
    if not found then raise exception 'Training batch not found' using errcode = 'P0002'; end if;
    perform yeoback_private.qa_scope(owner,batch.exhibition_id,null);
    return yeoback_private.training_batch_json(batch);
end;
$$;

create function public.claim_training_target(p_owner uuid,p_batch_id uuid,p_target_id uuid,p_request_id uuid,
    p_expected_attempt integer,p_mock boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    batch yeoback_private.training_batches%rowtype;
    target yeoback_private.training_targets%rowtype;
    job public.ai_jobs%rowtype;
    exhibition_revision integer;
    replay public.ai_job_attempts%rowtype;
    inputs jsonb;
    reservation jsonb;
begin
    if num_nulls(p_owner,p_batch_id,p_target_id,p_request_id,p_expected_attempt,p_mock) <> 0 or p_expected_attempt < 0 then
        raise exception 'Invalid training target input' using errcode = '22023';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('yeobek:ai-jobs:' || p_owner::text,0));
    select * into batch from yeoback_private.training_batches where owner_id = p_owner and id = p_batch_id
        and expires_at > clock_timestamp() for update;
    if not found then raise exception 'Training batch not found' using errcode = 'P0002'; end if;
    select * into target from yeoback_private.training_targets where batch_id = batch.id and id = p_target_id for update;
    if not found then raise exception 'Training target not found' using errcode = 'P0002'; end if;
    perform yeoback_private.qa_scope(p_owner,batch.exhibition_id,target.artwork_id);

    select * into replay from public.ai_job_attempts where owner_id = p_owner and request_id = p_request_id;
    if found then
        if replay.job_id is distinct from target.job_id or replay.attempt - 1 <> p_expected_attempt
            or replay.qa_mock is distinct from p_mock then
            raise exception 'Request ID already used with different input' using errcode = 'P1005';
        end if;
        select * into job from public.ai_jobs where id = replay.job_id and owner_id = p_owner;
        if not found or job.expires_at <= clock_timestamp() then raise exception 'Job not found' using errcode = 'P0002'; end if;
        return jsonb_build_object('claimed',false,'context',null,'job',case when target.kind = 'narration'
            then yeoback_private.ai_job_json(job) else yeoback_private.qa_job_json(job) end);
    end if;
    if exists (select 1 from yeoback_private.training_targets t join public.ai_jobs j on j.id = t.job_id
        where t.batch_id = batch.id and j.status = 'running' and j.lease_until > clock_timestamp()) then
        raise exception 'A training target is already running' using errcode = 'P1006';
    end if;
    if (target.job_id is null) is distinct from (p_expected_attempt = 0) then
        raise exception 'Training target attempt conflict' using errcode = 'P1006';
    end if;
    if p_expected_attempt = 0 then
        -- Keep lock acquisition in job -> source order for retries. First claims have no job yet.
        if target.kind = 'narration' then
            perform 1 from public.artist_profiles a join public.exhibitions e on e.artist_id = a.id
                where e.id = batch.exhibition_id for share of a;
            select revision into exhibition_revision from public.exhibitions where id = batch.exhibition_id
                and deleted_at is null for share;
            if exhibition_revision is distinct from batch.expected_revision then
                raise exception 'Exhibition revision conflict' using errcode = '40001';
            end if;
            inputs := yeoback_private.narration_inputs(p_owner,target.artwork_id);
        else
            inputs := yeoback_private.qa_inputs(p_owner,batch.exhibition_id,target.artwork_id);
        end if;
        if inputs->'fingerprint' is distinct from target.source_fingerprint then
            raise exception 'Training target revision conflict' using errcode = '40001';
        end if;
        if target.kind = 'narration' then
            reservation := public.reserve_ai_job(p_owner,p_request_id,target.artwork_id,target.expected_revision,
                target.expected_document_revision,'best_of_two',p_mock);
        else
            reservation := public.reserve_expected_qa_job(p_owner,p_request_id,batch.exhibition_id,target.artwork_id,
                target.expected_revision,target.expected_document_revision,p_mock);
        end if;
        update yeoback_private.training_targets set job_id = (reservation#>>'{job,id}')::uuid where id = target.id;
    elsif target.kind = 'narration' then
        select * into job from public.ai_jobs where id = target.job_id and owner_id = p_owner for update;
        if not found then raise exception 'Job not found' using errcode = 'P0002'; end if;
        perform 1 from public.artist_profiles a join public.exhibitions e on e.artist_id = a.id
            where e.id = batch.exhibition_id for share of a;
        select revision into exhibition_revision from public.exhibitions where id = batch.exhibition_id
            and deleted_at is null for share;
        if exhibition_revision is distinct from batch.expected_revision then
            raise exception 'Exhibition revision conflict' using errcode = '40001';
        end if;
        reservation := public.retry_ai_job(p_owner,target.job_id,p_request_id,p_expected_attempt,p_mock);
    else
        reservation := public.retry_expected_qa_job(p_owner,target.job_id,p_request_id,p_expected_attempt,p_mock);
    end if;
    update public.ai_job_attempts set qa_mock = p_mock where owner_id = p_owner and request_id = p_request_id;
    return jsonb_build_object('context',null) || reservation;
end;
$$;

-- Batch rows retain no private source bodies. Purge their manifests on the existing schedule.
alter function public.purge_expired() rename to purge_expired_before_training_batches;
alter function public.purge_expired_before_training_batches() set schema yeoback_private;
revoke all on function yeoback_private.purge_expired_before_training_batches() from public,anon,authenticated,service_role;
create function public.purge_expired()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
    result := yeoback_private.purge_expired_before_training_batches();
    delete from yeoback_private.training_batches where id in (
        select id from yeoback_private.training_batches where expires_at <= statement_timestamp()
        order by expires_at,id limit 1000 for update skip locked);
    return result;
end;
$$;

revoke all on function yeoback_private.training_batch_json(yeoback_private.training_batches),
    public.create_training_batch(uuid,uuid,uuid,integer,boolean),public.get_training_batch(uuid),
    public.claim_training_target(uuid,uuid,uuid,uuid,integer,boolean),public.purge_expired()
    from public,anon,authenticated,service_role;
grant execute on function public.create_training_batch(uuid,uuid,uuid,integer,boolean),
    public.claim_training_target(uuid,uuid,uuid,uuid,integer,boolean),public.purge_expired() to service_role;
grant execute on function public.get_training_batch(uuid) to authenticated;

commit;
