begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id,email) values
    ('00000000-0000-0000-0000-000000000001','publication@example.invalid'),
    ('00000000-0000-0000-0000-000000000002','other-publication@example.invalid');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select create_exhibition('10000000-0000-0000-0000-000000000001','One',null,null,null,
    '[{"id":"introduction","body":"Private exhibition introduction"}]','[]');
select create_exhibition('10000000-0000-0000-0000-000000000002','Two',null,null,null,'[]','[]');
select update_artist_profile(1,'Public artist',1,'[{"id":"bio","body":"Approved source. Private tail."}]','[]');
select create_artwork('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
    1,'One',null,null,null,'[]','[]');
select create_artwork('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001',
    2,'Unready',null,null,null,'[]','[]');
select create_artwork('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000002',
    1,'Three',null,null,null,'[]','[]');
select save_narration_draft('20000000-0000-0000-0000-000000000001',1,'First narration');
select save_narration_draft('20000000-0000-0000-0000-000000000003',1,'Second narration');

reset role;
update app_features set enabled = false where key = 'voice_required';
update exhibitions set start_time='09:30',end_time='18:00' where id='10000000-0000-0000-0000-000000000001';
insert into materials(id,owner_id,artwork_id,kind,state,storage_key,byte_size) values
    ('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',
     '20000000-0000-0000-0000-000000000001','image','ready','00000000-0000-0000-0000-000000000001/image1',100),
    ('30000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001',
     '20000000-0000-0000-0000-000000000003','image','ready','00000000-0000-0000-0000-000000000001/image3',100);
insert into materials(id,owner_id,exhibition_id,kind,state,storage_key,byte_size,content_type,content_hash)
values ('70000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001','image','ready',
    '00000000-0000-0000-0000-000000000001/poster.png',32,'image/png',sha256('Poster'::bytea));
update exhibitions set poster_material_id='70000000-0000-0000-0000-000000000001'
    where id='10000000-0000-0000-0000-000000000001';
-- First artwork deliberately has no image: exercise legacy public.publish.
update artworks set image_material_id = '30000000-0000-0000-0000-000000000003' where id = '20000000-0000-0000-0000-000000000003';
select set_config('test.bio_document',(select id::text from knowledge_documents
    where owner_id = '00000000-0000-0000-0000-000000000001' and artist_id is not null),true);

set local role authenticated;
select set_config('test.evidence1',upsert_evidence('10000000-0000-0000-0000-000000000001',null,'artist','Approved excerpt','Approved source.',
    jsonb_build_object('kind','document','source_document_id',current_setting('test.bio_document'),'source_section_id','bio','source_revision',2)
)->>'id',true);
select set_config('test.evidence2',upsert_evidence('10000000-0000-0000-0000-000000000002',null,'artist','Approved excerpt','Approved source.',
    jsonb_build_object('kind','document','source_document_id',current_setting('test.bio_document'),'source_section_id','bio','source_revision',2)
)->>'id',true);
select approve_evidence(current_setting('test.evidence1')::uuid,1);
select approve_evidence(current_setting('test.evidence2')::uuid,1);
select set_config('test.qa',upsert_evidence('10000000-0000-0000-0000-000000000001',null,'exhibition',
    'FAQ','Additional approved answer.','{"kind":"direct"}')->>'id',true);
select approve_evidence(current_setting('test.qa')::uuid,1);
select approve_narration('20000000-0000-0000-0000-000000000001',2,
    jsonb_build_array(jsonb_build_object('id',current_setting('test.evidence1'),'version',1)));
select approve_narration('20000000-0000-0000-0000-000000000003',2,
    jsonb_build_array(jsonb_build_object('id',current_setting('test.evidence2'),'version',1)));

select set_config('test.select1','[{"artwork_id":"20000000-0000-0000-0000-000000000001","expected_revision":2}]',true);
select set_config('test.select2','[{"artwork_id":"20000000-0000-0000-0000-000000000003","expected_revision":2}]',true);
select set_config('test.intro1',jsonb_build_object('bio',jsonb_build_object('id',current_setting('test.evidence1'),'version',1),
    'introduction',null,'theme',null)::text,true);

reset role;
update public.exhibitions set start_date='2026-11-14',end_date='2026-11-15',place='Test gallery';
set local role service_role;

