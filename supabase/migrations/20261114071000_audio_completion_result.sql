begin;

create or replace function public.complete_audio_job(p_owner uuid,p_job_id uuid,p_attempt integer,p_result jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
<<completion>>
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
    update public.ai_jobs j set status = result_status,routing = result_routing,result_code = completion.result_code,
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

commit;
