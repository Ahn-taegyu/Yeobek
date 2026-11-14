begin;

alter table public.publications drop constraint publications_v1_evidence_check,
    add constraint publications_v1_evidence_check check (
        jsonb_typeof(evidence) = 'array' or (
            jsonb_typeof(evidence) is not distinct from 'object'
            and evidence->>'schemaVersion' in ('1','2')
            and jsonb_typeof(evidence->'items') is not distinct from 'array'
            and evidence->'items' <> '[]'::jsonb
            and jsonb_typeof(narration_citations) = 'array'
            and ((audio_key is null) = (audio_text_hash is null))
        )
    );

create or replace function yeoback_private.require_publication_v1()
returns trigger language plpgsql set search_path = '' as $$
declare
    item jsonb;
    pin jsonb;
    item_id uuid;
    item_version integer;
    seen uuid[] := '{}';
    qa jsonb;
    approved_qa jsonb;
    qa_seen uuid[] := '{}';
    cited uuid[] := '{}';
begin
    if jsonb_typeof(new.evidence) is distinct from 'object'
        or (case new.evidence->>'schemaVersion'
            when '1' then new.evidence - array['schemaVersion','items'] <> '{}'
            when '2' then new.evidence - array['schemaVersion','items','approvedQa'] <> '{}'
                or jsonb_typeof(new.evidence->'approvedQa') is distinct from 'array'
            else true end)
        or jsonb_typeof(new.evidence->'items') is distinct from 'array'
        or jsonb_typeof(new.narration_citations) is distinct from 'array' then
        raise exception 'Invalid publication snapshot' using errcode = '22023';
    end if;
    if jsonb_array_length(new.evidence->'items') not between 1 and 100
        or jsonb_array_length(new.narration_citations) not between 1 and 12 then
        raise exception 'Invalid publication snapshot' using errcode = '22023';
    end if;
    for item in select value from jsonb_array_elements(new.evidence->'items') loop
        if jsonb_typeof(item) is distinct from 'object'
            or not item ?& array['id','version','ownerId','exhibitionId','publicationId','artworkId','scope','sourceLabel','body','contentHash']
            or item - array['id','version','ownerId','exhibitionId','publicationId','artworkId','scope','sourceLabel','body','contentHash'] <> '{}'
            or jsonb_typeof(item->'id') is distinct from 'string'
            or jsonb_typeof(item->'version') is distinct from 'number'
            or jsonb_typeof(item->'ownerId') is distinct from 'string'
            or jsonb_typeof(item->'exhibitionId') is distinct from 'string'
            or jsonb_typeof(item->'publicationId') is distinct from 'string'
            or jsonb_typeof(item->'scope') is distinct from 'string'
            or jsonb_typeof(item->'sourceLabel') is distinct from 'string'
            or jsonb_typeof(item->'body') is distinct from 'string'
            or jsonb_typeof(item->'contentHash') is distinct from 'string' then
            raise exception 'Invalid publication snapshot' using errcode = '22023';
        end if;
        item_id := (item->>'id')::uuid;
        item_version := (item->>'version')::integer;
        if item_version < 1 or item_id = any(seen)
            or (item->>'ownerId')::uuid <> new.owner_id
            or (item->>'exhibitionId')::uuid <> new.exhibition_id
            or (item->>'publicationId')::uuid <> new.id
            or item->>'scope' not in ('artist','exhibition','artwork')
            or char_length(item->>'sourceLabel') not between 1 and 200
            or (item->>'sourceLabel') !~ '[^[:space:]]'
            or char_length(item->>'body') not between 1 and 8000
            or (item->>'body') !~ '[^[:space:]]'
            or item->>'contentHash' <> encode(sha256(convert_to(item->>'body','UTF8')),'hex') then
            raise exception 'Invalid publication snapshot' using errcode = '22023';
        end if;
        if item->>'scope' = 'artwork' then
            if jsonb_typeof(item->'artworkId') is distinct from 'string'
                or (item->>'artworkId')::uuid <> new.artwork_id then
                raise exception 'Invalid publication snapshot' using errcode = '22023';
            end if;
        elsif item->'artworkId' is distinct from 'null'::jsonb then
            raise exception 'Invalid publication snapshot' using errcode = '22023';
        end if;
        seen := array_append(seen,item_id);
    end loop;
    for pin in select value from jsonb_array_elements(new.narration_citations) loop
        if jsonb_typeof(pin) is distinct from 'object' or not pin ?& array['id','version']
            or pin - array['id','version'] <> '{}'
            or jsonb_typeof(pin->'id') is distinct from 'string'
            or jsonb_typeof(pin->'version') is distinct from 'number' then
            raise exception 'Invalid publication snapshot' using errcode = '22023';
        end if;
        item_id := (pin->>'id')::uuid;
        item_version := (pin->>'version')::integer;
        if item_id = any(cited) or not exists (
            select 1 from jsonb_array_elements(new.evidence->'items') e
            where (e->>'id')::uuid = item_id and (e->>'version')::integer = item_version
        ) then raise exception 'Invalid publication snapshot' using errcode = '22023'; end if;
        cited := array_append(cited,item_id);
    end loop;
    if new.evidence->>'schemaVersion' = '2' then
        -- Reuse A's authoritative approval port while holding the publication lock.
        approved_qa := public.get_approved_qa_for_publication(new.owner_id,new.exhibition_id,new.artwork_id,true)
            || public.get_approved_qa_for_publication(new.owner_id,new.exhibition_id,null,true);
        for qa in select value from jsonb_array_elements(new.evidence->'approvedQa') loop
            if jsonb_typeof(qa) is distinct from 'object' or not exists (
                select 1 from jsonb_array_elements(approved_qa) a where a = qa
            ) then raise exception 'Invalid publication Q&A snapshot' using errcode = '22023'; end if;
            item_id := (qa->>'id')::uuid;
            if item_id = any(seen) or item_id = any(qa_seen) then
                raise exception 'Invalid publication Q&A snapshot' using errcode = '22023';
            end if;
            for pin in select value from jsonb_array_elements(qa->'evidencePins') loop
                if not exists (select 1 from jsonb_array_elements(new.evidence->'items') e
                    where e->'id' = pin->'id' and e->'version' = pin->'version') then
                    raise exception 'Invalid publication Q&A evidence' using errcode = '22023';
                end if;
            end loop;
            qa_seen := array_append(qa_seen,item_id);
        end loop;
    end if;
    return new;
exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Invalid publication snapshot' using errcode = '22023';
end;
$$;

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


create or replace function yeoback_private.publication_is_valid(p public.publications)
returns boolean language sql stable set search_path = '' as $$
    select p.revoked_at is null and p.evidence->>'schemaVersion' in ('1','2')
        and not exists (
            select 1 from public.publication_evidence_refs r join public.evidence_items e
                on (e.id,e.version) = (r.evidence_id,r.evidence_version)
            where r.publication_id = p.id and e.state = 'withdrawn'
        ) and not exists (
            select 1 from jsonb_array_elements(coalesce(p.evidence->'approvedQa','[]')) qa
            where not exists (
                select 1 from yeoback_private.qa_item_versions q
                where q.id = (qa->>'id')::uuid and q.version = (qa->>'version')::integer
                    and q.owner_id = p.owner_id and q.exhibition_id = p.exhibition_id
                    and q.artwork_id is not distinct from (qa->>'artworkId')::uuid
                    and q.state = 'approved' and encode(q.content_hash,'hex') = qa->>'contentHash'
                    and q.evidence_pins = qa->'evidencePins'
            )
        );
$$;

-- The model sees Q&A as cited evidence, never as an approved narration response.
-- The runtime still selects at most 12 excerpts / 8,000 characters in total.
create function yeoback_private.publication_context_evidence(p public.publications)
returns jsonb language sql stable set search_path = '' as $$
    select p.evidence->'items' || coalesce((select jsonb_agg(jsonb_build_object(
        'id',qa->'id','version',qa->'version','ownerId',p.owner_id,'exhibitionId',p.exhibition_id,
        'publicationId',p.id,'artworkId',qa->'artworkId','scope',qa->'scope',
        'sourceLabel','승인 예상 Q&A','body',body,
        'contentHash',encode(sha256(convert_to(body,'UTF8')),'hex')) order by qa->>'id')
        from (select value as qa from jsonb_array_elements(coalesce(p.evidence->'approvedQa','[]'))
            order by (value->>'approvedAt')::timestamptz desc,value->>'id' limit 100) candidates
        cross join lateral (select '질문: ' || (qa->>'question') || E'\n답변: ' || (qa->>'answer') as body) content), '[]');
