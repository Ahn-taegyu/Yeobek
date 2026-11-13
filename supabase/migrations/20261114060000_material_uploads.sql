begin;

insert into public.app_policies(key,value) values
    ('image_max_bytes',3145728),('pdf_max_bytes',6291456),
    ('upload_ttl_seconds',3600),('author_uploads_per_day',100);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
    ('artist-material-staging','artist-material-staging',false,52428800,
     array['image/jpeg','image/png','image/webp','application/pdf']),
    ('artist-materials','artist-materials',false,52428800,
     array['image/jpeg','image/png','image/webp','application/pdf']);

create policy artist_materials_no_direct_access on storage.objects as restrictive
    for all to anon,authenticated
    using (bucket_id not in ('artist-material-staging','artist-materials'))
    with check (bucket_id not in ('artist-material-staging','artist-materials'));

-- The scoped RPC exposes only DTO fields, not raw object keys.
revoke all on public.materials from anon,authenticated;

alter table public.materials
    add column filename text,
    add column content_type text,
    add column content_hash bytea,
    add column pages integer check (pages > 0),
    add column width integer check (width > 0),
    add column height integer check (height > 0),
    add column upload_expires_at timestamptz,
    add column upload_fingerprint bytea,
    add column deleted_at timestamptz,
    add column cleanup_after timestamptz,
    add column cleanup_pending boolean not null default false;
do $$
declare constraint_name text;
begin
    select conname into strict constraint_name from pg_catalog.pg_constraint
    where conrelid = 'public.materials'::regclass and contype = 'c'
        and pg_catalog.pg_get_constraintdef(oid) like '%3145728%';
    execute format('alter table public.materials drop constraint %I',constraint_name);
end;
$$;
alter table public.materials add constraint material_storage_shape check (
    (kind = 'text' and storage_key is null and byte_size is null and text_body is not null)
    or (kind in ('image','pdf') and storage_key is not null and text_body is null
        and byte_size is not null and byte_size between 1 and 52428800)
);
alter table public.artworks drop constraint artworks_exhibition_id_number_key;
create unique index artworks_active_number_key on public.artworks(exhibition_id,number) where deleted_at is null;

create index materials_due_cleanup on public.materials(cleanup_after,id) where cleanup_pending;
create index materials_expired_upload on public.materials(upload_expires_at,id)
    where state = 'pending' and upload_fingerprint is not null and deleted_at is null;

create index materials_owner_upload_date on public.materials(owner_id,created_at) where upload_fingerprint is not null;

-- Stage and final names never use the supplied filename.
create function yeoback_private.material_extension(p_type text)
returns text language sql immutable set search_path = '' as $$
    select case p_type when 'image/jpeg' then 'jpg' when 'image/png' then 'png'
        when 'image/webp' then 'webp' when 'application/pdf' then 'pdf' end;
$$;

create function yeoback_private.material_json(m public.materials)
returns jsonb language sql stable strict set search_path = '' as $$
    select jsonb_build_object(
        'id',m.id,'subjectType',case when m.artwork_id is not null then 'artwork'
            when m.exhibition_id is not null then 'exhibition' else 'artist' end,
        'subjectId',coalesce(m.artwork_id,m.exhibition_id,m.artist_id),'kind',m.kind,'state',m.state,
        'filename',m.filename,'contentType',m.content_type,'byteSize',m.byte_size,
        'version',m.version,'pages',m.pages,'width',m.width,'height',m.height,
        'createdAt',m.created_at,'updatedAt',m.updated_at,'deletedAt',m.deleted_at,'cleanupPending',m.cleanup_pending);
$$;

create function yeoback_private.upload_json(m public.materials,p_created boolean)
returns jsonb language sql stable strict set search_path = '' as $$
    select jsonb_build_object('material',yeoback_private.material_json(m),'created',p_created,
        'stagingKey',m.owner_id::text || '/uploads/' || m.id::text || '.' || yeoback_private.material_extension(m.content_type),
        'finalKey',m.storage_key,'uploadExpiresAt',m.upload_expires_at,'cleanupAfter',m.cleanup_after);
