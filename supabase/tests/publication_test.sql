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
insert into materials(id,owner_id,artwork_id,kind,state,storage_key,byte_size) values
    ('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',
     '20000000-0000-0000-0000-000000000001','image','ready','00000000-0000-0000-0000-000000000001/image1',100),
    ('30000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001',
     '20000000-0000-0000-0000-000000000003','image','ready','00000000-0000-0000-0000-000000000001/image3',100);
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

set local role service_role;
select is(publish('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',1,
    current_setting('test.select1')::jsonb || '[{"artwork_id":"20000000-0000-0000-0000-000000000002","expected_revision":1}]'::jsonb,
    current_setting('test.intro1')::jsonb,false)#>>'{blocked,0,artworkId}', '20000000-0000-0000-0000-000000000002',
    'one unready selection blocks the whole batch');
set local role authenticated;
select is(get_public_exhibition('10000000-0000-0000-0000-000000000001'),null,'blocked publish leaves the exhibition private');
set local role service_role;
select set_config('test.publish1',publish('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',1,
    current_setting('test.select1')::jsonb,current_setting('test.intro1')::jsonb,false)::text,true);
select is(publish('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',1,
    current_setting('test.select1')::jsonb,current_setting('test.intro1')::jsonb,false),
    current_setting('test.publish1')::jsonb || '{"created":false}'::jsonb,'successful publish replays before revision check');
select is((select image_key from publications where artwork_id = '20000000-0000-0000-0000-000000000001'),null::text,'legacy publisher accepts an absent image');
select is(jsonb_array_length(load_publication_context('10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',null)->'evidence'),2,'Q&A receives all current approved scoped evidence');
select is(load_publication_context('10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',null)#>'{narration,citations}',
    jsonb_build_array(current_setting('test.evidence1')),'narration preserves only explicitly approved citations');
select throws_ok($$select publish('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',2,
    '[]','{"bio":null,"introduction":null,"theme":null}',false)$$,'P1005','Request ID already used with different input',
    'request ID cannot be used for a changed selection');
set local role authenticated;
select is(jsonb_array_length(list_labels('10000000-0000-0000-0000-000000000001')->'artworks'),1,'only published artworks have labels');
select is(get_public_exhibition('10000000-0000-0000-0000-000000000001')->>'artist_bio','Approved source.',
    'explicit approved excerpt is public');
select is(get_public_exhibition('10000000-0000-0000-0000-000000000001')->>'introduction',null,
    'private exhibition document is never copied');
select is(get_review_bundle('20000000-0000-0000-0000-000000000001')#>>'{exhibitionPublicIntro,bio,id}',
    current_setting('test.evidence1'),'review reloads the published intro pins');

reset role;
update app_features set enabled = true where key = 'voice_required';
set local role authenticated;
select is(get_public_artwork('10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001')->>'title','One',
    'enabling voice requirement preserves the existing text-only publication');
set local role service_role;
select is(publish('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002',
    '40000000-0000-0000-0000-000000000004',1,current_setting('test.select2')::jsonb,
    '{"bio":null,"introduction":null,"theme":null}',true)#>'{blocked,0,reasons}', '["AUDIO_REQUIRED"]'::jsonb,
    'new text-only publication is blocked while voice is required');
set local role authenticated;
select is(pause('10000000-0000-0000-0000-000000000001',3,'20000000-0000-0000-0000-000000000001')->>'exhibitionState',
    'paused','pausing last artwork pauses exhibition');
set local role service_role;
select throws_ok($$select resume('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',4,true,
    '20000000-0000-0000-0000-000000000001')$$,'40001','Publication cannot be resumed or paused',
    'text-only artwork resume is blocked while voice is required');
reset role;
update app_features set enabled = false where key = 'voice_required';
set local role service_role;
select is(resume('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',4,false,'20000000-0000-0000-0000-000000000001')->>'state',
    'published','artwork can be resumed without replacing its snapshot');
