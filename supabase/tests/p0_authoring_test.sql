begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public,extensions;
select no_plan();

insert into auth.users(id,email) values
    ('00000000-0000-4000-8000-000000140001','authoring-one@example.invalid'),
    ('00000000-0000-4000-8000-000000140002','authoring-two@example.invalid');
select ok(not has_function_privilege('anon','advance_exhibition_step(uuid,integer,text)','EXECUTE'),'transition requires authenticated role');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000140001';
select throws_ok($$select create_exhibition('00000000-0000-4000-8000-000000140004',null,null,null,null,'[]','[]')$$,
    '23502','Title is required','legacy creation still requires a title');
select throws_ok($$select create_exhibition('00000000-0000-4000-8000-000000140004','Legacy','2026-11-14',null,null,'[]','[]')$$,
    '23514','Invalid exhibition period','legacy creation still requires paired dates');
select set_config('test.p0_exhibition','00000000-0000-4000-8000-000000140003',true);
select set_config('test.p0_first','00000000-0000-4000-8000-000000140005',true);
select set_config('test.p0_second','00000000-0000-4000-8000-000000140006',true);
select is(create_exhibition_draft(current_setting('test.p0_exhibition')::uuid,null,'2026-11-14',null,null,null,null,
    '[{"id":"exhibition_layout","body":"배치 계획"}]','[]')->>'authoring_step','basic','partial save retains step one');
select is(create_exhibition_draft(current_setting('test.p0_exhibition')::uuid,null,'2026-11-14',null,null,null,null,
    '[{"id":"exhibition_layout","body":"배치 계획"}]','[]')->>'_created','false','same draft request replays');
select is(get_exhibition(current_setting('test.p0_exhibition')::uuid)->>'draft_title',null,'blank title is preserved separately');
select is(get_exhibition(current_setting('test.p0_exhibition')::uuid)->>'title','제목 없는 전시','owner display title remains a string');
select is(get_exhibition(current_setting('test.p0_exhibition')::uuid)->>'start_date','2026-11-14','individual date survives partial save');
select is(advance_exhibition_step(current_setting('test.p0_exhibition')::uuid,1,'world')->>'advanced',
    'false','missing required input blocks step one');
select is(jsonb_array_length(advance_exhibition_step(current_setting('test.p0_exhibition')::uuid,1,'world')->'blockers'),
    5,'blocked transition returns field reasons');
select throws_ok($$select advance_exhibition_step(current_setting('test.p0_exhibition')::uuid,1,'artworks')$$,
    '40001','Exhibition step conflict','world step cannot be skipped');
select throws_ok($$select update_exhibition_draft(current_setting('test.p0_exhibition')::uuid,1,'전시','2026-11-15','2026-11-14',
    '24:00','12:00','장소',1,'[]','[]')$$,'22023','Invalid exhibition time','invalid time is rejected even on drafts');
select is(update_exhibition_draft(current_setting('test.p0_exhibition')::uuid,1,'전시','2026-11-15','2026-11-14',
    '09:00','12:00','장소',1,'[{"id":"exhibition_layout","body":"배치 계획"}]','[]')->>'revision','2',
    'incomplete chronology can be saved');
select is(advance_exhibition_step(current_setting('test.p0_exhibition')::uuid,2,'world')#>>'{blockers,0,code}',
    'INVALID_PERIOD','invalid chronology blocks advancement');
select is(update_exhibition_draft(current_setting('test.p0_exhibition')::uuid,2,'전시','2026-11-14','2026-11-14',
    '09:00','12:00','장소',1,'[]','[]')->>'start_time','09:00','times round trip in the HTTP format');

reset role;
select is((select count(*) from automation_notify_signals where exhibition_id=current_setting('test.p0_exhibition')::uuid),
    0::bigint,'partial save has no creation signal');
select throws_ok($$update public.exhibitions set state='published',public_title='전시',public_artist_display_name='작가'
    where id=current_setting('test.p0_exhibition')::uuid$$,'22023','Exhibition authoring is incomplete',
    'publication snapshot write rejects incomplete P0');
