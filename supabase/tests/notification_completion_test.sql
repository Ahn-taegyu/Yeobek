begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public,extensions;
select no_plan();

delete from public.automation_notify_signals;
update public.automation_events set state = 'suppressed',lease_until = null
    where kind = 'notify' and state in ('queued','running');
update public.automation_policies set mode = 'draft' where kind = 'notify';
update public.outbound_messages set state = 'suppressed',lease_until = null where state in ('approved','sending');

insert into auth.users(id,email) values ('00000000-0000-0000-0000-000000000001','notify@example.invalid');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select create_exhibition('10000000-0000-0000-0000-000000000001','Private title',null,null,null,
    '[{"id":"introduction","body":"Private draft text"}]','[]');
select create_artwork('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
    1,'Unpublished work',null,null,null,'[{"id":"description","body":"Private source"}]','[]');

reset role;
update auth.users set email_confirmed_at = now() where id = '00000000-0000-0000-0000-000000000001';
insert into public.operators(user_id) values ('00000000-0000-0000-0000-000000000001');
set local role authenticated;
select set_contact_consent('transactional',true,0);
set local role service_role;
select schedule_automation_notifications(10,true);
select set_config('test.notify',(claim_automation_notifications(1,true)->0)::text,true);
select complete_automation_event((current_setting('test.notify')::jsonb->>'id')::uuid,1,'processed','OK',
    '{"channel":"mail","category":"transactional","body":"Notice"}');
reset role;
select set_config('test.mail',(select id::text from outbound_messages
    where event_id = (current_setting('test.notify')::jsonb->>'id')::uuid),true);
set local role authenticated;
select decide_outbox(current_setting('test.mail')::uuid,1,true);
reset role;
insert into public.automation_events(kind,trigger_kind,dedupe_key,owner_id,mock,state,expires_at)
    values ('support','support_received','support:unrelated-notify-claim','00000000-0000-0000-0000-000000000001',true,
        'processed',statement_timestamp() + interval '1 day');
insert into public.outbound_messages(event_id,owner_id,channel,category,body,binding_scope,binding_id,destination_id,
    state,policy_revision,mock)
select id,owner_id,'support','usage','Reply','channel','user','chat','approved',1,true
    from public.automation_events where dedupe_key = 'support:unrelated-notify-claim';
set local role service_role;
select set_config('test.permit',(claim_notification_outbound(10,true)->0)::text,true);
select is(current_setting('test.permit')::jsonb->>'id',current_setting('test.mail'),'notification worker only claims notify mail');
reset role;
select is((select o.state from outbound_messages o join automation_events e on e.id = o.event_id
    where e.dedupe_key = 'support:unrelated-notify-claim'),'approved','support stays unclaimed');
update exhibitions set revision = revision + 1 where id = '10000000-0000-0000-0000-000000000001';
set local role service_role;
select is(check_outbound_dispatch(current_setting('test.mail')::uuid,
    (current_setting('test.permit')::jsonb->>'attempt')::uuid,true),null,'changed notification target cannot dispatch');
reset role;
select is((select result_code from outbound_messages where id = current_setting('test.mail')::uuid),'TARGET_CHANGED',
    'stale notification is suppressed with a safe code');

set local role service_role;
select set_config('test.suppressed',enqueue_automation_event('notify','published','published:suppressed-fixture',
    '00000000-0000-0000-0000-000000000001',null,1,true)->>'id',true);
select claim_automation_notifications(1,true);
select throws_ok($$select complete_automation_event(current_setting('test.suppressed')::uuid,1,'suppressed','TARGET_CHANGED',
    '{"channel":"mail","category":"transactional","body":"No send"}')$$,
    '22023','Invalid automation result','suppressed completion must not carry outbound data');
select is(complete_automation_event(current_setting('test.suppressed')::uuid,1,'suppressed','TARGET_CHANGED')->>'state',
    'suppressed','executor can settle stale input without a draft');
select is(complete_automation_event(current_setting('test.suppressed')::uuid,1,'suppressed','TARGET_CHANGED')->>'state',
    'suppressed','suppressed completion replay is idempotent');

reset role;
select * from finish();
rollback;
