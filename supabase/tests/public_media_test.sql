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
    narration_text,narration_hash,narration_citations,audio_key,audio_text_hash,approved_by)
values ('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',1,1,'Public work','00000000-0000-0000-0000-000000000001/fixture/image.png',
    jsonb_build_object('schemaVersion',1,'items',jsonb_build_array(jsonb_build_object(
        'id','50000000-0000-0000-0000-000000000001','version',1,
        'ownerId','00000000-0000-0000-0000-000000000001','exhibitionId','10000000-0000-0000-0000-000000000001',
        'publicationId','30000000-0000-0000-0000-000000000001','artworkId','20000000-0000-0000-0000-000000000001',
        'scope','artwork','sourceLabel','Approved source','body','Approved narration',
        'contentHash',encode(sha256('Approved narration'::bytea),'hex')))),
    'Approved narration',sha256('Approved narration'::bytea),'[{"id":"50000000-0000-0000-0000-000000000001","version":1}]',
    '00000000-0000-0000-0000-000000000001/fixture/audio.mp3',sha256('Approved narration'::bytea),
    '00000000-0000-0000-0000-000000000001');
update artworks set state = 'published',active_publication_id = '30000000-0000-0000-0000-000000000001'
    where id = '20000000-0000-0000-0000-000000000001';
update exhibitions set state = 'published',public_title = 'Public title',public_artist_display_name = 'Public artist'
    where id = '10000000-0000-0000-0000-000000000001';
insert into public.materials(owner_id,artwork_id,kind,state,storage_key,byte_size,content_type,content_hash)
values ('00000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','image','ready',
    '00000000-0000-0000-0000-000000000001/fixture/image.png',32,'image/png',sha256('Image bytes'::bytea));
insert into public.narration_approvals(id,owner_id,exhibition_id,artwork_id,artwork_revision,narration_text,text_hash,citations,approved_by)
select '60000000-0000-0000-0000-000000000001',owner_id,exhibition_id,artwork_id,1,narration_text,narration_hash,narration_citations,owner_id
from publications where id = '30000000-0000-0000-0000-000000000001';
insert into public.audio_assets(owner_id,exhibition_id,artwork_id,approval_id,text_hash,voice_config_version,storage_key,state,
    content_hash,byte_size,mock)
select owner_id,exhibition_id,artwork_id,'60000000-0000-0000-0000-000000000001',narration_hash,1,audio_key,'ready',
    sha256('Audio bytes'::bytea),32,true from publications where id = '30000000-0000-0000-0000-000000000001';

select ok(not has_function_privilege('anon','get_public_media(uuid,text,boolean)','EXECUTE'),'anonymous callers cannot resolve private keys');
select ok(not has_function_privilege('authenticated','get_public_media(uuid,text,boolean)','EXECUTE'),'artists cannot directly resolve private keys');
set local role service_role;
select is(get_public_media('30000000-0000-0000-0000-000000000001','image',false)->>'contentType','image/png',
    'current image has verified storage metadata');
select is(get_public_media('30000000-0000-0000-0000-000000000001','audio',false),null,'live request cannot access a mock asset');
select is(get_public_media('30000000-0000-0000-0000-000000000001','audio',true)->>'mock','true','mock request can access mock audio');
select is(get_public_media_refs(array['30000000-0000-0000-0000-000000000001'::uuid],false),
    '[{"publicationId":"30000000-0000-0000-0000-000000000001","image":{"id":"30000000-0000-0000-0000-000000000001","kind":"image"},"audio":null}]'::jsonb,
    'media references expose neither private keys nor hidden mock audio');
select throws_ok($$select get_public_media('30000000-0000-0000-0000-000000000001','pdf',true)$$,
    '22023','Invalid public media kind','PDFs are never served by the public media RPC');
reset role;
update public.audio_assets set mock = false where storage_key = '00000000-0000-0000-0000-000000000001/fixture/audio.mp3';
update app_policies set value = 2 where key = 'voice_config_version';
set local role service_role;
select is(get_public_media('30000000-0000-0000-0000-000000000001','audio',false)->>'contentHash',
    encode(sha256('Audio bytes'::bytea),'hex'),'old live snapshot remains readable after voice version changes');
reset role;
update artworks set state = 'paused' where id = '20000000-0000-0000-0000-000000000001';
set local role service_role;
select is(get_public_media('30000000-0000-0000-0000-000000000001','image',false),null,'artwork pause closes media');
reset role;
insert into publications(id,owner_id,exhibition_id,artwork_id,version,number,title,image_key,evidence,
    narration_text,narration_hash,narration_citations,audio_key,audio_text_hash,approved_by)
select '30000000-0000-0000-0000-000000000002',owner_id,exhibition_id,artwork_id,2,number,title,image_key,
    jsonb_set(evidence,'{items,0,publicationId}','"30000000-0000-0000-0000-000000000002"'),
    narration_text,narration_hash,narration_citations,audio_key,audio_text_hash,approved_by
from publications where id = '30000000-0000-0000-0000-000000000001';
update artworks set active_publication_id = '30000000-0000-0000-0000-000000000002',state = 'published'
    where id = '20000000-0000-0000-0000-000000000001';
set local role service_role;
select is(get_public_media('30000000-0000-0000-0000-000000000001','audio',false),null,'republish invalidates old audio references');
select is(get_public_media('30000000-0000-0000-0000-000000000002','audio',false)->>'version','2','new media reference follows the new snapshot');
reset role;
update publications set revoked_at = clock_timestamp() where id = '30000000-0000-0000-0000-000000000002';
set local role service_role;
select is(get_public_media('30000000-0000-0000-0000-000000000002','audio',false),null,'revoked publication closes audio');
select is(get_public_media('30000000-0000-0000-0000-000000000002','image',false),null,'revoked publication closes image');

reset role;
select * from finish();
rollback;
