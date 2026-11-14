begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public,extensions;
select no_plan();
select set_config('test.latest_owner',gen_random_uuid()::text,true);
select set_config('test.latest_other',gen_random_uuid()::text,true);
select set_config('test.latest_exhibition',gen_random_uuid()::text,true);
insert into auth.users(id,email) values
    (current_setting('test.latest_owner')::uuid,'latest-owner@example.invalid'),
    (current_setting('test.latest_other')::uuid,'latest-other@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.latest_owner'),true);
select create_exhibition(current_setting('test.latest_exhibition')::uuid,'Latest fixture',null,null,null,
    '[{"id":"introduction","body":"Exhibition source."}]','[]');
select is(get_latest_training_batch(current_setting('test.latest_exhibition')::uuid),null::jsonb,'owned empty exhibition returns null');
select throws_ok($$select get_latest_training_batch(gen_random_uuid())$$,'P0002',null,'missing exhibition is not an empty result');
set local role service_role;
select set_config('test.latest_first',create_training_batch(current_setting('test.latest_owner')::uuid,
    current_setting('test.latest_exhibition')::uuid,gen_random_uuid(),1,true)->>'id',true);
select set_config('test.latest_second',create_training_batch(current_setting('test.latest_owner')::uuid,
    current_setting('test.latest_exhibition')::uuid,gen_random_uuid(),1,true)->>'id',true);
reset role;
-- Expiry order is deliberately opposite to creation order; retention is not recency.
update yeoback_private.training_batches set created_at = statement_timestamp() - interval '2 hours',
    expires_at = statement_timestamp() + interval '10 days' where id = current_setting('test.latest_first')::uuid;
update yeoback_private.training_batches set created_at = statement_timestamp() - interval '1 hour',
    expires_at = statement_timestamp() + interval '1 day' where id = current_setting('test.latest_second')::uuid;
set local role authenticated;
select is(get_latest_training_batch(current_setting('test.latest_exhibition')::uuid),
    get_training_batch(current_setting('test.latest_second')::uuid),'latest reuses exact manifest and current target states');
select set_config('request.jwt.claim.sub',current_setting('test.latest_other'),true);
select throws_ok($$select get_latest_training_batch(current_setting('test.latest_exhibition')::uuid)$$,
    'P0002',null,'other account cannot distinguish an owned exhibition');
reset role;
update yeoback_private.training_batches set expires_at = statement_timestamp() - interval '1 second'
    where id = current_setting('test.latest_second')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.latest_owner'),true);
select is(get_latest_training_batch(current_setting('test.latest_exhibition')::uuid)->>'id',
    current_setting('test.latest_first'),'expired newest manifest is skipped');
reset role;
update yeoback_private.training_batches set expires_at = statement_timestamp() - interval '1 second'
    where id = current_setting('test.latest_first')::uuid;
set local role authenticated;
select is(get_latest_training_batch(current_setting('test.latest_exhibition')::uuid),null::jsonb,'all expired means empty');
reset role;
update yeoback_private.training_batches set created_at = statement_timestamp(),expires_at = statement_timestamp() + interval '1 day'
    where owner_id = current_setting('test.latest_owner')::uuid;
select set_config('test.latest_tie',greatest(current_setting('test.latest_first'),current_setting('test.latest_second')),true);
set local role authenticated;
select is(get_latest_training_batch(current_setting('test.latest_exhibition')::uuid)->>'id',
    current_setting('test.latest_tie'),'equal timestamps have deterministic descending UUID order');
reset role;
update public.exhibitions set deleted_at = statement_timestamp() where id = current_setting('test.latest_exhibition')::uuid;
set local role authenticated;
select throws_ok($$select get_latest_training_batch(current_setting('test.latest_exhibition')::uuid)$$,
    'P0002',null,'deleted exhibition hides a live manifest');
set local role anon;
select throws_ok($$select get_latest_training_batch(current_setting('test.latest_exhibition')::uuid)$$,
    '42501',null,'anonymous RPC execution is denied');
set local role service_role;
select throws_ok($$select get_latest_training_batch(current_setting('test.latest_exhibition')::uuid)$$,
    '42501',null,'worker cannot bypass owner-only lookup');
reset role;
select is((select count(*) from public.ai_job_attempts where owner_id = current_setting('test.latest_owner')::uuid),
    0::bigint,'reads do not reserve model work');
select * from finish();
rollback;
