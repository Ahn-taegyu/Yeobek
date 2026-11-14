begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public,extensions;
select no_plan();

-- Isolate cleanup ordering from earlier local HTTP runs; rollback restores it.
update visitor_audio_assets set cleanup_after = statement_timestamp() + interval '100 years';

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

select ok(not has_function_privilege('authenticated','reserve_visitor_voice(text,uuid,uuid,text,text,boolean,uuid,text)','EXECUTE'),
    'browser cannot reserve visitor voice work directly');
select ok(not has_function_privilege('anon','load_visitor_voice(text,uuid)','EXECUTE'),'anonymous cannot fetch internal voice result');
set local role service_role;
select set_config('test.stt',reserve_visitor_voice(current_setting('test.sid'),'10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',current_setting('test.input'),'transcription',true)->>'id',true);
select throws_ok($$select reserve_visitor_request(current_setting('test.sid'),'10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',current_setting('test.input'),true)$$,'P1005','Request ID already used with different input',
    'question cannot replay a transcription ID');
select throws_ok($$select complete_visitor_request(current_setting('test.sid'),current_setting('test.stt')::uuid,null,'PROVIDER_UNAVAILABLE')$$,
    'P0002','Visitor request not found','question completion cannot write a voice result');
select throws_ok($$select complete_visitor_voice(current_setting('test.sid'),current_setting('test.stt')::uuid,
    '{"requestId":"40000000-0000-0000-0000-000000000001","transcript":"Spoken text","audio":"bytes","mock":true}')$$,
    '22023','Invalid visitor transcript','transcript row cannot contain raw audio');
select set_config('test.transcript','{"requestId":"40000000-0000-0000-0000-000000000001","transcript":"Spoken text","mock":true}',true);
select is(complete_visitor_voice(current_setting('test.sid'),current_setting('test.stt')::uuid,
    current_setting('test.transcript')::jsonb)->>'status','succeeded','transcription completes with temporary text only');
select is(complete_visitor_voice(current_setting('test.sid'),current_setting('test.stt')::uuid,
    current_setting('test.transcript')::jsonb)->'result',current_setting('test.transcript')::jsonb,'identical completion replays');
select is(load_visitor_voice(current_setting('test.other_sid'),current_setting('test.stt')::uuid),null,'other session cannot read transcript');
select is(load_visitor_answer(current_setting('test.sid'),current_setting('test.stt')::uuid),null,'question loader excludes voice results');
update app_policies set value = 1 where key = 'visitor_requests_per_minute';
select throws_ok($$select reserve_visitor_request(current_setting('test.sid'),'10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000002',current_setting('test.input'),true)$$,'P1010','Visitor request limit reached',
    'transcription counts toward the same quota as questions');
update app_policies set value = 6 where key = 'visitor_requests_per_minute';
select set_config('test.answer',reserve_visitor_request(current_setting('test.sid'),'10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000002',current_setting('test.input'),true)->>'id',true);
select complete_visitor_request(current_setting('test.sid'),current_setting('test.answer')::uuid,
    jsonb_build_object('answerId',current_setting('test.answer'),'requestId','40000000-0000-0000-0000-000000000002',
    'contextSequence',0,'inputMode','text','outputMode','text','answer','Approved narration',
    'citations','["50000000-0000-0000-0000-000000000001"]'::jsonb,'outcome','answered',
    'publication',current_setting('test.ref')::jsonb,'source','approved_narration','mock',true));
select throws_ok($$select reserve_visitor_voice(current_setting('test.sid'),'10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000002',current_setting('test.input'),'transcription',true)$$,'P1005',
    'Request ID already used with different input','voice cannot reserve an existing question ID');
update app_policies set value = 2 where key = 'visitor_requests_per_minute';
select throws_ok($$select reserve_visitor_voice(current_setting('test.sid'),'10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000003',current_setting('test.input'),'reply_audio',true,current_setting('test.answer')::uuid,
    repeat('d',64))$$,'P1010','Visitor request limit reached','uncached speech shares the question and transcription quota');
update app_policies set value = 6 where key = 'visitor_requests_per_minute';
select throws_ok($$select reserve_visitor_voice(current_setting('test.other_sid'),'10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000003',current_setting('test.input'),'reply_audio',true,current_setting('test.answer')::uuid,
    repeat('d',64))$$,'P0002','Visitor answer not found','other session cannot synthesize saved answer');
select set_config('test.tts',reserve_visitor_voice(current_setting('test.sid'),'10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000003',current_setting('test.input'),'reply_audio',true,current_setting('test.answer')::uuid,
    repeat('d',64))->>'id',true);
select set_config('test.speech',jsonb_build_object('storageKey','requests/' || current_setting('test.tts') || '.mp3',
    'contentHash',repeat('e',64),'byteSize',104,'contentType','audio/mpeg','textHash',encode(sha256('Approved narration'::bytea),'hex'),
    'publication',current_setting('test.ref')::jsonb,'mock',true)::text,true);
