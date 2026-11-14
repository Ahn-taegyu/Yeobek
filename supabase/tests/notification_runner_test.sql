begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public,extensions;
select no_plan();

-- Isolate pre-existing work only inside this rollback transaction.
update public.outbound_messages set state='suppressed',lease_until=null where state in ('approved','sending');
update public.automation_policies set mode='draft' where kind='notify';
update yeoback_private.notification_runner set token=null,lease_until=null,mail_after='-infinity';

select ok((select bool_and(not has_function_privilege(role_name,signature,'EXECUTE'))
    from unnest(array['anon','authenticated']) role_name cross join unnest(array[
        'public.acquire_notification_run(uuid,boolean)', 'public.release_notification_run(uuid,boolean)',
        'public.check_notification_dispatch(uuid,uuid,boolean,uuid)',
        'public.complete_notification_dispatch(uuid,uuid,text,text,text,boolean,uuid)']) signature),
    'runner RPCs deny client roles');
select ok((select bool_and(has_function_privilege('service_role',signature,'EXECUTE'))
    from unnest(array['public.acquire_notification_run(uuid,boolean)', 'public.release_notification_run(uuid,boolean)',
        'public.check_notification_dispatch(uuid,uuid,boolean,uuid)',
        'public.complete_notification_dispatch(uuid,uuid,text,text,text,boolean,uuid)']) signature),
    'runner RPCs are available to service role');

set local role service_role;
select isnt(acquire_notification_run('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',true),null::jsonb,'mock run acquired');
select is(acquire_notification_run('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',true),null::jsonb,'second mock run blocked');
select isnt(acquire_notification_run('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',false),null::jsonb,'live run is independent');
select release_notification_run('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',true);
select is(acquire_notification_run('cccccccc-cccc-cccc-cccc-cccccccccccc',true),null::jsonb,'wrong token cannot release mock run');
select release_notification_run('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',true);
select isnt(acquire_notification_run('cccccccc-cccc-cccc-cccc-cccccccccccc',true),null::jsonb,'correct token releases mock run');
reset role;

insert into auth.users(id,email,email_confirmed_at) values
    ('00000000-0000-0000-0000-000000000001','runner@example.invalid',now());
insert into public.operators(user_id) values ('00000000-0000-0000-0000-000000000001');
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
select set_contact_consent('transactional',true,0);
reset role;
insert into public.automation_events(id,kind,trigger_kind,dedupe_key,owner_id,mock,state,expires_at)
select ('10000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,'notify','published',
    'runner-fixture-' || n,'00000000-0000-0000-0000-000000000001',true,'processed',clock_timestamp()+interval '1 day'
from generate_series(1,3) n;
insert into public.outbound_messages(id,event_id,owner_id,channel,category,body,state,policy_revision,mock,approved_by)
select ('20000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,
    ('10000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,
    '00000000-0000-0000-0000-000000000001','mail','transactional','Test notice','approved',
    (select revision from public.automation_policies where kind='notify'),true,'00000000-0000-0000-0000-000000000001'
from generate_series(1,3) n;

set local role service_role;
select set_config('test.first',(claim_notification_outbound(1,true)->0)::text,true);
select isnt(check_notification_dispatch((current_setting('test.first')::jsonb->>'id')::uuid,
    (current_setting('test.first')::jsonb->>'attempt')::uuid,true,'cccccccc-cccc-cccc-cccc-cccccccccccc'),null::jsonb,
    'first mail receives permit');
select is(complete_notification_dispatch((current_setting('test.first')::jsonb->>'id')::uuid,
    (current_setting('test.first')::jsonb->>'attempt')::uuid,'accepted','fixture','OK',true,
    'cccccccc-cccc-cccc-cccc-cccccccccccc')->>'state','accepted','first mail completes');
select set_config('test.second',(claim_notification_outbound(1,true)->0)::text,true);
select is(check_notification_dispatch((current_setting('test.second')::jsonb->>'id')::uuid,
    (current_setting('test.second')::jsonb->>'attempt')::uuid,true,'cccccccc-cccc-cccc-cccc-cccccccccccc'),null::jsonb,
    'immediate next mail is rate limited');
reset role;
select is((select state from public.outbound_messages where id=(current_setting('test.second')::jsonb->>'id')::uuid),
    'approved','rate limited mail returns to approved');
update yeoback_private.notification_runner set mail_after=clock_timestamp()-interval '1 second' where mock=true;
set local role service_role;
select set_config('test.second_retry',(claim_notification_outbound(1,true)->0)::text,true);
select isnt(check_notification_dispatch((current_setting('test.second_retry')::jsonb->>'id')::uuid,
    (current_setting('test.second_retry')::jsonb->>'attempt')::uuid,true,'cccccccc-cccc-cccc-cccc-cccccccccccc'),null::jsonb,
    'next mail receives permit after spacing');
reset role;

-- Delay the real blocker until the runner lease expires, while message lease remains valid.
alter function yeoback_private.outbound_blocker(public.outbound_messages) rename to test_runner_outbound_blocker;
create function yeoback_private.outbound_blocker(m public.outbound_messages)
returns text language plpgsql set search_path='' as $$
declare reason text;
begin
    reason:=yeoback_private.test_runner_outbound_blocker(m);
    perform pg_sleep(0.3);
    return reason;
end;
$$;
set local role service_role;
select set_config('test.third',(claim_notification_outbound(1,true)->0)::text,true);
reset role;
update yeoback_private.notification_runner set lease_until=clock_timestamp()+interval '200 milliseconds',mail_after='-infinity' where mock=true;
update public.outbound_messages set lease_until=clock_timestamp()+interval '30 seconds'
    where id=(current_setting('test.third')::jsonb->>'id')::uuid;
set local role service_role;
select is(check_notification_dispatch((current_setting('test.third')::jsonb->>'id')::uuid,
    (current_setting('test.third')::jsonb->>'attempt')::uuid,true,'cccccccc-cccc-cccc-cccc-cccccccccccc'),null::jsonb,
    'runner lease expiring during blocker cannot issue permit');
reset role;
select is((select state||':'||result_code from public.outbound_messages
    where id=(current_setting('test.third')::jsonb->>'id')::uuid),'failed:RUN_LEASE_EXPIRED',
    'expired runner settles the message as failed');
select * from finish();
rollback;
