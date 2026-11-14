begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public,extensions;
select no_plan();

select set_config('test.training_owner',gen_random_uuid()::text,true);
select set_config('test.training_exhibition',gen_random_uuid()::text,true);
select set_config('test.training_artwork',gen_random_uuid()::text,true);
select set_config('test.training_request',gen_random_uuid()::text,true);
select set_config('test.training_child_request',gen_random_uuid()::text,true);
insert into auth.users(id,email) values (current_setting('test.training_owner')::uuid,'training-owner@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.training_owner'),true);
select create_exhibition(current_setting('test.training_exhibition')::uuid,'Training fixture',null,null,null,
    '[{"id":"introduction","body":"An exhibition source excerpt."}]','[]');
select create_artwork(current_setting('test.training_artwork')::uuid,current_setting('test.training_exhibition')::uuid,
    1,'Artwork fixture',null,null,null,'[]','[]');

select throws_ok($$select create_training_batch(current_setting('test.training_owner')::uuid,
    current_setting('test.training_exhibition')::uuid,current_setting('test.training_request')::uuid,1,true)$$,
    '42501',null,'batch mutation requires worker access');
set local role service_role;
select set_config('test.training_batch_data',create_training_batch(current_setting('test.training_owner')::uuid,
    current_setting('test.training_exhibition')::uuid,current_setting('test.training_request')::uuid,1,true)::text,true);
select set_config('test.training_batch',current_setting('test.training_batch_data')::jsonb->>'id',true);
select set_config('test.training_qa',current_setting('test.training_batch_data')::jsonb#>>'{targets,0,id}',true);
select set_config('test.training_narration',current_setting('test.training_batch_data')::jsonb#>>'{targets,1,id}',true);
select is(current_setting('test.training_batch_data')::jsonb->>'status','queued','the batch starts with queued targets');
select is(jsonb_array_length(current_setting('test.training_batch_data')::jsonb->'targets'),3,
    'one artwork schedules narration plus its Q&A and exhibition Q&A');
select is(create_training_batch(current_setting('test.training_owner')::uuid,
    current_setting('test.training_exhibition')::uuid,current_setting('test.training_request')::uuid,1,true)->>'id',
    current_setting('test.training_batch'),'replay returns the same immutable target manifest');
select throws_ok($$select create_training_batch(current_setting('test.training_owner')::uuid,
    current_setting('test.training_exhibition')::uuid,current_setting('test.training_request')::uuid,1,false)$$,
    'P1005','Request ID already used with different input','request ID cannot replay with a different scope flag');

reset role;
select is((select count(*) from ai_job_attempts where owner_id = current_setting('test.training_owner')::uuid),0::bigint,
    'manifest creation consumes no job attempts');
set local role authenticated;
select is(get_training_batch(current_setting('test.training_batch')::uuid)->>'id',current_setting('test.training_batch'),
    'owner can read the manifest');
set local role service_role;
select set_config('test.training_job',claim_training_target(current_setting('test.training_owner')::uuid,
    current_setting('test.training_batch')::uuid,current_setting('test.training_qa')::uuid,
    current_setting('test.training_child_request')::uuid,0,false)#>>'{job,id}',true);
select is(claim_training_target(current_setting('test.training_owner')::uuid,current_setting('test.training_batch')::uuid,
    current_setting('test.training_qa')::uuid,current_setting('test.training_child_request')::uuid,0,false)->>'claimed',
    'false','same target request replays without another attempt');
select throws_ok($$select claim_training_target(current_setting('test.training_owner')::uuid,
    current_setting('test.training_batch')::uuid,current_setting('test.training_narration')::uuid,gen_random_uuid(),0,false)$$,
    'P1006','A training target is already running','a second target waits while the first lease is active');
select is(complete_expected_qa_job(current_setting('test.training_owner')::uuid,current_setting('test.training_job')::uuid,
    1,'{"status":"failed","resultCode":"PROVIDER_UNAVAILABLE"}')->>'status','failed','first target can record provider failure');
select is(claim_training_target(current_setting('test.training_owner')::uuid,current_setting('test.training_batch')::uuid,
    current_setting('test.training_qa')::uuid,gen_random_uuid(),1,false)#>>'{job,attempt}',
    '2','failed child retries individually in the same job');
select is(complete_expected_qa_job(current_setting('test.training_owner')::uuid,current_setting('test.training_job')::uuid,
    1,'{"status":"succeeded","items":[]}')->>'status','running','late previous completion cannot finish the retried attempt');
select is(complete_expected_qa_job(current_setting('test.training_owner')::uuid,current_setting('test.training_job')::uuid,
    2,'{"status":"failed","resultCode":"PROVIDER_UNAVAILABLE"}')->>'status','failed','retry records its own failure');
select set_config('test.training_narration_job',claim_training_target(current_setting('test.training_owner')::uuid,
    current_setting('test.training_batch')::uuid,current_setting('test.training_narration')::uuid,
    gen_random_uuid(),0,false)#>>'{job,id}',true);
select throws_ok($$select retry_expected_qa_job(current_setting('test.training_owner')::uuid,
    current_setting('test.training_job')::uuid,gen_random_uuid(),2,false)$$,
    'P1006','A training target is already running','standalone Q&A retry cannot bypass an active sibling');
select is(complete_ai_job(current_setting('test.training_owner')::uuid,current_setting('test.training_narration_job')::uuid,1,
    '{"status":"abstained","reason":"generation_failed","resultCode":"PROVIDER_UNAVAILABLE","routing":"operator"}')->>'kind',
    'narration','the batch child uses existing narration completion');
select is(retry_expected_qa_job(current_setting('test.training_owner')::uuid,current_setting('test.training_job')::uuid,
    gen_random_uuid(),2,false)#>>'{job,attempt}','3','standalone Q&A retry is allowed when no sibling is active');
select throws_ok($$select retry_ai_job(current_setting('test.training_owner')::uuid,
    current_setting('test.training_narration_job')::uuid,gen_random_uuid(),1,false)$$,
    'P1006','A training target is already running','standalone narration retry also enforces the batch guard');
select is(complete_expected_qa_job(current_setting('test.training_owner')::uuid,current_setting('test.training_job')::uuid,
    3,'{"status":"succeeded","items":[]}')->>'status','abstained','empty generated result records abstention');
reset role;
select is((select count(*) from ai_job_attempts where owner_id = current_setting('test.training_owner')::uuid),4::bigint,
    'quota ledger records only accepted claims and retries');

select * from finish();
rollback;