select throws_ok($$select complete_visitor_voice(current_setting('test.other_sid'),current_setting('test.tts')::uuid,
    current_setting('test.speech')::jsonb)$$,'P0002','Visitor request not found','other session cannot complete speech');
select throws_ok($$select complete_visitor_voice(current_setting('test.sid'),current_setting('test.tts')::uuid,
    current_setting('test.speech')::jsonb || '{"textHash":"wrong"}')$$,'22023','Invalid visitor audio metadata',
    'speech binds the exact saved reply text');
select throws_ok($$select complete_visitor_voice(current_setting('test.sid'),current_setting('test.tts')::uuid,
    current_setting('test.speech')::jsonb)$$,'P1002','Visitor audio object unavailable','ready speech requires a stored object');
reset role;
insert into storage.objects(bucket_id,name,metadata)
values ('visitor-audio',current_setting('test.speech')::jsonb->>'storageKey','{"size":104,"mimetype":"audio/mpeg"}');
set local role service_role;
select is(complete_visitor_voice(current_setting('test.sid'),current_setting('test.tts')::uuid,
    current_setting('test.speech')::jsonb)->>'status','succeeded','verified speech completes');
update app_policies set value = 1 where key = 'visitor_requests_per_minute';
select is(reserve_visitor_voice(current_setting('test.sid'),'10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000004',current_setting('test.input'),'reply_audio',true,current_setting('test.answer')::uuid,
    repeat('d',64))->>'claimed','false','cache reuse does not charge, even at the shared quota');
select throws_ok($$select reserve_visitor_voice(current_setting('test.sid'),'10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000004',repeat('f',64),'reply_audio',true,current_setting('test.answer')::uuid,
    repeat('d',64))$$,'P1005','Request ID already used with different input','cached request ID is still bound to its input');
update app_policies set value = 6 where key = 'visitor_requests_per_minute';
select set_config('test.late',reserve_visitor_voice(current_setting('test.sid'),'10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000005',current_setting('test.input'),'transcription',true)->>'id',true);
reset role;
update api_requests set lease_until = statement_timestamp() - interval '1 second' where id = current_setting('test.late')::uuid;
update api_requests set created_at = statement_timestamp() - interval '2 hours',expires_at = statement_timestamp() - interval '1 hour'
    where id = current_setting('test.stt')::uuid;
set local role service_role;
select is(complete_visitor_voice(current_setting('test.sid'),current_setting('test.late')::uuid,
    '{"requestId":"40000000-0000-0000-0000-000000000005","transcript":"Late transcript","mock":true}')->>'failureCode',
    'REQUEST_TIMEOUT','late provider completion is settled as timeout');
select is(reserve_visitor_voice(current_setting('test.sid'),'10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000005',current_setting('test.input'),'transcription',true)->>'claimed',
    'false','a timed-out voice request cannot claim another call');
select is(load_visitor_voice(current_setting('test.sid'),current_setting('test.stt')::uuid),null,'expired transcript cannot load');
select throws_ok($$select reserve_visitor_voice(current_setting('test.sid'),'10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',current_setting('test.input'),'transcription',true)$$,
    'P1012','Visitor request expired','expired transcript cannot replay');
reset role;
select ok((select expires_at from api_requests where id = current_setting('test.tts')::uuid)
    <= (select expires_at from api_requests where id = current_setting('test.answer')::uuid),'speech cannot outlive source answer');
update artworks set state = 'paused' where id = '20000000-0000-0000-0000-000000000001';
set local role service_role;
select is(load_visitor_voice(current_setting('test.sid'),current_setting('test.tts')::uuid),null,'pause closes cached speech');
select is(list_visitor_audio_cleanup(50),'[]'::jsonb,'live TTL and upload grace prevent early cleanup');
reset role;
update api_requests set created_at = statement_timestamp() - interval '2 hours',expires_at = statement_timestamp() - interval '1 hour'
    where id = current_setting('test.tts')::uuid;
set local role service_role;
select purge_expired();
reset role;
select ok(not exists (select 1 from api_requests where id = current_setting('test.tts')::uuid),'purge removes expired speech ledger row');
select ok(exists (select 1 from visitor_audio_assets where id = current_setting('test.tts')::uuid),'purge retains independent audio cleanup record');
update public.visitor_audio_assets set cleanup_after = statement_timestamp() - interval '1 second'
    where id = current_setting('test.tts')::uuid;
set local role service_role;
select is(list_visitor_audio_cleanup(50)#>>'{0,id}',current_setting('test.tts'),'worker can claim due cleanup');
select is(complete_visitor_audio_cleanup(current_setting('test.tts')::uuid),false,'cleanup requires Storage removal');
reset role;
update storage.objects set name = name || '.removed-fixture'
    where bucket_id = 'visitor-audio' and name = (current_setting('test.speech')::jsonb->>'storageKey');
set local role service_role;
select is(complete_visitor_audio_cleanup(current_setting('test.tts')::uuid),true,'verified removal clears durable cleanup entry');

reset role;
select * from finish();
rollback;
