begin;

-- Prior snapshots may predate the v1 contract; new inserts must use it.
alter table public.publications drop constraint publications_evidence_check,
    alter column audio_key drop not null, alter column audio_text_hash drop not null,
    add column narration_citations jsonb not null default '[]',
    add constraint publications_v1_evidence_check check (
        jsonb_typeof(evidence) = 'array' or (
        jsonb_typeof(evidence) is not distinct from 'object' and evidence->'schemaVersion' is not distinct from '1'::jsonb
        and jsonb_typeof(evidence->'items') is not distinct from 'array' and evidence->'items' <> '[]'::jsonb
        and jsonb_typeof(narration_citations) = 'array'
        and ((audio_key is null) = (audio_text_hash is null))
        )
    );

create function yeoback_private.require_publication_v1()
returns trigger language plpgsql set search_path = '' as $$
begin
    if jsonb_typeof(new.evidence) is distinct from 'object' then
        raise exception 'Publication evidence must use schema version 1' using errcode = '22023';
    end if;
    return new;
end;
$$;
create trigger require_publication_v1 before insert on public.publications
    for each row execute function yeoback_private.require_publication_v1();

alter table public.exhibitions add column intro_evidence jsonb not null default '{}';

create table public.publication_requests (
    owner_id uuid not null,
    request_id uuid not null,
    fingerprint bytea not null,
    result jsonb not null,
    primary key (owner_id, request_id)
);
create table public.publication_evidence_refs (
    publication_id uuid not null references public.publications(id),
    evidence_id uuid not null,
    evidence_version integer not null,
    primary key (publication_id, evidence_id, evidence_version),
    foreign key (evidence_id, evidence_version) references public.evidence_items(id, version)
);
create table public.withdrawn_evidence_sources (
    owner_id uuid not null,
    source_key text not null,
    primary key (owner_id, source_key)
);
alter table public.publication_requests enable row level security;
alter table public.publication_evidence_refs enable row level security;
alter table public.withdrawn_evidence_sources enable row level security;
revoke all on public.publication_requests, public.publication_evidence_refs, public.withdrawn_evidence_sources
    from public, anon, authenticated, service_role;

create function yeoback_private.evidence_source_key(e public.evidence_items)
returns text language sql immutable strict set search_path = '' as $$
    select case e.source_kind
        when 'document' then jsonb_build_array('document', e.source_document_id, e.source_section_id, e.source_revision)::text
        when 'material' then jsonb_build_array('material', e.material_id, e.material_version)::text
        else jsonb_build_array('direct', e.id, e.version)::text end;
$$;

create function yeoback_private.prevent_withdrawn_evidence()
returns trigger language plpgsql set search_path = '' as $$
begin
    if new.state = 'approved' and (exists (
        select 1 from public.withdrawn_evidence_sources s where s.owner_id = new.owner_id
        and s.source_key = yeoback_private.evidence_source_key(new)
    ) or exists (
        select 1 from public.evidence_items e where e.owner_id = new.owner_id and e.id = new.id
          and e.version <> new.version and e.state = 'withdrawn'
    )) then raise exception 'Evidence source is withdrawn' using errcode = '40001'; end if;
    return new;
end;
$$;
create trigger block_withdrawn_evidence before insert or update on public.evidence_items
    for each row execute function yeoback_private.prevent_withdrawn_evidence();

-- Active numbers remain reserved while the artwork or exhibition is paused.
create function yeoback_private.guard_public_number()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    if exists (
        select 1 from public.artworks a join public.publications p on p.id = a.active_publication_id
        where a.exhibition_id = new.exhibition_id and a.id <> new.id and a.deleted_at is null
            and p.number = new.number and p.revoked_at is null
    ) then
        raise exception 'Public artwork number is reserved' using errcode = '23505', constraint = 'artworks_exhibition_id_number_key';
    end if;
    return new;
