begin;

-- Optional media is copied only by explicit publication, never a draft edit.
-- Old exhibitions intentionally have no poster until the owner republishes.
alter table public.exhibitions add column public_poster_material_id uuid;
create or replace function yeoback_private.snapshot_publication_times()
returns trigger language plpgsql set search_path = '' as $$
begin
    new.public_start_time := new.start_time;
    new.public_end_time := new.end_time;
    new.public_poster_material_id := new.poster_material_id;
    return new;
end;
$$;

create or replace function public.get_public_media(p_publication_id uuid,p_kind text,p_mock boolean)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
    exhibition uuid;
    pub public.publications%rowtype;
    material public.materials%rowtype;
    audio public.audio_assets%rowtype;
    media jsonb;
begin
    if p_kind is null or p_kind not in ('image','audio','poster') or p_mock is null then
        raise exception 'Invalid public media kind' using errcode = '22023';
    end if;
    select exhibition_id into exhibition from public.publications where id = p_publication_id;
    if not found then return null; end if;
    select * into pub from yeoback_private.public_artworks(exhibition) p where p.id = p_publication_id;
    if not found then return null; end if;
    if p_kind = 'poster' then
        select m.* into material from public.exhibitions e
        join public.materials m on m.id = e.public_poster_material_id
        where e.id = pub.exhibition_id and m.owner_id = pub.owner_id and m.exhibition_id = e.id
            and m.artwork_id is null and m.kind = 'image' and m.state = 'ready' and m.deleted_at is null
            and m.content_type in ('image/jpeg','image/png','image/webp') and m.byte_size between 1 and 52428800
            and octet_length(m.content_hash) = 32;
        if not found then return null; end if;
        media := jsonb_build_object('bucket','artist-materials','storageKey',material.storage_key,
            'contentType',material.content_type,'byteSize',material.byte_size,
            'contentHash',encode(material.content_hash,'hex'),'mock',false);
    elsif p_kind = 'image' then
        select * into material from public.materials m
        where m.owner_id = pub.owner_id and m.artwork_id = pub.artwork_id and m.storage_key = pub.image_key
            and m.kind = 'image' and m.state = 'ready' and m.deleted_at is null
            and m.content_type in ('image/jpeg','image/png','image/webp') and m.byte_size between 1 and 52428800
            and octet_length(m.content_hash) = 32;
        if not found then return null; end if;
        media := jsonb_build_object('bucket','artist-materials','storageKey',material.storage_key,
            'contentType',material.content_type,'byteSize',material.byte_size,
            'contentHash',encode(material.content_hash,'hex'),'mock',false);
    else
        select * into audio from public.audio_assets a
        where a.owner_id = pub.owner_id and a.exhibition_id = pub.exhibition_id and a.artwork_id = pub.artwork_id
            and a.storage_key = pub.audio_key and a.state = 'ready'
            and a.text_hash = pub.narration_hash and a.text_hash = pub.audio_text_hash
            and (not a.mock or p_mock) and a.byte_size between 1 and 8388608 and octet_length(a.content_hash) = 32;
        if not found then return null; end if;
        media := jsonb_build_object('bucket','artist-audio','storageKey',audio.storage_key,
            'contentType','audio/mpeg','byteSize',audio.byte_size,'contentHash',encode(audio.content_hash,'hex'),'mock',audio.mock);
    end if;
    return media || jsonb_build_object('publicationId',pub.id,'exhibitionId',pub.exhibition_id,
        'artworkId',pub.artwork_id,'version',pub.version,'kind',p_kind);
end;
$$;

create or replace function public.get_public_exhibition(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
    select jsonb_build_object('id', e.id, 'title', e.public_title, 'artist_display_name', e.public_artist_display_name,
        'artist_bio', e.public_artist_bio, 'introduction', e.public_introduction, 'theme', e.public_theme,
        'poster', (select jsonb_build_object('id',p.id,'kind','poster')
            from yeoback_private.public_artworks(e.id) p
            where public.get_public_media(p.id,'poster',false) is not null
            order by p.number,p.artwork_id limit 1),
        'start_time', left(e.public_start_time::text,5), 'end_time', left(e.public_end_time::text,5),
        'start_date', e.public_start_date, 'end_date', e.public_end_date, 'place', e.public_place, 'artworks', snapshots.artworks)
    from public.exhibitions e
    cross join lateral (
        select jsonb_agg(yeoback_private.public_artwork_json(p) order by p.number, p.artwork_id) as artworks
        from yeoback_private.public_artworks(e.id) p
    ) snapshots
    where e.id = p_id and snapshots.artworks is not null;
$$;

create or replace function public.delete_material(p_id uuid,p_expected_version integer)
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
    if m.version is distinct from p_expected_version then
        raise exception 'Material revision conflict' using errcode = '40001';
    end if;
    -- The owner lock serializes these references with avatar and poster changes.
    if exists (
        select 1 from public.artist_profiles a where a.owner_id = owner and a.id = m.artist_id and a.avatar_material_id = m.id
    ) or exists (
        select 1 from public.exhibitions e where e.owner_id = owner and e.id = m.exhibition_id and (e.poster_material_id = m.id or (
            e.public_poster_material_id = m.id and e.deleted_at is null and exists (
                select 1 from public.artworks a join public.publications p on p.id = a.active_publication_id
                where a.exhibition_id = e.id and a.owner_id = owner and a.deleted_at is null and p.revoked_at is null
            )
        ))
    ) or exists (
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

commit;
