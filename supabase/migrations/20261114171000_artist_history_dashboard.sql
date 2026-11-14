begin;

-- Generated catalog checkpoint; prior migrations remain unchanged.
insert into yeoback_private.knowledge_section_catalog(subject_type,section_id,max_length,required)
select c.key,s.value->>'id',(s.value->>'maxLength')::integer,(s.value->>'required')::boolean from jsonb_each(
-- section-catalog:start
$section_catalog${"artist":[{"id":"bio","label":"작가 소개","prompt":"작가를 소개해 주세요.","group":"legacy","required":false,"maxLength":5000},{"id":"practice","label":"기본 작품 세계","prompt":"기본 작품 세계를 설명해 주세요.","group":"legacy","required":false,"maxLength":5000},{"id":"artist_motivation","label":"작업 계기","prompt":"작품 활동을 시작하게 된 계기는 무엇인가요?","group":"artist","required":false,"maxLength":5000},{"id":"artist_interests","label":"핵심 관심사","prompt":"작품 활동을 통해 지속적으로 탐구하는 주제나 관심사는 무엇인가요?","group":"artist","required":false,"maxLength":5000},{"id":"artist_philosophy","label":"예술관 및 철학","prompt":"작품을 만들 때 가장 중요하게 생각하는 가치나 철학은 무엇인가요?","group":"artist","required":false,"maxLength":5000},{"id":"artist_methods","label":"표현 방식","prompt":"주로 사용하는 재료, 기법 또는 표현 방식은 무엇인가요?","group":"artist","required":false,"maxLength":5000},{"id":"artist_method_reason","label":"표현 방식","prompt":"위 표현 방식을 선택한 이유는 무엇인가요?","group":"artist","required":false,"maxLength":5000},{"id":"artist_inspiration","label":"영감의 원천","prompt":"작품의 아이디어나 영감은 주로 어디에서 얻으시나요?","group":"artist","required":false,"maxLength":5000},{"id":"artist_audience","label":"소통","prompt":"관람객이 작가의 작품을 통해 어떤 경험을 하거나 질문을 떠올리기를 바라시나요?","group":"artist","required":false,"maxLength":5000},{"id":"artist_education","label":"학력 및 전공","prompt":"학력 및 전공","group":"artist_history","required":false,"maxLength":5000},{"id":"artist_exhibitions","label":"주요 전시 경력","prompt":"주요 전시 경력","group":"artist_history","required":false,"maxLength":5000},{"id":"artist_awards","label":"수상 및 선정 이력","prompt":"수상 및 선정 이력","group":"artist_history","required":false,"maxLength":5000},{"id":"artist_activities","label":"작품 활동","prompt":"작품 활동","group":"artist_history","required":false,"maxLength":5000},{"id":"artist_other_history","label":"기타","prompt":"추가로 소개하고 싶은 활동을 입력해 주세요","group":"artist_history","required":false,"maxLength":5000}],"exhibition":[{"id":"introduction","label":"전시 소개","prompt":"전시를 소개해 주세요.","group":"legacy","required":false,"maxLength":5000},{"id":"theme","label":"전시 주제","prompt":"전시 주제를 설명해 주세요.","group":"legacy","required":false,"maxLength":5000},{"id":"exhibition_background","label":"전시 기획 배경","prompt":"이번 전시를 기획하게 된 계기나 배경은 무엇인가요?","group":"exhibition_basic","required":false,"maxLength":5000},{"id":"exhibition_layout","label":"전시 구성","prompt":"전시 공간이나 작품의 배치에 특별한 의도가 있나요?","group":"exhibition_basic","required":false,"maxLength":5000},{"id":"exhibition_guidance","label":"관람 안내","prompt":"관람객이 알아야 할 특별한 안내 사항이 있나요?","group":"exhibition_basic","required":false,"maxLength":5000},{"id":"exhibition_focus","label":"핵심주제","prompt":"이번 전시에서 특별히 집중하거나 탐구하는 주제는 무엇인가요?","group":"exhibition_world","required":false,"maxLength":5000},{"id":"exhibition_connection","label":"기존 작품세계와의 연결","prompt":"이번 전시는 작가님의 기존 작품세계와 어떤 관계가 있나요?","group":"exhibition_world","required":false,"maxLength":5000},{"id":"exhibition_message","label":"전달 메시지","prompt":"이번 전시를 통해 관람객에게 가장 전달하고 싶은 메시지는 무엇인가요?","group":"exhibition_world","required":false,"maxLength":5000},{"id":"exhibition_distinction","label":"전시의 차별점","prompt":"이전 작업이나 전시와 비교했을 때 이번 전시만의 특징은 무엇인가요?","group":"exhibition_world","required":false,"maxLength":5000},{"id":"exhibition_viewpoint","label":"감상 관점","prompt":"관람객이 이번 전시를 감상할 때 특별히 주목했으면 하는 부분이 있나요?","group":"exhibition_world","required":false,"maxLength":5000},{"id":"exhibition_experience","label":"감정 및 경험","prompt":"관람객이 전시를 관람하면서 어떤 경험을 하기를 바라시나요?","group":"exhibition_world","required":false,"maxLength":5000}],"artwork":[{"id":"description","label":"작품 소개","prompt":"이 작품을 소개해 주세요.","group":"legacy","required":false,"maxLength":5000},{"id":"notes","label":"작품 메모","prompt":"작품에 관한 메모를 입력해 주세요.","group":"legacy","required":false,"maxLength":5000},{"id":"artwork_motivation","label":"제작 계기","prompt":"이 작품을 제작하게 된 계기나 영감은 무엇인가요?","group":"artwork_story","required":false,"maxLength":5000},{"id":"artwork_meaning","label":"작품의 의미","prompt":"이 작품을 통해 표현하거나 탐구하고자 한 것은 무엇인가요?","group":"artwork_story","required":false,"maxLength":5000},{"id":"artwork_elements","label":"표현 요소","prompt":"색채, 형태, 소재, 구도 등에서 특별한 의미를 담은 요소가 있나요?","group":"artwork_story","required":false,"maxLength":5000},{"id":"artwork_process","label":"제작 과정","prompt":"작품을 제작하면서 특별히 기억에 남는 과정이나 어려움이 있었나요?","group":"artwork_story","required":false,"maxLength":5000},{"id":"artwork_viewpoint","label":"감상 포인트","prompt":"관람객이 이 작품을 감상할 때 주목했으면 하는 부분은 무엇인가요?","group":"artwork_story","required":false,"maxLength":5000},{"id":"artwork_connection","label":"전시와의 연결","prompt":"이 작품은 이번 전시의 전체 주제와 어떻게 연결되나요?","group":"artwork_story","required":false,"maxLength":5000}]}$section_catalog$
-- section-catalog:end
::jsonb) c cross join lateral jsonb_array_elements(c.value) s
on conflict(subject_type,section_id) do update
set max_length=excluded.max_length,required=excluded.required;