end;
$$;
create trigger reserve_public_number before insert or update of number on public.artworks
    for each row execute function yeoback_private.guard_public_number();

create function yeoback_private.publication_is_valid(p public.publications)
returns boolean language sql stable set search_path = '' as $$
    select p.revoked_at is null and p.evidence->'schemaVersion' = '1'::jsonb
        and not exists (
        select 1 from public.publication_evidence_refs r join public.evidence_items e
            on (e.id, e.version) = (r.evidence_id, r.evidence_version)
        where r.publication_id = p.id and e.state = 'withdrawn'
    );
$$;

create or replace function yeoback_private.public_artworks(p_exhibition_id uuid) returns setof public.publications
language sql stable set search_path = '' as $$
    select p.* from public.publications p
    join public.artworks a on (a.id, a.active_publication_id) = (p.artwork_id, p.id)
    join public.exhibitions e on e.id = a.exhibition_id
    where e.id = p_exhibition_id and e.state = 'published' and e.deleted_at is null
        and not exists (
            select 1 from jsonb_each(e.intro_evidence) ref join public.evidence_items ev
                on (ev.id,ev.version) = ((ref.value->>'id')::uuid,(ref.value->>'version')::integer)
            where ev.state = 'withdrawn'
        )
        and a.state = 'published' and a.deleted_at is null and yeoback_private.publication_is_valid(p);
$$;

