begin;

insert into public.app_policies(key,value) values ('voice_config_version',1), ('evidence_body_chars',2000), ('evidence_label_chars',100);

create table public.app_features (
    key text primary key check (key ~ '^[a-z][a-z0-9_]{0,63}$'),
    enabled boolean not null
);
alter table public.app_features enable row level security;
revoke all on public.app_features from public,anon,authenticated;
grant select,insert,update,delete on public.app_features to service_role;
insert into public.app_features(key,enabled) values ('voice_required',true);

create table public.evidence_items (
    id uuid not null,
    version integer not null check (version > 0),
    owner_id uuid not null,
    exhibition_id uuid not null,
    artwork_id uuid,
    scope text not null check (scope in ('artist','exhibition','artwork')),
    source_label text not null check (char_length(source_label) between 1 and 200),
    body text not null check (char_length(body) between 1 and 8000),
    content_hash bytea not null check (content_hash = sha256(convert_to(body,'UTF8'))),
    state text not null default 'draft' check (state in ('draft','approved','withdrawn')),
    source_kind text not null check (source_kind in ('direct','document','material')),
    source_document_id uuid references public.knowledge_documents(id),
    source_section_id text,
    source_revision integer,
    material_id uuid references public.materials(id),
    material_version integer,
    page_start integer,
    page_end integer,
    created_at timestamptz not null default now(),
    approved_at timestamptz,
    withdrawn_at timestamptz,
    primary key (id,version),
    foreign key (owner_id,exhibition_id) references public.exhibitions(owner_id,id),
    foreign key (owner_id,exhibition_id,artwork_id) references public.artworks(owner_id,exhibition_id,id),
    check ((scope = 'artwork') = (artwork_id is not null)),
    check ((state = 'withdrawn') = (withdrawn_at is not null)),
    check (state <> 'approved' or approved_at is not null),
    check (case source_kind
        when 'direct' then num_nonnulls(source_document_id,source_section_id,source_revision,material_id,material_version,page_start,page_end) = 0
        when 'document' then num_nonnulls(source_document_id,source_section_id,source_revision) = 3
            and source_revision > 0 and num_nonnulls(material_id,material_version,page_start,page_end) = 0
        when 'material' then num_nonnulls(material_id,material_version,page_start,page_end) = 4
            and material_version > 0 and page_start > 0 and page_end >= page_start
            and num_nonnulls(source_document_id,source_section_id,source_revision) = 0
        else false end)
);
create index evidence_items_scope on public.evidence_items(owner_id,exhibition_id,artwork_id);
create index evidence_items_document on public.evidence_items(owner_id,source_document_id,source_section_id,source_revision)
    where source_document_id is not null;
create index evidence_items_material on public.evidence_items(owner_id,material_id,material_version)
    where material_id is not null;

create table public.narration_approvals (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null,
    exhibition_id uuid not null,
    artwork_id uuid not null,
    artwork_revision integer not null check (artwork_revision > 0),
    narration_text text not null check (char_length(narration_text) between 1 and 2000),
    text_hash bytea not null check (text_hash = sha256(convert_to(narration_text,'UTF8'))),
    citations jsonb not null check (jsonb_typeof(citations) = 'array' and jsonb_array_length(citations) between 1 and 12),
    approved_by uuid not null references auth.users(id) check (approved_by = owner_id),
    approved_at timestamptz not null default now(),
    unique (owner_id,exhibition_id,artwork_id,id),
    foreign key (owner_id,exhibition_id,artwork_id) references public.artworks(owner_id,exhibition_id,id)
);
create index narration_approvals_artwork on public.narration_approvals(owner_id,artwork_id,approved_at desc);

create table public.narration_approval_evidence (
    approval_id uuid not null references public.narration_approvals(id),
    evidence_id uuid not null,
    evidence_version integer not null,
    primary key (approval_id,evidence_id),
    foreign key (evidence_id,evidence_version) references public.evidence_items(id,version)
);

