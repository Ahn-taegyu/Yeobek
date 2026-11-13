begin;

create function yeoback_private.require_owner() returns uuid
language plpgsql stable set search_path = '' as $$
declare
    owner uuid := auth.uid();
begin
    if owner is null or auth.jwt()->>'is_anonymous' = 'true' then
        raise exception 'Artist sign-in is required' using errcode = '42501';
    end if;
    return owner;
end;
$$;

create function yeoback_private.optional_text(value text) returns text
language sql immutable strict set search_path = '' as $$
    select nullif(regexp_replace(value, '^[[:space:]]+|[[:space:]]+$', '', 'g'), '');
$$;

-- Return the live target and its ancestors. These IDs form the entire allowed source scope.
create function yeoback_private.subject_scope(p_owner uuid, p_type text, p_id uuid) returns uuid[]
language plpgsql stable set search_path = '' as $$
declare
    scope uuid[];
begin
    case p_type
        when 'artist' then
            select array[a.id, null::uuid, null::uuid] into scope
            from public.artist_profiles a where a.owner_id = p_owner and a.id = p_id;
        when 'exhibition' then
            select array[e.artist_id, e.id, null::uuid] into scope
            from public.exhibitions e where e.owner_id = p_owner and e.id = p_id and e.deleted_at is null;
        when 'artwork' then
            select array[e.artist_id, e.id, a.id] into scope
            from public.artworks a join public.exhibitions e on e.id = a.exhibition_id and e.owner_id = a.owner_id
            where a.owner_id = p_owner and a.id = p_id and a.deleted_at is null and e.deleted_at is null;
        else
            raise exception 'Unknown knowledge subject type' using errcode = '22023';
    end case;
    if scope is null then
        raise exception 'Subject not found' using errcode = 'P0002';
    end if;
    return scope;
end;
$$;

create function yeoback_private.validate_document(
    p_owner uuid, p_type text, p_subject uuid, p_sections jsonb, p_source_refs jsonb
) returns void
language plpgsql set search_path = '' as $$
declare
    scope uuid[] := yeoback_private.subject_scope(p_owner, p_type, p_subject);
    allowed_sections text[] := case p_type
        when 'artist' then array['bio', 'practice']
        when 'exhibition' then array['introduction', 'theme']
        when 'artwork' then array['description', 'notes']
    end;
    uuid_pattern constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
    section_ids text[] := array[]::text[];
    item jsonb;
    section_id text;
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
        if jsonb_typeof(item->'id') is distinct from 'string' or jsonb_typeof(item->'body') is distinct from 'string'
            or item - array['id', 'body'] <> '{}'::jsonb or not (section_id = any(allowed_sections))
            or section_id = any(section_ids) or char_length(item->>'body') > 5000 then
            raise exception 'Invalid or duplicate knowledge section' using errcode = '22023';
        end if;
        section_ids := array_append(section_ids, section_id);
    end loop;

    for item in select value from jsonb_array_elements(p_source_refs) loop
        if jsonb_typeof(item) <> 'object' or jsonb_typeof(item->'section_id') is distinct from 'string'
            or not (item->>'section_id' = any(section_ids)) then
            raise exception 'Source reference must name a saved section' using errcode = '22023';
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
                    raise exception 'Material source is outside the subject scope or unavailable' using errcode = '22023';
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
                    raise exception 'Document source is outside the subject scope or unavailable' using errcode = '22023';
                end if;
                if item->'source_revision' <> to_jsonb(source_document.revision) then
                    raise exception 'Source document revision conflict' using errcode = '40001';
                end if;
                if not exists (
                    select 1 from jsonb_array_elements(source_document.sections) s
                    where s.value->>'id' = item->>'source_section_id'
                ) then
                    raise exception 'Source section is unavailable' using errcode = '22023';
                end if;

            else
                raise exception 'Unknown source reference kind' using errcode = '22023';
        end case;
    end loop;
end;
$$;

create function yeoback_private.document_json(d public.knowledge_documents) returns jsonb
language sql stable strict set search_path = '' as $$
    select jsonb_build_object(
        'id', d.id, 'subject_type', d.subject_type, 'subject_id', d.subject_id,
        'revision', d.revision, 'sections', d.sections, 'source_refs', d.source_refs, 'updated_at', d.updated_at
    );
