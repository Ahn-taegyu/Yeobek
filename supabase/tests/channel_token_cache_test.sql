begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select set_config('test.channel_app', 'test_' || gen_random_uuid(), true);
select set_config('test.channel_other_app', 'test_' || gen_random_uuid(), true);
select set_config('test.channel_short_claim', gen_random_uuid()::text, true);
select set_config('test.channel_first_claim', gen_random_uuid()::text, true);
select set_config('test.channel_second_claim', gen_random_uuid()::text, true);

select ok(not has_function_privilege(role_name, signature, 'EXECUTE'),
    role_name || ' cannot execute ' || signature)
from (values ('anon'), ('authenticated')) as roles(role_name)
cross join (values ('claim_channel_token(text,text,uuid)'),
    ('complete_channel_token(text,text,uuid,text,integer)')) as signatures(signature);

select ok(not has_table_privilege(role_name, 'yeoback_private.' || table_name, privilege),
    role_name || ' has no ' || privilege || ' on ' || table_name)
from (values ('anon'), ('authenticated'), ('service_role')) as roles(role_name)
cross join (values ('channel_token_apps'), ('channel_token_claims'), ('channel_token_cache')) as tables(table_name)
cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) as privileges(privilege);

set local role anon;
select throws_ok(
    $$select claim_channel_token('test-app', 'front-desk', gen_random_uuid())$$,
    '42501', 'permission denied for function claim_channel_token', 'anonymous RPC call is denied');
set local role authenticated;
select throws_ok(
    $$select complete_channel_token('test-app', 'front-desk', gen_random_uuid(), 'sealed.fixture', 3600)$$,
    '42501', 'permission denied for function complete_channel_token', 'authenticated RPC call is denied');

set local role service_role;
select is(claim_channel_token(current_setting('test.channel_app'), 'front-desk',
    current_setting('test.channel_first_claim')::uuid), '{"state":"refresh","sealed":null}'::jsonb,
    'first worker takes the refresh lease');
select is(claim_channel_token(current_setting('test.channel_app'), 'front-desk', gen_random_uuid()),
    '{"state":"busy"}'::jsonb, 'concurrent worker cannot take the same channel lease');
select is(complete_channel_token(current_setting('test.channel_app'), 'front-desk',
    gen_random_uuid(), 'sealed.fixture', 3600), false, 'different claim cannot finish the lease');
select is(complete_channel_token(current_setting('test.channel_app'), 'other-desk',
    current_setting('test.channel_first_claim')::uuid, 'sealed.fixture', 3600), false,
    'same claim cannot complete another channel');

reset role;
update yeoback_private.channel_token_cache set lease_started_at = clock_timestamp() - interval '35 seconds'
where app_id = current_setting('test.channel_app');

set local role service_role;
select is(complete_channel_token(current_setting('test.channel_app'), 'front-desk',
    current_setting('test.channel_first_claim')::uuid, 'sealed.fixture', 3600), false,
    'expired lease cannot be completed');
select is(claim_channel_token(current_setting('test.channel_app'), 'front-desk',
    current_setting('test.channel_first_claim')::uuid), '{"state":"busy"}'::jsonb,
    'replaying an expired claim cannot reserve another provider call');
select is(claim_channel_token(current_setting('test.channel_app'), 'front-desk',
    current_setting('test.channel_second_claim')::uuid), '{"state":"refresh","sealed":null}'::jsonb,
    'fresh claim can replace the expired lease');
select is(complete_channel_token(current_setting('test.channel_app'), 'front-desk',
    current_setting('test.channel_first_claim')::uuid, 'sealed.fixture', 3600), false,
    'old claim cannot overwrite replacement lease');
select is(complete_channel_token(current_setting('test.channel_app'), 'front-desk',
    current_setting('test.channel_second_claim')::uuid, 'sealed.front', 3600), true,
    'replacement worker completes its own lease');
