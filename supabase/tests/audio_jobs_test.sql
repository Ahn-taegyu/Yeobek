begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public,extensions;
select no_plan();

-- Isolate the fixture from voice configuration registered by earlier HTTP runs.
select set_config('test.voice_version',(select (coalesce(max(version),0)+1)::text from voice_configs),true);
update app_policies set value = current_setting('test.voice_version')::integer where key = 'voice_config_version';

insert into auth.users(id,email) values
    ('00000000-0000-0000-0000-000000000001','audio-owner@example.invalid'),
    ('00000000-0000-0000-0000-000000000002','audio-other@example.invalid');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select create_exhibition('10000000-0000-0000-0000-000000000001','Audio exhibition',null,null,null,'[]','[]');
select create_artwork('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
    1,'Audio artwork',null,null,null,'[]','[]');
select save_narration_draft('20000000-0000-0000-0000-000000000001',1,'Approved narration',null);
select set_config('test.evidence',upsert_evidence('10000000-0000-0000-0000-000000000001',null,
    'exhibition','Approved source','Approved narration','{"kind":"direct"}')->>'id',true);
select approve_evidence(current_setting('test.evidence')::uuid,1);
select set_config('test.approval',approve_narration('20000000-0000-0000-0000-000000000001',2,
    jsonb_build_array(jsonb_build_object('id',current_setting('test.evidence'),'version',1)))->>'id',true);
select ok(not has_function_privilege('authenticated','reserve_audio_job(uuid,uuid,uuid,integer,uuid,text,boolean)','EXECUTE'),
    'authenticated cannot reserve synthesis directly');
select ok(not has_function_privilege('authenticated','get_audio_context(uuid,uuid,integer)','EXECUTE'),
    'authenticated cannot fetch private audio storage keys');

select ok(not has_function_privilege('authenticated','list_audio_cleanup(integer)','EXECUTE'),
    'authenticated cannot enumerate cleanup paths');
select ok(not has_function_privilege('authenticated','complete_audio_cleanup(uuid,uuid)','EXECUTE'),
    'authenticated cannot confirm object deletion');
select ok(not has_function_privilege('authenticated','resume_with_audio_mode(uuid,uuid,integer,boolean,boolean,uuid)','EXECUTE'),
    'authenticated cannot override the server audio mode');

reset role;
update public.exhibitions set start_date='2026-11-14',end_date='2026-11-15',place='Test gallery';
set local role service_role;
select is(sync_audio_config(repeat('a',64),true),current_setting('test.voice_version')::integer,'registers server voice fingerprint');
select throws_ok($$select sync_audio_config(repeat('b',64),true)$$,'P1003',
    'Voice configuration requires a new policy version','a different voice requires a version change');
select throws_ok($$select reserve_audio_job('00000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001',
    current_setting('test.approval')::uuid,2,'30000000-0000-0000-0000-000000000001',repeat('a',64),true)$$,
    'P0002','Subject not found','another owner cannot reserve synthesis');
