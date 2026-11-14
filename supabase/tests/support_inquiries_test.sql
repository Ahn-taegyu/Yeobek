begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public,extensions;
select no_plan();

select ok(not has_table_privilege('service_role','support_inquiries','SELECT'),'inbox data is available through bounded RPCs only');
select ok(not has_table_privilege('authenticated','support_inquiries','SELECT'),'artists cannot read inbox storage');
select ok(not has_function_privilege('anon','receive_support_inquiry(text,text,text,text,text,boolean,timestamptz,boolean)','EXECUTE'),'anonymous users cannot enqueue inquiries');
select ok(not has_function_privilege('authenticated','get_support_context(uuid,integer,boolean)','EXECUTE'),'artists cannot read context directly');
select ok(not has_function_privilege('service_role','set_support_binding(text,text,uuid,boolean,integer)','EXECUTE'),'binding has a separate operator entry point');

insert into auth.users(id,email) values
    ('00000000-0000-4000-8000-000000120001','support-one@example.invalid'),
    ('00000000-0000-4000-8000-000000120002','support-two@example.invalid');
insert into public.operators(user_id) values ('00000000-0000-4000-8000-000000120001');
update public.automation_policies set mode = 'auto' where kind = 'support';
update public.help_articles set published = false;
insert into public.help_articles(id,title,body,published) values
    ('00000000-0000-4000-8000-000000120003','Help title','Published help',true),
    ('00000000-0000-4000-8000-000000120004','Hidden title','Unpublished help',false);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000120002';
select throws_ok($$select set_support_binding('test-channel','test-user','00000000-0000-4000-8000-000000120002',true,0)$$,
    'P0002','Not found','a non-operator cannot bind a customer');
select create_exhibition('00000000-0000-4000-8000-000000120005','Other account private title',null,null,null,'[]','[]');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000120001';
select create_exhibition('00000000-0000-4000-8000-000000120006','Own private title',null,null,null,'[]','[]');
select is(set_support_binding('test-channel','test-user','00000000-0000-4000-8000-000000120001',true,0)->>'revision',
    '1','operator creates a binding at revision one');
select throws_ok($$select set_support_binding('test-channel','test-user','00000000-0000-4000-8000-000000120002',true,0)$$,
    '40001','Support binding changed','binding creation is compare-and-swap');
set local role service_role;
select set_config('test.support_received',(receive_support_inquiry('test-channel','test-user','pinned-chat','test-message',
    '문의 내용',false,transaction_timestamp(),true))::text,true);
select is(current_setting('test.support_received')::jsonb->>'duplicate','false','new message is accepted');
select is(receive_support_inquiry('test-channel','test-user','pinned-chat','test-message','문의 내용',
    false,transaction_timestamp(),true),current_setting('test.support_received')::jsonb || '{"duplicate":true}','replay returns original event');
select throws_ok($$select receive_support_inquiry('test-channel','test-user','different-chat','test-message','문의 내용',
    false,transaction_timestamp(),true)$$,'P1005','Message ID already used with different input','same ID cannot change the chat');
select set_config('test.support_unlinked',receive_support_inquiry('other-channel','test-user','chat','unlinked-message','문의',
    false,statement_timestamp(),true)->>'eventId',true);
select set_config('test.support_no_text',receive_support_inquiry('test-channel','test-user','chat','empty-message',null,
    false,statement_timestamp(),true)->>'eventId',true);
select set_config('test.support_truncated',receive_support_inquiry('test-channel','test-user','chat','truncated-message','문의',
    true,statement_timestamp(),true)->>'eventId',true);
select is(claim_support_events(10,true,'other-channel'),'[]'::jsonb,'no queued work for another channel');
select is(claim_support_events(10,false,'test-channel'),'[]'::jsonb,'mock events cannot become real work');
select set_config('test.support_event',current_setting('test.support_received')::jsonb->>'eventId',true);
select is(jsonb_array_length(claim_support_events(10,true,'test-channel')),1,'only the supported bound inquiry is claimed');
select set_config('test.support_context',get_support_context(current_setting('test.support_event')::uuid,1,true)::text,true);
select is(current_setting('test.support_context')::jsonb - array['eventId','question','evidence','revision'],'{}'::jsonb,
    'context has exact top-level fields');
