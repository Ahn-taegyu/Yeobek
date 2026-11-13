begin;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
    values ('artist-audio','artist-audio',false,8388608,array['audio/mpeg']);
create policy artist_audio_no_direct_access on storage.objects as restrictive
    for all to anon,authenticated using (bucket_id <> 'artist-audio') with check (bucket_id <> 'artist-audio');

create table public.voice_configs (
    version integer primary key check (version > 0),
    fingerprint bytea not null check (octet_length(fingerprint) = 32),
    mock boolean not null
);
alter table public.voice_configs enable row level security;
revoke all on public.voice_configs from public,anon,authenticated,service_role;

alter table public.ai_jobs drop constraint ai_jobs_kind_check,
    alter column strategy drop not null,
    add column audio_approval_id uuid references public.narration_approvals(id),
    add column voice_config_version integer references public.voice_configs(version),
    add column voice_fingerprint bytea,
    add constraint ai_jobs_kind_shape check (
        (kind = 'narration' and strategy is not null
            and num_nonnulls(audio_approval_id,voice_config_version,voice_fingerprint) = 0)
        or (kind = 'audio' and strategy is null
            and num_nonnulls(audio_approval_id,voice_config_version,voice_fingerprint) = 3
            and octet_length(voice_fingerprint) = 32)
    );

alter table public.audio_assets
    add column job_id uuid,
    add column cleanup_after timestamptz,
    add column attempt integer,
    add column voice_fingerprint bytea,
    add column content_hash bytea,
    add column byte_size integer check (byte_size between 1 and 8388608),
    add column mock boolean not null default false,
    add constraint audio_job_attempt_unique unique(job_id,attempt);
-- Audio assets survive the operational job ledger's retention window.
create index audio_assets_cleanup_due on public.audio_assets(cleanup_after,id)
    where cleanup_after is not null and state in ('pending','failed','revoked');
create unique index audio_assets_storage_key on public.audio_assets(storage_key) where job_id is not null;

create function public.sync_audio_config(p_fingerprint text,p_mock boolean)
returns integer language plpgsql security definer set search_path = '' as $$
declare
    active_version integer;
    config public.voice_configs%rowtype;
begin
    if p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{64}$' or p_mock is null then
        raise exception 'Invalid voice configuration' using errcode = '22023';
    end if;
    select value::integer into active_version from public.app_policies where key = 'voice_config_version' for share;
    if not found then raise exception 'Application policy unavailable' using errcode = 'P1003'; end if;
    insert into public.voice_configs(version,fingerprint,mock)
    values (active_version,decode(p_fingerprint,'hex'),p_mock) on conflict (version) do nothing;
    select * into strict config from public.voice_configs where version = active_version;
    if config.fingerprint <> decode(p_fingerprint,'hex') or config.mock <> p_mock then
        raise exception 'Voice configuration requires a new policy version' using errcode = 'P1003';
    end if;
    return active_version;
end;
$$;

create or replace function yeoback_private.ready_narration_audio(p_approval public.narration_approvals)
returns public.audio_assets language sql stable strict set search_path = '' as $$
    select a.* from public.audio_assets a join public.voice_configs c
        on c.version = a.voice_config_version and c.fingerprint = a.voice_fingerprint and c.mock = a.mock
    where a.approval_id = p_approval.id and a.state = 'ready' and a.text_hash = p_approval.text_hash
        and a.voice_config_version = yeoback_private.policy_integer('voice_config_version')
    order by a.created_at desc,a.id desc limit 1;
$$;