select set_config('test.mockjob',reserve_ai_job('00000000-0000-0000-0000-000000000001',gen_random_uuid(),
    '20000000-0000-0000-0000-000000000001',2,1,'single',true)#>>'{job,id}',true);
select complete_ai_job('00000000-0000-0000-0000-000000000001',current_setting('test.mockjob')::uuid,1,
    jsonb_build_object('status','selected','reason','passed','mock',true,'selected',jsonb_build_object(
        'answer','Simulated narration','citations',(select jsonb_build_array(source_ids->>0) from ai_jobs where id=current_setting('test.mockjob')::uuid))));
set local role authenticated;
select save_narration_draft('20000000-0000-0000-0000-000000000001',2,'Simulated narration',current_setting('test.mockjob')::uuid);
select save_narration_draft('20000000-0000-0000-0000-000000000001',3,'Edited simulated narration');
select approve_narration('20000000-0000-0000-0000-000000000001',4,
    jsonb_build_array(jsonb_build_object('id',current_setting('test.evidence1'),'version',1)));
reset role;
select ok(yeoback_private.narration_is_mock(yeoback_private.current_narration_approval(
    '00000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001')),'manual editing preserves simulated provenance');
delete from public.ai_jobs where id=current_setting('test.mockjob')::uuid;
select ok(yeoback_private.narration_is_mock(yeoback_private.current_narration_approval(
    '00000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001')),'job cleanup does not erase provenance');
select ok(not has_table_privilege('authenticated','yeoback_private.narration_provenance','INSERT'),'browser cannot replace provenance');
set local role service_role;
select set_config('test.mockselection','[{"artwork_id":"20000000-0000-0000-0000-000000000001","expected_revision":4}]',true);
select is(publish_with_audio_config('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',gen_random_uuid(),1,
    current_setting('test.mockselection')::jsonb,current_setting('test.intro1')::jsonb,false,null,false)#>>'{blocked,0,reasons,0}',
    'MOCK_NARRATION_NOT_ALLOWED','live publication rejects stored simulated text even without audio');
select is(publish('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',gen_random_uuid(),1,
    current_setting('test.mockselection')::jsonb,current_setting('test.intro1')::jsonb,false)#>>'{blocked,0,reasons,0}',
    'MOCK_NARRATION_NOT_ALLOWED','legacy service publisher fails closed');
select is(publish_with_audio_config('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',gen_random_uuid(),1,
    current_setting('test.mockselection')::jsonb,current_setting('test.intro1')::jsonb,false,null,true)->>'created','true','explicit development mode permits simulated publication');
select is(publish_with_audio_config('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',gen_random_uuid(),2,
    '[]',current_setting('test.intro1')::jsonb,false,null,false)#>>'{blocked,0,reasons,0}',
    'MOCK_NARRATION_NOT_ALLOWED','metadata-only live publication cannot retain a simulated snapshot');
set local role authenticated;
select pause('10000000-0000-0000-0000-000000000001',2,null);
set local role service_role;
select throws_ok($$select resume_with_audio_mode('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',3,false,false,null)$$,
    '40001','Publication contains mock narration','live resume cannot expose an earlier simulated snapshot');
select throws_ok($$select resume('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',3,false,null)$$,
    '40001','Publication contains mock narration','legacy resume also rejects simulated snapshot');
select lives_ok($$select resume_with_audio_mode('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',3,false,true,null)$$,
    'development resume remains supported');

select set_config('test.livejob',reserve_ai_job('00000000-0000-0000-0000-000000000001',gen_random_uuid(),
    '20000000-0000-0000-0000-000000000001',5,1,'single',false)#>>'{job,id}',true);
select complete_ai_job('00000000-0000-0000-0000-000000000001',current_setting('test.livejob')::uuid,1,
    jsonb_build_object('status','selected','reason','passed','mock',false,'selected',jsonb_build_object(
        'answer','Replacement live narration','citations',(select jsonb_build_array(source_ids->>0) from ai_jobs where id=current_setting('test.livejob')::uuid))));
set local role authenticated;
select save_narration_draft('20000000-0000-0000-0000-000000000001',5,'Replacement live narration',current_setting('test.livejob')::uuid);
select save_narration_draft('20000000-0000-0000-0000-000000000001',6,'Edited live narration');
select approve_narration('20000000-0000-0000-0000-000000000001',7,
    jsonb_build_array(jsonb_build_object('id',current_setting('test.evidence1'),'version',1)));
set local role service_role;
select set_config('test.live_request',gen_random_uuid()::text,true);
select is(publish_with_audio_config('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',current_setting('test.live_request')::uuid,4,
    '[{"artwork_id":"20000000-0000-0000-0000-000000000001","expected_revision":7}]',current_setting('test.intro1')::jsonb,false,null,false)->>'created',
    'true','newly approved live replacement can replace the simulated snapshot');

set local role authenticated;
select save_narration_draft('20000000-0000-0000-0000-000000000001',8,'Simulated narration');
select approve_narration('20000000-0000-0000-0000-000000000001',9,
    jsonb_build_array(jsonb_build_object('id',current_setting('test.evidence1'),'version',1)));
set local role service_role;
select is(publish_with_audio_config('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',current_setting('test.live_request')::uuid,4,
    '[{"artwork_id":"20000000-0000-0000-0000-000000000001","expected_revision":7}]',current_setting('test.intro1')::jsonb,false,null,false)->>'created',
    'false','safe successful request replays its pinned result despite later simulated drafts');

select * from finish();
rollback;
