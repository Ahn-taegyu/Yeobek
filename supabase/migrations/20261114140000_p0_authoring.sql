begin;

alter table public.exhibitions alter column title drop not null,
    add column authoring_step text check (authoring_step in ('basic','world','artworks')),
    add column start_time time without time zone check (start_time < time '24:00' and extract(second from start_time)=0),
    add column end_time time without time zone check (end_time < time '24:00' and extract(second from end_time)=0),
    add constraint exhibitions_legacy_title check (authoring_step is not null or title is not null);
alter table public.artworks alter column title drop not null,
    add column dimensions_unit text check (char_length(dimensions_unit) between 1 and 20),
    add column draft_number integer check (draft_number between 1 and 9999),
    add column active_draft_number integer generated always as
        (case when deleted_at is null then coalesce(draft_number,number) end) stored,
    add constraint artworks_active_draft_number_key unique(exhibition_id,active_draft_number) deferrable initially immediate,
    add constraint artworks_legacy_title check (draft_number is not null or title is not null);

do $$
declare constraint_name name;
begin
    select conname into strict constraint_name from pg_constraint
    where conrelid = 'public.exhibitions'::regclass and contype = 'c'
        and pg_get_constraintdef(oid) like '%num_nonnulls(start_date, end_date)%';
    execute format('alter table public.exhibitions drop constraint %I',constraint_name);
end;
$$;

alter table public.exhibitions add constraint exhibitions_draft_dates check (
    (start_date is null or isfinite(start_date)) and (end_date is null or isfinite(end_date))
    and (authoring_step is not null or
        ((start_date is null and end_date is null) or
            (start_date is not null and end_date is not null and start_date <= end_date)))
);

create function yeoback_private.authoring_time(p_value text)
returns time without time zone language plpgsql immutable strict set search_path = '' as $$
begin
    if p_value !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or char_length(p_value) <> 5 then
        raise exception 'Invalid exhibition time' using errcode = '22023';
    end if;
    return p_value::time;
end;
$$;

create function yeoback_private.exhibition_authoring_blockers(e public.exhibitions)
returns jsonb language sql immutable strict set search_path = '' as $$
    select coalesce(jsonb_agg(jsonb_build_object('code',code,'field',field) order by sequence),'[]')
    from (values
        (1,'TITLE_REQUIRED','title',e.title is null),
        (2,'START_DATE_REQUIRED','startDate',e.start_date is null),
        (3,'START_TIME_REQUIRED','startTime',e.start_time is null),
        (4,'END_DATE_REQUIRED','endDate',e.end_date is null),
        (5,'END_TIME_REQUIRED','endTime',e.end_time is null),
        (6,'PLACE_REQUIRED','place',e.place is null or e.place !~ '[^[:space:]]'),
        (7,'INVALID_PERIOD','endDate',e.start_date + e.start_time > e.end_date + e.end_time)
    ) as rules(sequence,code,field,blocked) where blocked;
$$;