-- The config-aware entry point uses an explicit attachment option. The
-- legacy service-role RPC remains available for existing trusted callers.
create function yeoback_private.publish_with_audio(p_owner uuid,p_exhibition_id uuid, p_request_id uuid, p_expected_revision integer,
    p_artworks jsonb, p_intro jsonb,p_voice_required boolean,p_attach_audio boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    owner uuid := p_owner;
    exhibition public.exhibitions%rowtype;
    artwork public.artworks%rowtype;
    approval public.narration_approvals%rowtype;
    audio public.audio_assets%rowtype;
    evidence public.evidence_items%rowtype;
    image public.materials%rowtype;
    candidate jsonb;
    pin jsonb;
    field text;
    intro_text jsonb := '{}';
    intro_refs jsonb := '{}';
    blocked jsonb := '[]';
    publications jsonb := '[]';
    snapshot jsonb;
    reasons text[];
    pub_id uuid;
    pub_version integer;
    author_name text;
    fingerprint bytea;
    old_request public.publication_requests%rowtype;
    response jsonb;
begin
    if p_voice_required is true and p_attach_audio is not true then
        raise exception 'Voice configuration is required for publication' using errcode = 'P1003';
    end if;
    if p_owner is null or p_request_id is null or p_expected_revision is null or jsonb_typeof(p_artworks) is distinct from 'array'
        or jsonb_typeof(p_intro) is distinct from 'object'
        or not p_intro ?& array['bio','introduction','theme']
        or p_intro - array['bio','introduction','theme'] <> '{}' then
        raise exception 'Invalid publication request' using errcode = '22023';
    end if;
    if jsonb_array_length(p_artworks) > 100 or
        (select count(distinct x->>'artwork_id') from jsonb_array_elements(p_artworks) x) <> jsonb_array_length(p_artworks) then
        raise exception 'Invalid publication selection' using errcode = '22023';
    end if;
    fingerprint := sha256(convert_to(jsonb_build_array(p_exhibition_id, p_expected_revision, p_artworks, p_intro)::text,'UTF8'));
    perform yeoback_private.lock_publication(owner);
    select display_name into author_name from public.artist_profiles where owner_id = owner for share;
    select * into exhibition from public.exhibitions where id = p_exhibition_id and owner_id = owner and deleted_at is null for update;
    if not found then raise exception 'Subject not found' using errcode = 'P0002'; end if;
    select * into old_request from public.publication_requests where owner_id = owner and request_id = p_request_id;
    if found then
        if old_request.fingerprint <> fingerprint then
            raise exception 'Request ID already used with different input' using errcode = 'P1005';
        end if;
        return old_request.result || '{"created":false}'::jsonb;
    end if;
    perform yeoback_private.sync_publication_voice(p_voice_required);
    if exhibition.revision is distinct from p_expected_revision then
        raise exception 'Publication revision conflict' using errcode = '40001';
    end if;
    if nullif(btrim(author_name),'') is null then
        raise exception 'Public artist name is required' using errcode = '22023';
    end if;
    -- Lock all selected work rows before locking their source documents.
    perform 1 from public.artworks a where a.owner_id = owner and a.exhibition_id = p_exhibition_id
        and a.id in (select (value->>'artwork_id')::uuid from jsonb_array_elements(p_artworks))
        order by a.id for update;
    perform 1 from public.knowledge_documents d where d.owner_id = owner
        and (d.artist_id = exhibition.artist_id or d.exhibition_id = p_exhibition_id or d.artwork_id in (
            select (value->>'artwork_id')::uuid from jsonb_array_elements(p_artworks)
        ))
        order by case d.subject_type when 'artwork' then 0 when 'exhibition' then 1 else 2 end,d.id for share;
    perform 1 from public.materials m where m.owner_id = owner and m.id in (
        select image_material_id from public.artworks a where a.owner_id = owner and a.exhibition_id = p_exhibition_id
        and a.id in (select (value->>'artwork_id')::uuid from jsonb_array_elements(p_artworks))
    ) or (m.owner_id = owner and m.id in (
        select e.material_id from public.evidence_items e where e.owner_id = owner
            and e.exhibition_id = p_exhibition_id and e.state = 'approved'
    )) order by m.id for share;
    for field, pin in select key, value from jsonb_each(p_intro) loop
        if pin = 'null'::jsonb then continue; end if;
        if jsonb_typeof(pin) <> 'object' or not pin ?& array['id','version'] or pin - array['id','version'] <> '{}' then
            raise exception 'Invalid introduction pin' using errcode = '22023';
        end if;
        select * into evidence from public.evidence_items e
            where (e.id,e.version) = ((pin->>'id')::uuid,(pin->>'version')::integer)
              and e.owner_id = owner and e.exhibition_id = p_exhibition_id and e.state = 'approved'
              and e.scope = case when field = 'bio' then 'artist' else 'exhibition' end
              and yeoback_private.evidence_is_current(e) and char_length(e.body) <= 5000
              and (e.source_kind <> 'document' or e.source_section_id = field);
        if not found then raise exception 'Introduction evidence is unavailable' using errcode = '40001'; end if;
        intro_text := intro_text || jsonb_build_object(field,evidence.body);
        intro_refs := intro_refs || jsonb_build_object(field,pin);
    end loop;

    for candidate in select value from jsonb_array_elements(p_artworks) loop
        select * into artwork from public.artworks
            where id = (candidate->>'artwork_id')::uuid and owner_id = owner
                and exhibition_id = p_exhibition_id and deleted_at is null for update;
        if not found then raise exception 'Subject not found' using errcode = 'P0002'; end if;
        reasons := yeoback_private.publication_rules(owner, artwork.id);
        if artwork.revision is distinct from (candidate->>'expected_revision')::integer then
            reasons := array_append(reasons,'REVISION_CONFLICT');
        end if;
        if cardinality(reasons) > 0 then
            blocked := blocked || jsonb_build_array(jsonb_build_object('artworkId',artwork.id,'reasons',reasons));
        end if;
    end loop;

    if p_artworks = '[]'::jsonb and not exists (
        select 1 from public.artworks a join public.publications p on p.id = a.active_publication_id
        where a.exhibition_id = p_exhibition_id and a.state = 'published' and a.deleted_at is null
            and yeoback_private.publication_is_valid(p)
    ) then raise exception 'At least one artwork must be published' using errcode = '22023'; end if;
    if blocked <> '[]'::jsonb then
        return jsonb_build_object('exhibitionId',p_exhibition_id,'revision',exhibition.revision,
            'state',exhibition.state,'publications',publications,'blocked',blocked,'created',false);
    end if;

    for candidate in select value from jsonb_array_elements(p_artworks) loop
        select * into strict artwork from public.artworks where id = (candidate->>'artwork_id')::uuid;
        approval := yeoback_private.current_narration_approval(owner, artwork.id);
        select * into strict image from public.materials where id = artwork.image_material_id;
        audio := null;
        if p_attach_audio then audio := yeoback_private.ready_narration_audio(approval); end if;
        select coalesce(max(version),0) + 1 into pub_version from public.publications where artwork_id = artwork.id;
        pub_id := gen_random_uuid();
        select jsonb_agg(jsonb_build_object(
            'id',e.id,'version',e.version,'ownerId',owner,'exhibitionId',p_exhibition_id,'publicationId',pub_id,
            'artworkId',e.artwork_id,'scope',e.scope,'sourceLabel',e.source_label,'body',e.body,
            'contentHash',encode(e.content_hash,'hex')
        ) order by e.id) into snapshot
        from public.evidence_items e where e.owner_id = owner and e.exhibition_id = p_exhibition_id
          and (e.artwork_id is null or e.artwork_id = artwork.id) and yeoback_private.evidence_is_current(e);
        insert into public.publications(id,owner_id,exhibition_id,artwork_id,version,number,title,creation_year,
            medium,dimensions,image_key,evidence,narration_text,narration_hash,narration_citations,audio_key,audio_text_hash,approved_by)
        values (pub_id,owner,p_exhibition_id,artwork.id,pub_version,artwork.number,artwork.title,artwork.creation_year,
            artwork.medium,artwork.dimensions,image.storage_key,jsonb_build_object('schemaVersion',1,'items',snapshot),
            approval.narration_text,approval.text_hash,approval.citations,audio.storage_key,audio.text_hash,owner);
        insert into public.publication_evidence_refs(publication_id,evidence_id,evidence_version)
            select pub_id,(e->>'id')::uuid,(e->>'version')::integer from jsonb_array_elements(snapshot) e;
        update public.artworks set active_publication_id = pub_id,state = 'published',
            revision = revision + 1,updated_at = statement_timestamp() where id = artwork.id;
        publications := publications || jsonb_build_array(jsonb_build_object(
            'artworkId',artwork.id,'publicationId',pub_id,'version',pub_version));
    end loop;
    update public.exhibitions set state = 'published', public_title = title, public_artist_display_name = author_name,
        public_artist_bio = intro_text->>'bio', public_introduction = intro_text->>'introduction',
        public_theme = intro_text->>'theme', intro_evidence = intro_refs, public_start_date = start_date,
        public_end_date = end_date, public_place = place, revision = revision + 1, updated_at = statement_timestamp()
    where id = p_exhibition_id returning * into exhibition;
    response := jsonb_build_object('exhibitionId',p_exhibition_id,'revision',exhibition.revision,'state',exhibition.state,
        'publications',publications,'blocked',blocked,'created',true);
    insert into public.publication_requests values (owner,p_request_id,fingerprint,response);
    return response;
end;
$$;

create function public.publish_with_audio_config(p_owner uuid,p_exhibition_id uuid,p_request_id uuid,p_expected_revision integer,
    p_artworks jsonb,p_intro jsonb,p_voice_required boolean,p_voice_fingerprint text,p_mock boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
    if p_voice_fingerprint is null and p_voice_required is distinct from false then
        raise exception 'Voice configuration is required for publication' using errcode = 'P1003';
    end if;
    perform yeoback_private.lock_publication(p_owner);
    if p_voice_fingerprint is not null then
        perform public.sync_audio_config(p_voice_fingerprint,p_mock);
    end if;
    return yeoback_private.publish_with_audio(p_owner,p_exhibition_id,p_request_id,p_expected_revision,
        p_artworks,p_intro,p_voice_required,p_voice_fingerprint is not null);
end;
$$;
revoke all on function yeoback_private.publish_with_audio(uuid,uuid,uuid,integer,jsonb,jsonb,boolean,boolean),
    public.publish_with_audio_config(uuid,uuid,uuid,integer,jsonb,jsonb,boolean,text,boolean)
    from public,anon,authenticated,service_role;
grant execute on function public.publish_with_audio_config(uuid,uuid,uuid,integer,jsonb,jsonb,boolean,text,boolean) to service_role;

create function yeoback_private.audio_job_approval(p_job public.ai_jobs)
returns public.narration_approvals language plpgsql set search_path = '' as $$
declare
    approval public.narration_approvals%rowtype;
    scope uuid[];
begin
    scope := yeoback_private.subject_scope(p_job.owner_id,'artwork',p_job.artwork_id);
    perform 1 from public.exhibitions where id = scope[2] and deleted_at is null for share;
    if not found then return null; end if;
    perform 1 from public.artworks where id = p_job.artwork_id and deleted_at is null for share;
    if not found then return null; end if;
    perform 1 from public.knowledge_documents d where d.owner_id = p_job.owner_id
        and (d.artwork_id = scope[3] or d.exhibition_id = scope[2] or d.artist_id = scope[1])
        order by case d.subject_type when 'artwork' then 0 when 'exhibition' then 1 else 2 end,d.id for share;
    perform 1 from public.materials m where m.owner_id = p_job.owner_id and m.id in (
        select e.material_id from public.narration_approval_evidence r join public.evidence_items e
            on (e.id,e.version) = (r.evidence_id,r.evidence_version) where r.approval_id = p_job.audio_approval_id
    ) order by m.id for share;
    perform 1 from public.app_policies where key = 'voice_config_version' and value = p_job.voice_config_version for share;
    if not found or not exists (select 1 from public.voice_configs c where c.version = p_job.voice_config_version
        and c.fingerprint = p_job.voice_fingerprint and c.mock = p_job.mock) then return null; end if;
    approval := yeoback_private.current_narration_approval(p_job.owner_id,p_job.artwork_id);
    if approval.id is distinct from p_job.audio_approval_id then return null; end if;
    return approval;
end;
$$;

create function yeoback_private.start_audio_attempt(p_job public.ai_jobs,p_request_id uuid,p_approval public.narration_approvals)
returns void language plpgsql set search_path = '' as $$
begin
    insert into public.ai_job_attempts(owner_id,job_id,attempt,request_id)
        values (p_job.owner_id,p_job.id,p_job.attempt,p_request_id);
    insert into public.audio_assets(owner_id,exhibition_id,artwork_id,approval_id,text_hash,
        voice_config_version,voice_fingerprint,storage_key,job_id,attempt,mock,cleanup_after)
    values (p_job.owner_id,p_approval.exhibition_id,p_job.artwork_id,p_approval.id,p_approval.text_hash,
        p_job.voice_config_version,p_job.voice_fingerprint,
        p_job.owner_id::text || '/audio/' || p_job.id::text || '/' || p_job.attempt || '.mp3',
        p_job.id,p_job.attempt,p_job.mock,p_job.lease_until + interval '3 minutes');
end;
$$;

create function public.reserve_audio_job(p_owner uuid,p_artwork_id uuid,p_approval_id uuid,p_expected_revision integer,
    p_request_id uuid,p_voice_fingerprint text,p_mock boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    job public.ai_jobs%rowtype;
    approval public.narration_approvals%rowtype;
    existing public.ai_job_attempts%rowtype;
    inputs jsonb;
    voice_version integer;
begin
    if p_owner is null or p_request_id is null or p_approval_id is null or p_expected_revision is null
        or p_voice_fingerprint is null or p_voice_fingerprint !~ '^[0-9a-f]{64}$' or p_mock is null then
        raise exception 'Invalid audio job input' using errcode = '22023';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('yeobek:ai-jobs:' || p_owner::text,0));
    perform yeoback_private.lock_publication(p_owner);
    perform yeoback_private.subject_scope(p_owner,'artwork',p_artwork_id);
    select * into existing from public.ai_job_attempts where owner_id = p_owner and request_id = p_request_id;
    if found then
        select * into strict job from public.ai_jobs where id = existing.job_id and owner_id = p_owner;
        if existing.attempt <> 1 or job.kind <> 'audio' or job.artwork_id <> p_artwork_id
            or job.audio_approval_id <> p_approval_id or job.expected_revision <> p_expected_revision
            or job.voice_fingerprint <> decode(p_voice_fingerprint,'hex') or job.mock <> p_mock then
            raise exception 'Request ID already used with different input' using errcode = 'P1005';
        end if;
        if job.expires_at <= statement_timestamp() then raise exception 'Job not found' using errcode = 'P0002'; end if;
        return jsonb_build_object('job',yeoback_private.ai_job_json(job),'claimed',false);
    end if;
    perform yeoback_private.assert_ai_quota(p_owner);
    inputs := yeoback_private.narration_inputs(p_owner,p_artwork_id);
    if (inputs->>'artwork_revision')::integer <> p_expected_revision then
        raise exception 'Artwork revision conflict' using errcode = '40001';
    end if;
    voice_version := public.sync_audio_config(p_voice_fingerprint,p_mock);
    approval := yeoback_private.current_narration_approval(p_owner,p_artwork_id);
    if approval.id is distinct from p_approval_id then
        raise exception 'Narration approval is not current' using errcode = '40001';
    end if;
    insert into public.ai_jobs(owner_id,artwork_id,document_id,request_id,expected_revision,expected_document_revision,
        kind,strategy,source_fingerprint,source_ids,lease_until,expires_at,mock,audio_approval_id,voice_config_version,voice_fingerprint)
    values (p_owner,p_artwork_id,(inputs->>'document_id')::uuid,p_request_id,p_expected_revision,
        (inputs->>'document_revision')::integer,'audio',null,inputs->'fingerprint','[]',
        clock_timestamp() + yeoback_private.policy_integer('job_lease_seconds') * interval '1 second',
        clock_timestamp() + yeoback_private.policy_integer('job_retention_days') * interval '1 day',
        p_mock,p_approval_id,voice_version,decode(p_voice_fingerprint,'hex')) returning * into job;
    approval := yeoback_private.audio_job_approval(job);
    if approval.id is null then raise exception 'Narration approval is not current' using errcode = '40001'; end if;
    perform yeoback_private.start_audio_attempt(job,p_request_id,approval);
    return jsonb_build_object('job',yeoback_private.ai_job_json(job),'claimed',true);
end;
$$;

create function public.retry_audio_job(p_owner uuid,p_job_id uuid,p_request_id uuid,p_expected_attempt integer,
    p_voice_fingerprint text,p_mock boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    job public.ai_jobs%rowtype;
    approval public.narration_approvals%rowtype;
    replay public.ai_job_attempts%rowtype;
begin
    if p_owner is null or p_request_id is null or p_expected_attempt is null
        or p_voice_fingerprint is null or p_voice_fingerprint !~ '^[0-9a-f]{64}$' or p_mock is null then
        raise exception 'Invalid audio retry input' using errcode = '22023';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('yeobek:ai-jobs:' || p_owner::text,0));
    perform yeoback_private.lock_publication(p_owner);
    select * into job from public.ai_jobs where owner_id = p_owner and id = p_job_id and kind = 'audio' for update;
    if not found or job.expires_at <= statement_timestamp() then raise exception 'Job not found' using errcode = 'P0002'; end if;
    perform yeoback_private.subject_scope(p_owner,'artwork',job.artwork_id);
    select * into replay from public.ai_job_attempts where owner_id = p_owner and request_id = p_request_id;
    if found then
        if replay.job_id <> job.id or replay.attempt - 1 <> p_expected_attempt or replay.attempt = 1
            or job.voice_fingerprint <> decode(p_voice_fingerprint,'hex') or job.mock <> p_mock then
            raise exception 'Request ID already used with different input' using errcode = 'P1005';
        end if;
        return jsonb_build_object('job',yeoback_private.ai_job_json(job),'claimed',false);
    end if;
    if job.attempt <> p_expected_attempt or job.status not in ('failed','cancelled','running')
        or (job.status = 'running' and job.lease_until > clock_timestamp()) then
        raise exception 'Job attempt cannot be retried' using errcode = 'P1006';
    end if;
    if job.voice_fingerprint <> decode(p_voice_fingerprint,'hex') or job.mock <> p_mock then
        raise exception 'Audio job voice configuration changed' using errcode = '40001';
    end if;
    perform yeoback_private.assert_ai_quota(p_owner);
    approval := yeoback_private.audio_job_approval(job);
    if approval.id is null then raise exception 'Narration approval or voice configuration changed' using errcode = '40001'; end if;
    if job.status = 'running' then
        update public.ai_job_attempts set completed_at = statement_timestamp(),result_code = 'REQUEST_TIMEOUT'
            where job_id = job.id and attempt = job.attempt;
        update public.audio_assets set state = 'failed' where job_id = job.id and attempt = job.attempt and state = 'pending';
    end if;
    update public.ai_jobs set attempt = job.attempt + 1,status = 'running',routing = 'none',result_code = null,result = null,
        lease_until = clock_timestamp() + yeoback_private.policy_integer('job_lease_seconds') * interval '1 second',
        expires_at = clock_timestamp() + yeoback_private.policy_integer('job_retention_days') * interval '1 day',
        updated_at = statement_timestamp()
        where id = job.id returning * into job;
    perform yeoback_private.start_audio_attempt(job,p_request_id,approval);
    return jsonb_build_object('job',yeoback_private.ai_job_json(job),'claimed',true);
end;
$$;

create function public.get_audio_context(p_owner uuid,p_job_id uuid,p_attempt integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    job public.ai_jobs%rowtype;
    approval public.narration_approvals%rowtype;
    asset public.audio_assets%rowtype;
begin
    perform yeoback_private.lock_publication(p_owner);
    select * into job from public.ai_jobs where owner_id = p_owner and id = p_job_id and kind = 'audio' for share;
    if not found or job.expires_at <= statement_timestamp() then raise exception 'Job not found' using errcode = 'P0002'; end if;
    if job.attempt is distinct from p_attempt or job.status <> 'running' or job.lease_until <= clock_timestamp() then
        raise exception 'Audio job attempt is not active' using errcode = 'P1006';
    end if;
    approval := yeoback_private.audio_job_approval(job);
    if approval.id is null then raise exception 'Narration approval or voice configuration changed' using errcode = '40001'; end if;
    select * into strict asset from public.audio_assets where job_id = job.id and attempt = job.attempt and state = 'pending';
    return jsonb_build_object('assetId',asset.id,'storageKey',asset.storage_key,'text',approval.narration_text,
        'textHash',encode(approval.text_hash,'hex'),'approvalId',approval.id,'voiceConfigVersion',job.voice_config_version,
        'voiceFingerprint',encode(job.voice_fingerprint,'hex'),'mock',job.mock);
end;
$$;

create function public.complete_audio_job(p_owner uuid,p_job_id uuid,p_attempt integer,p_result jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    job public.ai_jobs%rowtype;
    approval public.narration_approvals%rowtype;
    asset public.audio_assets%rowtype;
    result_status text := p_result->>'status';
    result_code text := p_result->>'resultCode';
    result_routing text := p_result->>'routing';
    saved_result jsonb;
    completion_hash bytea := sha256(convert_to(coalesce(p_result,'null')::text,'UTF8'));
    previous_hash bytea;
    object_meta jsonb;
    bytes integer;
    digest bytea;
begin
    if p_attempt is null then raise exception 'Invalid attempt' using errcode = '22023'; end if;
    perform yeoback_private.lock_publication(p_owner);
    select * into job from public.ai_jobs where id = p_job_id and owner_id = p_owner and kind = 'audio' for update;
    if not found or job.expires_at <= statement_timestamp() then raise exception 'Job not found' using errcode = 'P0002'; end if;
    if p_attempt <> job.attempt then return yeoback_private.ai_job_json(job); end if;
    if job.status <> 'running' then
        select completion_fingerprint into previous_hash from public.ai_job_attempts where job_id = job.id and attempt = job.attempt;
        if previous_hash is distinct from completion_hash then
            raise exception 'Job attempt completed with different result' using errcode = 'P1006';
        end if;
        return yeoback_private.ai_job_json(job);
    end if;
    if job.lease_until <= clock_timestamp() then return yeoback_private.ai_job_json(job); end if;
    if jsonb_typeof(p_result) is distinct from 'object'
        or p_result - array['status','resultCode','routing','contentHash','byteSize','elapsedMs','usage','steps'] <> '{}'
        or coalesce(result_status,'') not in ('succeeded','failed','cancelled')
        or coalesce(result_code,'') !~ '^[A-Z][A-Z0-9_]{0,63}$'
        or coalesce(result_routing,'') not in ('author','operator','none')
        or (result_status = 'succeeded') <> (result_code = 'OK')
        or (result_status = 'succeeded' and result_routing <> 'none') then
        raise exception 'Invalid audio job result' using errcode = '22023';
    end if;
    select * into strict asset from public.audio_assets where job_id = job.id and attempt = job.attempt and state = 'pending' for update;
    if result_status = 'succeeded' then
        approval := yeoback_private.audio_job_approval(job);
        if approval.id is null or approval.text_hash <> asset.text_hash then
            result_status := 'failed';
            result_code := 'REVISION_CONFLICT';
            result_routing := 'author';
        else
            if coalesce(p_result->>'contentHash','') !~ '^[0-9a-f]{64}$'
                or jsonb_typeof(p_result->'byteSize') is distinct from 'number'
                or coalesce(p_result->>'byteSize','') !~ '^[0-9]{1,7}$' then
                raise exception 'Invalid audio file metadata' using errcode = '22023';
            end if;
            bytes := (p_result->>'byteSize')::integer;
            digest := decode(p_result->>'contentHash','hex');
            if bytes not between 1 and 8388608 then raise exception 'Invalid audio file metadata' using errcode = '22023'; end if;
            select metadata into object_meta from storage.objects where bucket_id = 'artist-audio' and name = asset.storage_key for share;
            if not found or object_meta->>'mimetype' is distinct from 'audio/mpeg'
                or object_meta->>'size' is distinct from bytes::text then
                raise exception 'Audio object unavailable or mismatched' using errcode = 'P1002';
            end if;
            saved_result := jsonb_build_object('assetId',asset.id,'approvalId',approval.id,'textHash',encode(asset.text_hash,'hex'),
                'voiceConfigVersion',asset.voice_config_version,'mock',asset.mock);
        end if;
    end if;
    update public.audio_assets set state = case when result_status = 'succeeded' then 'ready' else 'failed' end,
        content_hash = digest,byte_size = bytes,
        cleanup_after = case when result_status = 'succeeded' then null else cleanup_after end where id = asset.id;
    update public.ai_jobs j set status = result_status,routing = result_routing,result_code = complete_audio_job.result_code,
        result = saved_result,updated_at = statement_timestamp() where id = job.id returning j.* into job;
    update public.ai_job_attempts set completed_at = statement_timestamp(),result_code = job.result_code,
        completion_fingerprint = completion_hash,
        duration_ms = case when p_result->>'elapsedMs' ~ '^[0-9]{1,8}$' then (p_result->>'elapsedMs')::integer end,
        usage = case when jsonb_typeof(p_result->'usage') = 'array' and octet_length(p_result->>'usage') <= 16384 then p_result->'usage' end,
        steps = case when jsonb_typeof(p_result->'steps') = 'array' and octet_length(p_result->>'steps') <= 16384 then p_result->'steps' end
        where job_id = job.id and attempt = job.attempt;
    return yeoback_private.ai_job_json(job);
end;
$$;

create function public.list_audio_cleanup(p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
    if p_limit is null or p_limit not between 1 and 100 then
        raise exception 'Invalid audio cleanup limit' using errcode = '22023';
    end if;
    -- Due candidates are already ineligible for publication. Row locking
    -- serializes this transition with completion without taking a job lock.
    return (with candidates as (
        select a.id from public.audio_assets a
        where a.cleanup_after <= statement_timestamp() and a.state in ('pending','failed','revoked')
            and not exists (select 1 from public.publications p where p.audio_key = a.storage_key)
        order by a.cleanup_after,a.id limit p_limit for update of a skip locked
    ), claimed as (
        update public.audio_assets a set state = 'revoked' from candidates c where c.id = a.id
        returning a.id,a.owner_id,a.storage_key,a.cleanup_after
    )
    select coalesce(jsonb_agg(jsonb_build_object('id',id,'ownerId',owner_id,'storageKey',storage_key)
        order by cleanup_after,id),'[]') from claimed);
end;
$$;

create function public.complete_audio_cleanup(p_owner uuid,p_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare asset public.audio_assets%rowtype;
begin
    select * into asset from public.audio_assets where owner_id = p_owner and id = p_id for update;
    if not found then raise exception 'Audio asset not found' using errcode = 'P0002'; end if;
    if asset.state <> 'revoked' or asset.cleanup_after > statement_timestamp() then return false; end if;
    if asset.cleanup_after is null then return true; end if;
    if exists (select 1 from public.publications where audio_key = asset.storage_key)
        or exists (select 1 from storage.objects where bucket_id = 'artist-audio' and name = asset.storage_key)
    then return false; end if;
    update public.audio_assets set cleanup_after = null where id = p_id;
    return true;
end;
$$;

-- An audio job does not have a narration candidate and cannot authorize a
-- narration save, even when a caller provides a null text.
alter function public.save_narration_draft(uuid,integer,text,uuid) set schema yeoback_private;
revoke all on function yeoback_private.save_narration_draft(uuid,integer,text,uuid)
    from public,anon,authenticated,service_role;
create function public.save_narration_draft(p_artwork_id uuid,p_expected_revision integer,p_text text,
    p_source_job_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare owner uuid := yeoback_private.require_owner();
begin
    if p_source_job_id is not null and not exists (
        select 1 from public.ai_jobs where owner_id = owner and id = p_source_job_id and kind = 'narration'
    ) then raise exception 'Job not found' using errcode = 'P0002'; end if;
    return yeoback_private.save_narration_draft(p_artwork_id,p_expected_revision,p_text,p_source_job_id);
end;
$$;
revoke all on function public.save_narration_draft(uuid,integer,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.save_narration_draft(uuid,integer,text,uuid) to authenticated;

-- Retain the existing implementations behind narration-only entry points.
alter function public.reserve_ai_job(uuid,uuid,uuid,integer,integer,text) set schema yeoback_private;
alter function public.retry_ai_job(uuid,uuid,uuid,integer) set schema yeoback_private;
alter function public.complete_ai_job(uuid,uuid,integer,jsonb) set schema yeoback_private;
revoke all on function yeoback_private.reserve_ai_job(uuid,uuid,uuid,integer,integer,text),
    yeoback_private.retry_ai_job(uuid,uuid,uuid,integer),yeoback_private.complete_ai_job(uuid,uuid,integer,jsonb)
    from public,anon,authenticated,service_role;

create function public.reserve_ai_job(p_owner uuid,p_request_id uuid,p_artwork_id uuid,
    p_expected_revision integer,p_expected_document_revision integer,p_strategy text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
    perform pg_advisory_xact_lock(hashtextextended('yeobek:ai-jobs:' || p_owner::text,0));
    if exists (select 1 from public.ai_job_attempts a join public.ai_jobs j on j.id = a.job_id
        where a.owner_id = p_owner and a.request_id = p_request_id and j.kind <> 'narration') then
        raise exception 'Request ID already used with different input' using errcode = 'P1005';
    end if;
    return yeoback_private.reserve_ai_job(p_owner,p_request_id,p_artwork_id,p_expected_revision,p_expected_document_revision,p_strategy);
end;
$$;
create function public.retry_ai_job(p_owner uuid,p_job_id uuid,p_request_id uuid,p_expected_attempt integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
    if not exists (select 1 from public.ai_jobs where owner_id = p_owner and id = p_job_id and kind = 'narration') then
        raise exception 'Job not found' using errcode = 'P0002';
    end if;
    return yeoback_private.retry_ai_job(p_owner,p_job_id,p_request_id,p_expected_attempt);
end;
$$;
create function public.complete_ai_job(p_owner uuid,p_job_id uuid,p_attempt integer,p_result jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
    if not exists (select 1 from public.ai_jobs where owner_id = p_owner and id = p_job_id and kind = 'narration') then
        raise exception 'Job not found' using errcode = 'P0002';
    end if;
    return yeoback_private.complete_ai_job(p_owner,p_job_id,p_attempt,p_result);
end;
$$;

revoke all on function yeoback_private.audio_job_approval(public.ai_jobs),
    yeoback_private.start_audio_attempt(public.ai_jobs,uuid,public.narration_approvals),
    public.list_audio_cleanup(integer),public.complete_audio_cleanup(uuid,uuid),
    public.sync_audio_config(text,boolean),public.reserve_audio_job(uuid,uuid,uuid,integer,uuid,text,boolean),
    public.retry_audio_job(uuid,uuid,uuid,integer,text,boolean),public.get_audio_context(uuid,uuid,integer),
    public.complete_audio_job(uuid,uuid,integer,jsonb),public.reserve_ai_job(uuid,uuid,uuid,integer,integer,text),
    public.retry_ai_job(uuid,uuid,uuid,integer),public.complete_ai_job(uuid,uuid,integer,jsonb)
    from public,anon,authenticated,service_role;
grant execute on function public.list_audio_cleanup(integer),public.complete_audio_cleanup(uuid,uuid),public.sync_audio_config(text,boolean),
    public.reserve_audio_job(uuid,uuid,uuid,integer,uuid,text,boolean),public.retry_audio_job(uuid,uuid,uuid,integer,text,boolean),
    public.get_audio_context(uuid,uuid,integer),public.complete_audio_job(uuid,uuid,integer,jsonb),
    public.reserve_ai_job(uuid,uuid,uuid,integer,integer,text),public.retry_ai_job(uuid,uuid,uuid,integer),
    public.complete_ai_job(uuid,uuid,integer,jsonb) to service_role;

commit;