create function public.list_labels(p_exhibition_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare owner uuid := yeoback_private.require_owner();
begin
    perform yeoback_private.subject_scope(owner, 'exhibition', p_exhibition_id);
    return jsonb_build_object(
        'exhibitionId', p_exhibition_id,
        'path', '/exhibitions/' || p_exhibition_id,
        'artworks', coalesce((select jsonb_agg(jsonb_build_object(
            'artworkId', p.artwork_id, 'number', p.number, 'title', p.title,
            'path', '/exhibitions/' || p_exhibition_id || '/artworks/' || p.artwork_id
        ) order by p.number) from yeoback_private.public_artworks(p_exhibition_id) p), '[]'::jsonb)
    );
end;
$$;

create function yeoback_private.sync_publication_voice(p_required boolean)
returns void language plpgsql set search_path = '' as $$
begin
    if p_required is null then raise exception 'Invalid voice policy' using errcode = '22023'; end if;
    -- Lock even if the setting is unchanged: another deployment must not
    -- change the effective feature until this transaction has finished.
    perform 1 from public.app_features where key = 'voice_required' for update;
    if not found then raise exception 'Application feature unavailable' using errcode = 'P1003'; end if;
    update public.app_features set enabled = p_required
        where key = 'voice_required' and enabled is distinct from p_required;
end;
$$;

create function public.publish(p_owner uuid,p_exhibition_id uuid, p_request_id uuid, p_expected_revision integer,
    p_artworks jsonb, p_intro jsonb,p_voice_required boolean)
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
        select * into strict image from public.materials where id = artwork.image_material_id;
        audio := yeoback_private.ready_narration_audio(approval);
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
            artwork.medium,artwork.dimensions,image.storage_key,jsonb_build_object('schemaVersion',1,'items',snapshot),
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

create function yeoback_private.change_publication_state(p_owner uuid,p_exhibition_id uuid, p_expected_revision integer,
    p_artwork_id uuid, p_resume boolean,p_voice_required boolean)
returns jsonb language plpgsql set search_path = '' as $$
declare
    owner uuid := p_owner;
    exhibition public.exhibitions%rowtype;
    artwork public.artworks%rowtype;
    next_state text := case when p_resume then 'published' else 'paused' end;
    revision_result integer;
    artwork_state text;
    voice_required boolean;
begin
    perform yeoback_private.lock_publication(owner);
    if p_resume then
        perform yeoback_private.sync_publication_voice(p_voice_required);
        voice_required := yeoback_private.feature_enabled('voice_required');
    end if;
    select * into exhibition from public.exhibitions where id = p_exhibition_id and owner_id = owner and deleted_at is null for update;
    if not found then raise exception 'Subject not found' using errcode = 'P0002'; end if;
    if p_artwork_id is not null then
        select * into artwork from public.artworks where id = p_artwork_id and exhibition_id = p_exhibition_id
            and owner_id = owner and deleted_at is null for update;
        if not found then raise exception 'Subject not found' using errcode = 'P0002'; end if;
        if artwork.revision is distinct from p_expected_revision then
            raise exception 'Publication revision conflict' using errcode = '40001';
        end if;
        if artwork.active_publication_id is null or (p_resume and not exists (
            select 1 from public.publications p where p.id = artwork.active_publication_id
            and yeoback_private.publication_is_valid(p) and (not voice_required or p.audio_key is not null)
        )) then raise exception 'Publication cannot be resumed or paused' using errcode = '40001'; end if;
        update public.artworks set state = next_state, revision = revision + 1, updated_at = statement_timestamp()
            where id = p_artwork_id and state <> next_state;
        select revision,state into revision_result,artwork_state from public.artworks where id = p_artwork_id;
        if not p_resume and exhibition.state = 'published' and not exists (
            select 1 from yeoback_private.public_artworks(p_exhibition_id)
        ) then
            update public.exhibitions set state = 'paused',revision = revision + 1,updated_at = statement_timestamp()
                where id = p_exhibition_id returning * into exhibition;
        end if;
    else
        if exhibition.revision is distinct from p_expected_revision then
            raise exception 'Publication revision conflict' using errcode = '40001';
        end if;
        if exhibition.public_title is null or (p_resume and (
            exists (select 1 from jsonb_each(exhibition.intro_evidence) r
                where not exists (
                    select 1 from public.evidence_items e
                    where e.owner_id = owner and e.state = 'approved'
                      and (e.id,e.version) = ((r.value->>'id')::uuid,(r.value->>'version')::integer)
                ))
            or (voice_required and exists (
                select 1 from public.artworks a join public.publications p on p.id = a.active_publication_id
                where a.exhibition_id = p_exhibition_id and a.state = 'published' and a.deleted_at is null
                  and yeoback_private.publication_is_valid(p) and p.audio_key is null
            ))
            or not exists (
                select 1 from public.artworks a join public.publications p on p.id = a.active_publication_id
                where a.exhibition_id = p_exhibition_id and a.state = 'published' and a.deleted_at is null
                  and yeoback_private.publication_is_valid(p) and (not voice_required or p.audio_key is not null)
            )
        )) then raise exception 'Publication cannot be resumed or paused' using errcode = '40001'; end if;
        update public.exhibitions set state = next_state,revision = revision + 1,updated_at = statement_timestamp()
            where id = p_exhibition_id and state <> next_state;
        select * into strict exhibition from public.exhibitions where id = p_exhibition_id;
        revision_result := exhibition.revision;
    end if;
    return jsonb_build_object('exhibitionId',p_exhibition_id,'artworkId',p_artwork_id,
        'exhibitionState',exhibition.state,'state',coalesce(artwork_state,exhibition.state),'revision',revision_result);
end;
$$;

create function public.pause(p_exhibition_id uuid,p_expected_revision integer,p_artwork_id uuid default null)
returns jsonb language sql security definer set search_path = '' as $$
    select yeoback_private.change_publication_state(yeoback_private.require_owner(),p_exhibition_id,p_expected_revision,p_artwork_id,false,null);
$$;
create function public.resume(p_owner uuid,p_exhibition_id uuid,p_expected_revision integer,p_voice_required boolean,p_artwork_id uuid default null)
returns jsonb language sql security definer set search_path = '' as $$
    select yeoback_private.change_publication_state(p_owner,p_exhibition_id,p_expected_revision,p_artwork_id,true,p_voice_required);
$$;

create function yeoback_private.revoke_impact(p_owner uuid,p_source_key text)
returns jsonb language sql stable set search_path = '' as $$
    with matching as (
        select id,version from public.evidence_items e where e.owner_id = p_owner
        and yeoback_private.evidence_source_key(e) = p_source_key
    ), affected as (
        select e.id,
            coalesce((select jsonb_agg(a.id order by a.id) from public.artworks a
                join public.publications p on p.id = a.active_publication_id
                where a.exhibition_id = e.id and a.deleted_at is null and p.revoked_at is null
                and exists (
                    select 1 from public.publication_evidence_refs r join matching m
                    on (m.id,m.version) = (r.evidence_id,r.evidence_version) where r.publication_id = p.id
                )), '[]') as artwork_ids,
            exists (select 1 from jsonb_each(e.intro_evidence) i join matching m
                on (m.id,m.version) = ((i.value->>'id')::uuid,(i.value->>'version')::integer)) as intro_affected
        from public.exhibitions e where e.owner_id = p_owner and e.deleted_at is null
    )
    select coalesce(jsonb_agg(jsonb_build_object('exhibitionId',id,'artworkIds',artwork_ids,
        'introAffected',intro_affected) order by id), '[]')
    from affected where artwork_ids <> '[]' or intro_affected;
$$;

create function public.get_revoke_impact(p_evidence_id uuid,p_expected_version integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
    owner uuid := yeoback_private.require_owner();
    source_key text;
    affected jsonb;
begin
    select yeoback_private.evidence_source_key(e) into source_key from public.evidence_items e
        where e.owner_id = owner and e.id = p_evidence_id and e.version = p_expected_version;
    if not found then raise exception 'Evidence not found' using errcode = 'P0002'; end if;
    affected := yeoback_private.revoke_impact(owner,source_key);
    return jsonb_build_object('evidenceId',p_evidence_id,'version',p_expected_version,'exhibitions',affected,
        'token',encode(sha256(convert_to(jsonb_build_array(p_evidence_id,p_expected_version,affected)::text,'UTF8')),'hex'));
end;
$$;

create function public.revoke_evidence(p_evidence_id uuid,p_expected_version integer,p_impact_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    owner uuid := yeoback_private.require_owner();
    source_key text;
    impact jsonb;
    item jsonb;
begin
    perform yeoback_private.lock_publication(owner);
    impact := public.get_revoke_impact(p_evidence_id,p_expected_version);
    if p_impact_token is distinct from impact->>'token' then
        raise exception 'Evidence revocation impact changed' using errcode = '40001';
    end if;
    select yeoback_private.evidence_source_key(e) into strict source_key from public.evidence_items e
        where e.owner_id = owner and e.id = p_evidence_id and e.version = p_expected_version;
    insert into public.withdrawn_evidence_sources values (owner,source_key) on conflict do nothing;
    update public.evidence_items e set state = 'withdrawn',withdrawn_at = statement_timestamp()
        where e.owner_id = owner and yeoback_private.evidence_source_key(e) = source_key and e.state <> 'withdrawn';
    update public.publications p set revoked_at = statement_timestamp()
        where p.owner_id = owner and p.revoked_at is null and exists (
            select 1 from public.publication_evidence_refs r join public.evidence_items e
                on (e.id,e.version) = (r.evidence_id,r.evidence_version)
            where r.publication_id = p.id and e.owner_id = owner
              and yeoback_private.evidence_source_key(e) = source_key
        );
    for item in select value from jsonb_array_elements(impact->'exhibitions') loop
        update public.artworks a set state = 'paused',revision = revision + 1,updated_at = statement_timestamp()
            where a.owner_id = owner and a.state = 'published' and a.id in (
                select value::uuid from jsonb_array_elements_text(item->'artworkIds')
            );
        update public.exhibitions e set state = 'paused',revision = revision + 1,updated_at = statement_timestamp()
            where e.owner_id = owner and e.id = (item->>'exhibitionId')::uuid and e.state = 'published'
              and ((item->>'introAffected')::boolean or not exists (
                  select 1 from yeoback_private.public_artworks(e.id)
              ));
    end loop;
    return impact;
end;
$$;

create function public.load_publication_context(p_exhibition_id uuid,p_artwork_id uuid,p_number integer)
returns jsonb language sql stable security definer set search_path = '' as $$
    select jsonb_build_object('ownerId',p.owner_id,'exhibitionId',p.exhibition_id,'artworkId',p.artwork_id,
        'publicationId',p.id,'version',p.version,'number',p.number,'title',p.title,'evidence',p.evidence->'items',
        'narration',jsonb_build_object('text',p.narration_text,'citations',
            (select jsonb_agg(pin->'id' order by ord) from jsonb_array_elements(p.narration_citations) with ordinality x(pin,ord))))
    from yeoback_private.public_artworks(p_exhibition_id) p
    where p.evidence->>'schemaVersion' = '1' and
        ((p_artwork_id is not null and p_number is null and p.artwork_id = p_artwork_id)
        or (p_artwork_id is null and p_number is not null and p.number = p_number));
$$;

create function public.is_publication_current(p_exhibition_id uuid,p_artwork_id uuid,p_publication_id uuid,p_version integer)
returns boolean language sql stable security definer set search_path = '' as $$
    select exists(select 1 from yeoback_private.public_artworks(p_exhibition_id) p
        where p.artwork_id = p_artwork_id and p.id = p_publication_id and p.version = p_version);
$$;

-- Extend the owner-only review with the currently selected public intro pins.
alter function public.get_review_bundle(uuid) set schema yeoback_private;
revoke all on function yeoback_private.get_review_bundle(uuid) from public,anon,authenticated,service_role;
create function public.get_review_bundle(p_artwork_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
    select yeoback_private.get_review_bundle(p_artwork_id) || jsonb_build_object(
        'exhibitionPublicIntro', jsonb_build_object('bio',null,'introduction',null,'theme',null) ||
            coalesce((select e.intro_evidence from public.artworks a join public.exhibitions e on e.id = a.exhibition_id
                where a.id = p_artwork_id and a.owner_id = yeoback_private.require_owner()),'{}')
    );
$$;
revoke all on function public.get_review_bundle(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_review_bundle(uuid) to authenticated;

revoke all on function yeoback_private.sync_publication_voice(boolean),yeoback_private.require_publication_v1(),yeoback_private.evidence_source_key(public.evidence_items),
    yeoback_private.prevent_withdrawn_evidence(),yeoback_private.guard_public_number(),
    yeoback_private.publication_is_valid(public.publications),
    yeoback_private.change_publication_state(uuid,uuid,integer,uuid,boolean,boolean),yeoback_private.revoke_impact(uuid,text),
    public.publish(uuid,uuid,uuid,integer,jsonb,jsonb,boolean),public.pause(uuid,integer,uuid),public.resume(uuid,uuid,integer,boolean,uuid),
    public.list_labels(uuid),public.get_revoke_impact(uuid,integer),public.revoke_evidence(uuid,integer,text),
    public.load_publication_context(uuid,uuid,integer),public.is_publication_current(uuid,uuid,uuid,integer)
    from public,anon,authenticated,service_role;
grant execute on function public.pause(uuid,integer,uuid),
    public.list_labels(uuid),public.get_revoke_impact(uuid,integer),public.revoke_evidence(uuid,integer,text) to authenticated;
grant execute on function public.publish(uuid,uuid,uuid,integer,jsonb,jsonb,boolean),public.resume(uuid,uuid,integer,boolean,uuid),
    public.load_publication_context(uuid,uuid,integer),
    public.is_publication_current(uuid,uuid,uuid,integer) to service_role;
commit;
