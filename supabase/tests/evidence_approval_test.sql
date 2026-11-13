begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
-- Do not depend on the deployment flag left by prior local HTTP tests.
update public.app_features set enabled = true where key = 'voice_required';

insert into auth.users(id,email) values
    ('00000000-0000-0000-0000-000000000001','evidence-one@example.invalid'),
    ('00000000-0000-0000-0000-000000000002','evidence-two@example.invalid');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select create_exhibition('10000000-0000-0000-0000-000000000001','Exhibition',null,null,null,'[]','[]');
select create_artwork('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
    1,'Artwork',null,null,null,'[{"id":"description","body":"A bronze relief"}]','[]');
select save_narration_draft('20000000-0000-0000-0000-000000000001',1,'The artist uses bronze.');
select set_config('test.document',get_artwork('20000000-0000-0000-0000-000000000001')#>>'{document,id}',true);

select ok(not has_table_privilege('authenticated','evidence_items','INSERT'),'browser cannot write evidence directly');
select ok(not has_table_privilege('authenticated','narration_approvals','INSERT'),'browser cannot forge approval');
select ok(not has_table_privilege('authenticated','app_features','UPDATE'),'browser cannot disable voice gate');
select ok(not has_function_privilege('anon','get_review_bundle(uuid)','EXECUTE'),'anonymous cannot see review');

select throws_ok($$select upsert_evidence('10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001','artwork','Studio notes','Invented excerpt',
    jsonb_build_object('kind','document','source_document_id',current_setting('test.document'),
        'source_section_id','description','source_revision',1))$$,
    '22023','Evidence excerpt is not in the selected section','document evidence must be an exact excerpt');
select set_config('test.evidence',upsert_evidence('10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001','artwork','Studio notes','bronze relief',
    jsonb_build_object('kind','document','source_document_id',current_setting('test.document'),
        'source_section_id','description','source_revision',1))->>'id',true);
select set_config('test.citations',jsonb_build_array(jsonb_build_object('id',current_setting('test.evidence'),'version',1))::text,true);
select throws_ok($$select approve_narration('20000000-0000-0000-0000-000000000001',2,
    current_setting('test.citations')::jsonb)$$,'P1002','Approved evidence unavailable','draft evidence cannot support approval');
select is(approve_evidence(current_setting('test.evidence')::uuid,1)->>'state','approved','owner approves evidence independently');
select throws_ok($$select approve_narration('20000000-0000-0000-0000-000000000001',1,
    current_setting('test.citations')::jsonb)$$,'40001','Narration revision conflict','stale draft cannot be approved');
select is(approve_narration('20000000-0000-0000-0000-000000000001',2,
    current_setting('test.citations')::jsonb)->>'text','The artist uses bronze.','approval pins the saved narration');
select is(get_review_bundle('20000000-0000-0000-0000-000000000001')->'blocking_codes',
    '["IMAGE_REQUIRED","AUDIO_REQUIRED"]'::jsonb,'missing image and required voice block publication');
set local role service_role;
update app_features set enabled = false where key = 'voice_required';
set local role authenticated;
select is(get_review_bundle('20000000-0000-0000-0000-000000000001')->'blocking_codes',
    '["IMAGE_REQUIRED"]'::jsonb,'trusted database feature disables the audio rule');

reset role;
update artworks set revision = revision + 1,state = 'paused'
    where id = '20000000-0000-0000-0000-000000000001';
set local role authenticated;
select is(get_review_bundle('20000000-0000-0000-0000-000000000001')#>>'{approval,text}',
    'The artist uses bronze.','revision and state changes retain approval for identical text and sources');
select lives_ok($$select save_narration_draft('20000000-0000-0000-0000-000000000001',3,'Rewritten draft.')$$,
    'owner can edit approved text as a separate draft');
select is(get_review_bundle('20000000-0000-0000-0000-000000000001')->'approval',
    'null'::jsonb,'text changes invalidate approval for new publication');
select lives_ok($$select approve_narration('20000000-0000-0000-0000-000000000001',4,
    current_setting('test.citations')::jsonb)$$,'changed text can be approved separately');

select lives_ok($$select update_knowledge_document('artwork','20000000-0000-0000-0000-000000000001',1,
    '[{"id":"description","body":"Revised bronze relief"}]','[]')$$,
    'ordinary document edit updates provenance independently of the artwork revision');
select is(get_review_bundle('20000000-0000-0000-0000-000000000001')->'approval',
    'null'::jsonb,'a new document revision invalidates the prior approval for new publication');
select throws_ok($$select approve_evidence(current_setting('test.evidence')::uuid,1)$$,
    'P1001','Evidence source revision conflict','source freshness is rechecked during evidence approval');

select is(upsert_evidence('10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001','artwork','New notes','Author observation','{"kind":"direct"}',
    current_setting('test.evidence')::uuid,1)->>'version','2','edit creates a fresh draft version');
select is(get_review_bundle('20000000-0000-0000-0000-000000000001')->'approval',
    'null'::jsonb,'a replacement draft invalidates approval for new publication');
reset role;
select is((select state from evidence_items where id = current_setting('test.evidence')::uuid and version = 1),
    'approved','creating a draft does not mutate the previously approved version');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select throws_ok($$select approve_evidence(current_setting('test.evidence')::uuid,2)$$,
    'P0002','Evidence not found','another artist cannot approve the evidence');
select throws_ok($$select get_review_bundle('20000000-0000-0000-0000-000000000001')$$,
    'P0002','Subject not found','another artist cannot inspect the review');

reset role;
select * from finish();
rollback;
