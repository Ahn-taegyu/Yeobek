begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public,extensions;
select no_plan();
insert into auth.users(id,email,email_confirmed_at) values
    ('00000000-0000-0000-0000-000000000001','automation-owner@example.invalid',now()),
    ('00000000-0000-0000-0000-000000000002','automation-operator@example.invalid',now());
insert into operators(user_id) values ('00000000-0000-0000-0000-000000000002');
select ok(not has_table_privilege('authenticated','outbound_messages','SELECT'),'outbox table is private');
select ok(not has_function_privilege('authenticated','check_outbound_dispatch(uuid,uuid,boolean)','EXECUTE'),
    'browser cannot resolve dispatch targets');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select is(get_contact_consents()#>>'{0,granted}','false','marketing consent starts disabled');
select is(get_contact_consents()#>>'{1,granted}','false','transactional consent starts disabled');
select is(set_contact_consent('transactional',true,0)->>'revision','1','first grant starts at revision one');
select throws_ok($$select set_contact_consent('transactional',false,0)$$,'40001','Consent revision conflict','consent update is CAS');
select throws_ok($$select list_outbox(50)$$,'P0002','Not found','nonoperator cannot browse outbox');
set local role service_role;
select set_config('test.event',enqueue_automation_event('notify','published','publish:sample',
    '00000000-0000-0000-0000-000000000001',null,1,true)->>'id',true);
select is(enqueue_automation_event('notify','published','publish:sample','00000000-0000-0000-0000-000000000001',null,1,true)->>'id',
    current_setting('test.event'),'same event is deduplicated');
select throws_ok($$select enqueue_automation_event('notify','exhibition_created','publish:sample',
    '00000000-0000-0000-0000-000000000001',null,1,true)$$,'P1005','Request ID already used with different input',
    'same dedupe key cannot change trigger meaning');
select is(claim_automation_events(10,false),'[]'::jsonb,'live worker does not claim mock events');
select is(claim_automation_events(10,true)#>>'{0,attempt}','1','worker claims one event attempt');
select throws_ok($$select complete_automation_event(current_setting('test.event')::uuid,1,'processed','OK',
    '{"channel":"mail","category":"transactional","body":"Publication ready","question":"private"}')$$,
    '22023','Invalid automation outbox payload','outbox payload does not accept questions');
select is(complete_automation_event(current_setting('test.event')::uuid,1,'processed','OK',
    '{"channel":"mail","category":"transactional","body":"Publication ready"}')->>'state','processed','event and draft commit together');
select is(complete_automation_event(current_setting('test.event')::uuid,1,'processed','OK',
    '{"channel":"mail","category":"transactional","body":"Publication ready"}')->>'state','processed','exact completion replay succeeds');
select throws_ok($$select complete_automation_event(current_setting('test.event')::uuid,1,'processed','OK',
    '{"channel":"mail","category":"transactional","body":"Different"}')$$,'40001','Automation attempt is not active',
    'changed completion cannot replace committed draft');
select is(claim_outbound_messages(10,true),'[]'::jsonb,'draft default requires operator approval');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select set_config('test.message',list_outbox(50)#>>'{0,id}',true);
select is(decide_outbox(current_setting('test.message')::uuid,1,true)->>'state','approved','operator approves exact draft revision');
select throws_ok($$select decide_outbox(current_setting('test.message')::uuid,1,true)$$,'40001','Outbox revision conflict',
    'cannot approve stale revision');
set local role service_role;
select set_config('test.attempt',claim_outbound_messages(10,true)#>>'{0,attempt}',true);
select throws_ok($$select complete_outbound_message(current_setting('test.message')::uuid,
    current_setting('test.attempt')::uuid,'accepted',null,'ACCEPTED')$$,'40001','Dispatch payload was not issued',
    'worker cannot record acceptance before releasing payload');
select is(check_outbound_dispatch(current_setting('test.message')::uuid,current_setting('test.attempt')::uuid,true)->>'recipient',
    'automation-owner@example.invalid','dispatch resolves confirmed recipient only after a claim');
select is(check_outbound_dispatch(current_setting('test.message')::uuid,current_setting('test.attempt')::uuid,true),null,
    'same claim cannot issue another send payload');
select is(complete_outbound_message(current_setting('test.message')::uuid,current_setting('test.attempt')::uuid,
    'unknown',null,'AMBIGUOUS_TRANSPORT')->>'state','unknown','uncertain receipt remains unknown');
select is(claim_outbound_messages(10,true),'[]'::jsonb,'unknown dispatch is never automatically retried');

update automation_policies set mode = 'auto' where kind = 'notify';
select set_config('test.event2',enqueue_automation_event('notify','draft_ready','draft:sample',
    '00000000-0000-0000-0000-000000000001',null,1,true)->>'id',true);
select claim_automation_events(10,true);
select complete_automation_event(current_setting('test.event2')::uuid,1,'processed','OK',
    '{"channel":"mail","category":"transactional","body":"Draft ready"}');
select set_config('test.auto',(claim_outbound_messages(10,true)->0)::text,true);
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select set_contact_consent('transactional',false,1);
set local role service_role;
select is(check_outbound_dispatch((current_setting('test.auto')::jsonb->>'id')::uuid,
    (current_setting('test.auto')::jsonb->>'attempt')::uuid,true),null,'revocation after claim blocks payload delivery');
reset role;
select is((select state from outbound_messages where event_id = current_setting('test.event2')::uuid),
    'suppressed','revoked consent suppresses the queued send');
set local role service_role;
select set_config('test.expired_queue',enqueue_automation_event('notify','published','published:expired-queue',
    '00000000-0000-0000-0000-000000000001',null,1,true)->>'id',true);
select set_config('test.expired_outbox',enqueue_automation_event('notify','published','published:expired-outbox',
    '00000000-0000-0000-0000-000000000001',null,1,true)->>'id',true);
reset role;
update automation_events set expires_at = statement_timestamp() - interval '1 second'
    where id = current_setting('test.expired_queue')::uuid;
set local role service_role;
select is(claim_automation_events(10,true)#>>'{0,id}',current_setting('test.expired_outbox'),'claim skips expired events');
select complete_automation_event(current_setting('test.expired_outbox')::uuid,1,'processed','OK',
    '{"channel":"mail","category":"transactional","body":"Expired publication"}');
reset role;
update automation_events set expires_at = statement_timestamp() - interval '1 second'
    where id = current_setting('test.expired_outbox')::uuid;
set local role service_role;
select is(claim_outbound_messages(10,true),'[]'::jsonb,'expired event cannot produce a dispatch claim');
reset role;
select is((select result_code from outbound_messages where event_id = current_setting('test.expired_outbox')::uuid),
    'EVENT_EXPIRED','expired outbox message is suppressed explicitly');
set local role service_role;
update automation_policies set mode = 'off' where kind = 'notify';
select set_config('test.off',enqueue_automation_event('notify','published','published:off',
    '00000000-0000-0000-0000-000000000001',null,1,true)->>'id',true);
select is(claim_automation_events(10,true),'[]'::jsonb,'off policy issues no execution claim');
reset role;
select is((select state from automation_events where id = current_setting('test.off')::uuid),'suppressed','off policy settles event');
select is((select attempt from automation_events where id = current_setting('test.off')::uuid),0,'off policy never allocates an attempt');

set local role service_role;
update automation_policies set mode = 'auto',allowed_categories = array['transactional','marketing'] where kind = 'notify';
select set_config('test.marketing_event',enqueue_automation_event('notify','exhibition_ended','marketing:consent',
    '00000000-0000-0000-0000-000000000001',null,1,true)->>'id',true);
select claim_automation_events(10,true);
select complete_automation_event(current_setting('test.marketing_event')::uuid,1,'processed','OK',
    '{"channel":"mail","category":"marketing","body":"An invitation"}');
reset role;
select is((select state from outbound_messages where event_id = current_setting('test.marketing_event')::uuid),'draft',
    'marketing stays draft even when auto policy lists it');
select set_config('test.marketing_id',(select id::text from outbound_messages
    where event_id = current_setting('test.marketing_event')::uuid),true);
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select set_contact_consent('transactional',true,2);
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select decide_outbox(current_setting('test.marketing_id')::uuid,1,true);
select throws_ok($$select claim_outbound_messages(10,true)$$,'42501','permission denied for function claim_outbound_messages',
    'operator browser cannot forge a worker claim');
select throws_ok($$select complete_outbound_message(current_setting('test.marketing_id')::uuid,gen_random_uuid(),
    'accepted',null,'ACCEPTED')$$,'42501','permission denied for function complete_outbound_message',
    'operator browser cannot forge a dispatch completion');
set local role service_role;
select is(claim_outbound_messages(10,true),'[]'::jsonb,'operator approval and transactional consent do not permit marketing');
reset role;
select is((select result_code from outbound_messages where id = current_setting('test.marketing_id')::uuid),'CONSENT_REQUIRED',
    'marketing requires its own consent');

set local role service_role;
select set_config('test.policy_event',enqueue_automation_event('notify','published','published:policy-change',
    '00000000-0000-0000-0000-000000000001',null,1,true)->>'id',true);
select claim_automation_events(10,true);
select complete_automation_event(current_setting('test.policy_event')::uuid,1,'processed','OK',
    '{"channel":"mail","category":"transactional","body":"Publication ready"}');
select set_config('test.policy_claim',(claim_outbound_messages(10,true)->0)::text,true);
update automation_policies set mode = 'draft' where kind = 'notify';
select is(check_outbound_dispatch((current_setting('test.policy_claim')::jsonb->>'id')::uuid,
    (current_setting('test.policy_claim')::jsonb->>'attempt')::uuid,true),null,
    'policy change after claim prevents a send permit');
reset role;
select is((select state from outbound_messages where event_id = current_setting('test.policy_event')::uuid),'draft',
    'policy change returns the message for renewed review');

set local role service_role;
update app_policies set value = 2 where key = 'automation_event_max_attempts';
select set_config('test.lease',enqueue_automation_event('triage','job_failed','job:lease',
    '00000000-0000-0000-0000-000000000001',null,1,true)->>'id',true);
select is(claim_automation_events(10,true)#>>'{0,attempt}','1','first event claim opens attempt one');
reset role;
update automation_events set lease_until = statement_timestamp() - interval '1 second' where id = current_setting('test.lease')::uuid;
set local role service_role;
select is(claim_automation_events(10,true)#>>'{0,attempt}','2','expired lease is recovered as a new attempt');
select throws_ok($$select complete_automation_event(current_setting('test.lease')::uuid,1,'processed','OK')$$,
    '40001','Automation attempt is not active','superseded attempt cannot complete');
reset role;
update automation_events set lease_until = statement_timestamp() - interval '1 second' where id = current_setting('test.lease')::uuid;
set local role service_role;
select is(claim_automation_events(10,true),'[]'::jsonb,'configured attempt cap prevents reclaim');
reset role;
select is((select result_code from automation_events where id = current_setting('test.lease')::uuid),'REQUEST_TIMEOUT',
    'last expired attempt settles as timeout');

set local role service_role;
insert into automation_bindings(provider,provider_scope,external_id,owner_id) values
    ('channeltalk','test-channel','other-user','00000000-0000-0000-0000-000000000002');
select set_config('test.support',enqueue_automation_event('support','support_received','support:other-binding',
    '00000000-0000-0000-0000-000000000001',null,1,true)->>'id',true);
select claim_automation_events(10,true);
select throws_ok($$select complete_automation_event(current_setting('test.support')::uuid,1,'processed','OK',
    '{"channel":"support","category":"usage","body":"Help response","bindingScope":"test-channel","bindingId":"other-user","destinationId":"test-chat"}')$$,
    '22023','Invalid automation outbox payload','another owner binding cannot be selected for a reply');
reset role;
select ok(not exists(select 1 from outbound_messages where event_id = current_setting('test.support')::uuid),
    'rejected binding creates no outbox row');
select * from finish();
rollback;
