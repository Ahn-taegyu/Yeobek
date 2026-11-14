begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public,extensions;
select no_plan();
-- The queue view is isolated only inside this rollback transaction.
update outbound_messages set created_at = statement_timestamp() - interval '100 years',state = 'suppressed';
update operators set enabled = false;
insert into auth.users(id,email,email_confirmed_at) values
    ('00000000-0000-0000-0000-000000000001','review-owner@example.invalid',now()),
    ('00000000-0000-0000-0000-000000000002','review-operator@example.invalid',now());
insert into operators(user_id) values('00000000-0000-0000-0000-000000000002');
do $$
declare event_id uuid; i integer;
begin
    for i in 1..115 loop
        insert into automation_events(kind,trigger_kind,dedupe_key,owner_id,mock,state,expires_at)
        values('notify','published','page:'||i,'00000000-0000-0000-0000-000000000001',true,'processed',now()+interval '30 days')
        returning id into event_id;
        insert into outbound_messages(event_id,owner_id,channel,category,body,state,policy_revision,mock,created_at)
        select event_id,'00000000-0000-0000-0000-000000000001','mail','transactional','Review fixture',
            case when i <= 60 then 'draft' else 'accepted' end,revision,true,
            now() - interval '2 days' + i * interval '1 minute' from automation_policies where kind='notify';
    end loop;
end;
$$;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select throws_ok($$select list_outbox_page()$$,'P0002','Not found','ordinary owner cannot access review pages');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select set_config('test.page1',list_outbox_page()::text,true);
select is(jsonb_array_length(current_setting('test.page1')::jsonb->'items'),50,'terminal traffic does not hide pending drafts');
select ok(current_setting('test.page1')::jsonb->>'nextCursor' is not null,'first page exposes next cursor');
select set_config('test.page2',list_outbox_page(50,(current_setting('test.page1')::jsonb->>'nextCursor')::uuid,'draft')::text,true);
select is(jsonb_array_length(current_setting('test.page2')::jsonb->'items'),10,'older drafts are reachable');
select is(current_setting('test.page2')::jsonb->>'nextCursor',null,'last page has no next cursor');
select ok(not exists(select 1 from jsonb_array_elements(current_setting('test.page1')::jsonb->'items') a
    join jsonb_array_elements(current_setting('test.page2')::jsonb->'items') b on a->>'id'=b->>'id'),'cursor pages do not overlap');