$$;

create function yeoback_private.add_document(
    p_owner uuid, p_type text, p_subject uuid, p_sections jsonb, p_source_refs jsonb
) returns void
language plpgsql set search_path = '' as $$
begin
    perform yeoback_private.validate_document(p_owner, p_type, p_subject, p_sections, p_source_refs);
    insert into public.knowledge_documents (owner_id, artist_id, exhibition_id, artwork_id, sections, source_refs)
    values (p_owner, case when p_type = 'artist' then p_subject end, case when p_type = 'exhibition' then p_subject end,
        case when p_type = 'artwork' then p_subject end, p_sections, p_source_refs);
end;
$$;

create function yeoback_private.save_document(
    p_owner uuid, p_type text, p_subject uuid, p_expected_revision integer, p_sections jsonb, p_source_refs jsonb
) returns jsonb
language plpgsql set search_path = '' as $$
declare
    document public.knowledge_documents;
begin
    select d.* into document from public.knowledge_documents d
    where d.owner_id = p_owner and d.subject_type = p_type and d.subject_id = p_subject for update;
    if not found then
        raise exception 'Knowledge document not found' using errcode = 'P0002';
    end if;
    if document.revision is distinct from p_expected_revision then
        raise exception 'Knowledge document revision conflict' using errcode = '40001';
    end if;
    perform yeoback_private.validate_document(p_owner, p_type, p_subject, p_sections, p_source_refs);
    if document.sections = p_sections and document.source_refs = p_source_refs then
        return yeoback_private.document_json(document);
    end if;
    update public.knowledge_documents d
    set sections = p_sections, source_refs = p_source_refs, revision = d.revision + 1, updated_at = now()
    where d.id = document.id returning d.* into document;
    return yeoback_private.document_json(document);
end;
$$;

create function yeoback_private.ensure_artist(p_owner uuid) returns uuid
language plpgsql set search_path = '' as $$
declare
    artist uuid;
begin
    insert into public.artist_profiles (owner_id) values (p_owner)
    on conflict (owner_id) do nothing returning id into artist;
    if found then
        perform yeoback_private.add_document(p_owner, 'artist', artist, '[]', '[]');
    else
        select a.id into artist from public.artist_profiles a where a.owner_id = p_owner;
    end if;
    return artist;
end;
$$;

create function yeoback_private.artist_json(a public.artist_profiles) returns jsonb
language sql stable strict set search_path = '' as $$
    select jsonb_build_object(
        'id', a.id, 'display_name', a.display_name, 'revision', a.revision,
        'created_at', a.created_at, 'updated_at', a.updated_at, 'document', yeoback_private.document_json(d)
    ) from public.knowledge_documents d where d.owner_id = a.owner_id and d.artist_id = a.id;
$$;

create function yeoback_private.exhibition_json(e public.exhibitions) returns jsonb
language sql stable strict set search_path = '' as $$
    select jsonb_build_object(
        'id', e.id, 'artist_id', e.artist_id, 'title', e.title, 'state', e.state,
        'start_date', e.start_date, 'end_date', e.end_date, 'place', e.place, 'revision', e.revision,
        'created_at', e.created_at, 'updated_at', e.updated_at, 'document', yeoback_private.document_json(d)
    ) from public.knowledge_documents d where d.owner_id = e.owner_id and d.exhibition_id = e.id;
$$;

create function yeoback_private.artwork_json(a public.artworks) returns jsonb
language sql stable strict set search_path = '' as $$
    select jsonb_build_object(
        'id', a.id, 'exhibition_id', a.exhibition_id, 'number', a.number, 'title', a.title,
        'creation_year', a.creation_year, 'medium', a.medium, 'dimensions', a.dimensions,
        'image_material_id', a.image_material_id, 'state', a.state, 'revision', a.revision,
        'created_at', a.created_at, 'updated_at', a.updated_at, 'document', yeoback_private.document_json(d)
    ) from public.knowledge_documents d where d.owner_id = a.owner_id and d.artwork_id = a.id;
$$;

create function public.get_artist_profile() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
    owner uuid := yeoback_private.require_owner();
    artist uuid := yeoback_private.ensure_artist(owner);
