begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-000000000001', 'job-owner@example.invalid'),
    ('00000000-0000-0000-0000-000000000002', 'other-job-owner@example.invalid');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select lives_ok($$select create_exhibition('10000000-0000-0000-0000-000000000001', 'Exhibition', null, null, null,
    '[{"id":"introduction","body":"Exhibition introduction"}]', '[]')$$, 'create exhibition with scoped source');
select lives_ok($$select create_artwork('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
    1, 'Artwork', null, null, null, '[{"id":"description","body":"Artwork description"}]', '[]')$$,
    'create artwork with scoped source');
select is(save_narration_draft('20000000-0000-0000-0000-000000000001', 1, 'Artist draft')->>'narration_draft',
    'Artist draft', 'manual draft saves through revision gate');
select throws_ok($$select save_narration_draft('20000000-0000-0000-0000-000000000001', 1, 'Lost update')$$, '40001',
    'Narration revision conflict', 'manual draft stale revision is rejected');
select is(get_narration_context('20000000-0000-0000-0000-000000000001') #>> '{sources,0,ref,sectionId}',
    'description', 'context prefers the artwork and returns camelCase provenance');
select is(get_narration_context('20000000-0000-0000-0000-000000000001') #>> '{sources,1,ref,sourceSectionId}',
    'introduction', 'context includes ancestor document provenance');
select ok(not has_function_privilege('authenticated', 'reserve_ai_job(uuid,uuid,uuid,int,int,text)', 'EXECUTE'),
    'authenticated cannot claim paid work directly');
select ok(not has_function_privilege('authenticated', 'retry_ai_job(uuid,uuid,uuid,int)', 'EXECUTE'),
    'authenticated cannot claim retries directly');
select ok(not has_function_privilege('authenticated', 'complete_ai_job(uuid,uuid,int,jsonb)', 'EXECUTE'),
    'authenticated cannot forge generation results');
select ok(not has_table_privilege('authenticated', 'ai_job_attempts', 'SELECT'), 'attempt telemetry is private');
select ok(not has_function_privilege('anon', 'get_narration_context(uuid)', 'EXECUTE'), 'anonymous cannot read source text');