select is(list_outbox_page(50,null,'accepted')#>>'{items,0,state}','accepted','history can be viewed independently');
select throws_ok($$select list_outbox_page(50,gen_random_uuid(),'draft')$$,'P0002','Outbox cursor not found','unknown cursor fails clearly');
reset role;
select set_config('test.expired_message',current_setting('test.page1')::jsonb#>>'{items,0,id}',true);
update automation_events set expires_at = now()-interval '1 second'
    where id = (select event_id from outbound_messages where id=current_setting('test.expired_message')::uuid);
set local role authenticated;
select throws_ok($$select decide_outbox(current_setting('test.expired_message')::uuid,1,true)$$,
    'P1031','Outbox review unavailable','expired draft cannot report successful approval');
select ok(not exists(select 1 from jsonb_array_elements(list_outbox_page()->'items') a
    where a->>'id'=current_setting('test.expired_message')),'expired drafts leave actionable queue');
select is(decide_outbox(current_setting('test.expired_message')::uuid,1,false)->>'state','rejected','operator may dismiss expired draft');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select create_exhibition('10000000-0000-0000-0000-000000000001','Deleted review target',null,null,null,'[]','[]');
reset role;
select set_config('test.deleted_message',current_setting('test.page2')::jsonb#>>'{items,0,id}',true);
update automation_events set exhibition_id='10000000-0000-0000-0000-000000000001'
    where id=(select event_id from outbound_messages where id=current_setting('test.deleted_message')::uuid);
update exhibitions set deleted_at=now() where id='10000000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select throws_ok($$select decide_outbox(current_setting('test.deleted_message')::uuid,1,true)$$,
    'P1031','Outbox review unavailable','deleted exhibition cannot be approved for dispatch');
reset role;
select is(yeoback_private.outbound_blocker(m),'TARGET_UNAVAILABLE','dispatch rechecks deleted target')
    from outbound_messages m where m.id=current_setting('test.deleted_message')::uuid;
-- Exercise the public worker entry points, not only the private predicate.
update outbound_messages set state='approved',approved_by='00000000-0000-0000-0000-000000000002'
    where id=current_setting('test.deleted_message')::uuid;
set local role service_role;
select is(claim_outbound_messages(100,true),'[]'::jsonb,'deleted target releases no dispatch claim');
reset role;
select is((select state||':'||result_code from outbound_messages where id=current_setting('test.deleted_message')::uuid),
    'suppressed:TARGET_UNAVAILABLE','claim settles deleted target without sending');
update exhibitions set deleted_at=null where id='10000000-0000-0000-0000-000000000001';
update automation_policies set mode='draft' where kind='notify';
insert into contact_consents(owner_id,category,granted,revision)
    values('00000000-0000-0000-0000-000000000001','transactional',true,1);
update outbound_messages set state='approved',approved_by='00000000-0000-0000-0000-000000000002',
    policy_revision=(select revision from automation_policies where kind='notify')
    where id=current_setting('test.deleted_message')::uuid;
set local role service_role;
select set_config('test.dispatch_claim',(claim_outbound_messages(100,true)->0)::text,true);
select is(current_setting('test.dispatch_claim')::jsonb->>'id',current_setting('test.deleted_message'),
    'live target can first be claimed');
reset role;
update exhibitions set deleted_at=now() where id='10000000-0000-0000-0000-000000000001';
set local role service_role;
select is(check_outbound_dispatch(current_setting('test.deleted_message')::uuid,
    (current_setting('test.dispatch_claim')::jsonb->>'attempt')::uuid,true),null::jsonb,
    'deletion after claim prevents dispatch payload release');
reset role;
select is((select state||':'||result_code from outbound_messages where id=current_setting('test.deleted_message')::uuid),
    'suppressed:TARGET_UNAVAILABLE','final dispatch guard settles deleted target');
-- Simulate time spent waiting in the policy/consent guard. The wrapper exists
-- only in this rollback transaction, and still runs the real guard first.
alter function yeoback_private.outbound_blocker(public.outbound_messages) rename to test_outbound_blocker;
create function yeoback_private.outbound_blocker(m public.outbound_messages)
returns text language plpgsql set search_path = '' as $$
declare reason text;
begin
    reason := yeoback_private.test_outbound_blocker(m);
    perform pg_sleep(0.3);
    return reason;
end;
$$;
update exhibitions set deleted_at=null where id='10000000-0000-0000-0000-000000000001';
update outbound_messages set state='sending',send_attempt=gen_random_uuid(),dispatch_checked_at=null,
    lease_until=clock_timestamp()+interval '200 milliseconds',approved_by='00000000-0000-0000-0000-000000000002'
    where id=current_setting('test.deleted_message')::uuid;
select set_config('test.delayed_attempt',(select send_attempt::text from outbound_messages
    where id=current_setting('test.deleted_message')::uuid),true);
set local role service_role;
select is(check_outbound_dispatch(current_setting('test.deleted_message')::uuid,
    current_setting('test.delayed_attempt')::uuid,true),null::jsonb,'guard delay cannot release an expired permit');
reset role;
select is((select state||':'||result_code from outbound_messages where id=current_setting('test.deleted_message')::uuid),
    'failed:DISPATCH_LEASE_EXPIRED','known unissued expired permit is settled without sending');
select is((select dispatch_checked_at from outbound_messages where id=current_setting('test.deleted_message')::uuid),
    null::timestamptz,'expired permit was never marked issued');
select * from finish();
rollback;