begin
    return (select yeoback_private.artist_json(a) from public.artist_profiles a where a.owner_id = owner and a.id = artist);
end;
$$;

create function public.update_artist_profile(
    p_expected_revision integer, p_display_name text, p_expected_document_revision integer,
    p_sections jsonb, p_source_refs jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
    owner uuid := yeoback_private.require_owner();
    artist public.artist_profiles;
begin
    update public.artist_profiles a
    set display_name = yeoback_private.optional_text(p_display_name), revision = a.revision + 1, updated_at = now()
    where a.owner_id = owner and a.revision = p_expected_revision returning a.* into artist;
    if not found then
        if exists (select 1 from public.artist_profiles a where a.owner_id = owner) then
            raise exception 'Artist revision conflict' using errcode = '40001';
        end if;
        raise exception 'Artist profile not found' using errcode = 'P0002';
    end if;
    perform yeoback_private.save_document(owner, 'artist', artist.id, p_expected_document_revision, p_sections, p_source_refs);
    return yeoback_private.artist_json(artist);
end;
$$;

create function public.get_exhibition(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
    owner uuid := yeoback_private.require_owner();
begin
    perform yeoback_private.subject_scope(owner, 'exhibition', p_id);
    return (select yeoback_private.exhibition_json(e) from public.exhibitions e where e.owner_id = owner and e.id = p_id);
end;
$$;

create function public.list_exhibitions() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
    owner uuid := yeoback_private.require_owner();
begin
    return (select coalesce(jsonb_agg(yeoback_private.exhibition_json(e) order by e.created_at desc, e.id), '[]'::jsonb)
        from public.exhibitions e where e.owner_id = owner and e.deleted_at is null);
end;
$$;

create function public.create_exhibition(
    p_id uuid, p_title text, p_start_date date, p_end_date date, p_place text, p_sections jsonb, p_source_refs jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
    owner uuid := yeoback_private.require_owner();
    artist uuid := yeoback_private.ensure_artist(owner);
    title text := yeoback_private.optional_text(p_title);
    place text := yeoback_private.optional_text(p_place);
    fingerprint bytea := sha256(convert_to(jsonb_build_array(
        title, p_start_date, p_end_date, place, p_sections, p_source_refs
    )::text, 'UTF8'));
    exhibition public.exhibitions;
    created boolean;
begin
    insert into public.exhibitions (id, owner_id, artist_id, title, start_date, end_date, place, create_fingerprint)
    values (p_id, owner, artist, title, p_start_date, p_end_date, place, fingerprint)
    on conflict (id) do nothing returning * into exhibition;
    created := found;
    if created then
        perform yeoback_private.add_document(owner, 'exhibition', exhibition.id, p_sections, p_source_refs);
    else
        select e.* into exhibition from public.exhibitions e where e.owner_id = owner and e.id = p_id and e.deleted_at is null;
        if not found then
            raise exception 'Exhibition not found' using errcode = 'P0002';
        end if;
        if exhibition.create_fingerprint <> fingerprint then
            raise exception 'Exhibition creation ID already used with different input' using errcode = '23505';
        end if;
    end if;
    return yeoback_private.exhibition_json(exhibition) || jsonb_build_object('_created', created);
end;
$$;

create function public.update_exhibition(
    p_id uuid, p_expected_revision integer, p_title text, p_start_date date, p_end_date date, p_place text,
    p_expected_document_revision integer, p_sections jsonb, p_source_refs jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
    owner uuid := yeoback_private.require_owner();
    exhibition public.exhibitions;
begin
    perform yeoback_private.subject_scope(owner, 'exhibition', p_id);
    update public.exhibitions e
    set title = yeoback_private.optional_text(p_title), start_date = p_start_date, end_date = p_end_date,
        place = yeoback_private.optional_text(p_place), revision = e.revision + 1, updated_at = now()
    where e.owner_id = owner and e.id = p_id and e.deleted_at is null and e.revision = p_expected_revision
    returning e.* into exhibition;
    if not found then
        raise exception 'Exhibition revision conflict' using errcode = '40001';
    end if;
    perform yeoback_private.save_document(owner, 'exhibition', p_id, p_expected_document_revision, p_sections, p_source_refs);
    return yeoback_private.exhibition_json(exhibition);
end;
$$;

create function public.get_artwork(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
    owner uuid := yeoback_private.require_owner();
begin
    perform yeoback_private.subject_scope(owner, 'artwork', p_id);
    return (select yeoback_private.artwork_json(a) from public.artworks a where a.owner_id = owner and a.id = p_id);
end;
$$;

create function public.list_artworks(p_exhibition_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
    owner uuid := yeoback_private.require_owner();
begin
    perform yeoback_private.subject_scope(owner, 'exhibition', p_exhibition_id);
    return (select coalesce(jsonb_agg(yeoback_private.artwork_json(a) order by a.number), '[]'::jsonb)
        from public.artworks a where a.owner_id = owner and a.exhibition_id = p_exhibition_id and a.deleted_at is null);
end;
$$;

create function public.create_artwork(
    p_id uuid, p_exhibition_id uuid, p_number integer, p_title text, p_creation_year text, p_medium text,
    p_dimensions text, p_sections jsonb, p_source_refs jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
    owner uuid := yeoback_private.require_owner();
    title text := yeoback_private.optional_text(p_title);
    creation_year text := yeoback_private.optional_text(p_creation_year);
    medium text := yeoback_private.optional_text(p_medium);
    dimensions text := yeoback_private.optional_text(p_dimensions);
    fingerprint bytea := sha256(convert_to(jsonb_build_array(
        p_exhibition_id, p_number, title, creation_year, medium, dimensions, p_sections, p_source_refs
    )::text, 'UTF8'));
    artwork public.artworks;
    created boolean;
begin
    perform yeoback_private.subject_scope(owner, 'exhibition', p_exhibition_id);
    insert into public.artworks (id, owner_id, exhibition_id, number, title, creation_year, medium, dimensions, create_fingerprint)
    values (p_id, owner, p_exhibition_id, p_number, title, creation_year, medium, dimensions, fingerprint)
    on conflict (id) do nothing returning * into artwork;
    created := found;
    if created then
        perform yeoback_private.add_document(owner, 'artwork', artwork.id, p_sections, p_source_refs);
    else
        select a.* into artwork from public.artworks a where a.owner_id = owner and a.id = p_id and a.deleted_at is null;
        if not found then
            raise exception 'Artwork not found' using errcode = 'P0002';
        end if;
        if artwork.create_fingerprint <> fingerprint then
            raise exception 'Artwork creation ID already used with different input' using errcode = '23505';
        end if;
    end if;
    return yeoback_private.artwork_json(artwork) || jsonb_build_object('_created', created);
end;
$$;

create function public.update_artwork(
    p_id uuid, p_expected_revision integer, p_number integer, p_title text, p_creation_year text, p_medium text,
    p_dimensions text, p_expected_document_revision integer, p_sections jsonb, p_source_refs jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
    owner uuid := yeoback_private.require_owner();
    artwork public.artworks;
begin
    perform yeoback_private.subject_scope(owner, 'artwork', p_id);
    update public.artworks a
    set number = p_number, title = yeoback_private.optional_text(p_title), creation_year = yeoback_private.optional_text(p_creation_year),
        medium = yeoback_private.optional_text(p_medium), dimensions = yeoback_private.optional_text(p_dimensions),
        revision = a.revision + 1, updated_at = now()
    where a.owner_id = owner and a.id = p_id and a.deleted_at is null and a.revision = p_expected_revision
    returning a.* into artwork;
    if not found then
        raise exception 'Artwork revision conflict' using errcode = '40001';
    end if;
    perform yeoback_private.save_document(owner, 'artwork', p_id, p_expected_document_revision, p_sections, p_source_refs);
    return yeoback_private.artwork_json(artwork);
end;
$$;

create function public.get_knowledge_document(p_subject_type text, p_subject_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
    owner uuid := yeoback_private.require_owner();
    document jsonb;
begin
    perform yeoback_private.subject_scope(owner, p_subject_type, p_subject_id);
    select yeoback_private.document_json(d) into document from public.knowledge_documents d
    where d.owner_id = owner and d.subject_type = p_subject_type and d.subject_id = p_subject_id;
    if not found then
        raise exception 'Knowledge document not found' using errcode = 'P0002';
    end if;
    return document;
end;
$$;

create function public.update_knowledge_document(
    p_subject_type text, p_subject_id uuid, p_expected_revision integer, p_sections jsonb, p_source_refs jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
    owner uuid := yeoback_private.require_owner();
begin
    perform yeoback_private.subject_scope(owner, p_subject_type, p_subject_id);
    return yeoback_private.save_document(owner, p_subject_type, p_subject_id, p_expected_revision, p_sections, p_source_refs);
end;
$$;

-- Only the active, non-revoked approved snapshot contributes public display fields.
create function yeoback_private.public_artworks(p_exhibition_id uuid) returns setof public.publications
language sql stable set search_path = '' as $$
    select p.* from public.publications p
    join public.artworks a on a.id = p.artwork_id and a.active_publication_id = p.id
    join public.exhibitions e on e.id = a.exhibition_id
    where e.id = p_exhibition_id and e.state = 'published' and e.deleted_at is null
        and a.state = 'published' and a.deleted_at is null and p.revoked_at is null;
$$;

create function yeoback_private.public_artwork_json(p public.publications) returns jsonb
language sql stable strict set search_path = '' as $$
    select jsonb_build_object('id', p.artwork_id, 'number', p.number, 'title', p.title,
        'creation_year', p.creation_year, 'medium', p.medium, 'dimensions', p.dimensions, 'publication_id', p.id);
$$;

create function public.get_public_exhibition(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
    select jsonb_build_object('id', e.id, 'title', e.public_title, 'artist_display_name', e.public_artist_display_name,
        'artist_bio', e.public_artist_bio, 'introduction', e.public_introduction, 'theme', e.public_theme,
        'start_date', e.public_start_date, 'end_date', e.public_end_date, 'place', e.public_place, 'artworks', snapshots.artworks)
    from public.exhibitions e
    cross join lateral (
        select jsonb_agg(yeoback_private.public_artwork_json(p) order by p.number, p.artwork_id) as artworks
        from yeoback_private.public_artworks(e.id) p
    ) snapshots
    where e.id = p_id and snapshots.artworks is not null;
$$;

create function public.get_public_artwork(p_exhibition_id uuid, p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
    select yeoback_private.public_artwork_json(p) || jsonb_build_object('narration_text', p.narration_text)
    from yeoback_private.public_artworks(p_exhibition_id) p where p.artwork_id = p_id;
$$;

revoke execute on all functions in schema yeoback_private from public, anon, authenticated;

revoke execute on function public.get_artist_profile(), public.update_artist_profile(integer, text, integer, jsonb, jsonb),
    public.get_exhibition(uuid), public.list_exhibitions(), public.create_exhibition(uuid, text, date, date, text, jsonb, jsonb),
    public.update_exhibition(uuid, integer, text, date, date, text, integer, jsonb, jsonb),
    public.get_artwork(uuid), public.list_artworks(uuid), public.create_artwork(uuid, uuid, integer, text, text, text, text, jsonb, jsonb),
    public.update_artwork(uuid, integer, integer, text, text, text, text, integer, jsonb, jsonb),
    public.get_knowledge_document(text, uuid), public.update_knowledge_document(text, uuid, integer, jsonb, jsonb)
from public, anon, authenticated;

grant execute on function public.get_artist_profile(), public.update_artist_profile(integer, text, integer, jsonb, jsonb),
    public.get_exhibition(uuid), public.list_exhibitions(), public.create_exhibition(uuid, text, date, date, text, jsonb, jsonb),
    public.update_exhibition(uuid, integer, text, date, date, text, integer, jsonb, jsonb),
    public.get_artwork(uuid), public.list_artworks(uuid), public.create_artwork(uuid, uuid, integer, text, text, text, text, jsonb, jsonb),
    public.update_artwork(uuid, integer, integer, text, text, text, text, integer, jsonb, jsonb),
    public.get_knowledge_document(text, uuid), public.update_knowledge_document(text, uuid, integer, jsonb, jsonb)
to authenticated;

revoke execute on function public.get_public_exhibition(uuid), public.get_public_artwork(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_public_exhibition(uuid), public.get_public_artwork(uuid, uuid) to anon, authenticated;

commit;
