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
-- A second exhibition owned by another artist must share the session quota.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select create_exhibition('10000000-0000-0000-0000-000000000002','Second exhibition',null,null,null,'[]','[]');
select create_artwork('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002',
    1,'Second artwork',null,null,null,'[]','[]');
reset role;
insert into publications(id,owner_id,exhibition_id,artwork_id,version,number,title,image_key,evidence,
    narration_text,narration_hash,narration_citations,approved_by)
select '30000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002',1,number,title,image_key,
    jsonb_build_object('schemaVersion',1,'items',jsonb_build_array((evidence#>'{items,0}') ||
      '{"ownerId":"00000000-0000-0000-0000-000000000002","exhibitionId":"10000000-0000-0000-0000-000000000002",
        "publicationId":"30000000-0000-0000-0000-000000000003","artworkId":"20000000-0000-0000-0000-000000000002"}'::jsonb)),
    narration_text,narration_hash,narration_citations,'00000000-0000-0000-0000-000000000002'
from publications where id = '30000000-0000-0000-0000-000000000001';
update artworks set state = 'published',active_publication_id = '30000000-0000-0000-0000-000000000003'
    where id = '20000000-0000-0000-0000-000000000002';
update exhibitions set state = 'published',public_title = 'Second public title',public_artist_display_name = 'Second public artist'
    where id = '10000000-0000-0000-0000-000000000002';

select ok(not has_function_privilege('authenticated','list_gaps(uuid,uuid,boolean)','EXECUTE'),'browser cannot bypass the gaps feature flag');
select ok(not has_function_privilege('authenticated','dismiss_gap(uuid,uuid,boolean)','EXECUTE'),'browser cannot dismiss gaps directly');
select ok(not has_table_privilege('authenticated','qa_gaps','SELECT'),'visitor questions have no direct owner table read');
select ok(not has_table_privilege('service_role','api_requests','SELECT'),'only visitor RPCs can read the answer store');
select ok(not has_function_privilege('authenticated','reserve_visitor_request(text,uuid,uuid,text,boolean)','EXECUTE'),
    'browser cannot reserve work without the session boundary');

set local role service_role;
select set_config('test.id1',reserve_visitor_request(current_setting('test.sid'),'10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',current_setting('test.input'),true)->>'id',true);
update app_policies set value = 1 where key = 'visitor_requests_per_minute';
select is(reserve_visitor_request(current_setting('test.sid'),'10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',current_setting('test.input'),true)->>'claimed','false','duplicate bypasses quota without a new claim');
select throws_ok($$select reserve_visitor_request(current_setting('test.sid'),'10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',repeat('d',64),true)$$,'P1005','Request ID already used with different input',
    'same ID cannot reserve a different input');
select throws_ok($$select reserve_visitor_request(current_setting('test.sid'),'10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000002',current_setting('test.input'),true)$$,'P1010','Visitor request limit reached',
    'minute limit reads the current policy');
select throws_ok($$select reserve_visitor_request(current_setting('test.sid'),'10000000-0000-0000-0000-000000000002',
    '40000000-0000-0000-0000-000000000002',current_setting('test.input'),true)$$,'P1010','Visitor request limit reached',
    'switching exhibitions does not bypass the session minute limit');
update app_policies set value = 1 where key = 'exhibition_requests_per_day';
select throws_ok($$select reserve_visitor_request(current_setting('test.other_sid'),'10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000002',current_setting('test.input'),true)$$,'P1010','Visitor request limit reached',
    'daily limit counts all sessions for the exhibition');
update app_policies set value = 6 where key = 'visitor_requests_per_minute';
update app_policies set value = 1000 where key = 'exhibition_requests_per_day';

select set_config('test.reply1',jsonb_build_object('answerId',current_setting('test.id1'),
    'requestId','40000000-0000-0000-0000-000000000001','contextSequence',0,'inputMode','text','outputMode','text',
    'answer','Approved narration','citations','["50000000-0000-0000-0000-000000000001"]'::jsonb,
    'outcome','answered','publication',current_setting('test.ref')::jsonb,'source','approved_narration','mock',true)::text,true);
select throws_ok($$select complete_visitor_request(current_setting('test.sid'),current_setting('test.id1')::uuid,
    current_setting('test.reply1')::jsonb || '{"question":"Private visitor question"}')$$,'22023','Invalid visitor result',
    'completion does not accept an input question');
select throws_ok($$select complete_visitor_request(current_setting('test.sid'),current_setting('test.id1')::uuid,
    current_setting('test.reply1')::jsonb || '{"answer":"Replacement narration"}')$$,'22023','Invalid approved narration',
    'approved narration must match the public snapshot exactly');
select throws_ok($$select complete_visitor_request(current_setting('test.other_sid'),current_setting('test.id1')::uuid,
    current_setting('test.reply1')::jsonb)$$,'P0002','Visitor request not found','another session cannot complete the request');
select throws_ok($$select complete_visitor_request(current_setting('test.sid'),current_setting('test.id1')::uuid,
    jsonb_set(current_setting('test.reply1')::jsonb,'{publication}',(current_setting('test.ref')::jsonb - 'version')))$$,
    '22023','Invalid visitor publication','a partial publication reference is invalid');
select throws_ok($$select complete_visitor_request(current_setting('test.sid'),current_setting('test.id1')::uuid,
    current_setting('test.reply1')::jsonb || '{"source":"fixed"}')$$,'22023','Invalid visitor citations',
    'fixed output cannot claim to be an answered reply');
select is(complete_visitor_request(current_setting('test.sid'),current_setting('test.id1')::uuid,
    current_setting('test.reply1')::jsonb)->>'status','succeeded','stores the verified public answer');
select is(complete_visitor_request(current_setting('test.sid'),current_setting('test.id1')::uuid,
    current_setting('test.reply1')::jsonb)->'result',current_setting('test.reply1')::jsonb,'same completion is idempotent');
select is(load_visitor_answer(current_setting('test.other_sid'),current_setting('test.id1')::uuid),null,
    'a different session cannot load the saved answer');
select is(record_gap(current_setting('test.sid'),'40000000-0000-0000-0000-000000000001','Answered question',true),false,
    'a successful answer cannot create a gap');
select lives_ok($$select record_visitor_steps(current_setting('test.sid'),current_setting('test.id1')::uuid,
    '[{"id":"answer.store","status":"done","elapsedMs":1}]')$$,'allows bounded static final steps');
select throws_ok($$select record_visitor_steps(current_setting('test.sid'),current_setting('test.id1')::uuid,
    '[{"id":"answer.store","status":"done","elapsedMs":1,"question":"private"}]')$$,'22023','Invalid visitor steps',
    'step records cannot contain input');

select set_config('test.id2',reserve_visitor_request(current_setting('test.sid'),'10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000002',current_setting('test.input'),true)->>'id',true);
select set_config('test.reply2',(current_setting('test.reply1')::jsonb || jsonb_build_object('answerId',current_setting('test.id2'),
    'requestId','40000000-0000-0000-0000-000000000002','answer','No material','outcome','insufficient_evidence',
    'citations','[]'::jsonb,'source','fixed'))::text,true);
select complete_visitor_request(current_setting('test.sid'),current_setting('test.id2')::uuid,current_setting('test.reply2')::jsonb);
select is(record_gap(current_setting('test.sid'),'40000000-0000-0000-0000-000000000002','Unknown fact',false),false,'disabled gap flag blocks writes');
select is(record_gap(current_setting('test.sid'),'40000000-0000-0000-0000-000000000002','Unknown  fact',true),true,'insufficient answer records a gap');
select is(record_gap(current_setting('test.sid'),'40000000-0000-0000-0000-000000000002','Unknown fact',true),true,'gap replay preserves success');
select is(load_visitor_answer(current_setting('test.sid'),current_setting('test.id2')::uuid)->>'gapRecorded','true',
    'gap state is visible on answer replay');

select throws_ok($$select list_gaps('00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',false)$$,'P0002','Not found','disabled gap flag also blocks owner reads');
select is(list_gaps('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',true)#>>'{0,count}',
    '1','same request increments once');
select set_config('test.gap',list_gaps('00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',true)#>>'{0,id}',true);
select throws_ok($$select list_gaps('00000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',true)$$,'P0002','Subject not found','another author cannot list gaps');
select throws_ok($$select dismiss_gap('00000000-0000-0000-0000-000000000002',current_setting('test.gap')::uuid,true)$$,
    'P0002','Gap not found','another author cannot dismiss a gap');

select set_config('test.stale',reserve_visitor_request(current_setting('test.sid'),'10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000003',current_setting('test.input'),true)->>'id',true);
select set_config('test.timeout',reserve_visitor_request(current_setting('test.sid'),'10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000004',current_setting('test.input'),true)->>'id',true);
reset role;
update api_requests set lease_until = statement_timestamp() - interval '1 second' where id = current_setting('test.timeout')::uuid;
set local role service_role;
select is(reserve_visitor_request(current_setting('test.sid'),'10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000004',current_setting('test.input'),true)->>'failureCode','REQUEST_TIMEOUT',
    'an expired lease becomes a failed replay without regeneration');

reset role;
insert into publications(id,owner_id,exhibition_id,artwork_id,version,number,title,image_key,evidence,
    narration_text,narration_hash,narration_citations,approved_by)
select '30000000-0000-0000-0000-000000000002',owner_id,exhibition_id,artwork_id,2,number,title,image_key,
    jsonb_set(evidence,'{items,0,publicationId}','"30000000-0000-0000-0000-000000000002"'),
    narration_text,narration_hash,narration_citations,approved_by
from publications where id = '30000000-0000-0000-0000-000000000001';
update artworks set active_publication_id = (select id from publications where version = 2
    and artwork_id = '20000000-0000-0000-0000-000000000001')
where id = '20000000-0000-0000-0000-000000000001';
select is((select status from qa_gaps where id = current_setting('test.gap')::uuid),'answered','republish resolves earlier open gaps');
set local role service_role;
select is(load_visitor_answer(current_setting('test.sid'),current_setting('test.id1')::uuid),null,'previous publication answer is unavailable');
select is(complete_visitor_request(current_setting('test.sid'),current_setting('test.stale')::uuid,
    current_setting('test.reply1')::jsonb || jsonb_build_object('answerId',current_setting('test.stale'),
        'requestId','40000000-0000-0000-0000-000000000003'))->>'failureCode','CONTENT_CHANGED',
    'publication replacement prevents saving stale content');
reset role;
update api_requests set created_at = statement_timestamp() - interval '2 hours', expires_at = statement_timestamp() - interval '1 hour'
    where id = current_setting('test.id1')::uuid;
set local role service_role;
select throws_ok($$select reserve_visitor_request(current_setting('test.sid'),'10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',current_setting('test.input'),true)$$,'P1012','Visitor request expired',
    'expired reply cannot replay');
select is(load_visitor_answer(current_setting('test.sid'),current_setting('test.id1')::uuid),null,'expired reply cannot be loaded');
select is(purge_expired()->>'answers','1','purge removes expired visitor answers');

reset role;
select * from finish();
rollback;
