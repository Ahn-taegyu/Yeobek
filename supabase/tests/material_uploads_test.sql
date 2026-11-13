begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public,extensions;
select no_plan();

insert into auth.users(id,email) values
    ('00000000-0000-0000-0000-000000000001','material-owner@example.invalid'),
    ('00000000-0000-0000-0000-000000000002','material-other@example.invalid');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select create_exhibition('10000000-0000-0000-0000-000000000001','Material exhibition',null,null,null,'[]','[]');
select create_artwork('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
    1,'Material artwork',null,null,null,'[]','[]');
select create_artwork('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001',
    2,'Disposable artwork',null,null,null,'[]','[]');
select ok(not has_function_privilege('authenticated','request_upload(uuid,uuid,text,uuid,text,text,text,integer)','EXECUTE'),
    'browser cannot reserve arbitrary uploads');
select ok(not has_function_privilege('authenticated','complete_upload(uuid,uuid,integer,text,integer,text,integer,integer,integer)','EXECUTE'),
    'browser cannot mark unchecked files ready');
select ok(not has_function_privilege('authenticated','list_material_cleanup(integer)','EXECUTE'),
    'browser cannot enumerate cleanup paths');
select ok(not has_function_privilege('authenticated','complete_material_cleanup(uuid,uuid,integer)','EXECUTE'),
    'browser cannot mark cleanup completed');
select ok(not has_table_privilege('authenticated','materials','SELECT'),'artist material list hides raw table keys');

set local role service_role;
select throws_ok($$select request_upload('00000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001',
    'artwork','20000000-0000-0000-0000-000000000001','image','image.jpeg','image/jpeg',64)$$,
    'P0002','Subject not found','foreign owner cannot reserve an upload to the artwork');
select throws_ok($$select request_upload('00000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',
    'artwork','20000000-0000-0000-0000-000000000001','image','image.png','image/jpeg',64)$$,
    '22023','Invalid upload metadata','filename and declared content type must agree');
update app_policies set value = 32 where key = 'image_max_bytes';
select throws_ok($$select request_upload('00000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',
    'artwork','20000000-0000-0000-0000-000000000001','image','image.jpeg','image/jpeg',64)$$,
    '22023','Upload exceeds material size limit','size limit comes from the current policy');
update app_policies set value = 64 where key = 'image_max_bytes';
select set_config('test.image',request_upload('00000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',
    'artwork','20000000-0000-0000-0000-000000000001','image','image.jpeg','image/jpeg',64)::text,true);
select is(current_setting('test.image')::jsonb->>'stagingKey',
    '00000000-0000-0000-0000-000000000001/uploads/30000000-0000-0000-0000-000000000001.jpg','staging path binds owner and material ID');
select is(current_setting('test.image')::jsonb->>'finalKey',
    '00000000-0000-0000-0000-000000000001/materials/30000000-0000-0000-0000-000000000001/v1.jpg','final path is a separate immutable version');
select is(request_upload('00000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',
    'artwork','20000000-0000-0000-0000-000000000001','image','image.jpeg','image/jpeg',64)->>'created','false','same reservation replays');
select throws_ok($$select request_upload('00000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',
    'artwork','20000000-0000-0000-0000-000000000001','image','other.jpeg','image/jpeg',64)$$,
    'P1005','Request ID already used with different input','changed input cannot replay an ID');
select throws_ok($$select complete_upload('00000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',
    1,repeat('a',64),64,'image/jpeg',null,10,10)$$,'P1002','Final upload is not available','staging alone cannot mark material ready');

reset role;
-- Simulate a finalized Storage object, after the worker validates the actual bytes.
insert into storage.objects(bucket_id,name,metadata) values
    ('artist-materials',current_setting('test.image')::jsonb->>'finalKey','{"size":64,"mimetype":"image/jpeg"}');
set local role service_role;
select is(complete_upload('00000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',
    1,repeat('a',64),64,'image/jpeg',null,10,10)->>'state','ready','verified final object can become ready');
select is(complete_upload('00000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',
    1,repeat('a',64),64,'image/jpeg',null,10,10)->>'version','1','matching completion replay keeps the version');
select throws_ok($$select complete_upload('00000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',
    1,repeat('b',64),64,'image/jpeg',null,10,10)$$,'40001','Upload completion conflicts with saved material','different bytes cannot replace final material');

select set_config('test.pdf',request_upload('00000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002',
    'exhibition','10000000-0000-0000-0000-000000000001','pdf','source.pdf','application/pdf',64)::text,true);
reset role;
insert into storage.objects(bucket_id,name,metadata) values
    ('artist-materials',current_setting('test.pdf')::jsonb->>'finalKey','{"size":64,"mimetype":"application/pdf"}');
