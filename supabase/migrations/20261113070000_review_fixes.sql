begin;

create function yeoback_private.validate_document(
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

create or replace function yeoback_private.document_json(d public.knowledge_documents) returns jsonb
language plpgsql stable strict set search_path = '' as $$
declare
    scope uuid[] := yeoback_private.subject_scope(d.owner_id, d.subject_type, d.subject_id);
    uuid_pattern constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
    warnings jsonb := '[]';
    item jsonb;
    source_id uuid;
    current_revision integer;
    warning jsonb;
begin
    for item in select value from jsonb_array_elements(d.source_refs) loop
        if item->>'kind' = 'document' then
            source_id := case when item->>'source_document_id' ~* uuid_pattern then (item->>'source_document_id')::uuid end;
            select s.revision into current_revision from public.knowledge_documents s
            where s.id = source_id and s.owner_id = d.owner_id and s.subject_type <> d.subject_type
                and (s.artist_id = scope[1] or s.exhibition_id = scope[2] or s.artwork_id = scope[3])
                and exists (select 1 from jsonb_array_elements(s.sections) section
                    where section.value->>'id' = item->>'source_section_id');
            warning := jsonb_build_object('kind', 'document', 'section_id', item->'section_id',
                'source_document_id', item->'source_document_id', 'source_section_id', item->'source_section_id',
                'source_revision', item->'source_revision');
            if current_revision is null then
                warnings := warnings || jsonb_build_array(warning || jsonb_build_object('code', 'source_unavailable'));
            elsif to_jsonb(current_revision) is distinct from item->'source_revision' then
                warnings := warnings || jsonb_build_array(warning || jsonb_build_object(
                    'code', 'source_changed', 'current_revision', current_revision));
            end if;
        elsif item->>'kind' = 'material' then
            source_id := case when item->>'material_id' ~* uuid_pattern then (item->>'material_id')::uuid end;
            if not exists (
                select 1 from public.materials m
                where m.id = source_id and m.owner_id = d.owner_id and m.state = 'ready'
                    and (m.artist_id = scope[1] or m.exhibition_id = scope[2] or m.artwork_id = scope[3])
            ) then
                warnings := warnings || jsonb_build_array(jsonb_build_object('code', 'source_unavailable',
                    'kind', 'material', 'section_id', item->'section_id', 'material_id', item->'material_id'));
            end if;
        end if;
    end loop;
    return jsonb_build_object(
        'id', d.id, 'subject_type', d.subject_type, 'subject_id', d.subject_id,
        'revision', d.revision, 'sections', d.sections, 'source_refs', d.source_refs,
        'source_warnings', warnings, 'updated_at', d.updated_at
    );
end;
$$;

create or replace function yeoback_private.add_document(
    p_owner uuid, p_type text, p_subject uuid, p_sections jsonb, p_source_refs jsonb
) returns void
language plpgsql set search_path = '' as $$
declare
    sections jsonb := yeoback_private.validate_document(p_owner, p_type, p_subject, p_sections, p_source_refs, '[]', '[]');
begin
    insert into public.knowledge_documents (owner_id, artist_id, exhibition_id, artwork_id, sections, source_refs)
    values (p_owner, case when p_type = 'artist' then p_subject end, case when p_type = 'exhibition' then p_subject end,
        case when p_type = 'artwork' then p_subject end, sections, p_source_refs);
end;
$$;

create or replace function yeoback_private.save_document(
    p_owner uuid, p_type text, p_subject uuid, p_expected_revision integer, p_sections jsonb, p_source_refs jsonb
) returns jsonb
language plpgsql set search_path = '' as $$
declare
    document public.knowledge_documents;
    normalized_sections jsonb;
begin
    select d.* into document from public.knowledge_documents d
    where d.owner_id = p_owner and d.subject_type = p_type and d.subject_id = p_subject for update;
    if not found then
        raise exception 'Knowledge document not found' using errcode = 'P0002';
    end if;
    if document.revision is distinct from p_expected_revision then
        raise exception 'Knowledge document revision conflict' using errcode = '40001';
    end if;
    normalized_sections := yeoback_private.validate_document(
        p_owner, p_type, p_subject, p_sections, p_source_refs, document.sections, document.source_refs
    );
    if document.sections = normalized_sections and document.source_refs = p_source_refs then
        return yeoback_private.document_json(document);
    end if;
    update public.knowledge_documents d
    set sections = normalized_sections, source_refs = p_source_refs, revision = d.revision + 1, updated_at = now()
    where d.id = document.id returning d.* into document;
    return yeoback_private.document_json(document);
end;
$$;

drop function yeoback_private.validate_document(uuid, text, uuid, jsonb, jsonb);
revoke execute on function yeoback_private.validate_document(uuid, text, uuid, jsonb, jsonb, jsonb, jsonb)
from public, anon, authenticated;

create or replace function public.list_exhibitions() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
    owner uuid := yeoback_private.require_owner();
begin
    return (
        select coalesce(jsonb_agg(
            yeoback_private.exhibition_json(e) || jsonb_build_object('artwork_count', (
                select count(*) from public.artworks a
                where a.owner_id = e.owner_id and a.exhibition_id = e.id and a.deleted_at is null
            )) order by e.updated_at desc, e.id
        ), '[]'::jsonb)
        from public.exhibitions e where e.owner_id = owner and e.deleted_at is null
    );
end;
$$;

commit;