select set_config('test.job',reserve_audio_job('00000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
    current_setting('test.approval')::uuid,2,'30000000-0000-0000-0000-000000000001',repeat('a',64),true)#>>'{job,id}',true);
select is(reserve_audio_job('00000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
    current_setting('test.approval')::uuid,2,'30000000-0000-0000-0000-000000000001',repeat('a',64),true)->>'claimed',
    'false','same audio request cannot charge twice');
select throws_ok($$select reserve_ai_job('00000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',2,1,'single',true)$$,'P1005',
    'Request ID already used with different input','narration reservation cannot replay an audio request');
select throws_ok($$select retry_ai_job('00000000-0000-0000-0000-000000000001',current_setting('test.job')::uuid,
    '30000000-0000-0000-0000-000000000002',1,true)$$,'P0002','Job not found','narration retry cannot start audio');
select throws_ok($$select complete_ai_job('00000000-0000-0000-0000-000000000001',current_setting('test.job')::uuid,1,'{}')$$,
    'P0002','Job not found','narration completion cannot write audio');
select set_config('test.context',get_audio_context('00000000-0000-0000-0000-000000000001',
    current_setting('test.job')::uuid,1)::text,true);
select is(current_setting('test.context')::jsonb->>'text','Approved narration','synthesis input comes from the exact approved text');
select set_config('test.success',jsonb_build_object('status','succeeded','resultCode','OK','routing','none',
    'contentHash',repeat('a',64),'byteSize',104)::text,true);
select throws_ok($$select complete_audio_job('00000000-0000-0000-0000-000000000001',current_setting('test.job')::uuid,1,
    current_setting('test.success')::jsonb)$$,'P1002','Audio object unavailable or mismatched','ready requires a stored object');

reset role;
insert into storage.objects(bucket_id,name,metadata) values
    ('artist-audio',current_setting('test.context')::jsonb->>'storageKey','{"size":104,"mimetype":"audio/mpeg"}');
set local role service_role;
select is(complete_audio_job('00000000-0000-0000-0000-000000000001',current_setting('test.job')::uuid,1,
    current_setting('test.success')::jsonb)#>>'{result,mock}','true','ready result preserves mock provenance');
select is(complete_audio_job('00000000-0000-0000-0000-000000000001',current_setting('test.job')::uuid,1,
    current_setting('test.success')::jsonb)->>'status','succeeded','completion replays without writing a new asset');

set local role authenticated;
select is(get_ai_job(current_setting('test.job')::uuid)->>'kind','audio','normal owner job endpoint reads audio');
select ok(not (get_ai_job(current_setting('test.job')::uuid)->'result' ? 'storageKey'),'public job result has no storage key');
select throws_ok($$select save_narration_draft('20000000-0000-0000-0000-000000000001',2,null,
    current_setting('test.job')::uuid)$$,'P0002','Job not found','an audio job cannot authorize clearing narration');
select is(get_review_bundle('20000000-0000-0000-0000-000000000001')#>>'{audio,id}',
    current_setting('test.context')::jsonb->>'assetId','review sees the ready matching audio');

set local role service_role;
-- Add only the image-ready fixture; the voice is the genuine job result.
reset role;
update artist_profiles set display_name = 'Audio author' where owner_id = '00000000-0000-0000-0000-000000000001';
insert into materials(id,owner_id,artwork_id,kind,state,storage_key,byte_size)
values ('60000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001','image','ready','00000000-0000-0000-0000-000000000001/audio-fixture',64);
update artworks set image_material_id = '60000000-0000-0000-0000-000000000001'
    where id = '20000000-0000-0000-0000-000000000001';
set local role service_role;
select throws_ok($$select publish_with_audio_config('00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001',1,
    '[{"artwork_id":"20000000-0000-0000-0000-000000000001","expected_revision":2}]',
    '{"bio":null,"introduction":null,"theme":null}',true,null,true)$$,
    'P1003','Voice configuration is required for publication','required audio needs explicit worker fingerprint');
select is(publish_with_audio_config('00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001',1,
    '[{"artwork_id":"20000000-0000-0000-0000-000000000001","expected_revision":2}]',
    '{"bio":null,"introduction":null,"theme":null}',false,null,false)->>'created','true',
    'voice optional publication works without a configured fingerprint');
reset role;
select is((select audio_key from publications where artwork_id = '20000000-0000-0000-0000-000000000001' and version = 1),
    null,'no explicit fingerprint means no audio attachment');
set local role service_role;
select is(publish_with_audio_config('00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000002',2,
    '[{"artwork_id":"20000000-0000-0000-0000-000000000001","expected_revision":3}]',
    '{"bio":null,"introduction":null,"theme":null}',true,repeat('a',64),true)->>'created','true',
    'voice required publication accepts the matching asset');
reset role;
select is((select audio_key from publications where artwork_id = '20000000-0000-0000-0000-000000000001' and version = 2),
    current_setting('test.context')::jsonb->>'storageKey','publication pins the exact asset from the worker voice config');
set local role authenticated;
select pause('10000000-0000-0000-0000-000000000001',3);
set local role service_role;
select throws_ok($$select resume_with_audio_mode('00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',4,false,false)$$,'40001',
    'Publication contains mock audio','live exhibition resume blocks pinned mock audio even if voice is optional');
select throws_ok($$select resume_with_audio_mode('00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',4,true,false,'20000000-0000-0000-0000-000000000001')$$,'40001',
    'Publication contains mock audio','live artwork resume checks the exact pinned asset');
select throws_ok($$select resume_with_audio_mode('00000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',4,false,true)$$,'P0002','Subject not found',
    'another owner cannot resume the exhibition');
select is(resume_with_audio_mode('00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',4,true,true)->>'state','published',
    'mock mode can resume its published snapshot');
set local role service_role;
select set_config('test.retry_job',reserve_audio_job('00000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
    current_setting('test.approval')::uuid,4,'30000000-0000-0000-0000-000000000003',repeat('a',64),true)#>>'{job,id}',true);
select complete_audio_job('00000000-0000-0000-0000-000000000001',current_setting('test.retry_job')::uuid,1,
    '{"status":"failed","resultCode":"PROVIDER_UNAVAILABLE","routing":"operator"}');
select is(retry_audio_job('00000000-0000-0000-0000-000000000001',current_setting('test.retry_job')::uuid,
    '30000000-0000-0000-0000-000000000004',1,repeat('a',64),true)#>>'{job,attempt}','2','retry starts a distinct asset attempt');
select is(complete_audio_job('00000000-0000-0000-0000-000000000001',current_setting('test.retry_job')::uuid,1,
    current_setting('test.success')::jsonb)->>'status','running','late old completion cannot modify the active attempt');
set local role authenticated;
select revoke_evidence(current_setting('test.evidence')::uuid,1,get_revoke_impact(current_setting('test.evidence')::uuid,1)->>'token');
set local role service_role;
select is(complete_audio_job('00000000-0000-0000-0000-000000000001',current_setting('test.retry_job')::uuid,2,
    current_setting('test.success')::jsonb)->>'resultCode','REVISION_CONFLICT','in-flight revocation prevents a ready asset');

select is(list_audio_cleanup(50),'[]'::jsonb,'failed and superseded attempts retain their upload grace period');
reset role;
-- Simulate an upload arriving after the attempt failed, before its grace period ends.
insert into storage.objects(bucket_id,name,metadata)
select 'artist-audio',storage_key,'{"size":104,"mimetype":"audio/mpeg"}'
from audio_assets where job_id = current_setting('test.retry_job')::uuid and attempt = 1;
select set_config('test.failed_asset',(select id::text from audio_assets
    where job_id = current_setting('test.retry_job')::uuid and attempt = 1),true);
update audio_assets set cleanup_after = statement_timestamp() - interval '1 second'
    where job_id = current_setting('test.retry_job')::uuid;
-- A snapshot reference keeps its object even if a maintenance write makes
-- the asset look due. The paused artwork must still be resumable.
insert into publications(id,owner_id,exhibition_id,artwork_id,version,number,title,image_key,evidence,narration_text,
    narration_hash,narration_citations,audio_key,audio_text_hash,approved_by)
select '40000000-0000-0000-0000-000000000001',a.owner_id,a.exhibition_id,a.artwork_id,3,1,'Audio artwork','fixture/image',
    jsonb_build_object('schemaVersion',1,'items',jsonb_build_array(jsonb_build_object(
        'id',current_setting('test.evidence'),'version',1,'ownerId',a.owner_id,'exhibitionId',a.exhibition_id,
        'publicationId','40000000-0000-0000-0000-000000000001','artworkId',null,'scope','exhibition',
        'sourceLabel','Approved source','body','Approved narration','contentHash',encode(a.text_hash,'hex')))),
    'Approved narration',a.text_hash,jsonb_build_array(jsonb_build_object('id',current_setting('test.evidence'),'version',1)),
    a.storage_key,a.text_hash,a.owner_id from audio_assets a where a.job_id = current_setting('test.job')::uuid;
update artworks set state = 'paused',active_publication_id = '40000000-0000-0000-0000-000000000001'
    where id = '20000000-0000-0000-0000-000000000001';
update audio_assets set state = 'failed',cleanup_after = statement_timestamp() - interval '1 second'
    where job_id = current_setting('test.job')::uuid;
set local role service_role;
select is(jsonb_array_length(list_audio_cleanup(50)),2,'only unreferenced failed attempts are queued for removal');
select is(complete_audio_cleanup('00000000-0000-0000-0000-000000000001',current_setting('test.failed_asset')::uuid),
    false,'late object must actually be removed');
reset role;
-- Metadata-only fixture: actual Storage API deletion is exercised by HTTP tests.
update storage.objects set name = name || '.fixture-removed' where bucket_id = 'artist-audio' and name = (
    select storage_key from audio_assets where id = current_setting('test.failed_asset')::uuid
);
set local role service_role;
select is(complete_audio_cleanup('00000000-0000-0000-0000-000000000001',current_setting('test.failed_asset')::uuid),
    true,'confirmed deletion completes cleanup');
select is(jsonb_array_length(list_audio_cleanup(50)),1,'completed cleanup does not appear again');

reset role;
select * from finish();
rollback;
