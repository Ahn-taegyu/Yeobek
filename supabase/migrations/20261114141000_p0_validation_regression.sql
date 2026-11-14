begin;

create or replace function yeoback_private.validate_document(
    p_owner uuid, p_type text, p_subject uuid, p_sections jsonb, p_source_refs jsonb,
    p_saved_sections jsonb, p_saved_source_refs jsonb
) returns jsonb
language plpgsql set search_path = '' as $$
declare
    scope uuid[] := yeoback_private.subject_scope(p_owner, p_type, p_subject);
    allowed_sections text[] := array(select c.section_id from yeoback_private.knowledge_section_catalog c where c.subject_type = p_type);
    uuid_pattern constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
    -- Match the HTTP validator's String.trim() character set.
    body_whitespace constant text := U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
    sections jsonb := '[]';
    remaining_refs jsonb := p_saved_source_refs;
    section_ids text[] := array[]::text[];
    item jsonb;
    section_id text;
    section_limit integer;
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
        select c.max_length into section_limit from yeoback_private.knowledge_section_catalog c
        where c.subject_type = p_type and c.section_id = item->>'id';
        trimmed_body := btrim(item->>'body', body_whitespace);
        if jsonb_typeof(item->'id') is distinct from 'string' or jsonb_typeof(item->'body') is distinct from 'string'
            or item - array['id', 'body'] <> '{}'::jsonb or section_limit is null
            or section_id = any(section_ids) or char_length(trimmed_body) > section_limit then
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

create or replace function public.create_exhibition(
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
    if yeoback_private.optional_text(p_title) is null then
        raise exception 'Title is required' using errcode = '23502';
    end if;
    if (p_start_date is null) <> (p_end_date is null) or p_start_date > p_end_date then
        raise exception 'Invalid exhibition period' using errcode = '23514';
    end if;
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

create or replace function public.update_exhibition(
    p_id uuid, p_expected_revision integer, p_title text, p_start_date date, p_end_date date, p_place text,
    p_expected_document_revision integer, p_sections jsonb, p_source_refs jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
    owner uuid := yeoback_private.require_owner();
    exhibition public.exhibitions;
begin
    if yeoback_private.optional_text(p_title) is null then
        raise exception 'Title is required' using errcode = '23502';
    end if;
    perform yeoback_private.subject_scope(owner, 'exhibition', p_id);
    if (p_start_date is null) <> (p_end_date is null) or p_start_date > p_end_date then
        raise exception 'Invalid exhibition period' using errcode = '23514';
    end if;
    update public.exhibitions e
    set title = yeoback_private.optional_text(p_title), start_date = p_start_date, end_date = p_end_date,
        place = yeoback_private.optional_text(p_place), revision = e.revision + 1, updated_at = now()
    where e.owner_id = owner and e.id = p_id and e.deleted_at is null and e.revision = p_expected_revision
    returning e.* into exhibition;
    if not found then
        raise exception 'Exhibition revision conflict' using errcode = '40001';
    end if;
    if exhibition.authoring_step in ('world','artworks') and yeoback_private.exhibition_authoring_blockers(exhibition) <> '[]' then
        raise exception 'Exhibition authoring is incomplete' using errcode = '22023';
    end if;
    perform yeoback_private.save_document(owner, 'exhibition', p_id, p_expected_document_revision, p_sections, p_source_refs);
    return yeoback_private.exhibition_json(exhibition);
end;
$$;

create or replace function public.create_artwork(
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
    if yeoback_private.optional_text(p_title) is null then
        raise exception 'Title is required' using errcode = '23502';
    end if;
    perform 1 from public.exhibitions where id = p_exhibition_id and owner_id = owner and deleted_at is null for update;
    if not found then raise exception 'Subject not found' using errcode = 'P0002'; end if;
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

create or replace function public.update_artwork(
    p_id uuid, p_expected_revision integer, p_number integer, p_title text, p_creation_year text, p_medium text,
    p_dimensions text, p_expected_document_revision integer, p_sections jsonb, p_source_refs jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
    owner uuid := yeoback_private.require_owner();
    artwork public.artworks;
begin
    if yeoback_private.optional_text(p_title) is null then
        raise exception 'Title is required' using errcode = '23502';
    end if;
    perform 1 from public.exhibitions e join public.artworks a on a.exhibition_id = e.id and a.owner_id = e.owner_id
    where a.id = p_id and a.owner_id = owner and a.deleted_at is null and e.deleted_at is null for update of e;
    if not found then raise exception 'Subject not found' using errcode = 'P0002'; end if;
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

commit;