create table public.audio_assets (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null,
    exhibition_id uuid not null,
    artwork_id uuid not null,
    approval_id uuid not null,
    text_hash bytea not null check (octet_length(text_hash) = 32),
    voice_config_version integer not null check (voice_config_version > 0),
    storage_key text check (char_length(storage_key) between 1 and 512 and split_part(storage_key,'/',1) = owner_id::text),
    state text not null default 'pending' check (state in ('pending','ready','failed','revoked')),
    created_at timestamptz not null default now(),
    check (state <> 'ready' or storage_key is not null),
    foreign key (owner_id,exhibition_id,artwork_id,approval_id)
        references public.narration_approvals(owner_id,exhibition_id,artwork_id,id)
);
create index audio_assets_approval on public.audio_assets(approval_id,voice_config_version) where state = 'ready';

alter table public.evidence_items enable row level security;
alter table public.narration_approvals enable row level security;
alter table public.narration_approval_evidence enable row level security;
alter table public.audio_assets enable row level security;
revoke all on public.evidence_items, public.narration_approvals, public.narration_approval_evidence, public.audio_assets
    from public,anon,authenticated,service_role;

create function yeoback_private.lock_publication(p_owner uuid)
returns void language sql set search_path = '' as $$
    select pg_advisory_xact_lock(hashtextextended('yeobek:publication:'||p_owner::text,0));
$$;

create function yeoback_private.feature_enabled(p_key text)
returns boolean language plpgsql stable set search_path = '' as $$
declare value boolean;
begin
    select enabled into value from public.app_features where key = p_key;
    if not found then raise exception 'Application feature unavailable' using errcode = 'P1003'; end if;
    return value;
end;
$$;

create function yeoback_private.evidence_json(e public.evidence_items)
returns jsonb language sql stable strict set search_path = '' as $$
    select jsonb_build_object('id',e.id,'version',e.version,'exhibition_id',e.exhibition_id,
        'artwork_id',e.artwork_id,'scope',e.scope,'source_label',e.source_label,'body',e.body,
        'content_hash',encode(e.content_hash,'hex'),'state',e.state,
        'source',jsonb_strip_nulls(jsonb_build_object('kind',e.source_kind,
            'source_document_id',e.source_document_id,'source_section_id',e.source_section_id,
            'source_revision',e.source_revision,'material_id',e.material_id,'material_version',e.material_version,
            'page_start',e.page_start,'page_end',e.page_end)),
        'created_at',e.created_at,'approved_at',e.approved_at,'withdrawn_at',e.withdrawn_at);
$$;

create function yeoback_private.approval_json(a public.narration_approvals)
returns jsonb language sql stable strict set search_path = '' as $$
    select jsonb_build_object('id',a.id,'artwork_id',a.artwork_id,'artwork_revision',a.artwork_revision,
        'text',a.narration_text,'text_hash',encode(a.text_hash,'hex'),'citations',a.citations,
        'approved_by',a.approved_by,'approved_at',a.approved_at);
$$;

create function yeoback_private.evidence_scope(p_owner uuid,p_exhibition uuid,p_artwork uuid,p_scope text)
returns uuid language plpgsql stable set search_path = '' as $$
declare scope_ids uuid[];
begin
    scope_ids := yeoback_private.subject_scope(p_owner,'exhibition',p_exhibition);
    if p_scope = 'artist' and p_artwork is null then return scope_ids[1]; end if;
    if p_scope = 'exhibition' and p_artwork is null then return scope_ids[2]; end if;
    if p_scope = 'artwork' and p_artwork is not null then
        scope_ids := yeoback_private.subject_scope(p_owner,'artwork',p_artwork);
        if scope_ids[2] = p_exhibition then return scope_ids[3]; end if;
        raise exception 'Subject not found' using errcode = 'P0002';
    end if;
    raise exception 'Invalid evidence scope' using errcode = '22023';
end;
$$;

-- Revalidate mutable provenance before approving. Locks keep validation and
-- approval atomic while source editing uses the normal author RPCs.
create function yeoback_private.validate_evidence_source(e public.evidence_items,p_subject_id uuid)
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
end;
$$;