$$;

create function yeoback_private.material_cleanup_deadline(p_upload_expires_at timestamptz)
returns timestamptz language sql volatile set search_path = '' as $$
    select greatest(clock_timestamp() + interval '3 minutes',p_upload_expires_at + interval '2 hours');
$$;

create function public.request_upload(p_owner uuid,p_id uuid,p_subject_type text,p_subject_id uuid,
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
        or p_filename ~ '[/\\[:cntrl:]]' or p_byte_size is null or p_byte_size not between 1 and 52428800
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
    if p_byte_size > yeoback_private.policy_integer(case p_kind when 'image' then 'image_max_bytes' else 'pdf_max_bytes' end) then
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

create function public.get_upload(p_owner uuid,p_id uuid,p_allow_cleanup boolean default false)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare m public.materials%rowtype;
begin
    select * into m from public.materials where id = p_id and owner_id = p_owner
        and (p_allow_cleanup is true or (deleted_at is null and upload_fingerprint is not null and state in ('pending','ready')));
    if not found then raise exception 'Material not found' using errcode = 'P0002'; end if;
    if p_allow_cleanup is true then return yeoback_private.upload_json(m,false); end if;
    perform yeoback_private.subject_scope(p_owner,case when m.artist_id is not null then 'artist'
        when m.exhibition_id is not null then 'exhibition' else 'artwork' end,
        coalesce(m.artist_id,m.exhibition_id,m.artwork_id));
    if m.state = 'pending' and m.upload_expires_at <= statement_timestamp() then
        raise exception 'Upload expired' using errcode = 'P1020';
    end if;
    return yeoback_private.upload_json(m,false);
end;
$$;

create function public.complete_upload(p_owner uuid,p_id uuid,p_expected_version integer,
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

create function public.list_materials(p_subject_type text,p_subject_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare owner uuid := yeoback_private.require_owner();
begin
    perform yeoback_private.subject_scope(owner,p_subject_type,p_subject_id);
    return coalesce((select jsonb_agg(yeoback_private.material_json(m) order by m.created_at desc,m.id)
        from public.materials m where m.owner_id = owner and m.deleted_at is null
          and case p_subject_type when 'artist' then m.artist_id = p_subject_id
            when 'exhibition' then m.exhibition_id = p_subject_id else m.artwork_id = p_subject_id end),'[]');
end;
$$;

create function public.delete_material(p_id uuid,p_expected_version integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    owner uuid := yeoback_private.require_owner();
    m public.materials%rowtype;
begin
    perform yeoback_private.lock_publication(owner);
    -- update_artwork takes its artwork row before validating source material.
    perform 1 from public.artworks a where a.owner_id = owner and a.image_material_id = p_id
        and a.deleted_at is null for update;
    select * into m from public.materials where id = p_id and owner_id = owner for update;
    if not found then raise exception 'Material not found' using errcode = 'P0002'; end if;
    if m.deleted_at is not null then
        if m.version - 1 is distinct from p_expected_version and m.version is distinct from p_expected_version then
            raise exception 'Material revision conflict' using errcode = '40001';
        end if;
        return yeoback_private.material_json(m);
    end if;
    if m.version is distinct from p_expected_version then raise exception 'Material revision conflict' using errcode = '40001'; end if;
    if exists (
        select 1 from public.artworks a join public.publications p on p.id = a.active_publication_id
            where a.owner_id = owner and a.deleted_at is null and p.image_key = m.storage_key and p.revoked_at is null
    ) or exists (
        select 1 from public.evidence_items e where e.owner_id = owner and e.material_id = m.id and e.state = 'approved'
    ) or exists (
        select 1 from public.knowledge_documents d
        where d.owner_id = owner and exists (
            select 1 from jsonb_array_elements(d.source_refs) r
            where r->>'kind' = 'material' and lower(r->>'material_id') = m.id::text
        ) and (
            d.artist_id is not null or exists (
                select 1 from public.exhibitions e where e.id = d.exhibition_id and e.deleted_at is null
            ) or exists (
                select 1 from public.artworks a join public.exhibitions e on e.id = a.exhibition_id
                where a.id = d.artwork_id and a.deleted_at is null and e.deleted_at is null
            )
        )
    ) then raise exception 'Material is in use' using errcode = 'P1021'; end if;
    update public.artworks set image_material_id = null,revision = revision + 1,updated_at = statement_timestamp()
        where owner_id = owner and image_material_id = m.id and deleted_at is null;
    update public.materials set state = 'revoked',deleted_at = statement_timestamp(),
        cleanup_pending = storage_key is not null,
        cleanup_after = case when storage_key is not null then yeoback_private.material_cleanup_deadline(m.upload_expires_at) end,
        version = version + 1,updated_at = statement_timestamp()
        where id = m.id returning * into m;
    return yeoback_private.material_json(m);
end;
$$;

create function public.list_material_cleanup(p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
    if p_limit is null or p_limit not between 1 and 100 then
        raise exception 'Invalid material cleanup limit' using errcode = '22023';
    end if;
    -- A row lock excludes completion/deletion. This batch takes no owner
    -- lock and commits before Storage calls, so it cannot invert their locks.
    with expired as (
        select id from public.materials where state = 'pending' and upload_fingerprint is not null
          and deleted_at is null and upload_expires_at <= statement_timestamp()
        order by upload_expires_at,id limit p_limit for update skip locked
    )
    update public.materials m set state = 'revoked',deleted_at = statement_timestamp(),
        cleanup_pending = true,cleanup_after = yeoback_private.material_cleanup_deadline(m.upload_expires_at),
        version = m.version + 1,updated_at = statement_timestamp()
    from expired e where m.id = e.id;
    return coalesce((select jsonb_agg(jsonb_build_object(
        'id',due.id,'ownerId',due.owner_id,'version',due.version,
        'stagingKey',yeoback_private.upload_json(due,false)->>'stagingKey',
        'finalKey',case when due.deleted_at is not null then due.storage_key end
    ) order by due.cleanup_after,due.id) from (
        select m.* from public.materials m where m.cleanup_pending and m.cleanup_after <= statement_timestamp()
        order by m.cleanup_after,m.id limit p_limit
    ) due),'[]');
end;
$$;

create function public.complete_material_cleanup(p_owner uuid,p_id uuid,p_expected_version integer)
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
        (o.bucket_id = 'artist-material-staging' and o.name = (yeoback_private.upload_json(m,false)->>'stagingKey'))
    ) then raise exception 'Material cleanup is incomplete' using errcode = '40001'; end if;
    update public.materials set cleanup_pending = false,cleanup_after = null,updated_at = statement_timestamp()
        where id = m.id returning * into m;
    return yeoback_private.material_json(m);
end;
$$;

create function public.set_artwork_image(p_artwork_id uuid,p_expected_revision integer,p_material_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    owner uuid := yeoback_private.require_owner();
    a public.artworks%rowtype;
begin
    perform yeoback_private.lock_publication(owner);
    perform yeoback_private.subject_scope(owner,'artwork',p_artwork_id);
    select * into a from public.artworks where id = p_artwork_id and owner_id = owner and deleted_at is null for update;
    if not found then raise exception 'Subject not found' using errcode = 'P0002'; end if;
    if a.revision is distinct from p_expected_revision then raise exception 'Artwork revision conflict' using errcode = '40001'; end if;
    if p_material_id is not null then
        perform 1 from public.materials where id = p_material_id and owner_id = owner and artwork_id = p_artwork_id
            and kind = 'image' and state = 'ready' and deleted_at is null for share;
        if not found then raise exception 'Material not found' using errcode = 'P0002'; end if;
    end if;
    if a.image_material_id is distinct from p_material_id then
        update public.artworks set image_material_id = p_material_id,revision = revision + 1,updated_at = statement_timestamp()
            where id = a.id returning * into a;
    end if;
    return yeoback_private.artwork_json(a);
end;
$$;

create function public.delete_artwork(p_id uuid,p_expected_revision integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    owner uuid := yeoback_private.require_owner();
    a public.artworks%rowtype;
begin
    perform yeoback_private.lock_publication(owner);
    perform yeoback_private.subject_scope(owner,'artwork',p_id);
    select * into a from public.artworks where id = p_id and owner_id = owner and deleted_at is null for update;
    if not found then raise exception 'Subject not found' using errcode = 'P0002'; end if;
    if a.revision is distinct from p_expected_revision then raise exception 'Artwork revision conflict' using errcode = '40001'; end if;
    if a.state = 'published' or exists (select 1 from public.publications p where p.id = a.active_publication_id and p.revoked_at is null) then
        raise exception 'Artwork still has an active publication' using errcode = 'P1022';
    end if;
    update public.artworks set deleted_at = statement_timestamp(),state = 'draft',active_publication_id = null,
        image_material_id = null,revision = revision + 1,updated_at = statement_timestamp()
        where id = a.id returning * into a;
    return yeoback_private.artwork_json(a) || jsonb_build_object('deleted_at',a.deleted_at);
end;
$$;


create or replace function yeoback_private.validate_document(
    p_owner uuid, p_type text, p_subject uuid, p_sections jsonb, p_source_refs jsonb,
    p_saved_sections jsonb, p_saved_source_refs jsonb
) returns jsonb
language plpgsql set search_path = '' as $$
declare
    scope uuid[] := yeoback_private.subject_scope(p_owner, p_type, p_subject);
    allowed_sections text[] := case p_type
        when 'artist' then array['bio', 'practice']
        when 'exhibition' then array['introduction', 'theme']
        when 'artwork' then array['description', 'notes']
    end;
    uuid_pattern constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
    -- Match the HTTP validator's String.trim() character set.
    body_whitespace constant text := U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
    sections jsonb := '[]';
    remaining_refs jsonb := p_saved_source_refs;
    section_ids text[] := array[]::text[];
    item jsonb;
    section_id text;
    trimmed_body text;
    saved_body text;
    saved_ref_index integer;
    source_document public.knowledge_documents;
    material public.materials;
begin
    if jsonb_typeof(p_sections) is distinct from 'array' or jsonb_typeof(p_source_refs) is distinct from 'array' then
        raise exception 'Sections and source references must be arrays' using errcode = '22023';
    end if;
    if jsonb_array_length(p_sections) > cardinality(allowed_sections) or jsonb_array_length(p_source_refs) > 24 then
        raise exception 'Too many sections or source references' using errcode = '22023';
    end if;

    for item in select value from jsonb_array_elements(p_sections) loop
        if jsonb_typeof(item) <> 'object' then
            raise exception 'Each section must be an object' using errcode = '22023';
        end if;
        section_id := item->>'id';
        trimmed_body := btrim(item->>'body', body_whitespace);
        if jsonb_typeof(item->'id') is distinct from 'string' or jsonb_typeof(item->'body') is distinct from 'string'
            or item - array['id', 'body'] <> '{}'::jsonb or not (section_id = any(allowed_sections))
            or section_id = any(section_ids) or char_length(trimmed_body) > 5000 then
            raise exception 'Invalid or duplicate knowledge section' using errcode = '22023';
        end if;
        section_ids := array_append(section_ids, section_id);

        select s.value->>'body' into saved_body from jsonb_array_elements(p_saved_sections) s
        where s.value->>'id' = section_id;
        if saved_body is not null and btrim(saved_body, body_whitespace) = trimmed_body then
            trimmed_body := saved_body;
        end if;
        sections := sections || jsonb_build_array(jsonb_build_object('id', section_id, 'body', trimmed_body));
    end loop;

    for item in select value from jsonb_array_elements(p_source_refs) loop
        if jsonb_typeof(item) <> 'object' or jsonb_typeof(item->'section_id') is distinct from 'string'
            or not (item->>'section_id' = any(section_ids)) then
            raise exception 'Source reference must name a saved section' using errcode = '22023';
        end if;

        -- Consume one exact match in this draft. Additional copies still need validation.
        select (r.ordinality - 1)::integer into saved_ref_index
        from jsonb_array_elements(remaining_refs) with ordinality r
        where r.value = item limit 1;
        if found then
            remaining_refs := remaining_refs - saved_ref_index;
            continue;
        end if;

        case item->>'kind'
            when 'direct' then
                if item - array['section_id', 'kind'] <> '{}'::jsonb then
                    raise exception 'Invalid direct source reference' using errcode = '22023';
                end if;

            when 'material' then
                if coalesce(item->>'material_id', '') !~* uuid_pattern
                    or item - array['section_id', 'kind', 'material_id', 'page_start', 'page_end'] <> '{}'::jsonb then
                    raise exception 'Invalid material source reference' using errcode = '22023';
                end if;
                select m.* into material from public.materials m
                where m.id = (item->>'material_id')::uuid and m.owner_id = p_owner and m.state = 'ready'
                    and (m.artist_id = scope[1] or m.exhibition_id = scope[2] or m.artwork_id = scope[3])
                for share;
                if not found then
                    raise exception 'Material source is outside the subject scope or unavailable' using errcode = 'P1002';
                end if;
                if material.kind = 'pdf' then
                    if jsonb_typeof(item->'page_start') is distinct from 'number'
                        or jsonb_typeof(item->'page_end') is distinct from 'number'
                        or (item->>'page_start') !~ '^[1-9][0-9]{0,9}$' or (item->>'page_end') !~ '^[1-9][0-9]{0,9}$' then
                        raise exception 'PDF source requires positive integer page bounds' using errcode = '22023';
                    end if;
                    if (item->>'page_end')::bigint > 2147483647 or (item->>'page_start')::bigint > (item->>'page_end')::bigint then
                        raise exception 'Invalid PDF page range' using errcode = '22023';
                    end if;
                    if material.pages is null or (item->>'page_end')::bigint > material.pages then
                        raise exception 'PDF source pages exceed verified document' using errcode = '22023';
                    end if;
                elsif item ?| array['page_start', 'page_end'] then
                    raise exception 'Page bounds only apply to PDF sources' using errcode = '22023';
                end if;

            when 'document' then
                if coalesce(item->>'source_document_id', '') !~* uuid_pattern
                    or jsonb_typeof(item->'source_section_id') is distinct from 'string'
                    or jsonb_typeof(item->'source_revision') is distinct from 'number'
                    or item - array['section_id', 'kind', 'source_document_id', 'source_section_id', 'source_revision'] <> '{}'::jsonb then
                    raise exception 'Invalid document source reference' using errcode = '22023';
                end if;
                select d.* into source_document from public.knowledge_documents d
                where d.id = (item->>'source_document_id')::uuid and d.owner_id = p_owner
                    and d.subject_type <> p_type
                    and (d.artist_id = scope[1] or d.exhibition_id = scope[2] or d.artwork_id = scope[3])
                for share;
                if not found then
                    raise exception 'Document source is outside the subject scope or unavailable' using errcode = 'P1002';
                end if;
                if not exists (
                    select 1 from jsonb_array_elements(source_document.sections) s
                    where s.value->>'id' = item->>'source_section_id'
                ) then
                    raise exception 'Source section is unavailable' using errcode = 'P1002';
                end if;
                if item->'source_revision' <> to_jsonb(source_document.revision) then
                    raise exception 'Source document revision conflict' using errcode = 'P1001';
                end if;

            else
                raise exception 'Unknown source reference kind' using errcode = '22023';
        end case;
    end loop;
    return sections;
end;
$$;

create or replace function yeoback_private.validate_evidence_source(e public.evidence_items,p_subject_id uuid)
returns void language plpgsql set search_path = '' as $$
declare
    doc public.knowledge_documents%rowtype;
    material public.materials%rowtype;
begin
    if e.source_kind = 'direct' then return; end if;
    if e.source_kind = 'document' then
        select * into doc from public.knowledge_documents d
            where d.owner_id = e.owner_id and d.id = e.source_document_id
            and d.subject_type = e.scope and d.subject_id = p_subject_id for share;
        if not found then raise exception 'Evidence source unavailable' using errcode = 'P1002'; end if;
        if doc.revision <> e.source_revision then
            raise exception 'Evidence source revision conflict' using errcode = 'P1001';
        end if;
        if not exists (select 1 from jsonb_array_elements(doc.sections) s
            where s->>'id' = e.source_section_id and strpos(s->>'body',e.body) > 0) then
            raise exception 'Evidence excerpt is not in the selected section' using errcode = '22023';
        end if;
        return;
    end if;
    select * into material from public.materials m where m.owner_id = e.owner_id and m.id = e.material_id
        and m.state = 'ready' and m.kind = 'pdf' and p_subject_id = coalesce(m.artist_id,m.exhibition_id,m.artwork_id) for share;
    if not found then raise exception 'Evidence source unavailable' using errcode = 'P1002'; end if;
    if material.version <> e.material_version then
        raise exception 'Evidence source revision conflict' using errcode = 'P1001';
    end if;
    if material.pages is null or e.page_end > material.pages then
        raise exception 'PDF source pages exceed verified document' using errcode = '22023';
    end if;
end;
$$;

create or replace function yeoback_private.evidence_is_current(e public.evidence_items)
returns boolean language sql stable strict set search_path = '' as $$
    select e.state = 'approved'
        and not exists (select 1 from public.evidence_items newer where newer.id = e.id and newer.version > e.version)
        and case e.source_kind
            when 'direct' then true
            when 'document' then exists (select 1 from public.knowledge_documents d
                where d.id = e.source_document_id and d.owner_id = e.owner_id and d.revision = e.source_revision)
            when 'material' then exists (select 1 from public.materials m where m.id = e.material_id
                and m.owner_id = e.owner_id and m.version = e.material_version and m.state = 'ready'
                and m.kind = 'pdf' and m.pages is not null and e.page_end <= m.pages)
            else false end;
$$;

revoke all on function yeoback_private.material_extension(text),yeoback_private.material_json(public.materials),
    yeoback_private.material_cleanup_deadline(timestamptz),yeoback_private.upload_json(public.materials,boolean),public.request_upload(uuid,uuid,text,uuid,text,text,text,integer),
    public.get_upload(uuid,uuid,boolean),public.complete_upload(uuid,uuid,integer,text,integer,text,integer,integer,integer),
    public.list_material_cleanup(integer),public.complete_material_cleanup(uuid,uuid,integer),public.list_materials(text,uuid),public.delete_material(uuid,integer),
    public.set_artwork_image(uuid,integer,uuid),public.delete_artwork(uuid,integer)
    from public,anon,authenticated,service_role;
grant execute on function public.request_upload(uuid,uuid,text,uuid,text,text,text,integer),
    public.get_upload(uuid,uuid,boolean),public.complete_upload(uuid,uuid,integer,text,integer,text,integer,integer,integer),
    public.list_material_cleanup(integer),public.complete_material_cleanup(uuid,uuid,integer) to service_role;
grant execute on function public.list_materials(text,uuid),public.delete_material(uuid,integer),
    public.set_artwork_image(uuid,integer,uuid),public.delete_artwork(uuid,integer) to authenticated;
commit;
