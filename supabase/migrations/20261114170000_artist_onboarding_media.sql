begin;

alter table public.materials
    add constraint materials_artist_scope_key unique (owner_id, artist_id, id),
    add constraint materials_exhibition_scope_key unique (owner_id, exhibition_id, id);

alter table public.artist_profiles
    add column full_name text check (char_length(full_name) between 1 and 100),
    add column keywords jsonb not null default '{"fields":[],"moods":[],"topics":[]}'::jsonb,
    add column onboarding_completed_at timestamptz,
    add column avatar_material_id uuid,
    add constraint artist_profiles_avatar_material_fk foreign key (owner_id, id, avatar_material_id)
        references public.materials(owner_id, artist_id, id);

alter table public.exhibitions
    add column poster_material_id uuid,
    add constraint exhibitions_poster_material_fk foreign key (owner_id, id, poster_material_id)
        references public.materials(owner_id, exhibition_id, id);

create function yeoback_private.onboarding_name(p_value text) returns text
language sql immutable strict set search_path = '' as $$
    select nullif(btrim(p_value, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'), '');
$$;

create function yeoback_private.visible_onboarding_name(p_value text) returns boolean
language sql immutable strict set search_path = '' as $$
    -- Match the HTTP visible-text rule for whitespace, controls, format characters and default ignorables.
    select p_value collate "C" ~ (U&'[^\0001-\0020\007F-\00A0\00AD\034F\0600-\0605\061C\06DD\070F\0890-\0891\08E2\115F-\1160\1680\17B4-\17B5\180B-\180F\2000-\200F\2028-\202F\205F-\206F\3000\3164\FE00-\FE0F\FEFF\FFA0\FFF0-\FFFB' ||
        U&'\+0110BD\+0110CD\+013430-\+01343F\+01BCA0-\+01BCA3\+01D173-\+01D17A\+0E0000-\+0E0FFF]');
$$;

create function yeoback_private.has_verified_artist_email(p_owner uuid) returns boolean
language sql stable set search_path = '' as $$
    select exists (
        select 1 from auth.users u where u.id = p_owner and u.email_confirmed_at is not null
            and nullif(btrim(u.email), '') is not null
    );
$$;

create function yeoback_private.valid_artist_keywords(p_keywords jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
    category record;
    selected jsonb;
begin
    if jsonb_typeof(p_keywords) is distinct from 'object'
        or p_keywords - array['fields', 'moods', 'topics'] <> '{}'::jsonb then
        return false;
    end if;
    for category in select * from (values
        ('fields', '["동양화","서양화","수묵화","조각","사진","일러스트","설치미술","미디어아트","공예","기타"]'::jsonb),
        ('moods', '["따뜻한","차분한","몽환적인","서정적인","실험적인","강렬한","미니멀한","유쾌한","사색적인"]'::jsonb),
        ('topics', '["자연","기억","감정","관계","정체성","상상","일상","사회","시간"]'::jsonb)
    ) as catalog(key, options) loop
        selected := p_keywords->category.key;
        if jsonb_typeof(selected) is distinct from 'array' then
            return false;
        end if;
        if jsonb_array_length(selected) > jsonb_array_length(category.options)
            or not (category.options @> selected)
            or jsonb_array_length(selected) <> (select count(distinct item) from jsonb_array_elements(selected) as entries(item)) then
            return false;
        end if;
    end loop;
    return true;
end;
$$;

create or replace function yeoback_private.artist_json(a public.artist_profiles) returns jsonb
language sql stable strict set search_path = '' as $$
    select jsonb_build_object(
        'id', a.id, 'display_name', a.display_name, 'full_name', a.full_name, 'keywords', a.keywords,
        'onboarding_completed_at', a.onboarding_completed_at,
        'onboarding_complete', a.onboarding_completed_at is not null
            and coalesce(yeoback_private.visible_onboarding_name(a.full_name), false)
            and coalesce(yeoback_private.visible_onboarding_name(a.display_name), false)
            and yeoback_private.has_verified_artist_email(a.owner_id),
        'avatar_material_id', a.avatar_material_id,
        'art_world_registered', exists (
            select 1 from jsonb_array_elements(d.sections) s
            where s->>'id' in ('practice', 'artist_motivation', 'artist_interests', 'artist_philosophy',
                'artist_methods', 'artist_method_reason', 'artist_inspiration', 'artist_audience')
                and s->>'body' ~ '[^[:space:]]'
        ),
        'revision', a.revision, 'created_at', a.created_at, 'updated_at', a.updated_at,
        'document', yeoback_private.document_json(d)
    ) from public.knowledge_documents d where d.owner_id = a.owner_id and d.artist_id = a.id;
$$;

create or replace function yeoback_private.exhibition_json(e public.exhibitions) returns jsonb
language sql stable strict set search_path = '' as $$
    select jsonb_build_object(
        'id', e.id, 'artist_id', e.artist_id, 'title', coalesce(e.title,'제목 없는 전시'),
        'draft_title', e.title, 'authoring_step', e.authoring_step,
        'start_time', left(e.start_time::text,5), 'end_time', left(e.end_time::text,5), 'state', e.state,
        'start_date', e.start_date, 'end_date', e.end_date, 'place', e.place, 'revision', e.revision,
        'poster_material_id', e.poster_material_id,
        'created_at', e.created_at, 'updated_at', e.updated_at, 'document', yeoback_private.document_json(d)
    ) from public.knowledge_documents d where d.owner_id = e.owner_id and d.exhibition_id = e.id;
$$;

create function public.update_artist_onboarding(p_expected_revision integer, p_full_name text, p_display_name text,
    p_keywords jsonb, p_complete boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
    owner uuid := yeoback_private.require_owner();
    normalized_full_name text := yeoback_private.onboarding_name(p_full_name);
    normalized_display_name text := yeoback_private.onboarding_name(p_display_name);
    artist public.artist_profiles%rowtype;
begin
    select * into artist from public.artist_profiles a where a.owner_id = owner for update;
    if not found then raise exception 'Artist profile not found' using errcode = 'P0002'; end if;
    if artist.revision is distinct from p_expected_revision then
        raise exception 'Artist revision conflict' using errcode = '40001';
    end if;
    if p_complete is null or not yeoback_private.valid_artist_keywords(p_keywords) then
        raise exception 'Invalid onboarding input' using errcode = '22023';
    end if;
    if (normalized_full_name is not null and (char_length(normalized_full_name) > 100
            or not yeoback_private.visible_onboarding_name(normalized_full_name)))
        or (normalized_display_name is not null and (char_length(normalized_display_name) > 100
            or not yeoback_private.visible_onboarding_name(normalized_display_name))) then
        raise exception 'Invalid artist name' using errcode = '22023';
    end if;
    if p_complete then
        if normalized_full_name is null or normalized_display_name is null then
            raise exception 'Artist names are required to complete onboarding' using errcode = '22023';
        end if;
        if not yeoback_private.has_verified_artist_email(owner) then
            raise exception 'Verified email is required to complete onboarding' using errcode = '42501';
        end if;
    end if;

    update public.artist_profiles a set full_name = normalized_full_name,
        display_name = normalized_display_name, keywords = p_keywords,
        onboarding_completed_at = case when p_complete then coalesce(a.onboarding_completed_at, statement_timestamp())
            else a.onboarding_completed_at end,
        revision = a.revision + 1, updated_at = statement_timestamp()
    where a.id = artist.id returning a.* into artist;
    return yeoback_private.artist_json(artist);
end;
$$;

create function yeoback_private.require_ready_author_image(p_owner uuid, p_subject_type text, p_subject_id uuid,
    p_material_id uuid) returns void
language plpgsql set search_path = '' as $$
declare
    image_max_bytes bigint := least(3145728, yeoback_private.policy_integer('image_max_bytes'));
begin
    perform 1 from public.materials m where m.id = p_material_id and m.owner_id = p_owner
        and case p_subject_type when 'artist' then m.artist_id when 'exhibition' then m.exhibition_id end = p_subject_id
        and m.kind = 'image' and m.state = 'ready' and m.deleted_at is null
        and m.upload_fingerprint is not null and m.content_hash is not null
        and m.byte_size between 1 and image_max_bytes for share;
    if not found then raise exception 'Material not found' using errcode = 'P0002'; end if;
end;
$$;

create function public.set_artist_avatar(p_expected_revision integer, p_material_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
    owner uuid := yeoback_private.require_owner();
    artist public.artist_profiles%rowtype;
begin
    perform yeoback_private.lock_publication(owner);
    select * into artist from public.artist_profiles a where a.owner_id = owner for update;
    if not found then raise exception 'Artist profile not found' using errcode = 'P0002'; end if;
    if artist.revision is distinct from p_expected_revision then
        raise exception 'Artist revision conflict' using errcode = '40001';
    end if;
    if p_material_id is not null then
        perform yeoback_private.require_ready_author_image(owner, 'artist', artist.id, p_material_id);
    end if;
    if artist.avatar_material_id is distinct from p_material_id then
        update public.artist_profiles a set avatar_material_id = p_material_id,
            revision = a.revision + 1, updated_at = statement_timestamp()
        where a.id = artist.id returning a.* into artist;
    end if;
    return yeoback_private.artist_json(artist);
end;
$$;

create function public.set_exhibition_poster(p_id uuid, p_expected_revision integer, p_material_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
    owner uuid := yeoback_private.require_owner();
    exhibition public.exhibitions%rowtype;
begin
    perform yeoback_private.lock_publication(owner);
    select * into exhibition from public.exhibitions e where e.id = p_id and e.owner_id = owner and e.deleted_at is null for update;
    if not found then raise exception 'Exhibition not found' using errcode = 'P0002'; end if;
    if exhibition.revision is distinct from p_expected_revision then
        raise exception 'Exhibition revision conflict' using errcode = '40001';
    end if;
    if p_material_id is not null then
        perform yeoback_private.require_ready_author_image(owner, 'exhibition', exhibition.id, p_material_id);
    end if;
    if exhibition.poster_material_id is distinct from p_material_id then
        update public.exhibitions e set poster_material_id = p_material_id,
            revision = e.revision + 1, updated_at = statement_timestamp()
        where e.id = exhibition.id returning e.* into exhibition;
    end if;
    return yeoback_private.exhibition_json(exhibition);
end;
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
        select 1 from public.exhibitions e where e.owner_id = owner and e.id = m.exhibition_id and e.poster_material_id = m.id
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

revoke all on function yeoback_private.onboarding_name(text), yeoback_private.visible_onboarding_name(text),
    yeoback_private.has_verified_artist_email(uuid), yeoback_private.valid_artist_keywords(jsonb),
    yeoback_private.require_ready_author_image(uuid, text, uuid, uuid) from public, anon, authenticated, service_role;

revoke all on function public.update_artist_onboarding(integer, text, text, jsonb, boolean),
    public.set_artist_avatar(integer, uuid), public.set_exhibition_poster(uuid, integer, uuid)
    from public, anon, authenticated, service_role;
grant execute on function public.update_artist_onboarding(integer, text, text, jsonb, boolean),
    public.set_artist_avatar(integer, uuid), public.set_exhibition_poster(uuid, integer, uuid) to authenticated;

commit;