select is(resume('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',3,false)->>'state','published','exhibition gate resumes separately');
select is(publish('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000003',4,
    '[]',current_setting('test.intro1')::jsonb,false)#>>'{publications,0}',null,'metadata-only publication does not rewrite active artwork');
set local role authenticated;
select is(get_public_artwork('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001')->>'publication_id',
    current_setting('test.publish1')::jsonb#>>'{publications,0,publicationId}','metadata-only publication preserves active version');

set local role authenticated;
select set_config('test.impact_before',get_revoke_impact(current_setting('test.evidence1')::uuid,1)->>'token',true);
set local role service_role;
select publish('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000002',1,
    current_setting('test.select2')::jsonb,'{"bio":null,"introduction":null,"theme":null}',false);
set local role authenticated;
select throws_ok($$select revoke_evidence(current_setting('test.evidence1')::uuid,1,current_setting('test.impact_before'))$$,
    '40001','Evidence revocation impact changed','revocation requires confirmation of changed impact');
select is(jsonb_array_length(get_revoke_impact(current_setting('test.evidence1')::uuid,1)->'exhibitions'),2,
    'common source impact spans both owned exhibitions');
select revoke_evidence(current_setting('test.evidence1')::uuid,1,get_revoke_impact(current_setting('test.evidence1')::uuid,1)->>'token');
select is(get_public_exhibition('10000000-0000-0000-0000-000000000001'),null,'intro and artwork withdrawal close first exhibition');
select is(get_public_exhibition('10000000-0000-0000-0000-000000000002'),null,'withdrawal closes other exhibition using same source');

select upsert_evidence('10000000-0000-0000-0000-000000000001',null,'artist','Approved excerpt','Approved source.',
    jsonb_build_object('kind','document','source_document_id',current_setting('test.bio_document'),'source_section_id','bio','source_revision',2),
    current_setting('test.evidence1')::uuid,1);
select throws_ok($$select approve_evidence(current_setting('test.evidence1')::uuid,2)$$,
    '40001','Evidence source is withdrawn','a new evidence version cannot restore the withdrawn source version');
select update_artist_profile(2,'Public artist',2,'[{"id":"bio","body":"Approved source. New author revision."}]','[]');
select upsert_evidence('10000000-0000-0000-0000-000000000001',null,'artist','Revised excerpt','Approved source.',
    jsonb_build_object('kind','document','source_document_id',current_setting('test.bio_document'),'source_section_id','bio','source_revision',3),
    current_setting('test.evidence1')::uuid,2);
select is(approve_evidence(current_setting('test.evidence1')::uuid,3)->>'state','approved',
    'a different source revision may receive a fresh approval under the same evidence identity');
select is(get_public_exhibition('10000000-0000-0000-0000-000000000001'),null,
    'fresh approval does not restore the previously revoked publication');

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select throws_ok($$select list_labels('10000000-0000-0000-0000-000000000001')$$,'P0002','Subject not found','foreign owner sees no labels');
select throws_ok($$select get_revoke_impact(current_setting('test.evidence1')::uuid,1)$$,'P0002','Evidence not found','foreign owner sees no impact');
select ok(not has_function_privilege('authenticated','publish(uuid,uuid,uuid,int,jsonb,jsonb,boolean)','EXECUTE'),'browser cannot publish without worker policy');
select ok(not has_function_privilege('authenticated','resume(uuid,uuid,int,boolean,uuid)','EXECUTE'),'browser cannot resume without worker policy');
select ok(not has_function_privilege('anon','load_publication_context(uuid,uuid,int)','EXECUTE'),'anonymous role cannot read private retrieval payloads');

reset role;
-- Simulate a legacy snapshot present before the v1 insertion rule existed.
-- Clone a known valid snapshot with one malformed field. BEFORE INSERT must
-- reject its contract before the duplicate primary key constraint is reached.
create function pg_temp.try_bad_snapshot(p_path text[],p_value jsonb,p_pins jsonb default null)
returns void language sql as $$
    insert into public.publications(id,owner_id,exhibition_id,artwork_id,version,number,title,image_key,
        evidence,narration_text,narration_hash,audio_key,audio_text_hash,approved_by,narration_citations)
    select id,owner_id,exhibition_id,artwork_id,version,number,title,image_key,
        jsonb_set(evidence,p_path,p_value),narration_text,narration_hash,audio_key,audio_text_hash,approved_by,
        coalesce(p_pins,narration_citations)
    from public.publications where id = (current_setting('test.publish1')::jsonb#>>'{publications,0,publicationId}')::uuid;
$$;
select throws_ok($$select pg_temp.try_bad_snapshot('{items,0,body}','"Tampered body"')$$,
    '22023','Invalid publication snapshot','snapshot rejects a body/hash mismatch');
select throws_ok($$select pg_temp.try_bad_snapshot('{items,0,ownerId}','"00000000-0000-0000-0000-000000000002"')$$,
    '22023','Invalid publication snapshot','snapshot rejects another owner');
select throws_ok($$select pg_temp.try_bad_snapshot('{items,0}','{"excerpt":"Missing fields"}')$$,
    '22023','Invalid publication snapshot','snapshot requires the complete evidence contract');
select throws_ok($$select pg_temp.try_bad_snapshot('{items,0,privateNotes}','"Must not leak"')$$,
    '22023','Invalid publication snapshot','snapshot rejects extra private metadata');
select throws_ok($$select pg_temp.try_bad_snapshot('{schemaVersion}','1',jsonb_build_array(jsonb_build_object(
    'id',current_setting('test.evidence1'),'version',99)))$$,
    '22023','Invalid publication snapshot','narration citations pin an actual evidence version');
select throws_ok($$select pg_temp.try_bad_snapshot('{items}','[]')$$,
    '22023','Invalid publication snapshot','snapshot requires evidence');
select throws_ok($$select pg_temp.try_bad_snapshot('{schemaVersion}','1','[]')$$,
    '22023','Invalid publication snapshot','snapshot requires explicit narration citations');

alter table public.publications disable trigger require_publication_v1;
insert into publications(id,owner_id,exhibition_id,artwork_id,version,number,title,image_key,evidence,narration_text,narration_hash,
    audio_key,audio_text_hash,approved_by)
values ('50000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',2,1,
    'Legacy','legacy-image','[{"excerpt":"Unvalidated"}]','Legacy narration',sha256('Legacy narration'::bytea),
    'legacy-audio',sha256('Legacy narration'::bytea),'00000000-0000-0000-0000-000000000001');
alter table public.publications enable trigger require_publication_v1;
update artworks set state = 'published',active_publication_id = '50000000-0000-0000-0000-000000000001'
    where id = '20000000-0000-0000-0000-000000000001';
update exhibitions set state = 'published',intro_evidence = '{}' where id = '10000000-0000-0000-0000-000000000001';
set local role anon;
select is(get_public_artwork('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001'),null,
    'legacy snapshot is not publicly served');
reset role;
select lives_ok($$update publications set revoked_at = statement_timestamp()
    where id = '50000000-0000-0000-0000-000000000001'$$,'legacy snapshot can still be revoked');

reset role;
select * from finish();
rollback;