select is(claim_channel_token(current_setting('test.channel_app'), 'front-desk', gen_random_uuid()),
    '{"state":"cached","sealed":"sealed.front"}'::jsonb, 'worker reuses the channel ciphertext');
select is(claim_channel_token(current_setting('test.channel_app'), 'other-desk',
    current_setting('test.channel_second_claim')::uuid), '{"state":"busy"}'::jsonb,
    'reused claim cannot reserve quota through another channel');

select is(claim_channel_token(current_setting('test.channel_app'), 'desk-' || n, gen_random_uuid()),
    '{"state":"refresh","sealed":null}'::jsonb, 'reservation available for desk ' || n)
from generate_series(1, 8) as desks(n);
select is(claim_channel_token(current_setting('test.channel_app'), 'overflow', gen_random_uuid()),
    '{"state":"limited"}'::jsonb, 'eleventh reservation is blocked across channels');
select is(claim_channel_token(current_setting('test.channel_app'), 'front-desk', gen_random_uuid()),
    '{"state":"cached","sealed":"sealed.front"}'::jsonb, 'exhausted quota does not prevent cache reuse');
select is(claim_channel_token(current_setting('test.channel_other_app'), 'front-desk',
    current_setting('test.channel_short_claim')::uuid),
    '{"state":"refresh","sealed":null}'::jsonb, 'different app has separate cache and quota');

reset role;
update yeoback_private.channel_token_cache set lease_started_at = clock_timestamp() - interval '2 seconds'
where app_id = current_setting('test.channel_other_app') and channel_id = 'front-desk';
set local role service_role;
select is(complete_channel_token(current_setting('test.channel_other_app'), 'front-desk',
    current_setting('test.channel_short_claim')::uuid, 'sealed.short', 1), false,
    'a live lease cannot store an already expired token');
select is(complete_channel_token(current_setting('test.channel_other_app'), 'front-desk',
    current_setting('test.channel_short_claim')::uuid, 'sealed.other', 3600), true,
    'rejected completion leaves the lease intact');

reset role;
update yeoback_private.channel_token_claims set reserved_at = clock_timestamp() - interval '31 minutes'
where app_id = current_setting('test.channel_app');
update yeoback_private.channel_token_cache set expires_at = clock_timestamp() + interval '15 seconds'
where app_id = current_setting('test.channel_app') and channel_id = 'front-desk';

set local role service_role;
select is(claim_channel_token(current_setting('test.channel_app'), 'front-desk', gen_random_uuid()),
    '{"state":"refresh","sealed":"sealed.front"}'::jsonb,
    'quota rolls over and near-expiry ciphertext is returned to the refresh worker');
reset role;
select is((select count(*) from yeoback_private.channel_token_claims
    where app_id = current_setting('test.channel_app')), 1::bigint, 'expired reservations are cleaned up');

set local role service_role;
select throws_ok(
    $$select claim_channel_token('invalid.app', 'front-desk', gen_random_uuid())$$,
    '22023', 'Invalid channel token claim', 'invalid app identifier is rejected');
select throws_ok(
    $$select claim_channel_token('valid-app', repeat('c', 201), gen_random_uuid())$$,
    '22023', 'Invalid channel token claim', 'oversized channel identifier is rejected');
select throws_ok(
    $$select claim_channel_token('valid-app', 'front-desk', null)$$,
    '22023', 'Invalid channel token claim', 'missing claim UUID is rejected');
select throws_ok(
    $$select complete_channel_token('valid-app', 'front-desk', gen_random_uuid(), repeat('c', 32769), 3600)$$,
    '22023', 'Invalid channel token completion', 'oversized ciphertext is rejected');
select throws_ok(
    $$select complete_channel_token('valid-app', 'front-desk', gen_random_uuid(), 'sealed.fixture', 0)$$,
    '22023', 'Invalid channel token completion', 'zero expiry is rejected');
reset role;


select * from finish();
rollback;