select is(current_setting('test.support_context')::jsonb->'evidence',jsonb_build_array(
    '{"id":"help:1","kind":"help","body":"Published help"}'::jsonb,
    '{"id":"status:account","kind":"status","body":"삭제되지 않은 전시 수입니다. 초안 1건, 게시 0건, 일시 중지 0건."}'::jsonb),
    'context includes only published help and counts for the frozen owner');
select is(get_support_context(current_setting('test.support_event')::uuid,2,true),null,'wrong attempt cannot see context');
select set_config('test.support_job',reserve_automation_job(current_setting('test.support_event')::uuid,1,true)->>'jobId',true);
select set_config('test.support_completed',complete_support_job(current_setting('test.support_event')::uuid,
    current_setting('test.support_job')::uuid,1,true,current_setting('test.support_context')::jsonb->>'revision',
    'processed','OK','Reply','status','[]','[]',0)::text,true);
select is(current_setting('test.support_completed')::jsonb->'event'->>'state','processed','context-bound reply completes');
select is(complete_support_job(current_setting('test.support_event')::uuid,current_setting('test.support_job')::uuid,
    1,true,current_setting('test.support_context')::jsonb->>'revision','processed','OK','Reply','status','[]','[]',0),
    current_setting('test.support_completed')::jsonb,'identical completion replay is idempotent');
select is(claim_support_outbound(10,true,'other-channel'),'[]'::jsonb,'outbox claim is restricted to the configured channel');
select set_config('test.support_send',(claim_support_outbound(10,true,'test-channel')->0)::text,true);

reset role;
select is((select result_code from automation_events where id = current_setting('test.support_unlinked')::uuid),
    'UNLINKED_ACCOUNT','same external ID in another channel never inherits a binding');
select is((select result_code from automation_events where id = current_setting('test.support_no_text')::uuid),
    'UNSUPPORTED_INQUIRY','null question is escalated');
select is((select result_code from automation_events where id = current_setting('test.support_truncated')::uuid),
    'UNSUPPORTED_INQUIRY','truncated question is escalated');
select is((select destination_id from outbound_messages where event_id = current_setting('test.support_event')::uuid),
    'pinned-chat','destination comes from the verified inbox record');
update public.help_articles set title = 'Changed help' where id = '00000000-0000-4000-8000-000000120003';
select is((select revision from help_articles where id = '00000000-0000-4000-8000-000000120003'),2,'help title changes bump revision');
set local role service_role;
select is(check_outbound_dispatch((current_setting('test.support_send')::jsonb->>'id')::uuid,
    (current_setting('test.support_send')::jsonb->>'attempt')::uuid,true),null,'changed help invalidates approval before transport');
select set_config('test.support_stale',receive_support_inquiry('test-channel','test-user','pinned-chat','stale-message',
    '새 문의',false,statement_timestamp(),true)->>'eventId',true);
select claim_support_events(1,true,'test-channel');
select set_config('test.support_old_context',get_support_context(current_setting('test.support_stale')::uuid,1,true)::text,true);
select set_config('test.support_stale_job',reserve_automation_job(current_setting('test.support_stale')::uuid,1,true)->>'jobId',true);
set local role authenticated;
select is(set_support_binding('test-channel','test-user','00000000-0000-4000-8000-000000120002',true,1)->>'revision',
    '2','operator reassignment bumps the binding revision');
set local role service_role;
select is(get_support_context(current_setting('test.support_stale')::uuid,1,true),null,'reassignment revokes context for the old inquiry');
select is(complete_support_job(current_setting('test.support_stale')::uuid,current_setting('test.support_stale_job')::uuid,
    1,true,current_setting('test.support_old_context')::jsonb->>'revision','processed','OK','Reply','status','[]','[]',0)
    ->'event'->>'resultCode','STALE_CONTEXT','reassignment suppresses the stale model result');
reset role;
select is((select result_code from outbound_messages where event_id = current_setting('test.support_event')::uuid),
    'STALE_CONTEXT','stale approval records a safe reason');
select is((select count(*) from outbound_messages where event_id = current_setting('test.support_stale')::uuid),
    0::bigint,'stale completion records no outbound reply');

select * from finish();
rollback;