create function public.create_exhibition_draft(p_id uuid,p_title text,p_start_date date,p_end_date date,
    p_start_time text,p_end_time text,p_place text,p_sections jsonb,p_source_refs jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    owner uuid := yeoback_private.require_owner();
    artist uuid := yeoback_private.ensure_artist(owner);
    title text := yeoback_private.optional_text(p_title);
    place text := yeoback_private.optional_text(p_place);
    starts time := yeoback_private.authoring_time(p_start_time);
    ends time := yeoback_private.authoring_time(p_end_time);
    fingerprint bytea := sha256(convert_to(jsonb_build_array('draft-v1',title,p_start_date,p_end_date,
        starts,ends,place,p_sections,p_source_refs)::text,'UTF8'));
    exhibition public.exhibitions;
    created boolean;
begin
    insert into public.exhibitions(id,owner_id,artist_id,title,start_date,end_date,start_time,end_time,place,
        authoring_step,create_fingerprint)
    values(p_id,owner,artist,title,p_start_date,p_end_date,starts,ends,place,'basic',fingerprint)
    on conflict(id) do nothing returning * into exhibition;
    created := found;
    if created then
        perform yeoback_private.add_document(owner,'exhibition',p_id,p_sections,p_source_refs);
    else
        select * into exhibition from public.exhibitions where id=p_id and owner_id=owner and deleted_at is null;
        if not found then raise exception 'Exhibition not found' using errcode = 'P0002'; end if;
        if exhibition.create_fingerprint <> fingerprint then
            raise exception 'Exhibition creation ID already used with different input' using errcode = '23505';
        end if;
    end if;
    return yeoback_private.exhibition_json(exhibition) || jsonb_build_object('_created',created);
end;
$$;

create function public.update_exhibition_draft(p_id uuid,p_expected_revision integer,p_title text,p_start_date date,
    p_end_date date,p_start_time text,p_end_time text,p_place text,p_expected_document_revision integer,
    p_sections jsonb,p_source_refs jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    owner uuid := yeoback_private.require_owner();
    e public.exhibitions%rowtype;
begin
    perform yeoback_private.subject_scope(owner,'exhibition',p_id);
    update public.exhibitions set title=yeoback_private.optional_text(p_title),start_date=p_start_date,end_date=p_end_date,
        start_time=yeoback_private.authoring_time(p_start_time),end_time=yeoback_private.authoring_time(p_end_time),
        place=yeoback_private.optional_text(p_place),revision=revision+1,updated_at=statement_timestamp()
    where id=p_id and owner_id=owner and deleted_at is null and authoring_step is not null and revision=p_expected_revision
    returning * into e;
    if not found then raise exception 'Exhibition revision conflict' using errcode = '40001'; end if;
    perform yeoback_private.save_document(owner,'exhibition',p_id,p_expected_document_revision,p_sections,p_source_refs);
    return yeoback_private.exhibition_json(e);
end;
$$;

create function public.advance_exhibition_step(p_id uuid,p_expected_revision integer,p_step text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    owner uuid := yeoback_private.require_owner();
    e public.exhibitions%rowtype;
    blockers jsonb;
begin
    if p_step is null or p_step not in ('world','artworks') then
        raise exception 'Invalid exhibition step' using errcode = '22023';
    end if;
    select * into e from public.exhibitions where id=p_id and owner_id=owner and deleted_at is null for update;
    if not found then raise exception 'Exhibition not found' using errcode = 'P0002'; end if;
    if e.revision is distinct from p_expected_revision or e.authoring_step is distinct from
        (case p_step when 'world' then 'basic' else 'world' end) then
        raise exception 'Exhibition step conflict' using errcode = '40001';
    end if;
    blockers := yeoback_private.exhibition_authoring_blockers(e);
    if blockers <> '[]' then
        return jsonb_build_object('advanced',false,'exhibition',yeoback_private.exhibition_json(e),'blockers',blockers);
    end if;
    update public.exhibitions set authoring_step=p_step,revision=revision+1,updated_at=statement_timestamp()
    where id=p_id returning * into e;
    return jsonb_build_object('advanced',true,'exhibition',yeoback_private.exhibition_json(e),'blockers','[]'::jsonb);
end;
$$;

create function public.create_artwork_draft(p_id uuid,p_exhibition_id uuid,p_number integer,p_title text,p_creation_year text,
    p_medium text,p_dimensions text,p_dimensions_unit text,p_sections jsonb,p_source_refs jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    owner uuid := yeoback_private.require_owner();
    title text := yeoback_private.optional_text(p_title);
    creation_year text := yeoback_private.optional_text(p_creation_year);
    medium text := yeoback_private.optional_text(p_medium);
    dimensions text := yeoback_private.optional_text(p_dimensions);
    unit text := yeoback_private.optional_text(p_dimensions_unit);
    fingerprint bytea := sha256(convert_to(jsonb_build_array('draft-v1',p_exhibition_id,p_number,title,creation_year,
        medium,dimensions,unit,p_sections,p_source_refs)::text,'UTF8'));
    a public.artworks%rowtype;
    draft_slot integer;
    legacy_slot integer;
    created boolean := false;
begin
    perform 1 from public.exhibitions where id=p_exhibition_id and owner_id=owner and deleted_at is null for update;
    if not found then raise exception 'Subject not found' using errcode = 'P0002'; end if;
    select * into a from public.artworks where id=p_id;
    if not found then
        select coalesce(p_number,min(n)) into draft_slot from generate_series(1,9999) n
        where not exists(select 1 from public.artworks where exhibition_id=p_exhibition_id and active_draft_number=n);
        select n into legacy_slot from generate_series(1,9999) n where not exists(
            select 1 from public.artworks x left join public.publications p on p.id=x.active_publication_id and p.revoked_at is null
            where x.exhibition_id=p_exhibition_id and x.deleted_at is null and (x.number=n or p.number=n))
            order by (n=draft_slot) desc,n limit 1;
        if draft_slot is null or legacy_slot is null then
            raise exception 'Artwork number capacity reached' using errcode = '22023';
        end if;
        insert into public.artworks(id,owner_id,exhibition_id,number,draft_number,title,creation_year,medium,dimensions,
            dimensions_unit,create_fingerprint)
        values(p_id,owner,p_exhibition_id,legacy_slot,draft_slot,title,creation_year,medium,dimensions,unit,fingerprint)
        on conflict(id) do nothing returning * into a;
        created := found;
        if created then
            perform yeoback_private.add_document(owner,'artwork',p_id,p_sections,p_source_refs);
        else
            select * into a from public.artworks where id=p_id;
        end if;
    end if;
    if a.id is null or a.owner_id <> owner or a.deleted_at is not null then
        raise exception 'Artwork not found' using errcode = 'P0002';
    end if;
    if a.create_fingerprint <> fingerprint then
        raise exception 'Artwork creation ID already used with different input' using errcode = '23505';
    end if;
    return yeoback_private.artwork_json(a) || jsonb_build_object('_created',created);
end;
$$;

create function public.update_artwork_draft(p_id uuid,p_expected_revision integer,p_number integer,p_title text,
    p_creation_year text,p_medium text,p_dimensions text,p_dimensions_unit text,p_expected_document_revision integer,
    p_sections jsonb,p_source_refs jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    owner uuid := yeoback_private.require_owner();
    a public.artworks%rowtype;
begin
    perform 1 from public.exhibitions e join public.artworks x on x.exhibition_id=e.id and x.owner_id=e.owner_id
    where x.id=p_id and x.owner_id=owner and x.deleted_at is null and e.deleted_at is null for update of e;
    if not found then raise exception 'Subject not found' using errcode = 'P0002'; end if;
    update public.artworks x set title=yeoback_private.optional_text(p_title),
        draft_number=coalesce(p_number,x.draft_number,x.number),creation_year=yeoback_private.optional_text(p_creation_year),
        medium=yeoback_private.optional_text(p_medium),dimensions=yeoback_private.optional_text(p_dimensions),
        dimensions_unit=yeoback_private.optional_text(p_dimensions_unit),revision=x.revision+1,updated_at=statement_timestamp()
    where x.id=p_id and x.owner_id=owner and x.deleted_at is null and x.revision=p_expected_revision
    returning * into a;
    if not found then raise exception 'Artwork revision conflict' using errcode = '40001'; end if;
    perform yeoback_private.save_document(owner,'artwork',p_id,p_expected_document_revision,p_sections,p_source_refs);
    return yeoback_private.artwork_json(a);
end;
$$;

create function public.reorder_artworks(p_exhibition_id uuid,p_items jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    owner uuid := yeoback_private.require_owner();
    item jsonb;
begin
    if jsonb_typeof(p_items) is distinct from 'array' then
        raise exception 'Invalid artwork order' using errcode='22023';
    end if;
    if jsonb_array_length(p_items) not between 1 and 9999 then
        raise exception 'Invalid artwork order' using errcode='22023';
    end if;
    for item in select value from jsonb_array_elements(p_items) loop
        if jsonb_typeof(item) is distinct from 'object' or item - array['id','expected_revision'] <> '{}'
            or jsonb_typeof(item->'id') is distinct from 'string'
            or item->>'id' !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
            or jsonb_typeof(item->'expected_revision') is distinct from 'number'
            or item->>'expected_revision' !~ '^[1-9][0-9]{0,9}$'
            or (item->>'expected_revision')::numeric > 2147483647 then
            raise exception 'Invalid artwork order item' using errcode='22023';
        end if;
    end loop;
    if (select count(distinct (value->>'id')::uuid) from jsonb_array_elements(p_items)) <> jsonb_array_length(p_items) then
        raise exception 'Duplicate artwork order item' using errcode='22023';
    end if;
    perform 1 from public.exhibitions where id=p_exhibition_id and owner_id=owner and deleted_at is null for update;
    if not found then raise exception 'Exhibition not found' using errcode='P0002'; end if;
    perform 1 from public.artworks x where x.exhibition_id=p_exhibition_id and x.owner_id=owner and x.deleted_at is null order by x.id for update;
    if (select count(*) from public.artworks where exhibition_id=p_exhibition_id and owner_id=owner and deleted_at is null)
        <> jsonb_array_length(p_items) or exists (
        select 1 from jsonb_array_elements(p_items) s where not exists (
            select 1 from public.artworks x where x.id=(s.value->>'id')::uuid and x.exhibition_id=p_exhibition_id
                and x.owner_id=owner and x.deleted_at is null and x.revision=(s.value->>'expected_revision')::integer)) then
        raise exception 'Artwork order revision conflict' using errcode='40001';
    end if;
    set constraints public.artworks_active_draft_number_key deferred;
    update public.artworks x set draft_number=s.ordinality::integer,revision=x.revision+1,updated_at=statement_timestamp()
    from jsonb_array_elements(p_items) with ordinality s
    where x.id=(s.value->>'id')::uuid and x.active_draft_number<>s.ordinality;
    set constraints public.artworks_active_draft_number_key immediate;
    return jsonb_build_object('items',coalesce((
        select jsonb_agg(yeoback_private.artwork_json(x) order by s.ordinality)
        from jsonb_array_elements(p_items) with ordinality s join public.artworks x on x.id=(s.value->>'id')::uuid),'[]'));
end;
$$;

-- Catalog seed is generated from src/lib/contracts/knowledge-sections.ts.
create table yeoback_private.knowledge_section_catalog (
    subject_type text not null,
    section_id text not null,
    max_length integer not null check (max_length > 0),
    required boolean not null,
    primary key(subject_type,section_id)
);
revoke all on yeoback_private.knowledge_section_catalog from public,anon,authenticated,service_role;
insert into yeoback_private.knowledge_section_catalog(subject_type,section_id,max_length,required)
select c.key,s.value->>'id',(s.value->>'maxLength')::integer,(s.value->>'required')::boolean from jsonb_each(
-- section-catalog:start
$section_catalog${"artist":[{"id":"bio","label":"작가 소개","prompt":"작가를 소개해 주세요.","group":"legacy","required":false,"maxLength":5000},{"id":"practice","label":"기본 작품 세계","prompt":"기본 작품 세계를 설명해 주세요.","group":"legacy","required":false,"maxLength":5000},{"id":"artist_motivation","label":"작업 계기","prompt":"작품 활동을 시작하게 된 계기는 무엇인가요?","group":"artist","required":false,"maxLength":5000},{"id":"artist_interests","label":"핵심 관심사","prompt":"작품 활동을 통해 지속적으로 탐구하는 주제나 관심사는 무엇인가요?","group":"artist","required":false,"maxLength":5000},{"id":"artist_philosophy","label":"예술관 및 철학","prompt":"작품을 만들 때 가장 중요하게 생각하는 가치나 철학은 무엇인가요?","group":"artist","required":false,"maxLength":5000},{"id":"artist_methods","label":"표현 방식","prompt":"주로 사용하는 재료, 기법 또는 표현 방식은 무엇인가요?","group":"artist","required":false,"maxLength":5000},{"id":"artist_method_reason","label":"표현 방식","prompt":"위 표현 방식을 선택한 이유는 무엇인가요?","group":"artist","required":false,"maxLength":5000},{"id":"artist_inspiration","label":"영감의 원천","prompt":"작품의 아이디어나 영감은 주로 어디에서 얻으시나요?","group":"artist","required":false,"maxLength":5000},{"id":"artist_audience","label":"소통","prompt":"관람객이 작가의 작품을 통해 어떤 경험을 하거나 질문을 떠올리기를 바라시나요?","group":"artist","required":false,"maxLength":5000}],"exhibition":[{"id":"introduction","label":"전시 소개","prompt":"전시를 소개해 주세요.","group":"legacy","required":false,"maxLength":5000},{"id":"theme","label":"전시 주제","prompt":"전시 주제를 설명해 주세요.","group":"legacy","required":false,"maxLength":5000},{"id":"exhibition_background","label":"전시 기획 배경","prompt":"이번 전시를 기획하게 된 계기나 배경은 무엇인가요?","group":"exhibition_basic","required":false,"maxLength":5000},{"id":"exhibition_layout","label":"전시 구성","prompt":"전시 공간이나 작품의 배치에 특별한 의도가 있나요?","group":"exhibition_basic","required":false,"maxLength":5000},{"id":"exhibition_guidance","label":"관람 안내","prompt":"관람객이 알아야 할 특별한 안내 사항이 있나요?","group":"exhibition_basic","required":false,"maxLength":5000},{"id":"exhibition_focus","label":"핵심주제","prompt":"이번 전시에서 특별히 집중하거나 탐구하는 주제는 무엇인가요?","group":"exhibition_world","required":false,"maxLength":5000},{"id":"exhibition_connection","label":"기존 작품세계와의 연결","prompt":"이번 전시는 작가님의 기존 작품세계와 어떤 관계가 있나요?","group":"exhibition_world","required":false,"maxLength":5000},{"id":"exhibition_message","label":"전달 메시지","prompt":"이번 전시를 통해 관람객에게 가장 전달하고 싶은 메시지는 무엇인가요","group":"exhibition_world","required":false,"maxLength":5000},{"id":"exhibition_distinction","label":"전시의 차별점","prompt":"이전 작업이나 전시와 비교했을 때 이번 전시만의 특징은 무엇인가요?","group":"exhibition_world","required":false,"maxLength":5000},{"id":"exhibition_viewpoint","label":"감상 관점","prompt":"관람객이 이번 전시를 감상할 때 특별히 주목했으면 하는 부분이 있나요?","group":"exhibition_world","required":false,"maxLength":5000},{"id":"exhibition_experience","label":"감정 및 경험","prompt":"관람객이 전시를 관람하면서 어떤 경험을 하기를 바라시나요?","group":"exhibition_world","required":false,"maxLength":5000}],"artwork":[{"id":"description","label":"작품 소개","prompt":"이 작품을 소개해 주세요.","group":"legacy","required":false,"maxLength":5000},{"id":"notes","label":"작품 메모","prompt":"작품에 관한 메모를 입력해 주세요.","group":"legacy","required":false,"maxLength":5000},{"id":"artwork_motivation","label":"제작 계기","prompt":"이 작품을 제작하게 된 계기나 영감은 무엇인가요?","group":"artwork_story","required":false,"maxLength":5000},{"id":"artwork_meaning","label":"작품의 의미","prompt":"이 작품을 통해 표현하거나 탐구하고자 한 것은 무엇인가요?","group":"artwork_story","required":false,"maxLength":5000},{"id":"artwork_elements","label":"표현 요소","prompt":"색채, 형태, 소재, 구도 등에서 특별한 의미를 담은 요소가 있나요?","group":"artwork_story","required":false,"maxLength":5000},{"id":"artwork_process","label":"제작 과정","prompt":"작품을 제작하면서 특별히 기억에 남는 과정이나 어려움이 있었나요?","group":"artwork_story","required":false,"maxLength":5000},{"id":"artwork_viewpoint","label":"감상 포인트","prompt":"관람객이 이 작품을 감상할 때 주목했으면 하는 부분은 무엇인가요?","group":"artwork_story","required":false,"maxLength":5000},{"id":"artwork_connection","label":"전시와의 연결","prompt":"이 작품은 이번 전시의 전체 주제와 어떻게 연결되나요?","group":"artwork_story","required":false,"maxLength":5000}]}$section_catalog$
-- section-catalog:end
::jsonb) c
    cross join lateral jsonb_array_elements(c.value) s;


create or replace function yeoback_private.artist_json(a public.artist_profiles) returns jsonb
language sql stable strict set search_path = '' as $$
    select jsonb_build_object(
        'id', a.id, 'art_world_registered', exists(select 1 from jsonb_array_elements(d.sections) s
            where s->>'id' <> 'bio' and s->>'body' ~ '[^[:space:]]'), 'display_name', a.display_name, 'revision', a.revision,
        'created_at', a.created_at, 'updated_at', a.updated_at, 'document', yeoback_private.document_json(d)
    ) from public.knowledge_documents d where d.owner_id = a.owner_id and d.artist_id = a.id;
$$;

create or replace function yeoback_private.exhibition_json(e public.exhibitions) returns jsonb
language sql stable strict set search_path = '' as $$
    select jsonb_build_object(
        'id', e.id, 'artist_id', e.artist_id, 'title', coalesce(e.title,'제목 없는 전시'), 'draft_title', e.title, 'authoring_step', e.authoring_step,
        'start_time', left(e.start_time::text,5), 'end_time', left(e.end_time::text,5), 'state', e.state,
        'start_date', e.start_date, 'end_date', e.end_date, 'place', e.place, 'revision', e.revision,
        'created_at', e.created_at, 'updated_at', e.updated_at, 'document', yeoback_private.document_json(d)
    ) from public.knowledge_documents d where d.owner_id = e.owner_id and d.exhibition_id = e.id;
$$;

create or replace function yeoback_private.artwork_json(a public.artworks) returns jsonb
language sql stable strict set search_path = '' as $$
    select jsonb_build_object(
        'id', a.id, 'exhibition_id', a.exhibition_id, 'number', a.number, 'title', coalesce(a.title,'제목 없는 작품'), 'draft_title', a.title,
        'draft_number', coalesce(a.draft_number,a.number), 'dimensions_unit', a.dimensions_unit,
        'creation_year', a.creation_year, 'medium', a.medium, 'dimensions', a.dimensions,
        'image_material_id', a.image_material_id, 'state', a.state, 'revision', a.revision,
        'created_at', a.created_at, 'updated_at', a.updated_at, 'document', yeoback_private.document_json(d),
        'narration_draft', a.narration_draft
    ) from public.knowledge_documents d where d.owner_id = a.owner_id and d.artwork_id = a.id;
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
        raise exception 'Title is required' using errcode = '22023';
    end if;
    if (p_start_date is null) <> (p_end_date is null) or p_start_date > p_end_date then
        raise exception 'Invalid exhibition period' using errcode = '22023';
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
        raise exception 'Title is required' using errcode = '22023';
    end if;
    perform yeoback_private.subject_scope(owner, 'exhibition', p_id);
    if (p_start_date is null) <> (p_end_date is null) or p_start_date > p_end_date then
        raise exception 'Invalid exhibition period' using errcode = '22023';
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
        raise exception 'Title is required' using errcode = '22023';
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
        raise exception 'Title is required' using errcode = '22023';
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

create or replace function yeoback_private.signal_exhibition_notification()
returns trigger language plpgsql set search_path = '' as $$
declare trigger_kind text;
    origin_mock boolean;
    runtime_mode text := current_setting('yeobek.notification_mock',true);
begin
    if tg_op = 'INSERT' then
        if new.authoring_step is not null then return new; end if;
        trigger_kind := 'exhibition_created';
    elsif new.state = 'published' and new.revision > old.revision then
        trigger_kind := 'published';
        -- Publication does not record a general provider mode. An attached
        -- known mock asset pins this signal to mock; otherwise the mode is unknown.
        if runtime_mode in ('true','false') then
            origin_mock := runtime_mode::boolean;
        elsif exists (select 1 from public.artworks a join public.publications p on p.id = a.active_publication_id
            join public.audio_assets v on v.storage_key = p.audio_key
            where a.exhibition_id = new.id and a.state = 'published' and v.mock) then origin_mock := true; end if;
    else return new;
    end if;
    insert into public.automation_notify_signals(owner_id,exhibition_id,trigger_kind,dedupe_key,
        source_revision,exhibition_revision,source_mock)
    values(new.owner_id,new.id,trigger_kind,trigger_kind || ':' || new.id || ':' || new.revision,
        new.revision,new.revision,origin_mock) on conflict(dedupe_key) do nothing;
    return new;
end;
$$;

-- Release one creation signal after step two; incomplete draft edits never notify.
create function yeoback_private.signal_authoring_completed()
returns trigger language plpgsql set search_path = '' as $$
begin
    insert into public.automation_notify_signals(owner_id,exhibition_id,trigger_kind,dedupe_key,source_revision,exhibition_revision)
    values(new.owner_id,new.id,'exhibition_created','exhibition_created:' || new.id || ':' || new.revision,
        new.revision,new.revision) on conflict(dedupe_key) do nothing;
    return new;
end;
$$;
create trigger exhibition_authoring_completed_notify after update of authoring_step on public.exhibitions
    for each row when (old.authoring_step = 'world' and new.authoring_step = 'artworks')
    execute function yeoback_private.signal_authoring_completed();

create or replace function public.delete_artwork(p_id uuid,p_expected_revision integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    owner uuid := yeoback_private.require_owner();
    a public.artworks%rowtype;
begin
    perform yeoback_private.lock_publication(owner);
    perform 1 from public.exhibitions e join public.artworks x on x.exhibition_id=e.id and x.owner_id=e.owner_id
    where x.id=p_id and x.owner_id=owner for update of e;
    select * into a from public.artworks where id = p_id and owner_id = owner for update;
    if not found then raise exception 'Subject not found' using errcode = 'P0002'; end if;
    if a.deleted_at is not null then
        if a.revision is distinct from p_expected_revision and a.revision - 1 is distinct from p_expected_revision then
            raise exception 'Artwork revision conflict' using errcode = '40001';
        end if;
    else
        perform yeoback_private.subject_scope(owner,'artwork',p_id);
        if a.revision is distinct from p_expected_revision then
            raise exception 'Artwork revision conflict' using errcode = '40001';
        end if;
        if a.state = 'published' or exists (
            select 1 from public.publications p where p.id = a.active_publication_id and p.revoked_at is null
        ) then raise exception 'Artwork still has an active publication' using errcode = 'P1022'; end if;
        update public.artworks set deleted_at = statement_timestamp(),state = 'draft',active_publication_id = null,
            image_material_id = null,revision = revision + 1,updated_at = statement_timestamp()
            where id = a.id returning * into a;
    end if;
    return jsonb_build_object('id',a.id,'revision',a.revision,'deletedAt',a.deleted_at);
end;
$$;

-- The publication trigger runs only on the existing snapshot write, after
-- replay handling. A rejection rolls back artwork snapshots in that transaction.
create function yeoback_private.enforce_exhibition_authoring_publish()
returns trigger language plpgsql set search_path = '' as $$
begin
    if new.authoring_step is not null and new.state = 'published'
        and (new.authoring_step <> 'artworks' or yeoback_private.exhibition_authoring_blockers(new) <> '[]') then
        raise exception 'Exhibition authoring is incomplete' using errcode = '22023';
    end if;
    return new;
end;
$$;
create trigger enforce_exhibition_authoring_publish before update of public_title on public.exhibitions
    for each row execute function yeoback_private.enforce_exhibition_authoring_publish();

create or replace function public.list_artworks(p_exhibition_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
    owner uuid := yeoback_private.require_owner();
begin
    perform yeoback_private.subject_scope(owner,'exhibition',p_exhibition_id);
    return (select coalesce(jsonb_agg(yeoback_private.artwork_json(a) order by a.active_draft_number,a.id),'[]')
        from public.artworks a where a.owner_id=owner and a.exhibition_id=p_exhibition_id and a.deleted_at is null);
end;
$$;

create or replace function yeoback_private.publication_rules(p_owner uuid,p_artwork uuid)
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
            (1,'TITLE_REQUIRED',artwork.title is null or artwork.title !~ '[^[:space:]]'),
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

revoke all on function yeoback_private.authoring_time(text),yeoback_private.exhibition_authoring_blockers(public.exhibitions),
    yeoback_private.signal_authoring_completed(),yeoback_private.enforce_exhibition_authoring_publish()
    from public,anon,authenticated,service_role;
revoke all on function public.create_exhibition_draft(uuid,text,date,date,text,text,text,jsonb,jsonb),
    public.update_exhibition_draft(uuid,integer,text,date,date,text,text,text,integer,jsonb,jsonb),
    public.advance_exhibition_step(uuid,integer,text),
    public.create_artwork_draft(uuid,uuid,integer,text,text,text,text,text,jsonb,jsonb),
    public.update_artwork_draft(uuid,integer,integer,text,text,text,text,text,integer,jsonb,jsonb),
    public.reorder_artworks(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.create_exhibition_draft(uuid,text,date,date,text,text,text,jsonb,jsonb),
    public.update_exhibition_draft(uuid,integer,text,date,date,text,text,text,integer,jsonb,jsonb),
    public.advance_exhibition_step(uuid,integer,text),
    public.create_artwork_draft(uuid,uuid,integer,text,text,text,text,text,jsonb,jsonb),
    public.update_artwork_draft(uuid,integer,integer,text,text,text,text,text,integer,jsonb,jsonb),
    public.reorder_artworks(uuid,jsonb) to authenticated;
commit;
