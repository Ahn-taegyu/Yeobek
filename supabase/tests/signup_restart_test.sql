begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public,extensions;
select no_plan();

select set_config('test.restart_pending',gen_random_uuid()::text,true);
select set_config('test.restart_request',gen_random_uuid()::text,true);

insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values
    (current_setting('test.restart_pending')::uuid,'restart-pending@example.invalid',null,
        jsonb_build_object('provider','email','yeobek_signup_request_id',current_setting('test.restart_request')),'{}'),
    (gen_random_uuid(),'restart-confirmed@example.invalid',now(),
        jsonb_build_object('provider','email','yeobek_signup_request_id',gen_random_uuid()),'{}'),
    (gen_random_uuid(),'restart-issued@example.invalid',null,'{"provider":"email"}','{}'),
    (gen_random_uuid(),'restart-spoofed@example.invalid',null,'{"provider":"email"}',
        jsonb_build_object('yeobek_signup_request_id',gen_random_uuid())),
    (gen_random_uuid(),'restart-oauth@example.invalid',null,
        jsonb_build_object('provider','oauth','yeobek_signup_request_id',gen_random_uuid()),'{}');

set local role anon;
select throws_ok($$select get_pending_signup_user('restart-pending@example.invalid')$$,
    '42501',null,'anonymous callers cannot look up pending signups');
set local role authenticated;
select throws_ok($$select get_pending_signup_user('restart-pending@example.invalid')$$,
    '42501',null,'authenticated callers cannot look up pending signups');

set local role service_role;
select is(get_pending_signup_user(' RESTART-PENDING@EXAMPLE.INVALID '),current_setting('test.restart_pending')::uuid,
    'a pending self-service signup is found regardless of its original request ID and email case');
select is(get_pending_signup_user('restart-confirmed@example.invalid'),null::uuid,
    'a confirmed account is never restarted');
select is(get_pending_signup_user('restart-issued@example.invalid'),null::uuid,
    'an account without the signup tag is not restarted');
select is(get_pending_signup_user('restart-spoofed@example.invalid'),null::uuid,
    'a request ID in user-editable metadata does not count as a signup tag');
select is(get_pending_signup_user('restart-oauth@example.invalid'),null::uuid,
    'another provider is not restarted');
select is(get_pending_signup_user('restart-missing@example.invalid'),null::uuid,
    'an unknown email returns no account');
select throws_ok($$select get_pending_signup_user('  ')$$,'22023','Invalid signup email','a blank email is rejected');
select throws_ok($$select get_pending_signup_user(repeat('a',255))$$,'22023','Invalid signup email','an overlong email is rejected');

reset role;
select * from finish();
rollback;
