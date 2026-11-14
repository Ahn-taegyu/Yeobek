begin;

create function yeoback_private.exhibition_publication_rules(p_owner uuid,p_exhibition_id uuid)
returns text[] language plpgsql stable set search_path = '' as $$
declare e public.exhibitions%rowtype; reasons text[];
begin
    perform yeoback_private.subject_scope(p_owner,'exhibition',p_exhibition_id);
    select * into strict e from public.exhibitions where id=p_exhibition_id and owner_id=p_owner;
    select coalesce(array_agg(code order by ord),'{}') into reasons from (values
        (1,'EXHIBITION_TITLE_REQUIRED',e.title is null or e.title !~ '[^[:space:]]'),
        (2,'EXHIBITION_PERIOD_REQUIRED',e.start_date is null or e.end_date is null),
        (3,'EXHIBITION_PERIOD_INVALID',e.start_date > e.end_date),
        (4,'EXHIBITION_PLACE_REQUIRED',e.place is null or e.place !~ '[^[:space:]]'),
        (5,'ARTWORK_REQUIRED',not exists(select 1 from public.artworks a where a.exhibition_id=e.id and a.deleted_at is null)),
        (6,'ARTIST_NAME_REQUIRED',not exists(select 1 from public.artist_profiles a where a.owner_id=p_owner and nullif(btrim(a.display_name),'') is not null))
    ) rules(ord,code,blocked) where blocked;
    return reasons;
end;
$$;
revoke all on function yeoback_private.exhibition_publication_rules(uuid,uuid) from public,anon,authenticated,service_role;

create function public.get_publication_checklist(p_exhibition_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare owner uuid := yeoback_private.require_owner(); e public.exhibitions%rowtype;
begin
    perform yeoback_private.subject_scope(owner,'exhibition',p_exhibition_id);
    select * into strict e from public.exhibitions where id=p_exhibition_id and owner_id=owner;
    return jsonb_build_object('exhibitionId',e.id,'revision',e.revision,
        'exhibitionBlockingCodes',yeoback_private.exhibition_publication_rules(owner,e.id),
        'artworks',coalesce((select jsonb_agg(jsonb_build_object('artworkId',a.id,'revision',a.revision,
            'blockingCodes',yeoback_private.publication_rules(owner,a.id)) order by a.number,a.id)
            from public.artworks a where a.owner_id=owner and a.exhibition_id=e.id and a.deleted_at is null),'[]'));
end;
$$;
revoke all on function public.get_publication_checklist(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_publication_checklist(uuid) to authenticated;

create or replace function yeoback_private.publish_with_audio(p_owner uuid,p_exhibition_id uuid, p_request_id uuid, p_expected_revision integer,
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
    exhibition_blocked text[];
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
    exhibition_blocked := yeoback_private.exhibition_publication_rules(owner,p_exhibition_id);
    if cardinality(exhibition_blocked) > 0 then
        return jsonb_build_object('exhibitionId',p_exhibition_id,'revision',exhibition.revision,
            'state',exhibition.state,'publications',publications,'blocked',blocked,
            'exhibitionBlocked',exhibition_blocked,'created',false);
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
    ) then
        return jsonb_build_object('exhibitionId',p_exhibition_id,'revision',exhibition.revision,
            'state',exhibition.state,'publications',publications,'blocked',blocked,
            'exhibitionBlocked',jsonb_build_array('ARTWORK_REQUIRED'),'created',false);
    end if;
    if blocked <> '[]'::jsonb then
        return jsonb_build_object('exhibitionId',p_exhibition_id,'revision',exhibition.revision,
            'state',exhibition.state,'publications',publications,'blocked',blocked,'created',false);
    end if;

    for candidate in select value from jsonb_array_elements(p_artworks) loop
        select * into strict artwork from public.artworks where id = (candidate->>'artwork_id')::uuid;
        approval := yeoback_private.current_narration_approval(owner, artwork.id);
        image := null;
        if artwork.image_material_id is not null then
            select * into strict image from public.materials where id = artwork.image_material_id;
        end if;
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
            artwork.medium,artwork.dimensions,image.storage_key,jsonb_build_object('schemaVersion',2,'items',snapshot,
                'approvedQa',public.get_approved_qa_for_publication(owner,p_exhibition_id,artwork.id,
                    coalesce(current_setting('yeobek.notification_mock',true) = 'true',false))
                    || public.get_approved_qa_for_publication(owner,p_exhibition_id,null,
                    coalesce(current_setting('yeobek.notification_mock',true) = 'true',false))),
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


commit;
