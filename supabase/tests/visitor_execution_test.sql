begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public,extensions;
select no_plan();

insert into auth.users(id,email) values
    ('00000000-0000-0000-0000-000000000001','visitor-owner@example.invalid'),
    ('00000000-0000-0000-0000-000000000002','other-visitor-owner@example.invalid');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select create_exhibition('10000000-0000-0000-0000-000000000001','Visitor exhibition',null,null,null,'[]','[]');
select create_artwork('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
    1,'Visitor artwork',null,null,null,'[]','[]');
reset role;

-- This fixture represents a trusted W4 publication, without external AI or file upload.
insert into publications(id,owner_id,exhibition_id,artwork_id,version,number,title,image_key,evidence,
    narration_text,narration_hash,narration_citations,approved_by)
values ('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',1,1,'Public work','fixture/image',
    jsonb_build_object('schemaVersion',1,'items',jsonb_build_array(jsonb_build_object(
        'id','50000000-0000-0000-0000-000000000001','version',1,
        'ownerId','00000000-0000-0000-0000-000000000001','exhibitionId','10000000-0000-0000-0000-000000000001',
        'publicationId','30000000-0000-0000-0000-000000000001','artworkId','20000000-0000-0000-0000-000000000001',
        'scope','artwork','sourceLabel','Approved source','body','Approved narration',
        'contentHash',encode(sha256('Approved narration'::bytea),'hex')))),
    'Approved narration',sha256('Approved narration'::bytea),'[{"id":"50000000-0000-0000-0000-000000000001","version":1}]',
    '00000000-0000-0000-0000-000000000001');
update artworks set state = 'published',active_publication_id = '30000000-0000-0000-0000-000000000001'
    where id = '20000000-0000-0000-0000-000000000001';
update exhibitions set state = 'published',public_title = 'Public title',public_artist_display_name = 'Public artist'
    where id = '10000000-0000-0000-0000-000000000001';
select set_config('test.sid',repeat('a',64),true);
select set_config('test.other_sid',repeat('b',64),true);
select set_config('test.input',repeat('c',64),true);
select set_config('test.ref','{"exhibitionId":"10000000-0000-0000-0000-000000000001","artworkId":"20000000-0000-0000-0000-000000000001","publicationId":"30000000-0000-0000-0000-000000000001","version":1}',true);

select ok(not has_function_privilege('authenticated','record_visitor_execution(text,uuid,jsonb,jsonb,int)','EXECUTE'),
    'browser cannot write visitor execution records');
set local role service_role;
select set_config('test.execution_id',reserve_visitor_request(current_setting('test.sid'),'10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',current_setting('test.input'),true)->>'id',true);
select throws_ok($$select record_visitor_execution(current_setting('test.sid'),current_setting('test.execution_id')::uuid,
    '[]','[]',10)$$,'P1011','Visitor execution is not complete','running request cannot freeze incomplete telemetry');
select complete_visitor_request(current_setting('test.sid'),current_setting('test.execution_id')::uuid,null,
    'PROVIDER_UNAVAILABLE','[]');
select set_config('test.calls','[{"provider":"mock","model":"mock-qa","mock":true,"usage":{"inputTokens":1,"totalTokens":2}}]',true);
select set_config('test.steps','[{"id":"answer.store","status":"failed","elapsedMs":1}]',true);
select throws_ok($$select record_visitor_execution(current_setting('test.other_sid'),current_setting('test.execution_id')::uuid,
    '[]','[]',10)$$,'P0002','Visitor request not found','another session cannot write telemetry');
select throws_ok($$select record_visitor_execution(current_setting('test.sid'),current_setting('test.execution_id')::uuid,
    '[]','[{"provider":"mock","model":"mock-qa","question":"not allowed"}]',10)$$,'22023',
    'Invalid visitor execution metadata','telemetry cannot contain a question field');
select throws_ok($$select record_visitor_execution(current_setting('test.sid'),current_setting('test.execution_id')::uuid,
    '[]','[{"provider":"mock","model":"mock-qa","usage":{"inputTokens":-1}}]',10)$$,'22023',
    'Invalid visitor execution metadata','negative token count rejected');
select lives_ok($$select record_visitor_execution(current_setting('test.sid'),current_setting('test.execution_id')::uuid,
    current_setting('test.steps')::jsonb,current_setting('test.calls')::jsonb,10)$$,'terminal execution metadata is stored');
select lives_ok($$select record_visitor_execution(current_setting('test.sid'),current_setting('test.execution_id')::uuid,
    current_setting('test.steps')::jsonb,current_setting('test.calls')::jsonb,10)$$,'identical metadata replay is idempotent');
select throws_ok($$select record_visitor_execution(current_setting('test.sid'),current_setting('test.execution_id')::uuid,
    current_setting('test.steps')::jsonb,current_setting('test.calls')::jsonb,11)$$,'P1011',
    'Visitor execution already recorded','execution metadata cannot be rewritten');
select throws_ok($$select record_visitor_steps(current_setting('test.sid'),current_setting('test.execution_id')::uuid,
    '[]')$$,'P1011','Visitor execution already recorded','legacy step-only RPC cannot change the execution record');
reset role;
select is((select usage from api_requests where id = current_setting('test.execution_id')::uuid),
    jsonb_build_object('calls',current_setting('test.calls')::jsonb,'elapsedMs',10),'only bounded telemetry is saved');
select * from finish();
rollback;