-- Owner dashboard uses current editable dates, not the public snapshot.
-- Date-only legacy records span the whole local day in Asia/Seoul.
create function yeoback_private.exhibition_period_state(e public.exhibitions,p_at timestamptz)
returns text language plpgsql immutable strict set search_path = '' as $$
declare local_at timestamp := p_at at time zone 'Asia/Seoul'; starts time; ends time;
begin
    if e.start_date is null or e.end_date is null then return 'unknown'; end if;
    -- DATE accepts years beyond TIMESTAMP; preserve legacy rows without converting their dates.
    starts := coalesce(e.start_time,time '00:00');
    ends := coalesce(e.end_time,time '23:59:59.999999');
    if row(e.start_date,starts)>row(e.end_date,ends) then return 'unknown'; end if;
    if row(local_at::date,local_at::time)<row(e.start_date,starts) then return 'upcoming'; end if;
    if row(local_at::date,local_at::time)>row(e.end_date,ends) then return 'ended'; end if;
    return 'ongoing';
end;
$$;
revoke all on function yeoback_private.exhibition_period_state(public.exhibitions,timestamptz)
    from public,anon,authenticated,service_role;

create function yeoback_private.exhibition_dashboard_status(p_state text,p_period text)
returns text language sql immutable strict set search_path = '' as $$
    select case when p_state<>'published' or p_period not in ('ongoing','ended') then 'preparing' else p_period end;
$$;
revoke all on function yeoback_private.exhibition_dashboard_status(text,text)
    from public,anon,authenticated,service_role;

create or replace function yeoback_private.exhibition_json(e public.exhibitions) returns jsonb
language sql stable strict set search_path = '' as $$
    select jsonb_build_object(
        'id',e.id,'artist_id',e.artist_id,'title',coalesce(e.title,'제목 없는 전시'),'draft_title',e.title,
        'authoring_step',e.authoring_step,'start_time',left(e.start_time::text,5),'end_time',left(e.end_time::text,5),
        'state',e.state,'start_date',e.start_date,'end_date',e.end_date,'place',e.place,'revision',e.revision,
        'created_at',e.created_at,'updated_at',e.updated_at,'document',yeoback_private.document_json(d),
        'poster_material_id',e.poster_material_id,'period_state',p.value,
        'dashboard_status',yeoback_private.exhibition_dashboard_status(e.state,p.value)
    ) from public.knowledge_documents d
    cross join lateral (select yeoback_private.exhibition_period_state(e,statement_timestamp()) as value) p
    where d.owner_id=e.owner_id and d.exhibition_id=e.id;
$$;

commit;
