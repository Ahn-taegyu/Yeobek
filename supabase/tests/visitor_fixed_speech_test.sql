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

select ok(not has_function_privilege('anon','get_visitor_answer_exhibition(text,uuid)','EXECUTE'),
    'anonymous cannot resolve visitor answer exhibition');
select ok(not has_function_privilege('authenticated','get_visitor_answer_exhibition(text,uuid)','EXECUTE'),
    'authenticated cannot resolve visitor answer exhibition directly');
set local role service_role;
select set_config('test.answer',reserve_visitor_request(current_setting('test.sid'),'10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',current_setting('test.input'),true)->>'id',true);
select complete_visitor_request(current_setting('test.sid'),current_setting('test.answer')::uuid,
    jsonb_build_object('answerId',current_setting('test.answer'),'requestId','40000000-0000-0000-0000-000000000001',
    'contextSequence',0,'inputMode','text','outputMode','voice','answer','Choose an artwork',
    'citations','[]'::jsonb,'outcome','clarify','publication',null,'source','fixed','mock',true));
select is(get_visitor_answer_exhibition(current_setting('test.sid'),current_setting('test.answer')::uuid),
    '10000000-0000-0000-0000-000000000001'::uuid,'fixed reply resolves its saved exhibition');
select is(get_visitor_answer_exhibition(current_setting('test.other_sid'),current_setting('test.answer')::uuid),null,
    'another session cannot resolve a fixed reply');
select set_config('test.voice',reserve_visitor_voice(current_setting('test.sid'),'10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000002',current_setting('test.input'),'reply_audio',true,current_setting('test.answer')::uuid,
    repeat('d',64))->>'id',true);
select set_config('test.speech',jsonb_build_object('storageKey','requests/' || current_setting('test.voice') || '.mp3',
    'contentHash',repeat('e',64),'byteSize',104,'contentType','audio/mpeg','textHash',encode(sha256('Choose an artwork'::bytea),'hex'),
    'publication',null,'mock',true)::text,true);
reset role;
insert into storage.objects(bucket_id,name,metadata) values
    ('visitor-audio',current_setting('test.speech')::jsonb->>'storageKey','{"size":104,"mimetype":"audio/mpeg"}');
set local role service_role;
select throws_ok($$select complete_visitor_voice(current_setting('test.sid'),current_setting('test.voice')::uuid,
    current_setting('test.speech')::jsonb - 'publication')$$,'22023','Invalid visitor audio metadata',
    'fixed speech still requires explicit null publication');
select is(complete_visitor_voice(current_setting('test.sid'),current_setting('test.voice')::uuid,
    current_setting('test.speech')::jsonb)->>'status','succeeded','fixed clarification can be synthesized and stored');
select is(reserve_visitor_voice(current_setting('test.sid'),'10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000003',current_setting('test.input'),'reply_audio',true,current_setting('test.answer')::uuid,
    repeat('d',64))->>'claimed','false','fixed clarification also reuses cached audio');
update app_policies set value = 1 where key = 'visitor_audio_cache_requests_per_minute';
select throws_ok($$select reserve_visitor_voice(current_setting('test.sid'),'10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000004',current_setting('test.input'),'reply_audio',true,current_setting('test.answer')::uuid,
    repeat('d',64))$$,'P1010','Visitor request limit reached','fresh cached ID is bounded independently of synthesis quota');
select is(reserve_visitor_voice(current_setting('test.sid'),'10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000003',current_setting('test.input'),'reply_audio',true,current_setting('test.answer')::uuid,
    repeat('d',64))->>'claimed','false','existing cached ID can replay even at the cache limit');
reset role;
update exhibitions set state = 'paused' where id = '10000000-0000-0000-0000-000000000001';
set local role service_role;
select is(load_visitor_voice(current_setting('test.sid'),current_setting('test.voice')::uuid),null,
    'pausing the exhibition closes saved clarification audio');
select is(get_visitor_answer_exhibition(current_setting('test.sid'),current_setting('test.answer')::uuid),null,
    'pausing the exhibition closes source resolution');
reset role;
update exhibitions set state = 'published' where id = '10000000-0000-0000-0000-000000000001';
update api_requests set created_at = statement_timestamp() - interval '2 hours',expires_at = statement_timestamp() - interval '1 hour'
    where id = current_setting('test.answer')::uuid;
set local role service_role;
select is(get_visitor_answer_exhibition(current_setting('test.sid'),current_setting('test.answer')::uuid),null,
    'expired fixed reply cannot resolve an exhibition');
select is(load_visitor_voice(current_setting('test.sid'),current_setting('test.voice')::uuid),null,
    'cached voice cannot outlive its fixed source reply');
select throws_ok($$select load_visitor_answer(current_setting('test.sid'),current_setting('test.answer')::uuid)$$,
    'P1012','Visitor request expired','same session gets expiry when the exhibition is still public');
select is(load_visitor_answer(current_setting('test.other_sid'),current_setting('test.answer')::uuid),null,
    'another session cannot distinguish an expired answer');
reset role;
update exhibitions set state = 'paused' where id = '10000000-0000-0000-0000-000000000001';
set local role service_role;
select is(load_visitor_answer(current_setting('test.sid'),current_setting('test.answer')::uuid),null,
    'expired answer stays hidden when the exhibition is not public');
reset role;
select * from finish();
rollback;