$$;
revoke all on function yeoback_private.publication_context_evidence(public.publications)
    from public,anon,authenticated,service_role;

create or replace function public.load_publication_context(p_exhibition_id uuid,p_artwork_id uuid,p_number integer)
returns jsonb language sql stable security definer set search_path = '' as $$
    select jsonb_build_object('ownerId',p.owner_id,'exhibitionId',p.exhibition_id,'artworkId',p.artwork_id,
        'publicationId',p.id,'version',p.version,'number',p.number,'title',p.title,
        'evidence',yeoback_private.publication_context_evidence(p),
        'narration',jsonb_build_object('text',p.narration_text,'citations',
            (select jsonb_agg(pin->'id' order by ord) from jsonb_array_elements(p.narration_citations) with ordinality x(pin,ord))))
    from yeoback_private.public_artworks(p_exhibition_id) p
    where ((p_artwork_id is not null and p_number is null and p.artwork_id = p_artwork_id)
        or (p_artwork_id is null and p_number is not null and p.number = p_number));
$$;

create or replace function yeoback_private.complete_visitor_request(p_session_hash text,p_id uuid,p_result jsonb,
    p_failure_code text default null,p_steps jsonb default '[]')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    sid bytea := yeoback_private.visitor_hash(p_session_hash);
    row public.api_requests%rowtype;
    exhibition uuid;
    ref jsonb := p_result->'publication';
    pub public.publications%rowtype;
