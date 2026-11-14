begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public,extensions;
select no_plan();
-- Retained local fixtures do not change this test's queue, principal or policy assumptions.
update automation_events set state = 'suppressed' where state in ('queued','running');
update outbound_messages set state = 'suppressed' where state in ('approved','sending');
update operators set enabled = false;
update automation_policies set mode = 'draft';
insert into auth.users(id,email) values
    ('00000000-0000-0000-0000-000000000001','ledger-owner@example.invalid'),
    ('00000000-0000-0000-0000-000000000002','ledger-operator@example.invalid');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select create_exhibition('10000000-0000-0000-0000-000000000001','Ledger exhibition',null,null,null,'[]','[]');
select create_artwork('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
    1,'Ledger artwork',null,null,null,'[]','[]');
select ok(not has_function_privilege('authenticated','reserve_automation_job(uuid,integer,boolean)','EXECUTE'),
    'browser cannot reserve an automation job');
set local role service_role;
select set_config('test.event',enqueue_automation_event('notify','published','published:ledger',
    '00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',1,true)->>'id',true);
select claim_automation_events(10,true);
select set_config('test.job',reserve_automation_job(current_setting('test.event')::uuid,1,true)->>'jobId',true);
select is(reserve_automation_job(current_setting('test.event')::uuid,1,true)->>'claimed','false','same event attempt claims one job');
select throws_ok($$select complete_automation_event(current_setting('test.event')::uuid,1,'processed','OK')$$,
    '40001','Automation job completion is required','event cannot bypass linked job completion');
select throws_ok($$select complete_automation_job(current_setting('test.event')::uuid,current_setting('test.job')::uuid,1,'processed','OK',
    null,'[{"provider":"mock","model":"mock","rawQuestion":"private"}]')$$,
    '22023','Invalid automation usage','raw metadata is rejected');
select set_config('test.out','{"channel":"mail","category":"transactional","body":"Approved template text"}',true);
select is(complete_automation_job(current_setting('test.event')::uuid,current_setting('test.job')::uuid,1,'processed','OK',
    current_setting('test.out')::jsonb)->>'state','succeeded','outbox and ledger complete together');
select is(complete_automation_job(current_setting('test.event')::uuid,current_setting('test.job')::uuid,1,'processed','OK',
    current_setting('test.out')::jsonb)->>'state','succeeded','exact completion is idempotent');
select throws_ok($$select complete_automation_job(current_setting('test.event')::uuid,current_setting('test.job')::uuid,1,
    'processed','OK',current_setting('test.out')::jsonb,'[]','[]',1)$$,
    '40001','Automation job already completed','modified completion is rejected');
update app_policies set value = 1 where key = 'author_jobs_per_day';
select is(reserve_ai_job('00000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',1,1,'single',true)->>'claimed','true','automation does not spend the author quota');
set local role authenticated;
select throws_ok($$select get_ai_job(current_setting('test.job')::uuid)$$,'P0002','Job not found','author API hides automation jobs');
reset role;
select is((select count(*) from outbound_messages where event_id = current_setting('test.event')::uuid),1::bigint,
    'completion replay cannot duplicate the outbox');
select is((select result from ai_jobs where id = current_setting('test.job')::uuid),null,'job result never stores outbound body');

set local role service_role;
select set_config('test.global',enqueue_automation_event('briefing','daily_briefing','daily:ledger',null,null,null,true)->>'id',true);
select claim_automation_events(10,true);
select throws_ok($$select reserve_automation_job(current_setting('test.global')::uuid,1,true)$$,
    'P1003','Automation operator is not configured','operator-free deployment cannot run global AI');
insert into operators(user_id) values ('00000000-0000-0000-0000-000000000002');
select set_config('test.global_job',reserve_automation_job(current_setting('test.global')::uuid,1,true)->>'jobId',true);
reset role;
select is((select owner_id from ai_jobs where id = current_setting('test.global_job')::uuid),
    '00000000-0000-0000-0000-000000000002'::uuid,'global job uses the enabled operator principal');
update automation_events set lease_until = statement_timestamp() - interval '1 second' where id = current_setting('test.global')::uuid;
set local role service_role;
select claim_automation_events(10,true);
set local role service_role;
update app_policies set value = 1 where key = 'automation_jobs_per_day';
select throws_ok($$select reserve_automation_job(current_setting('test.global')::uuid,2,true)$$,
    'P1030','Daily automation job limit reached','new claim can be denied by independent quota');
