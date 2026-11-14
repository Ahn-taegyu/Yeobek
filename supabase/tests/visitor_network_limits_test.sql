begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select set_config('test.network_owner',gen_random_uuid()::text,true);
select set_config('test.network_exhibition',gen_random_uuid()::text,true);
select set_config('test.network_artwork',gen_random_uuid()::text,true);
select set_config('test.network_publication',gen_random_uuid()::text,true);
select set_config('test.network_evidence',gen_random_uuid()::text,true);
select set_config('test.network',encode(sha256(gen_random_uuid()::text::bytea),'hex'),true);
select set_config('test.other_network',encode(sha256(gen_random_uuid()::text::bytea),'hex'),true);
select set_config('test.network_request',gen_random_uuid()::text,true);
select set_config('test.network_session',encode(sha256(gen_random_uuid()::text::bytea),'hex'),true);
select set_config('test.other_network_session',encode(sha256(gen_random_uuid()::text::bytea),'hex'),true);

insert into auth.users(id,email) values
    (current_setting('test.network_owner')::uuid,'network-' || current_setting('test.network_owner') || '@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.network_owner'),true);
select create_exhibition(current_setting('test.network_exhibition')::uuid,'Network fixture',null,null,null,'[]','[]');
select create_artwork(current_setting('test.network_artwork')::uuid,current_setting('test.network_exhibition')::uuid,
    1,'Network artwork',null,null,null,'[]','[]');
reset role;

-- Trusted publication fixture using the approved snapshot shape.
insert into publications(id,owner_id,exhibition_id,artwork_id,version,number,title,image_key,evidence,
    narration_text,narration_hash,narration_citations,approved_by,audio_key,audio_text_hash)
values (current_setting('test.network_publication')::uuid,current_setting('test.network_owner')::uuid,
    current_setting('test.network_exhibition')::uuid,current_setting('test.network_artwork')::uuid,
    1,1,'Public work','fixture/image',
    jsonb_build_object('schemaVersion',1,'items',jsonb_build_array(jsonb_build_object(
        'id',current_setting('test.network_evidence'),'version',1,'ownerId',current_setting('test.network_owner'),
        'exhibitionId',current_setting('test.network_exhibition'),'publicationId',current_setting('test.network_publication'),
        'artworkId',current_setting('test.network_artwork'),'scope','artwork','sourceLabel','Approved source',
        'body','Approved narration','contentHash',encode(sha256('Approved narration'::bytea),'hex')))),
    'Approved narration',sha256('Approved narration'::bytea),
    jsonb_build_array(jsonb_build_object('id',current_setting('test.network_evidence'),'version',1)),
    current_setting('test.network_owner')::uuid,
    'fixture/audio',sha256('Approved narration'::bytea));
update artworks set state='published',active_publication_id=current_setting('test.network_publication')::uuid
where id=current_setting('test.network_artwork')::uuid;
update exhibitions set state='published',public_title='Public exhibition',public_artist_display_name='Public artist'
where id=current_setting('test.network_exhibition')::uuid;

update app_policies set value=1 where key='visitor_network_requests_per_minute';
update app_policies set value=2 where key='visitor_network_requests_per_day';

set local role anon;
select throws_ok($$select consume_visitor_network_budget(current_setting('test.network'),
    current_setting('test.network_session'),current_setting('test.network_exhibition')::uuid,
    current_setting('test.network_request')::uuid,'question')$$,
    '42501','permission denied for function consume_visitor_network_budget','anonymous callers cannot reserve IP quota');
set local role authenticated;
select throws_ok($$select consume_visitor_network_budget(current_setting('test.network'),
    current_setting('test.network_session'),current_setting('test.network_exhibition')::uuid,
    current_setting('test.network_request')::uuid,'question')$$,
    '42501','permission denied for function consume_visitor_network_budget','authenticated callers cannot reserve IP quota');
reset role;
select ok(not has_table_privilege('service_role','yeoback_private.visitor_network_requests','SELECT'),
    'worker cannot read hashes directly from the private ledger');

set local role service_role;
select lives_ok($$select consume_visitor_network_budget(current_setting('test.network'),
    current_setting('test.network_session'),current_setting('test.network_exhibition')::uuid,
    current_setting('test.network_request')::uuid,'question')$$,'worker reserves the first request');
select lives_ok($$select consume_visitor_network_budget(current_setting('test.network'),
    current_setting('test.network_session'),current_setting('test.network_exhibition')::uuid,
    current_setting('test.network_request')::uuid,'question')$$,'exact retry can replay at the cap');
select throws_ok($$select consume_visitor_network_budget(current_setting('test.network'),
    current_setting('test.network_session'),current_setting('test.network_exhibition')::uuid,
    current_setting('test.network_request')::uuid,'transcription')$$,
    'P1005','Request ID already used with different input','reusing a request ID for another operation is a conflict');
select throws_ok($$select consume_visitor_network_budget(current_setting('test.network'),
    current_setting('test.other_network_session'),current_setting('test.network_exhibition')::uuid,
    gen_random_uuid(),'transcription')$$,
    'P1010','Visitor network limit reached','a different visitor cookie keeps the same network minute quota');
select lives_ok($$select consume_visitor_network_budget(current_setting('test.other_network'),
    current_setting('test.other_network_session'),current_setting('test.network_exhibition')::uuid,
    gen_random_uuid(),'reply_audio')$$,'another network has independent quota');

reset role;
select is((select count(*) from yeoback_private.visitor_network_requests
    where network_hash=decode(current_setting('test.network'),'hex')),1::bigint,'retry has one reservation');
-- Allow one more minute reservation without moving time across a UTC day.
update app_policies set value=10 where key='visitor_network_requests_per_minute';
set local role service_role;
select lives_ok($$select consume_visitor_network_budget(current_setting('test.network'),
    current_setting('test.other_network_session'),current_setting('test.network_exhibition')::uuid,
    gen_random_uuid(),'transcription')$$,'worker reserves the second daily slot');
select throws_ok($$select consume_visitor_network_budget(current_setting('test.network'),
    current_setting('test.other_network_session'),current_setting('test.network_exhibition')::uuid,
    gen_random_uuid(),'reply_audio')$$,
    'P1010','Visitor network limit reached','daily cap blocks new requests independently of minute cap');
set local role anon;
select is(get_public_artwork(current_setting('test.network_exhibition')::uuid,
    current_setting('test.network_artwork')::uuid)->>'narration_text','Approved narration',
    'approved narration remains available after network AI quota is exhausted');

reset role;
-- Put this fixture ahead of ordinary stale rows in the bounded purge order.
insert into yeoback_private.visitor_network_requests(network_hash,session_hash,request_id,exhibition_id,kind,reserved_at)
select decode(current_setting('test.network'),'hex'),decode(current_setting('test.network_session'),'hex'),
    gen_random_uuid(),current_setting('test.network_exhibition')::uuid,'question','2000-01-01'::timestamptz
from generate_series(1,1001);
set local role service_role;
select lives_ok($$select purge_expired()$$,'existing purge RPC also cleans up the private network ledger');
reset role;
select is((select count(*) from yeoback_private.visitor_network_requests
    where network_hash=decode(current_setting('test.network'),'hex') and reserved_at='2000-01-01'::timestamptz),
    1::bigint,'each purge removes at most 1000 expired network reservations');
select is((select count(*) from yeoback_private.visitor_network_requests
    where network_hash=decode(current_setting('test.network'),'hex') and reserved_at>'2000-01-01'::timestamptz),
    2::bigint,'purge retains live reservations and their quota');

select * from finish();
rollback;