create function public.upsert_evidence(p_exhibition_id uuid,p_artwork_id uuid,p_scope text,p_source_label text,
    p_body text,p_source jsonb,p_evidence_id uuid default null,p_expected_version integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    owner uuid := yeoback_private.require_owner();
    subject_id uuid;
    head public.evidence_items%rowtype;
    entry public.evidence_items%rowtype;
begin
    perform yeoback_private.lock_publication(owner);
    subject_id := yeoback_private.evidence_scope(owner,p_exhibition_id,p_artwork_id,p_scope);
    if (p_evidence_id is null) <> (p_expected_version is null)
        or p_source_label is null or p_source_label !~ '[^[:space:]]' or char_length(p_source_label) > least(200,yeoback_private.policy_integer('evidence_label_chars'))
        or p_body is null or p_body !~ '[^[:space:]]' or char_length(p_body) > least(8000,yeoback_private.policy_integer('evidence_body_chars'))
        or jsonb_typeof(p_source) is distinct from 'object' then
        raise exception 'Invalid evidence input' using errcode = '22023';
    end if;
    if p_evidence_id is not null then
        select * into head from public.evidence_items e where e.owner_id = owner and e.id = p_evidence_id
            order by version desc limit 1 for update;
        if not found or head.exhibition_id <> p_exhibition_id or head.artwork_id is distinct from p_artwork_id
            or head.scope <> p_scope then raise exception 'Evidence not found' using errcode = 'P0002'; end if;
        if head.version <> p_expected_version then raise exception 'Evidence version conflict' using errcode = '40001'; end if;
    end if;
    entry.id := coalesce(p_evidence_id,gen_random_uuid());
    entry.version := coalesce(head.version + 1,1);
    entry.owner_id := owner;
    entry.exhibition_id := p_exhibition_id;
    entry.artwork_id := p_artwork_id;
    entry.scope := p_scope;
    entry.source_label := p_source_label;
    entry.body := p_body;
    entry.content_hash := sha256(convert_to(p_body,'UTF8'));
    entry.source_kind := p_source->>'kind';
    case entry.source_kind
        when 'direct' then
            if p_source - 'kind' <> '{}'::jsonb then raise exception 'Invalid direct source' using errcode = '22023'; end if;
        when 'document' then
            if p_source - array['kind','source_document_id','source_section_id','source_revision'] <> '{}'::jsonb
                or jsonb_typeof(p_source->'source_document_id') is distinct from 'string'
                or jsonb_typeof(p_source->'source_section_id') is distinct from 'string'
                or jsonb_typeof(p_source->'source_revision') is distinct from 'number' then
                raise exception 'Invalid document source' using errcode = '22023';
            end if;
            entry.source_document_id := (p_source->>'source_document_id')::uuid;
            entry.source_section_id := p_source->>'source_section_id';
            entry.source_revision := (p_source->>'source_revision')::integer;
        when 'material' then
            if p_source - array['kind','material_id','page_start','page_end'] <> '{}'::jsonb
                or jsonb_typeof(p_source->'material_id') is distinct from 'string'
                or jsonb_typeof(p_source->'page_start') is distinct from 'number'
                or jsonb_typeof(p_source->'page_end') is distinct from 'number' then
                raise exception 'Invalid PDF source' using errcode = '22023';
            end if;
            entry.material_id := (p_source->>'material_id')::uuid;
            entry.page_start := (p_source->>'page_start')::integer;
            entry.page_end := (p_source->>'page_end')::integer;
            if entry.page_start < 1 or entry.page_end < entry.page_start then
                raise exception 'Invalid PDF page range' using errcode = '22023';
            end if;
            select m.version into entry.material_version from public.materials m
                where m.owner_id = owner and m.id = entry.material_id for share;
        else raise exception 'Invalid evidence source kind' using errcode = '22023';
    end case;
    perform yeoback_private.validate_evidence_source(entry,subject_id);
    insert into public.evidence_items(id,version,owner_id,exhibition_id,artwork_id,scope,source_label,body,content_hash,
        source_kind,source_document_id,source_section_id,source_revision,material_id,material_version,page_start,page_end)
    values (entry.id,entry.version,entry.owner_id,entry.exhibition_id,entry.artwork_id,entry.scope,entry.source_label,
        entry.body,entry.content_hash,entry.source_kind,entry.source_document_id,entry.source_section_id,
        entry.source_revision,entry.material_id,entry.material_version,entry.page_start,entry.page_end)
    returning * into entry;
    return yeoback_private.evidence_json(entry);
end;
$$;

create function public.approve_evidence(p_evidence_id uuid,p_version integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    owner uuid := yeoback_private.require_owner();
    entry public.evidence_items%rowtype;
    subject_id uuid;
begin
    perform yeoback_private.lock_publication(owner);
    select * into entry from public.evidence_items e where e.owner_id = owner and e.id = p_evidence_id
        order by version desc limit 1 for update;
    if not found then raise exception 'Evidence not found' using errcode = 'P0002'; end if;
    subject_id := yeoback_private.evidence_scope(owner,entry.exhibition_id,entry.artwork_id,entry.scope);
    if p_version is null or entry.version <> p_version then raise exception 'Evidence version conflict' using errcode = '40001'; end if;
    if entry.state = 'withdrawn' then raise exception 'Evidence source unavailable' using errcode = 'P1002'; end if;
    perform yeoback_private.validate_evidence_source(entry,subject_id);
    if entry.state = 'draft' then
        update public.evidence_items e set state = 'approved',approved_at = statement_timestamp()
            where e.id = entry.id and e.version = entry.version returning * into entry;
    end if;
    return yeoback_private.evidence_json(entry);
end;
$$;

-- The published snapshot keeps pinned revisions. New approvals and publications
-- must use current source revisions and the latest approved evidence versions.
create function yeoback_private.evidence_is_current(e public.evidence_items)
returns boolean language sql stable strict set search_path = '' as $$
    select e.state = 'approved'
        and not exists (select 1 from public.evidence_items newer where newer.id = e.id and newer.version > e.version)
        and case e.source_kind
            when 'direct' then true
            when 'document' then exists (select 1 from public.knowledge_documents d
                where d.id = e.source_document_id and d.owner_id = e.owner_id and d.revision = e.source_revision)
            when 'material' then exists (select 1 from public.materials m where m.id = e.material_id
                and m.owner_id = e.owner_id and m.version = e.material_version and m.state = 'ready')
            else false end;
$$;

create function public.approve_narration(p_artwork_id uuid,p_expected_revision integer,p_citations jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    owner uuid := yeoback_private.require_owner();
    artwork public.artworks%rowtype;
    entry public.evidence_items%rowtype;
    approval public.narration_approvals%rowtype;
    citation jsonb;
    cited_id uuid;
    cited_version integer;
    cited_ids uuid[] := '{}';
    subject_id uuid;
    scope_ids uuid[];
begin
    perform yeoback_private.lock_publication(owner);
    scope_ids := yeoback_private.subject_scope(owner,'artwork',p_artwork_id);
    perform 1 from public.exhibitions where id = scope_ids[2] and owner_id = owner and deleted_at is null for share;
    if not found then raise exception 'Subject not found' using errcode = 'P0002'; end if;
    select * into artwork from public.artworks a where a.id = p_artwork_id and a.owner_id = owner and a.deleted_at is null for share;
    if not found then raise exception 'Subject not found' using errcode = 'P0002'; end if;
    if p_expected_revision is distinct from artwork.revision then
        raise exception 'Narration revision conflict' using errcode = '40001';
    end if;
    if artwork.narration_draft is null or artwork.narration_draft !~ '[^[:space:]]'
        or jsonb_typeof(p_citations) is distinct from 'array' then
        raise exception 'Invalid narration approval' using errcode = '22023';
    end if;
    if jsonb_array_length(p_citations) not between 1 and 12 then
        raise exception 'Narration requires approved citations' using errcode = '22023';
    end if;
    for citation in select value from jsonb_array_elements(p_citations) loop
        if jsonb_typeof(citation) <> 'object' or citation - array['id','version'] <> '{}'::jsonb
            or jsonb_typeof(citation->'id') is distinct from 'string'
            or jsonb_typeof(citation->'version') is distinct from 'number' then
            raise exception 'Invalid narration citation' using errcode = '22023';
        end if;
        cited_id := (citation->>'id')::uuid;
        cited_version := (citation->>'version')::integer;
        if cited_id = any(cited_ids) then raise exception 'Duplicate narration citation' using errcode = '22023'; end if;
        cited_ids := array_append(cited_ids,cited_id);
        select * into entry from public.evidence_items e where e.id = cited_id and e.version = cited_version
            and e.owner_id = owner and e.exhibition_id = artwork.exhibition_id
            and (e.artwork_id is null or e.artwork_id = artwork.id) for share;
        if not found or not yeoback_private.evidence_is_current(entry) then
            raise exception 'Approved evidence unavailable' using errcode = 'P1002';
        end if;
        subject_id := case entry.scope when 'artist' then scope_ids[1] when 'exhibition' then scope_ids[2] else scope_ids[3] end;
        perform yeoback_private.validate_evidence_source(entry,subject_id);
    end loop;

    select * into approval from public.narration_approvals a
        where a.owner_id = owner and a.artwork_id = artwork.id order by a.approved_at desc,a.id desc limit 1;
    if found and approval.artwork_revision = artwork.revision and approval.citations = p_citations then
        return yeoback_private.approval_json(approval);
    end if;
    insert into public.narration_approvals(owner_id,exhibition_id,artwork_id,artwork_revision,narration_text,
        text_hash,citations,approved_by,approved_at)
    values (owner,artwork.exhibition_id,artwork.id,artwork.revision,artwork.narration_draft,
        sha256(convert_to(artwork.narration_draft,'UTF8')),p_citations,owner,clock_timestamp())
    returning * into approval;
    insert into public.narration_approval_evidence(approval_id,evidence_id,evidence_version)
        select approval.id,(c->>'id')::uuid,(c->>'version')::integer from jsonb_array_elements(p_citations) c;
    return yeoback_private.approval_json(approval);
end;
$$;

create function yeoback_private.current_narration_approval(p_owner uuid,p_artwork uuid)
returns public.narration_approvals language plpgsql stable set search_path = '' as $$
declare
    approval public.narration_approvals%rowtype;
begin
    select n.* into approval from public.narration_approvals n
        where n.owner_id = p_owner and n.artwork_id = p_artwork order by n.approved_at desc,n.id desc limit 1;
    if not found or not exists (select 1 from public.artworks a where a.id = p_artwork and a.owner_id = p_owner
        and a.deleted_at is null
        and sha256(convert_to(a.narration_draft,'UTF8')) = approval.text_hash)
        or exists (select 1 from public.narration_approval_evidence c join public.evidence_items e
            on e.id = c.evidence_id and e.version = c.evidence_version
            where c.approval_id = approval.id and not yeoback_private.evidence_is_current(e)) then
        return null;
    end if;
    return approval;
end;
$$;

create function yeoback_private.ready_narration_audio(p_approval public.narration_approvals)
returns public.audio_assets language sql stable strict set search_path = '' as $$
    select a.* from public.audio_assets a where a.approval_id = p_approval.id
        and a.state = 'ready' and a.text_hash = p_approval.text_hash
        and a.voice_config_version = yeoback_private.policy_integer('voice_config_version')
        order by a.created_at desc,a.id desc limit 1;
$$;

create function yeoback_private.publication_rules(p_owner uuid,p_artwork uuid)
returns text[] language plpgsql stable set search_path = '' as $$
declare
    artwork public.artworks%rowtype;
    approval public.narration_approvals%rowtype;
    audio public.audio_assets%rowtype;
    missing text[];
    evidence_count bigint;
begin
    perform yeoback_private.subject_scope(p_owner,'artwork',p_artwork);
    select * into strict artwork from public.artworks where id = p_artwork and owner_id = p_owner;
    approval := yeoback_private.current_narration_approval(p_owner,p_artwork);
    audio := yeoback_private.ready_narration_audio(approval);
    select count(*) into evidence_count from public.evidence_items e where e.owner_id = p_owner
        and e.exhibition_id = artwork.exhibition_id and (e.artwork_id is null or e.artwork_id = artwork.id)
        and yeoback_private.evidence_is_current(e);
    select coalesce(array_agg(code order by ord),'{}') into missing from (
        values
            (1,'TITLE_REQUIRED',artwork.title !~ '[^[:space:]]'),
            (2,'NUMBER_CONFLICT',exists (select 1 from public.artworks other
                join public.publications p on p.id = other.active_publication_id
                where other.owner_id = p_owner and other.exhibition_id = artwork.exhibition_id
                and other.id <> artwork.id and other.deleted_at is null
                and p.revoked_at is null and p.number = artwork.number)),
            (3,'IMAGE_REQUIRED',not exists (select 1 from public.materials m where m.id = artwork.image_material_id
                and m.owner_id = p_owner and m.artwork_id = artwork.id and m.kind = 'image'
                and m.state = 'ready' and m.storage_key is not null)),
            (4,'EVIDENCE_REQUIRED',evidence_count = 0),
            (5,'EVIDENCE_LIMIT',evidence_count > 100),
            (6,'NARRATION_APPROVAL_REQUIRED',approval.id is null),
            (7,'AUDIO_REQUIRED',yeoback_private.feature_enabled('voice_required') and audio.id is null)
    ) as rules(ord,code,blocked) where blocked;
    return missing;
end;
$$;

create function public.get_review_bundle(p_artwork_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
    owner uuid := yeoback_private.require_owner();
    scope_ids uuid[] := yeoback_private.subject_scope(owner,'artwork',p_artwork_id);
    artwork public.artworks%rowtype;
    approval public.narration_approvals%rowtype;
    audio public.audio_assets%rowtype;
    publication public.publications%rowtype;
    evidence jsonb;
begin
    select * into strict artwork from public.artworks where id = p_artwork_id and owner_id = owner;
    approval := yeoback_private.current_narration_approval(owner,p_artwork_id);
    audio := yeoback_private.ready_narration_audio(approval);
    select * into publication from public.publications p where p.id = artwork.active_publication_id and p.owner_id = owner;
    select coalesce(jsonb_agg(yeoback_private.evidence_json(e) order by e.scope,e.created_at,e.id),'[]') into evidence
        from public.evidence_items e where e.owner_id = owner and e.exhibition_id = scope_ids[2]
        and (e.artwork_id is null or e.artwork_id = p_artwork_id)
        and not exists (select 1 from public.evidence_items newer where newer.id = e.id and newer.version > e.version);
    return jsonb_build_object('artwork',yeoback_private.artwork_json(artwork),'evidence',evidence,
        'approval',case when approval.id is not null then yeoback_private.approval_json(approval) end,
        'audio',case when audio.id is not null then jsonb_build_object('id',audio.id,'state',audio.state,
            'approval_id',audio.approval_id,'voice_config_version',audio.voice_config_version,
            'text_hash',encode(audio.text_hash,'hex'),'created_at',audio.created_at) end,
        'publication',case when publication.id is not null then jsonb_build_object('id',publication.id,
            'version',publication.version,'number',publication.number,'approved_at',publication.approved_at,
            'revoked_at',publication.revoked_at) end,
        'blocking_codes',yeoback_private.publication_rules(owner,p_artwork_id));
end;
$$;

revoke all on function yeoback_private.lock_publication(uuid),yeoback_private.feature_enabled(text),
    yeoback_private.evidence_json(public.evidence_items),yeoback_private.approval_json(public.narration_approvals),
    yeoback_private.evidence_scope(uuid,uuid,uuid,text),yeoback_private.validate_evidence_source(public.evidence_items,uuid),
    yeoback_private.evidence_is_current(public.evidence_items),yeoback_private.current_narration_approval(uuid,uuid),
    yeoback_private.ready_narration_audio(public.narration_approvals),yeoback_private.publication_rules(uuid,uuid)
    from public,anon,authenticated,service_role;
revoke all on function public.upsert_evidence(uuid,uuid,text,text,text,jsonb,uuid,integer),
    public.approve_evidence(uuid,integer),public.approve_narration(uuid,integer,jsonb),public.get_review_bundle(uuid)
    from public,anon,authenticated,service_role;
grant execute on function public.upsert_evidence(uuid,uuid,text,text,text,jsonb,uuid,integer),
    public.approve_evidence(uuid,integer),public.approve_narration(uuid,integer,jsonb),public.get_review_bundle(uuid)
    to authenticated;

commit;