set local role authenticated;
select is(advance_exhibition_step(current_setting('test.p0_exhibition')::uuid,3,'world')#>>'{exhibition,authoring_step}',
    'world','valid step one advances');
select is(advance_exhibition_step(current_setting('test.p0_exhibition')::uuid,4,'artworks')#>>'{exhibition,authoring_step}',
    'artworks','empty optional world answers allow completion');
select throws_ok($$select advance_exhibition_step(current_setting('test.p0_exhibition')::uuid,4,'artworks')$$,
    '40001','Exhibition step conflict','old revision cannot repeat completion');
reset role;
select is((select count(*) from automation_notify_signals where exhibition_id=current_setting('test.p0_exhibition')::uuid),
    1::bigint,'completed authoring releases one creation signal');

set local role authenticated;
select is(get_artist_profile()->>'art_world_registered','false','empty profile is unregistered');
select update_knowledge_document('artist',(get_artist_profile()->>'id')::uuid,1,
    '[{"id":"bio","body":"소개"},{"id":"artist_methods","body":"재료"},{"id":"artist_method_reason","body":"이유"}]','[]');
select is(get_artist_profile()->>'art_world_registered','true','distinct artist answers are retained');
select throws_ok($$select update_knowledge_document('artist',(get_artist_profile()->>'id')::uuid,2,
    '[{"id":"artwork_elements","body":"Wrong scope"}]','[]')$$,
    '22023','Invalid or duplicate knowledge section','shared catalog still validates section scope');
select is(create_artwork_draft(current_setting('test.p0_first')::uuid,current_setting('test.p0_exhibition')::uuid,
    null,null,null,null,null,'cm','[{"id":"artwork_elements","body":"색채"}]','[]')->>'draft_number',
    '1','first partial artwork gets an automatic number');
select is(create_artwork_draft(current_setting('test.p0_second')::uuid,current_setting('test.p0_exhibition')::uuid,
    null,'두 번째',null,null,null,null,'[]','[]')->>'draft_number','2','second artwork gets distinct space');
select is(get_artwork(current_setting('test.p0_first')::uuid)->>'dimensions_unit','cm','size unit is retained');
select is(get_artwork(current_setting('test.p0_first')::uuid)->>'draft_title',null,'partial artwork retains a blank title');
select throws_ok($$select reorder_artworks(current_setting('test.p0_exhibition')::uuid,jsonb_build_array(
    jsonb_build_object('id',current_setting('test.p0_first'),'expected_revision',1)))$$,
    '40001','Artwork order revision conflict','reordering requires all active IDs');
select is(reorder_artworks(current_setting('test.p0_exhibition')::uuid,jsonb_build_array(
    jsonb_build_object('id',current_setting('test.p0_second'),'expected_revision',1),
    jsonb_build_object('id',current_setting('test.p0_first'),'expected_revision',1))) #>> '{items,0,draft_number}',
    '1','atomic swap changes draft numbers');
select is(list_artworks(current_setting('test.p0_exhibition')::uuid)#>>'{0,id}',current_setting('test.p0_second'),
    'active list resumes in draft order');
select is(get_artwork(current_setting('test.p0_second')::uuid)->>'number','2','original number is unaffected');
select is(update_artwork_draft(current_setting('test.p0_first')::uuid,2,null,'첫 작품',null,null,null,null,1,
    '[{"id":"artwork_elements","body":"색채"}]','[]')->>'draft_number','2','omitted update number preserves the assigned order');
select throws_ok($$select reorder_artworks(current_setting('test.p0_exhibition')::uuid,jsonb_build_array(
    jsonb_build_object('id',current_setting('test.p0_first'),'expected_revision',2),
    jsonb_build_object('id',current_setting('test.p0_second'),'expected_revision',2)))$$,
    '40001','Artwork order revision conflict','stale artwork revision prevents any reorder');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000140002';
select throws_ok($$select reorder_artworks(current_setting('test.p0_exhibition')::uuid,jsonb_build_array(
    jsonb_build_object('id',current_setting('test.p0_first'),'expected_revision',3)))$$,
    'P0002','Exhibition not found','outside account cannot change order');

reset role;
select * from finish();
rollback;
