begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public,extensions;
select no_plan();

select set_config('test.signup_network',encode(sha256(gen_random_uuid()::text::bytea),'hex'),true);
select set_config('test.signup_other_network',encode(sha256(gen_random_uuid()::text::bytea),'hex'),true);
select set_config('test.signup_email',encode(sha256(gen_random_uuid()::text::bytea),'hex'),true);
select set_config('test.signup_other_email',encode(sha256(gen_random_uuid()::text::bytea),'hex'),true);
select set_config('test.signup_request',gen_random_uuid()::text,true);

select is((select value from app_policies where key = 'visitor_network_requests_per_minute'),
    30::bigint,'signup defaults preserve the existing visitor network policy');
select is((select value from app_policies where key = 'signup_email_send_per_hour'),
    5::bigint,'default signup email budget permits five sends per hour');
select ok(not has_table_privilege('service_role','yeoback_private.signup_attempts','SELECT'),
    'service role cannot read signup hashes directly');
select ok(not has_table_privilege('service_role','yeoback_private.signup_attempts','INSERT'),
    'service role accounts for attempts through the RPC');

set local role anon;
select throws_ok($$select consume_signup_budget(current_setting('test.signup_network'),
    current_setting('test.signup_email'),gen_random_uuid(),'signup')$$,
    '42501',null,'anonymous callers cannot debit signup quota');
set local role authenticated;
select throws_ok($$select consume_signup_budget(current_setting('test.signup_network'),
    current_setting('test.signup_email'),gen_random_uuid(),'signup')$$,
    '42501',null,'authenticated callers cannot debit signup quota');
set local role service_role;
select throws_ok($$select consume_signup_budget('192.0.2.1',
    current_setting('test.signup_email'),gen_random_uuid(),'signup')$$,
    '22023','Invalid signup attempt','raw network input is rejected');
select throws_ok($$select consume_signup_budget(current_setting('test.signup_network'),
    'artist@example.invalid',gen_random_uuid(),'signup')$$,
    '22023','Invalid signup attempt','raw email input is rejected');
select throws_ok($$select consume_signup_budget(current_setting('test.signup_network'),
    repeat('g',64),gen_random_uuid(),'verify')$$,
    '22023','Invalid signup attempt','64-character inputs must still be hexadecimal');
select throws_ok($$select consume_signup_budget(current_setting('test.signup_network'),
    current_setting('test.signup_email'),null,'signup')$$,
    '22023','Invalid signup attempt','request ID is required');
select throws_ok($$select consume_signup_budget(current_setting('test.signup_network'),
    current_setting('test.signup_email'),gen_random_uuid(),'login')$$,
    '22023','Invalid signup attempt','other operations cannot use the ledger');

select lives_ok($$select consume_signup_budget(current_setting('test.signup_network'),
    current_setting('test.signup_email'),current_setting('test.signup_request')::uuid,'signup')$$,
    'signup debits one send');
select lives_ok($$select consume_signup_budget(current_setting('test.signup_network'),
    current_setting('test.signup_email'),current_setting('test.signup_request')::uuid,'signup')$$,
    'a repeated request ID debits a second attempt');
select lives_ok($$select consume_signup_budget(upper(current_setting('test.signup_network')),
    upper(current_setting('test.signup_email')),gen_random_uuid(),'resend') from generate_series(1,3)$$,
    'three resends reach the email cap after two signups');
select throws_ok($$select consume_signup_budget(current_setting('test.signup_other_network'),
    current_setting('test.signup_email'),gen_random_uuid(),'resend')$$,
    'P1040','Signup attempt limit reached','the sixth send is blocked even on another network');
select lives_ok($$select consume_signup_budget(current_setting('test.signup_network'),
    current_setting('test.signup_other_email'),gen_random_uuid(),'signup')$$,
    'a different email can still send on the same network');
