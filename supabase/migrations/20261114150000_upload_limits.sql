begin;

-- Keep the old upload path for images and existing small in-flight PDFs.
-- New PDF capabilities use a separate, PDF-only staging bucket.
update storage.buckets set file_size_limit = 3145728 where id = 'artist-material-staging';
update storage.buckets set file_size_limit = 6291456 where id = 'artist-materials';
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('artist-material-pdf-staging','artist-material-pdf-staging',false,6291456,array['application/pdf']);

alter policy artist_materials_no_direct_access on storage.objects
    using (bucket_id not in ('artist-material-staging','artist-material-pdf-staging','artist-materials'))
    with check (bucket_id not in ('artist-material-staging','artist-material-pdf-staging','artist-materials'));

create or replace function public.request_upload(p_owner uuid,p_id uuid,p_subject_type text,p_subject_id uuid,
    p_kind text,p_filename text,p_content_type text,p_byte_size integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    m public.materials%rowtype;
    ext text := yeoback_private.material_extension(p_content_type);
    fingerprint bytea;
    reserved_now timestamptz;
    utc_day timestamptz;
begin
    if p_owner is null or p_id is null or p_subject_type is null or p_subject_type not in ('artist','exhibition','artwork')
        or p_kind not in ('image','pdf') or p_kind is null or ext is null
        or (p_kind = 'pdf') <> (ext = 'pdf') or p_filename is null or char_length(p_filename) not between 1 and 255
        or p_filename ~ '[/\\[:cntrl:]]' or p_byte_size is null or p_byte_size < 1
        or (substring(lower(p_filename) from '\.([a-z]+)$') is distinct from ext
            and not (ext = 'jpg' and lower(p_filename) like '%.jpeg')) then
        raise exception 'Invalid upload metadata' using errcode = '22023';
    end if;
    -- Serialize a client-supplied UUID before taking the owner lock. Other
    -- material operations never acquire this UUID lock after the owner lock.
    perform pg_advisory_xact_lock(hashtextextended('yeobek:upload-id:' || p_id::text,0));
    perform yeoback_private.lock_publication(p_owner);
    perform yeoback_private.subject_scope(p_owner,p_subject_type,p_subject_id);
    fingerprint := sha256(convert_to(jsonb_build_array(p_subject_type,p_subject_id,p_kind,p_filename,p_content_type,p_byte_size)::text,'UTF8'));
    select * into m from public.materials where id = p_id for update;
    if found then
        if m.owner_id <> p_owner or m.deleted_at is not null then raise exception 'Material not found' using errcode = 'P0002'; end if;
        if m.upload_fingerprint is distinct from fingerprint then
            raise exception 'Request ID already used with different input' using errcode = 'P1005';
        end if;
        if m.state = 'pending' and m.upload_expires_at <= clock_timestamp() then
            raise exception 'Upload expired' using errcode = 'P1020';
        end if;
        return yeoback_private.upload_json(m,false);
    end if;
    if p_byte_size > least(case p_kind when 'image' then 3145728 else 6291456 end,
        yeoback_private.policy_integer(case p_kind when 'image' then 'image_max_bytes' else 'pdf_max_bytes' end)) then
        raise exception 'Upload exceeds material size limit' using errcode = '22023';
    end if;
    reserved_now := clock_timestamp();
    utc_day := date_trunc('day',reserved_now,'UTC');
    if (select count(*) from public.materials where owner_id = p_owner and upload_fingerprint is not null
        and created_at >= utc_day and created_at < utc_day + interval '24 hours')
        >= yeoback_private.policy_integer('author_uploads_per_day') then
        raise exception 'Upload limit reached' using errcode = 'P1023';
    end if;
    insert into public.materials(id,owner_id,artist_id,exhibition_id,artwork_id,kind,state,storage_key,
        byte_size,filename,content_type,upload_fingerprint,upload_expires_at,created_at,updated_at)
    values (p_id,p_owner,case when p_subject_type = 'artist' then p_subject_id end,
        case when p_subject_type = 'exhibition' then p_subject_id end,case when p_subject_type = 'artwork' then p_subject_id end,
        p_kind,'pending',p_owner::text || '/materials/' || p_id::text || '/v1.' || ext,p_byte_size,
        p_filename,p_content_type,fingerprint,reserved_now + yeoback_private.policy_integer('upload_ttl_seconds') * interval '1 second',
        reserved_now,reserved_now) returning * into m;
    return yeoback_private.upload_json(m,true);
end;
$$;

create or replace function public.complete_upload(p_owner uuid,p_id uuid,p_expected_version integer,
    p_content_hash text,p_byte_size integer,p_content_type text,p_pages integer,p_width integer,p_height integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    m public.materials%rowtype;
    hash bytea;
    metadata jsonb;
begin
    if p_content_hash is null or p_content_hash !~ '^[0-9a-f]{64}$' then
        raise exception 'Invalid upload content hash' using errcode = '22023';
    end if;
    hash := decode(p_content_hash,'hex');
    perform yeoback_private.lock_publication(p_owner);
    select * into m from public.materials where id = p_id and owner_id = p_owner
        and deleted_at is null and upload_fingerprint is not null and state in ('pending','ready') for update;
    if not found then raise exception 'Material not found' using errcode = 'P0002'; end if;
    perform yeoback_private.subject_scope(p_owner,case when m.artist_id is not null then 'artist'
        when m.exhibition_id is not null then 'exhibition' else 'artwork' end,
        coalesce(m.artist_id,m.exhibition_id,m.artwork_id));
    if m.state = 'ready' then
        if p_expected_version is null or m.version <> p_expected_version or m.content_hash is distinct from hash
            or m.byte_size is distinct from p_byte_size or m.content_type is distinct from p_content_type
            or m.pages is distinct from p_pages or m.width is distinct from p_width or m.height is distinct from p_height then
            raise exception 'Upload completion conflicts with saved material' using errcode = '40001';
        end if;
        return yeoback_private.material_json(m);
    end if;
    if m.upload_expires_at <= clock_timestamp() then raise exception 'Upload expired' using errcode = 'P1020'; end if;
    if m.version is distinct from p_expected_version then raise exception 'Material revision conflict' using errcode = '40001'; end if;
    if p_byte_size > least(case m.kind when 'image' then 3145728 else 6291456 end,
        yeoback_private.policy_integer(case m.kind when 'image' then 'image_max_bytes' else 'pdf_max_bytes' end)) then
        raise exception 'Upload exceeds material size limit' using errcode = '22023';
    end if;
    if m.byte_size is distinct from p_byte_size or m.content_type is distinct from p_content_type
        or (m.kind = 'pdf' and (p_pages is null or p_pages < 1 or p_width is not null or p_height is not null))
        or (m.kind = 'image' and (p_pages is not null or p_width is null or p_height is null or p_width < 1 or p_height < 1)) then
        raise exception 'Uploaded bytes do not match declared material' using errcode = '22023';
    end if;
    select o.metadata into metadata from storage.objects o
        where o.bucket_id = 'artist-materials' and o.name = m.storage_key for share;
    if not found or (metadata ? 'size' and metadata->>'size' is distinct from p_byte_size::text)
        or (metadata ? 'mimetype' and metadata->>'mimetype' is distinct from p_content_type) then
        raise exception 'Final upload is not available' using errcode = 'P1002';
    end if;
    update public.materials set state = 'ready',content_hash = hash,pages = p_pages,width = p_width,height = p_height,
        cleanup_pending = true,cleanup_after = yeoback_private.material_cleanup_deadline(m.upload_expires_at),
        updated_at = statement_timestamp() where id = m.id returning * into m;
    return yeoback_private.material_json(m);
end;
$$;

create or replace function public.complete_material_cleanup(p_owner uuid,p_id uuid,p_expected_version integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.materials%rowtype;
begin
    perform yeoback_private.lock_publication(p_owner);
    select * into m from public.materials where id = p_id and owner_id = p_owner for update;
    if not found then raise exception 'Material not found' using errcode = 'P0002'; end if;
    if m.version is distinct from p_expected_version then raise exception 'Material revision conflict' using errcode = '40001'; end if;
    if not m.cleanup_pending or m.cleanup_after > statement_timestamp() then return yeoback_private.material_json(m); end if;
    if exists (select 1 from storage.objects o where
        (m.deleted_at is not null and o.bucket_id = 'artist-materials' and o.name = m.storage_key) or
        (o.bucket_id in ('artist-material-staging','artist-material-pdf-staging') and o.name = (yeoback_private.upload_json(m,false)->>'stagingKey'))
    ) then raise exception 'Material cleanup is incomplete' using errcode = '40001'; end if;
    update public.materials set cleanup_pending = false,cleanup_after = null,updated_at = statement_timestamp()
        where id = m.id returning * into m;
    return yeoback_private.material_json(m);
end;
$$;

commit;
