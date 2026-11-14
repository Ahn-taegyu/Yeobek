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


insert into public.publications(id,owner_id,exhibition_id,artwork_id,version,number,title,evidence,
    narration_text,narration_hash,narration_citations,approved_by)
select '30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',1,1,'Published artwork',
    jsonb_build_object('schemaVersion',1,'items',jsonb_agg(jsonb_build_object(
        'id',('50000000-0000-0000-0000-'||lpad(n::text,12,'0')),'version',1,
        'ownerId','00000000-0000-0000-0000-000000000001','exhibitionId','10000000-0000-0000-0000-000000000001',
        'publicationId','30000000-0000-0000-0000-000000000001',
        'artworkId',case when n=3 then '20000000-0000-0000-0000-000000000001' end,
        'scope',case n when 1 then 'artist' when 2 then 'exhibition' else 'artwork' end,
        'sourceLabel','Approved source','body','Evidence '||n,
        'contentHash',encode(sha256(convert_to('Evidence '||n,'UTF8')),'hex')) order by n)),
    'Approved artwork narration',sha256('Approved artwork narration'::bytea),
    '[{"id":"50000000-0000-0000-0000-000000000003","version":1}]','00000000-0000-0000-0000-000000000001'
from generate_series(1,3) n;
update artworks set state='published',active_publication_id='30000000-0000-0000-0000-000000000001'
    where id='20000000-0000-0000-0000-000000000001';
update exhibitions set state='published',public_title='Published exhibition',public_artist_display_name='Artist'
    where id='10000000-0000-0000-0000-000000000001';
set local role service_role;
select set_config('test.common',load_publication_context('10000000-0000-0000-0000-000000000001',null,null)::text,true);
select is(current_setting('test.common')::jsonb->'artworkId','null'::jsonb,'common context does not select an artwork');
select is(current_setting('test.common')::jsonb->'number','null'::jsonb,'common context has no artwork number');
select is(current_setting('test.common')::jsonb->'narration','null'::jsonb,'common context cannot replay artwork narration');
select is(jsonb_array_length(current_setting('test.common')::jsonb->'evidence'),2,'only artist and exhibition evidence is included');
select ok(not exists(select 1 from jsonb_array_elements(current_setting('test.common')::jsonb->'evidence') e
    where e->>'scope'='artwork'),'artwork evidence is excluded from the common prompt');
select is(is_publication_current('10000000-0000-0000-0000-000000000001',null,
    '30000000-0000-0000-0000-000000000001',1),true,'common reference follows its revocable publication dependency');
select is(check_publication_versions('10000000-0000-0000-0000-000000000001',
    '[{"artworkId":null,"publicationId":"30000000-0000-0000-0000-000000000001","version":1}]')#>>'{publications,0,current}',
    'true','batch version check supports a common reference');
select set_config('test.sid',repeat('a',64),true);
select set_config('test.answer',reserve_visitor_request(current_setting('test.sid'),'10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',repeat('b',64),true)->>'id',true);
select set_config('test.reply',jsonb_build_object('answerId',current_setting('test.answer'),
    'requestId','40000000-0000-0000-0000-000000000001','contextSequence',1,'inputMode','text','outputMode','voice',
    'answer','An exhibition answer.','citations',jsonb_build_array('50000000-0000-0000-0000-000000000001'),
    'outcome','answered','source','generated','mock',true,'publication',jsonb_build_object(
        'exhibitionId','10000000-0000-0000-0000-000000000001','artworkId',null,
        'publicationId','30000000-0000-0000-0000-000000000001','version',1))::text,true);
select throws_ok($$select complete_visitor_request(current_setting('test.sid'),current_setting('test.answer')::uuid,
    jsonb_set(current_setting('test.reply')::jsonb,'{citations}','["50000000-0000-0000-0000-000000000003"]'))$$,
    '22023','Invalid visitor citations','common replies cannot cite artwork evidence');
select is(complete_visitor_request(current_setting('test.sid'),current_setting('test.answer')::uuid,
    current_setting('test.reply')::jsonb)->>'status','succeeded','common-only generated answer can be persisted');
select is(load_visitor_answer(current_setting('test.sid'),current_setting('test.answer')::uuid)->'publication'->'artworkId',
    'null'::jsonb,'saved reply preserves no artwork selection');
select set_config('test.voice',reserve_visitor_voice(current_setting('test.sid'),'10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000002',repeat('c',64),'reply_audio',true,current_setting('test.answer')::uuid,repeat('d',64))->>'id',true);
reset role;
update artworks set state='paused' where id='20000000-0000-0000-0000-000000000001';
set local role service_role;
select is(load_publication_context('10000000-0000-0000-0000-000000000001',null,null),null,'pausing last publication closes common retrieval');
select is(load_visitor_answer(current_setting('test.sid'),current_setting('test.answer')::uuid),null,'common cached answer closes with publication');
select is(complete_visitor_voice(current_setting('test.sid'),current_setting('test.voice')::uuid,'{}')->>'failureCode',
    'CONTENT_CHANGED','in-flight common speech cannot complete after pause');
reset role;
select * from finish();
rollback;