begin
    select exhibition_id into exhibition from public.api_requests where session_hash = sid and id = p_id;
    if not found then raise exception 'Visitor request not found' using errcode = 'P0002'; end if;
    -- Use the same ordering as reserve; the publication lock is shared with pause/revoke.
    perform yeoback_private.visitor_public_lock(exhibition,false);
    select * into row from public.api_requests where session_hash = sid and id = p_id for update;
    if not found then raise exception 'Visitor request not found' using errcode = 'P0002'; end if;
    if row.expires_at <= statement_timestamp() then raise exception 'Visitor request expired' using errcode = 'P1012'; end if;
    if row.state <> 'running' then
        if row.failure_code is not distinct from p_failure_code and
            (row.result - 'gapRecorded') is not distinct from p_result then
            if row.publication_id is not null and not exists (
                select 1 from yeoback_private.public_artworks(exhibition) p where p.id = row.publication_id
            ) then raise exception 'Publication changed' using errcode = '40001'; end if;
            return yeoback_private.visitor_envelope(row,false);
        end if;
        raise exception 'Visitor request already completed' using errcode = 'P1011';
    end if;
    if row.lease_until <= statement_timestamp() then
        update public.api_requests set state = 'failed',failure_code = 'REQUEST_TIMEOUT',updated_at = statement_timestamp()
            where id = row.id returning * into row;
        return yeoback_private.visitor_envelope(row,false);
    end if;
    perform yeoback_private.validate_visitor_steps(p_steps);
    if p_failure_code is not null then
        if p_result is not null or p_failure_code !~ '^[A-Z][A-Z0-9_]{0,63}$' then
            raise exception 'Invalid visitor failure' using errcode = '22023';
        end if;
        update public.api_requests set state = 'failed',failure_code = p_failure_code,steps = p_steps,
            updated_at = statement_timestamp() where id = row.id returning * into row;
        return yeoback_private.visitor_envelope(row,false);
    end if;
    if jsonb_typeof(p_result) is distinct from 'object' or
        p_result - array['answerId','requestId','contextSequence','inputMode','outputMode','answer',
            'citations','outcome','publication','source','mock'] <> '{}' or
        not p_result ?& array['answerId','requestId','contextSequence','inputMode','outputMode','answer',
            'citations','outcome','publication','source','mock'] or
        (p_result->>'answerId') is distinct from row.id::text or
        (p_result->>'requestId') is distinct from row.request_id::text or
        jsonb_typeof(p_result->'contextSequence') is distinct from 'number' or
        coalesce(p_result->>'contextSequence','') !~ '^[0-9]{1,16}$' or
        (p_result->>'contextSequence')::numeric > 9007199254740991 or
        coalesce(p_result->>'inputMode','') not in ('text','voice') or
        coalesce(p_result->>'outputMode','') not in ('text','voice') or
        coalesce(p_result->>'outcome','') not in ('answered','clarify','insufficient_evidence') or
        coalesce(p_result->>'source','') not in ('approved_narration','generated','fixed') or
        p_result->'mock' is distinct from to_jsonb(row.mock) or
        jsonb_typeof(p_result->'answer') is distinct from 'string' or
        coalesce(p_result->>'answer','') !~ '[^[:space:]]' or
        char_length(p_result->>'answer') > (case when p_result->>'source' = 'approved_narration' then 2000 else 600 end) or
        jsonb_typeof(p_result->'citations') is distinct from 'array'
        then raise exception 'Invalid visitor result' using errcode = '22023'; end if;
    if jsonb_array_length(p_result->'citations') > 12 or
        (p_result->>'outcome' = 'answered') <> (jsonb_array_length(p_result->'citations') > 0) or
        (p_result->>'outcome' = 'answered') = (p_result->>'source' = 'fixed') or
        (select count(distinct item) from jsonb_array_elements(p_result->'citations') item)
            <> jsonb_array_length(p_result->'citations')
        then raise exception 'Invalid visitor citations' using errcode = '22023'; end if;
    if ref = 'null'::jsonb then
        if p_result->>'outcome' <> 'clarify' then raise exception 'Publication required' using errcode = '22023'; end if;
        if not exists (select 1 from yeoback_private.public_artworks(exhibition)) then
            update public.api_requests set state = 'failed',failure_code = 'CONTENT_CHANGED',steps = p_steps,
                updated_at = statement_timestamp() where id = row.id returning * into row;
            return yeoback_private.visitor_envelope(row,false);
        end if;
    else
        if jsonb_typeof(ref) is distinct from 'object' or
            not ref ?& array['exhibitionId','artworkId','publicationId','version'] or
            ref - array['exhibitionId','artworkId','publicationId','version'] <> '{}' or
            jsonb_typeof(ref->'artworkId') is distinct from 'string' or
            jsonb_typeof(ref->'publicationId') is distinct from 'string' or
            jsonb_typeof(ref->'version') is distinct from 'number' or
            (ref->>'exhibitionId') is distinct from exhibition::text then
            raise exception 'Invalid visitor publication' using errcode = '22023';
        end if;
        select * into pub from yeoback_private.public_artworks(exhibition) p
            where p.id::text = ref->>'publicationId' and p.artwork_id::text = ref->>'artworkId'
                and to_jsonb(p.version) = ref->'version';
        if not found then
            update public.api_requests set state = 'failed',failure_code = 'CONTENT_CHANGED',steps = p_steps,
                updated_at = statement_timestamp() where id = row.id returning * into row;
            return yeoback_private.visitor_envelope(row,false);
        end if;
        if exists (select 1 from jsonb_array_elements(p_result->'citations') item
            where jsonb_typeof(item) <> 'string' or not exists (
                select 1 from jsonb_array_elements(yeoback_private.publication_context_evidence(pub)) e where e->'id' = item
            )) then raise exception 'Invalid visitor citations' using errcode = '22023'; end if;
        if p_result->>'source' = 'approved_narration' and (
            pub.narration_text is distinct from p_result->>'answer' or p_result->'citations' is distinct from (
                select jsonb_agg(c->'id' order by ord) from jsonb_array_elements(pub.narration_citations) with ordinality t(c,ord)
            )
        ) then raise exception 'Invalid approved narration' using errcode = '22023'; end if;
    end if;
    update public.api_requests set state = 'ready',result = p_result,steps = p_steps,
        artwork_id = pub.artwork_id,publication_id = pub.id,updated_at = statement_timestamp()
        where id = row.id returning * into row;
    return yeoback_private.visitor_envelope(row,false);
end;
$$;

commit;