set local role service_role;
select is(complete_upload('00000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002',
    1,repeat('a',64),64,'application/pdf',2,null,null)->>'pages','2','verified PDF page count is persisted');
set local role authenticated;
select is(set_artwork_image('20000000-0000-0000-0000-000000000001',1,'30000000-0000-0000-0000-000000000001')->>'revision',
    '2','ready image attaches through artwork CAS');
select ok(not (list_materials('artwork','20000000-0000-0000-0000-000000000001')->0 ? 'storageKey'),'material DTO contains no raw key');
select throws_ok($$select update_knowledge_document('exhibition','10000000-0000-0000-0000-000000000001',1,
    '[{"id":"introduction","body":"Catalogue note"}]',
    '[{"section_id":"introduction","kind":"material","material_id":"30000000-0000-0000-0000-000000000002","page_start":1,"page_end":3}]')$$,
    '22023','PDF source pages exceed verified document','knowledge reference cannot exceed verified page count');
select throws_ok($$select upsert_evidence('10000000-0000-0000-0000-000000000001',null,'exhibition','Catalogue','A note',
    '{"kind":"material","material_id":"30000000-0000-0000-0000-000000000002","page_start":1,"page_end":3}')$$,
    '22023','PDF source pages exceed verified document','public evidence cannot exceed verified page count');
select update_knowledge_document('exhibition','10000000-0000-0000-0000-000000000001',1,
    '[{"id":"introduction","body":"Catalogue note"}]',
    '[{"section_id":"introduction","kind":"material","material_id":"30000000-0000-0000-0000-000000000002","page_start":1,"page_end":2}]');
select throws_ok($$select delete_material('30000000-0000-0000-0000-000000000002',1)$$,
    'P1021','Material is in use','live knowledge reference prevents deletion');

select set_config('test.deleted',delete_artwork('20000000-0000-0000-0000-000000000002',1)::text,true);
select is(current_setting('test.deleted')::jsonb->>'revision','2','draft artwork is logically deleted');
select ok((current_setting('test.deleted')::jsonb->>'deletedAt') is not null,'delete result has the deletion timestamp');
select is(delete_artwork('20000000-0000-0000-0000-000000000002',1),current_setting('test.deleted')::jsonb,
    'same base revision replays the deletion result');
select is(delete_artwork('20000000-0000-0000-0000-000000000002',2),current_setting('test.deleted')::jsonb,
    'current revision replays the deletion result');
select throws_ok($$select delete_artwork('20000000-0000-0000-0000-000000000002',3)$$,'40001','Artwork revision conflict',
    'unrelated revision cannot replay the deletion');
select lives_ok($$select create_artwork('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001',
    2,'Replacement number',null,null,null,'[]','[]')$$,'new ID can reuse a deleted draft number');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select throws_ok($$select delete_artwork('20000000-0000-0000-0000-000000000002',1)$$,
    'P0002','Subject not found','foreign owner cannot replay a deletion');
select throws_ok($$select delete_material('30000000-0000-0000-0000-000000000001',1)$$,
    'P0002','Material not found','foreign owner cannot delete material');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select is(delete_material('30000000-0000-0000-0000-000000000001',1)->>'cleanupPending','true','deletion records pending physical cleanup');
select is(delete_material('30000000-0000-0000-0000-000000000001',1)->>'version','2','deletion replay keeps the same version');
set local role service_role;
select is(get_upload('00000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',true)#>>'{material,cleanupPending}',
    'true','worker can recover cleanup keys for a deleted material');
select ok((get_upload('00000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',true)
        ->>'cleanupAfter')::timestamptz >=
    ((current_setting('test.image')::jsonb->>'uploadExpiresAt')::timestamptz + interval '2 hours 3 minutes'),
    'cleanup allows for token issuance finishing after reservation expiration');
select is(complete_material_cleanup('00000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',2)->>'cleanupPending','true','worker cannot clear cleanup before token deadline');
reset role;
update materials set cleanup_after = statement_timestamp() - interval '1 second'
    where id = '30000000-0000-0000-0000-000000000001';
set local role service_role;
select is(list_material_cleanup(50)#>>'{0,finalKey}',current_setting('test.image')::jsonb->>'finalKey',
    'due revoked cleanup contains the final path');
select throws_ok($$select complete_material_cleanup('00000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',2)$$,
    '40001','Material cleanup is incomplete','cleanup cannot finish while final object exists');
reset role;
-- Metadata-only fixture has no stored bytes. Move its key to model absence;
-- actual object removal is tested through Storage HTTP, never SQL DELETE.
update storage.objects set name = name || '.fixture-removed'
    where bucket_id = 'artist-materials' and name = (current_setting('test.image')::jsonb->>'finalKey');
set local role service_role;
select is(complete_material_cleanup('00000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',2)->>'cleanupPending',
    'false','confirmed object removal completes cleanup');