set local role service_role;
select throws_ok($$select reserve_ai_job('00000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 2, 1, 'single')$$,
    'P0002', 'Subject not found', 'service calls also check target ownership');
select throws_ok($$select reserve_ai_job('00000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 1, 1, 'single')$$,
    '40001', 'Narration source revision conflict', 'reservation requires current revisions');
select is(reserve_ai_job('00000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001', 2, 1, 'single', true)#>>'{job,mock}', 'true',
    'new simulated request marks the running attempt');
select is(reserve_ai_job('00000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001', 2, 1, 'single', false)->>'claimed', 'false', 'same request replays without claiming');
select is(reserve_ai_job('00000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001', 2, 1, 'single', false)#>>'{job,mock}', 'true',
    'replay preserves the existing simulation marker');
select throws_ok($$select reserve_ai_job('00000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001', 2, 1, 'best_of_two')$$,
    'P1005', 'Request ID already used with different input', 'changed payload cannot replay');
update app_policies set value = 1 where key = 'author_jobs_per_day';
select throws_ok($$select reserve_ai_job('00000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001', 2, 1, 'single')$$,
    'P1004', 'Daily author job limit reached', 'policy updates apply immediately to other requests');
update app_policies set value = 3 where key = 'author_jobs_per_day';

reset role;
select set_config('test.job', (select id::text from ai_jobs where request_id = '30000000-0000-0000-0000-000000000001'), true);
select set_config('test.source', (select source_ids->>0 from ai_jobs where id = current_setting('test.job')::uuid), true);
update ai_jobs set lease_until = statement_timestamp() - interval '1 second' where id = current_setting('test.job')::uuid;

set local role authenticated;
select is(get_ai_job(current_setting('test.job')::uuid)->>'resultCode', 'REQUEST_TIMEOUT', 'expired lease is visible as timeout');
select set_config('test.expired_job', get_ai_job(current_setting('test.job')::uuid)::text, true);
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select throws_ok($$select get_ai_job(current_setting('test.job')::uuid)$$, 'P0002', 'Job not found', 'foreign owner sees 404');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';

set local role service_role;
select is(reserve_ai_job('00000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001', 2, 1, 'single')->'job', current_setting('test.expired_job')::jsonb,
    'replaying the expired reservation matches the owner GET projection');
select is(complete_ai_job('00000000-0000-0000-0000-000000000001', current_setting('test.job')::uuid, 1, '{}'),
    current_setting('test.expired_job')::jsonb, 'expired completion also returns the owner GET projection');
select is(retry_ai_job('00000000-0000-0000-0000-000000000001', current_setting('test.job')::uuid,
    '30000000-0000-0000-0000-000000000002', 1, false)#>>'{job,mock}', 'false',
    'a newly claimed retry uses its own simulation mode');
select is(retry_ai_job('00000000-0000-0000-0000-000000000001', current_setting('test.job')::uuid,
    '30000000-0000-0000-0000-000000000002', 1)->>'claimed', 'false', 'duplicate retry returns existing attempt');
select throws_ok($$select retry_ai_job('00000000-0000-0000-0000-000000000001', current_setting('test.job')::uuid,
    '30000000-0000-0000-0000-000000000003', 1)$$,
    'P1006', 'Job attempt cannot be retried', 'other retry request cannot claim prior attempt');
select is(complete_ai_job('00000000-0000-0000-0000-000000000001', current_setting('test.job')::uuid, 1, '{}')->>'status',
    'running', 'late completion cannot alter the current attempt');
select throws_ok($$select complete_ai_job('00000000-0000-0000-0000-000000000001', current_setting('test.job')::uuid, 2,
    '{"status":"selected","reason":"passed","selected":{"answer":"Candidate","citations":["other"]}}')$$,
    '22023', 'Invalid narration citations', 'unreserved citations cannot be stored');
select throws_ok($$select complete_ai_job('00000000-0000-0000-0000-000000000001',
    current_setting('test.job')::uuid, 2, jsonb_build_object('status', 'selected', 'reason', 'passed',
        'selected', jsonb_build_object('answer', 'Candidate', 'citations', jsonb_build_array(current_setting('test.source')),
        'followUpQuestions', jsonb_build_array(repeat('a', 201)))))$$,
    '22023', 'Invalid follow-up questions', 'a question may contain at most 200 characters');
select throws_ok($$select complete_ai_job('00000000-0000-0000-0000-000000000001',
    current_setting('test.job')::uuid, 2, jsonb_build_object('status', 'selected', 'reason', 'passed',
        'selected', jsonb_build_object('answer', 'Candidate', 'citations', jsonb_build_array(current_setting('test.source')),
        'followUpQuestions', jsonb_build_array(E' \n\t'))))$$,
    '22023', 'Invalid follow-up questions', 'a question cannot consist solely of whitespace');
select is(complete_ai_job('00000000-0000-0000-0000-000000000001', current_setting('test.job')::uuid, 2,
    jsonb_build_object('status', 'selected', 'reason', 'passed', 'selected',
        jsonb_build_object('answer', 'Candidate', 'citations', jsonb_build_array(current_setting('test.source'))),
        'usage', '[{"internal":true}]'::jsonb, 'mock', true)) #>> '{result,selected,answer}',
    'Candidate', 'service can complete with a reserved citation');

select is(complete_ai_job('00000000-0000-0000-0000-000000000001', current_setting('test.job')::uuid, 2,
    jsonb_build_object('status', 'selected', 'reason', 'passed', 'selected',
        jsonb_build_object('answer', 'Candidate', 'citations', jsonb_build_array(current_setting('test.source'))),
        'usage', '[{"internal":true}]'::jsonb, 'mock', true))->>'status', 'succeeded', 'identical completion is idempotent');
select throws_ok($$select complete_ai_job('00000000-0000-0000-0000-000000000001',
    current_setting('test.job')::uuid, 2, '{}')$$, 'P1006',
    'Job attempt completed with different result', 'conflicting completion cannot replace the original result');

select is(complete_ai_job('00000000-0000-0000-0000-000000000001', current_setting('test.job')::uuid, 2,
    jsonb_build_object('status', 'selected', 'reason', 'passed', 'selected',
        jsonb_build_object('answer', 'Candidate', 'citations', jsonb_build_array(current_setting('test.source'))),
        'usage', '[{"internal":true}]'::jsonb, 'mock', true))->>'mock', 'true',
    'selected mock results identify the whole job as simulated');

set local role authenticated;
select is((select narration_draft from artworks where id = '20000000-0000-0000-0000-000000000001'), 'Artist draft',
    'generation does not overwrite the artist draft');
select ok(not (get_ai_job(current_setting('test.job')::uuid) ? 'usage'), 'job getter never exposes telemetry');
select throws_ok($$select save_narration_draft('20000000-0000-0000-0000-000000000001', 2, 'Other',
    current_setting('test.job')::uuid)$$, '22023', 'Draft does not match selected candidate',
    'selected job must match the saved text');
select is(save_narration_draft('20000000-0000-0000-0000-000000000001', 2, 'Candidate',
    current_setting('test.job')::uuid)->>'narration_draft', 'Candidate', 'artist may explicitly apply the candidate');

select is(get_artwork('20000000-0000-0000-0000-000000000001')->>'narration_draft', 'Candidate',
    'owner artwork reload returns the saved narration');
select is(list_artworks('10000000-0000-0000-0000-000000000001')#>>'{0,narration_draft}', 'Candidate',
    'owner artwork list returns the saved narration');

set local role service_role;
select set_config('test.stale_job', reserve_ai_job('00000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003',
    '20000000-0000-0000-0000-000000000001', 3, 1, 'single')#>>'{job,id}', true);

set local role authenticated;
select lives_ok($$select update_knowledge_document('exhibition', '10000000-0000-0000-0000-000000000001', 1,
    '[{"id":"introduction","body":"Revised ancestor"}]', '[]')$$, 'update ancestor during generation');

set local role service_role;
select is(complete_ai_job('00000000-0000-0000-0000-000000000001', current_setting('test.stale_job')::uuid, 1, '{"mock":true}')->>'resultCode',
    'REVISION_CONFLICT', 'ancestor edit makes completion stale');
select is(complete_ai_job('00000000-0000-0000-0000-000000000001', current_setting('test.stale_job')::uuid, 1, '{"mock":true}')->>'status',
    'failed', 'stale failure persists and duplicate completion replays');
select is(complete_ai_job('00000000-0000-0000-0000-000000000001', current_setting('test.stale_job')::uuid,
    1, '{"mock":true}')->>'mock', 'true', 'failed mock jobs retain the simulation marker');
select throws_ok($$select retry_ai_job('00000000-0000-0000-0000-000000000001', current_setting('test.stale_job')::uuid,
    '30000000-0000-0000-0000-000000000004', 1)$$, 'P1004', 'Daily author job limit reached',
    'retries count toward the same daily limit');

update app_policies set value = 10 where key = 'author_jobs_per_day';
select throws_ok($$select retry_ai_job('00000000-0000-0000-0000-000000000001', current_setting('test.stale_job')::uuid,
    '30000000-0000-0000-0000-000000000004', 1)$$, '40001', 'Narration source revision conflict',
    'a retry with quota cannot use stale ancestor revisions');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select throws_ok($$select save_narration_draft('20000000-0000-0000-0000-000000000001', 3, 'Candidate',
    current_setting('test.job')::uuid)$$, 'P0002', 'Job not found', 'another owner cannot use a source job');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select throws_ok($$select save_narration_draft('20000000-0000-0000-0000-000000000001', 3, 'Candidate',
    current_setting('test.job')::uuid)$$, '40001', 'Narration revision conflict', 'changed inputs cannot reuse a completed candidate');

reset role;
select * from finish();
rollback;