select lives_ok($$select consume_signup_budget(current_setting('test.signup_network'),
    current_setting('test.signup_email'),gen_random_uuid(),'verify') from generate_series(1,10)$$,
    'verification has ten independent email debits even after reaching the send cap');
select throws_ok($$select consume_signup_budget(current_setting('test.signup_other_network'),
    current_setting('test.signup_email'),gen_random_uuid(),'verify')$$,
    'P1040','Signup attempt limit reached','the eleventh verification is blocked across networks');

reset role;
select is((select count(*) from yeoback_private.signup_attempts
    where request_id = current_setting('test.signup_request')::uuid),
    2::bigint,'both accepted calls with the same ID are recorded');
select is((select count(*) from yeoback_private.signup_attempts
    where network_hash = decode(current_setting('test.signup_network'),'hex')),
    16::bigint,'accepted calls use canonical binary hashes and are the only debits');

-- Exercise both network windows without waiting for the clock to advance.
update app_policies set value = 6 where key in ('signup_network_send_per_minute','signup_network_send_per_hour');
set local role service_role;
select throws_ok($$select consume_signup_budget(upper(current_setting('test.signup_network')),
    current_setting('test.signup_other_email'),gen_random_uuid(),'resend')$$,
    'P1040','Signup attempt limit reached','network quota spans destinations and uses canonical hashes');
reset role;
update app_policies set value = 10 where key = 'signup_network_send_per_hour';
set local role service_role;
select throws_ok($$select consume_signup_budget(current_setting('test.signup_network'),
    current_setting('test.signup_other_email'),gen_random_uuid(),'resend')$$,
    'P1040','Signup attempt limit reached','minute limit applies even below the hourly cap');
reset role;
update app_policies set value = 6 where key = 'signup_network_send_per_hour';
update yeoback_private.signup_attempts set attempted_at = statement_timestamp() - interval '5 minutes'
where network_hash = decode(current_setting('test.signup_network'),'hex') and kind in ('signup','resend');
set local role service_role;
select throws_ok($$select consume_signup_budget(current_setting('test.signup_network'),
    current_setting('test.signup_other_email'),gen_random_uuid(),'resend')$$,
    'P1040','Signup attempt limit reached','hourly limit applies after attempts age out of the minute window');
select lives_ok($$select consume_signup_budget(current_setting('test.signup_other_network'),
    current_setting('test.signup_other_email'),gen_random_uuid(),'resend')$$,
    'another network can still send to an email below its cap');

reset role;
update app_policies set value = 10 where key = 'signup_network_verify_per_minute';
set local role service_role;
select throws_ok($$select consume_signup_budget(current_setting('test.signup_network'),
    current_setting('test.signup_other_email'),gen_random_uuid(),'verify')$$,
    'P1040','Signup attempt limit reached','verification uses its own network policy across destinations');
reset role;

-- Old fixtures precede ordinary stale rows when the bounded purge runs.
insert into yeoback_private.signup_attempts(network_hash,email_hash,request_id,kind,attempted_at)
select decode(current_setting('test.signup_network'),'hex'),decode(current_setting('test.signup_email'),'hex'),
    gen_random_uuid(),'signup','2000-01-01'::timestamptz from generate_series(1,1001);
insert into yeoback_private.signup_attempts(network_hash,email_hash,request_id,kind,attempted_at)
values (decode(current_setting('test.signup_network'),'hex'),decode(current_setting('test.signup_email'),'hex'),
    gen_random_uuid(),'verify',statement_timestamp() - interval '47 hours');
set local role service_role;
select ok(purge_expired() ?& array['answers','gaps','jobs'],'purge preserves its existing response fields');
reset role;
select is((select count(*) from yeoback_private.signup_attempts
    where network_hash = decode(current_setting('test.signup_network'),'hex') and attempted_at = '2000-01-01'::timestamptz),
    1::bigint,'one purge removes at most 1000 expired signup attempts');