reset role;
update materials set cleanup_after = statement_timestamp() - interval '1 second'
    where id = '30000000-0000-0000-0000-000000000002';
set local role service_role;
select is(list_material_cleanup(50)#>>'{0,finalKey}',null,'ready cleanup exposes no final deletion path');
select is(list_material_cleanup(50)#>>'{0,stagingKey}',current_setting('test.pdf')::jsonb->>'stagingKey',
    'ready cleanup still includes the staging path');
select is(complete_material_cleanup('00000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002',1)
    ->>'cleanupPending','false','ready cleanup keeps the final object');
select request_upload('00000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000003',
    'exhibition','10000000-0000-0000-0000-000000000001','pdf','expired.pdf','application/pdf',64);
reset role;
update materials set upload_expires_at = statement_timestamp() - interval '1 second'
    where id = '30000000-0000-0000-0000-000000000003';
set local role service_role;
select is(list_material_cleanup(1),'[]'::jsonb,'expired upload is tombstoned before token cleanup is due');
select is(get_upload('00000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000003',true)
    #>>'{material,state}','revoked','expired pending upload cannot complete');
select throws_ok($$select complete_material_cleanup('00000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000003',1)$$,'40001','Material revision conflict','stale cleanup cannot clear a newer tombstone');
reset role;
-- Immutable snapshot uses the earlier image even after a draft image changes.
insert into publications(id,owner_id,exhibition_id,artwork_id,version,number,title,image_key,evidence,
    narration_text,narration_hash,narration_citations,approved_by)
values ('40000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',1,1,'Public work',
    current_setting('test.image')::jsonb->>'finalKey',
    jsonb_build_object('schemaVersion',1,'items',jsonb_build_array(jsonb_build_object(
        'id','50000000-0000-0000-0000-000000000001','version',1,
        'ownerId','00000000-0000-0000-0000-000000000001','exhibitionId','10000000-0000-0000-0000-000000000001',
        'publicationId','40000000-0000-0000-0000-000000000001','artworkId','20000000-0000-0000-0000-000000000001',
        'scope','artwork','sourceLabel','Approved source','body','Approved narration',
        'contentHash',encode(sha256('Approved narration'::bytea),'hex')))),
    'Approved narration',sha256('Approved narration'::bytea),'[{"id":"50000000-0000-0000-0000-000000000001","version":1}]',
    '00000000-0000-0000-0000-000000000001');
update artworks set state = 'paused',active_publication_id = '40000000-0000-0000-0000-000000000001'
    where id = '20000000-0000-0000-0000-000000000001';
set local role authenticated;
select throws_ok($$select delete_artwork('20000000-0000-0000-0000-000000000001',3)$$,
    'P1022','Artwork still has an active publication','even a paused active snapshot blocks artwork deletion');
reset role;
select is((select image_key from publications where id = '40000000-0000-0000-0000-000000000001'),
    current_setting('test.image')::jsonb->>'finalKey','snapshot image key is immutable');

-- Legacy PDF evidence stays pinned in an existing public snapshot, but
-- is ineligible for any new publication until its page count is verified.
reset role;
insert into materials(id,owner_id,exhibition_id,kind,state,storage_key,byte_size) values
    ('30000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000001',
     '10000000-0000-0000-0000-000000000001','pdf','ready',
     '00000000-0000-0000-0000-000000000001/legacy.pdf',64);
insert into evidence_items(id,version,owner_id,exhibition_id,scope,source_label,body,content_hash,state,source_kind,
    material_id,material_version,page_start,page_end,approved_at)
values ('50000000-0000-0000-0000-000000000001',1,'00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001','exhibition','Approved source','Approved narration',
    sha256('Approved narration'::bytea),'approved','material',
    '30000000-0000-0000-0000-000000000010',1,1,1,statement_timestamp());
insert into publication_evidence_refs values
    ('40000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001',1);
update artworks set state = 'published' where id = '20000000-0000-0000-0000-000000000001';
update exhibitions set state = 'published',public_title = 'Public show',public_artist_display_name = 'Public artist'
    where id = '10000000-0000-0000-0000-000000000001';
update artist_profiles set display_name = 'Public artist' where owner_id = '00000000-0000-0000-0000-000000000001';
set local role anon;
select is(get_public_artwork('10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001')->>'title','Public work','legacy snapshot remains readable');
set local role service_role;
select throws_ok($$select publish('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000001',1,'[]',
    '{"bio":null,"introduction":{"id":"50000000-0000-0000-0000-000000000001","version":1},"theme":null}',false)$$,
    '40001','Introduction evidence is unavailable','unverified legacy PDF cannot be published as a new introduction');

reset role;
select * from finish();
rollback;
