begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
insert into auth.users(id,email)
values ('6e8b3420-79aa-4974-9d69-7dda5e50b001','b-authoring-checklist-repro@example.invalid');

set local role authenticated;
set local request.jwt.claim.sub = '6e8b3420-79aa-4974-9d69-7dda5e50b001';
select create_exhibition_draft('6e8b3420-79aa-4974-9d69-7dda5e50b002','Synthetic exhibition',
    '2026-11-14','2026-11-15','09:30','18:00','Test gallery','[]','[]');
select update_artist_profile(1,'Test artist',1,'[]','[]');
select create_artwork_draft('6e8b3420-79aa-4974-9d69-7dda5e50b003','6e8b3420-79aa-4974-9d69-7dda5e50b002',
    1,'Synthetic artwork',null,null,null,null,'[]','[]');
select save_narration_draft('6e8b3420-79aa-4974-9d69-7dda5e50b003',1,'Manually written narration about layers.');
select set_config('test.ab_authoring_evidence',upsert_evidence('6e8b3420-79aa-4974-9d69-7dda5e50b002',null,'exhibition',
    'Reviewed source','The artwork uses three layers.','{"kind":"direct"}')->>'id',true);
select approve_evidence(current_setting('test.ab_authoring_evidence')::uuid,1);
select approve_narration('6e8b3420-79aa-4974-9d69-7dda5e50b003',2,
    jsonb_build_array(jsonb_build_object('id',current_setting('test.ab_authoring_evidence'),'version',1)));

reset role;
update app_features set enabled = false where key = 'voice_required';
set local role authenticated;
select is(get_publication_checklist('6e8b3420-79aa-4974-9d69-7dda5e50b002')->'exhibitionBlockingCodes','["EXHIBITION_AUTHORING_INCOMPLETE"]'::jsonb,'basic stage is not ready to publish');
set local role service_role;
select is(publish_with_audio_config('6e8b3420-79aa-4974-9d69-7dda5e50b001','6e8b3420-79aa-4974-9d69-7dda5e50b002',gen_random_uuid(),1,'[{"artwork_id":"6e8b3420-79aa-4974-9d69-7dda5e50b003","expected_revision":2}]','{"bio":null,"introduction":null,"theme":null}',false,null,false)->'exhibitionBlocked',
    '["EXHIBITION_AUTHORING_INCOMPLETE"]'::jsonb,'publish returns the same blocker instead of a late trigger exception');
set local role authenticated;
select advance_exhibition_step('6e8b3420-79aa-4974-9d69-7dda5e50b002',1,'world');
select is(get_publication_checklist('6e8b3420-79aa-4974-9d69-7dda5e50b002')->'exhibitionBlockingCodes','["EXHIBITION_AUTHORING_INCOMPLETE"]'::jsonb,'world stage still blocks publication');
select advance_exhibition_step('6e8b3420-79aa-4974-9d69-7dda5e50b002',2,'artworks');
select is(get_publication_checklist('6e8b3420-79aa-4974-9d69-7dda5e50b002')->'exhibitionBlockingCodes','[]'::jsonb,'completed authoring is ready');
reset role;
update public.exhibitions set start_time=null where id='6e8b3420-79aa-4974-9d69-7dda5e50b002';
select ok('EXHIBITION_START_TIME_REQUIRED'=any(yeoback_private.exhibition_publication_rules('6e8b3420-79aa-4974-9d69-7dda5e50b001','6e8b3420-79aa-4974-9d69-7dda5e50b002')),'P0 missing time is reported before publish');
update public.exhibitions set start_time='19:00',end_date=start_date where id='6e8b3420-79aa-4974-9d69-7dda5e50b002';
select ok('EXHIBITION_INVALID_PERIOD'=any(yeoback_private.exhibition_publication_rules('6e8b3420-79aa-4974-9d69-7dda5e50b001','6e8b3420-79aa-4974-9d69-7dda5e50b002')),'same-day reversed hours are blocked');
update public.exhibitions set start_time='09:30' where id='6e8b3420-79aa-4974-9d69-7dda5e50b002';
set local role service_role;
select is(publish_with_audio_config('6e8b3420-79aa-4974-9d69-7dda5e50b001','6e8b3420-79aa-4974-9d69-7dda5e50b002',gen_random_uuid(),3,'[{"artwork_id":"6e8b3420-79aa-4974-9d69-7dda5e50b003","expected_revision":2}]','{"bio":null,"introduction":null,"theme":null}',false,null,false)->>'created','true','P0 stage completion publishes successfully');
reset role;
select * from finish();
rollback;