reset role;
select is((select status from ai_jobs where id = current_setting('test.global_job')::uuid),'failed',
    'quota denial leaves the superseded ledger attempt terminal');
set local role service_role;
update app_policies set value = 100 where key = 'automation_jobs_per_day';
select is(reserve_automation_job(current_setting('test.global')::uuid,2,true)->>'jobId',current_setting('test.global_job'),
    'expired attempt reuses the job ID');
select throws_ok($$select complete_automation_job(current_setting('test.global')::uuid,current_setting('test.global_job')::uuid,
    1,'processed','OK')$$,'40001','Automation attempt is not active','old worker cannot settle new attempt');
reset role;
select is((select result_code from ai_job_attempts where job_id = current_setting('test.global_job')::uuid and attempt = 1),
    'REQUEST_TIMEOUT','superseded attempt keeps timeout history');
set local role service_role;
update app_policies set value = 2 where key = 'automation_event_max_attempts';
reset role;
update automation_events set lease_until = statement_timestamp() - interval '1 second' where id = current_setting('test.global')::uuid;
set local role service_role;
select is(claim_automation_events(10,true),'[]'::jsonb,'attempt cap does not issue another claim');
reset role;
select is((select result_code from ai_job_attempts where job_id = current_setting('test.global_job')::uuid and attempt = 2),
    'REQUEST_TIMEOUT','attempt cap closes the last ledger attempt');

set local role service_role;
select set_config('test.off',enqueue_automation_event('notify','published','published:ledger-off',
    '00000000-0000-0000-0000-000000000001',null,1,true)->>'id',true);
select set_config('test.expired',enqueue_automation_event('triage','job_failed','job:ledger-expired',
    '00000000-0000-0000-0000-000000000001',null,1,true)->>'id',true);
select claim_automation_events(10,true);
select set_config('test.off_job',reserve_automation_job(current_setting('test.off')::uuid,1,true)->>'jobId',true);
select set_config('test.expired_job',reserve_automation_job(current_setting('test.expired')::uuid,1,true)->>'jobId',true);
update automation_policies set mode = 'off' where kind = 'notify';
reset role;
update automation_events set lease_until = statement_timestamp() - interval '1 second' where id = current_setting('test.off')::uuid;
update automation_events set expires_at = statement_timestamp() - interval '1 second' where id = current_setting('test.expired')::uuid;
set local role service_role;
select is(claim_automation_events(10,true),'[]'::jsonb,'off and expired events yield no claim');
reset role;
select is((select result_code from ai_job_attempts where job_id = current_setting('test.off_job')::uuid),
    'POLICY_OFF','off policy closes the abandoned ledger attempt');
select is((select result_code from ai_job_attempts where job_id = current_setting('test.expired_job')::uuid),
    'EVENT_EXPIRED','expiry drain closes the abandoned ledger attempt');
set local role service_role;
update automation_policies set mode = 'draft' where kind = 'notify';
select set_config('test.late_off',enqueue_automation_event('notify','published','published:configuration-race',
    '00000000-0000-0000-0000-000000000001',null,1,true)->>'id',true);
select set_config('test.deleted_target',enqueue_automation_event('triage','job_failed','job:deleted-target',
    '00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',1,true)->>'id',true);
select claim_automation_events(10,true);
update automation_policies set mode = 'off' where kind = 'notify';
reset role;
update exhibitions set deleted_at = statement_timestamp() where id = '10000000-0000-0000-0000-000000000001';
set local role service_role;
select is(reserve_automation_job(current_setting('test.late_off')::uuid,1,true)->>'claimed','false',
    'policy turned off after claim cannot reserve AI work');
select is(reserve_automation_job(current_setting('test.deleted_target')::uuid,1,true)->>'claimed','false',
    'deleted target cannot reserve AI work');
reset role;
select is((select result_code from automation_events where id = current_setting('test.deleted_target')::uuid),
    'TARGET_UNAVAILABLE','deleted target is explicitly suppressed');
select ok(not exists (select 1 from ai_jobs where automation_event_id in (
    current_setting('test.deleted_target')::uuid,current_setting('test.late_off')::uuid)),
    'late suppression does not charge a ledger attempt');
select * from finish();
rollback;