select is((select count(*) from yeoback_private.signup_attempts
    where network_hash = decode(current_setting('test.signup_network'),'hex') and attempted_at > '2000-01-01'::timestamptz),
    17::bigint,'purge keeps recent attempts including the row from 47 hours ago');

select set_config('test.signup_pending_user',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) values
    (current_setting('test.signup_pending_user')::uuid,'pending-artist@example.invalid',
        jsonb_build_object('provider','email','yeobek_signup_request_id',current_setting('test.signup_request')),'{}'),
    (gen_random_uuid(),'spoofed-artist@example.invalid','{"provider":"email"}',
        jsonb_build_object('yeobek_signup_request_id',current_setting('test.signup_request'))),
    (gen_random_uuid(),'other-provider@example.invalid',
        jsonb_build_object('provider','oauth','yeobek_signup_request_id',current_setting('test.signup_request')),'{}');
set local role anon;
select throws_ok($$select get_signup_verification_identity('pending-artist@example.invalid',
    current_setting('test.signup_request')::uuid)$$,'42501',null,'anonymous callers cannot resolve verification identity');
set local role authenticated;
select throws_ok($$select get_signup_verification_identity('pending-artist@example.invalid',
    current_setting('test.signup_request')::uuid)$$,'42501',null,'authenticated callers cannot resolve verification identity');
set local role service_role;
select throws_ok($$select get_signup_verification_identity(repeat('a',255),gen_random_uuid())$$,
    '22023','Invalid signup verification identity','email length is bounded');
select throws_ok($$select get_signup_verification_identity('pending-artist@example.invalid',null)$$,
    '22023','Invalid signup verification identity','verification requires a signup request ID');
select is(get_signup_verification_identity(' PENDING-ARTIST@EXAMPLE.INVALID ',current_setting('test.signup_request')::uuid),
    current_setting('test.signup_pending_user')::uuid,'the original request matches the pending email identity');
select is(get_signup_verification_identity('pending-artist@example.invalid',gen_random_uuid()),
    null::uuid,'a fresh signup request cannot operate on an earlier pending account');
select is(get_signup_verification_identity('missing-artist@example.invalid',current_setting('test.signup_request')::uuid),
    null::uuid,'matching the request ID alone is insufficient');
select is(get_signup_verification_identity('spoofed-artist@example.invalid',current_setting('test.signup_request')::uuid),
    null::uuid,'editable user metadata cannot bind a signup');
select is(get_signup_verification_identity('other-provider@example.invalid',current_setting('test.signup_request')::uuid),
    null::uuid,'a signup request cannot operate on a non-email provider account');
reset role;
update auth.users set email_confirmed_at = now() where id = current_setting('test.signup_pending_user')::uuid;
set local role service_role;
select is(get_signup_verification_identity('pending-artist@example.invalid',current_setting('test.signup_request')::uuid),
    null::uuid,'a verified account cannot be activated again');
reset role;

-- Model a confirmed Auth account before its first direct login.
select set_config('test.signup_owner',gen_random_uuid()::text,true);
insert into auth.users(id,email,email_confirmed_at) values (current_setting('test.signup_owner')::uuid,
    'signup-' || current_setting('test.signup_owner') || '@example.invalid',now());
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.signup_owner'),true);
select is((select count(*) from artist_profiles),0::bigint,'a newly confirmed Auth account has no pre-created profile');
select set_config('test.signup_artist',get_artist_profile()->>'id',true);
select lives_ok($$select create_exhibition(gen_random_uuid(),'Signup fixture',null,null,null,'[]','[]')$$,
    'a new artist can create an exhibition after visiting the profile');
select is(get_artist_profile()->>'id',current_setting('test.signup_artist'),'first profile and exhibition share one artist');
select is((select count(*) from artist_profiles),1::bigint,'the account retains exactly one artist profile');
select is((select count(*) from knowledge_documents where subject_type = 'artist'),1::bigint,
    'lazy initialization retains exactly one artist knowledge document');

select * from finish();
rollback;
