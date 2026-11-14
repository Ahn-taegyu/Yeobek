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

set local role authenticated;
select save_narration_draft('20000000-0000-0000-0000-000000000002',1,'Second work narration');
select approve_narration('20000000-0000-0000-0000-000000000002',2,
    jsonb_build_array(jsonb_build_object('id',current_setting('test.evidence1'),'version',1)));
set local role service_role;
select set_config('test.batch','[{"artwork_id":"20000000-0000-0000-0000-000000000001","expected_revision":2},{"artwork_id":"20000000-0000-0000-0000-000000000002","expected_revision":2}]',true);
select set_config('test.before',publish('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',gen_random_uuid(),1,
    current_setting('test.batch')::jsonb,current_setting('test.intro1')::jsonb,false)::text,true);
set local role authenticated;
select reorder_artworks('10000000-0000-0000-0000-000000000001',
    '[{"id":"20000000-0000-0000-0000-000000000002","expected_revision":3},{"id":"20000000-0000-0000-0000-000000000001","expected_revision":3}]');
select is(get_public_artwork('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001')->>'number','1',
    'draft reorder does not change the published number');
set local role service_role;
select is(publish('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',gen_random_uuid(),2,
    '[{"artwork_id":"20000000-0000-0000-0000-000000000001","expected_revision":4}]',current_setting('test.intro1')::jsonb,false)#>>'{blocked,0,reasons,0}',
    'NUMBER_CONFLICT','partial swap cannot take the unselected public number');
select is(publish('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',gen_random_uuid(),2,
    '[{"artwork_id":"20000000-0000-0000-0000-000000000001","expected_revision":4},{"artwork_id":"20000000-0000-0000-0000-000000000002","expected_revision":3}]',
    current_setting('test.intro1')::jsonb,false)->>'created','false','stale swap participant blocks the whole batch');
select is(get_public_artwork('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001')->>'number','1',
    'failed batch preserves the original public snapshot');
select set_config('test.after',publish('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',gen_random_uuid(),2,
    '[{"artwork_id":"20000000-0000-0000-0000-000000000001","expected_revision":4},{"artwork_id":"20000000-0000-0000-0000-000000000002","expected_revision":4}]',
    current_setting('test.intro1')::jsonb,false)::text,true);
select is(current_setting('test.after')::jsonb->>'created','true','complete swap publishes atomically');
select is(get_public_artwork('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001')->>'number','2','first work receives its draft number');
select is(get_public_artwork('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002')->>'number','1','second work receives its draft number');
select is(load_publication_context('10000000-0000-0000-0000-000000000001',null,1)->>'artworkId','20000000-0000-0000-0000-000000000002',
    'visitor number lookup follows the new snapshot');
select ok((select bool_and(not is_publication_current('10000000-0000-0000-0000-000000000001',
    (x->>'artworkId')::uuid,(x->>'publicationId')::uuid,(x->>'version')::integer))
    from jsonb_array_elements(current_setting('test.before')::jsonb->'publications') x),
    'old snapshot references are no longer current for cache and speech');
set local role authenticated;
select reorder_artworks('10000000-0000-0000-0000-000000000001',
    '[{"id":"20000000-0000-0000-0000-000000000001","expected_revision":5},{"id":"20000000-0000-0000-0000-000000000002","expected_revision":5}]');
select pause('10000000-0000-0000-0000-000000000001',6,'20000000-0000-0000-0000-000000000002');
set local role service_role;
select is(publish('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',gen_random_uuid(),3,
    '[{"artwork_id":"20000000-0000-0000-0000-000000000001","expected_revision":6}]',current_setting('test.intro1')::jsonb,false)#>>'{blocked,0,reasons,0}',
    'NUMBER_CONFLICT','paused public work retains its number reservation');
select * from finish();
rollback;
