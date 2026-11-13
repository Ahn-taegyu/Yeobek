begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-000000000001', 'one@example.invalid'),
    ('00000000-0000-0000-0000-000000000002', 'two@example.invalid');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';

select is(get_artist_profile()->'document'->>'subject_type', 'artist', 'first visit creates an artist and linked document');
select is((select count(*) from artist_profiles), 1::bigint, 'artist can read their own profile');
select is(update_artist_profile(1, ' Artist one ', 1,
    '[{"id":"bio","body":"Private biography"},{"id":"practice","body":"Private practice"}]', '[]')->>'display_name',
    'Artist one', 'profile and knowledge save together');
select throws_ok($$select update_artist_profile(1, 'Old', 2, '[]', '[]')$$, '40001',
    'Artist revision conflict', 'a stale artist revision cannot overwrite the profile');

select is(create_exhibition('10000000-0000-0000-0000-000000000001', 'Draft exhibition', null, null, null,
    '[{"id":"introduction","body":"Private introduction"}]', '[]')->>'_created', 'true', 'initial create reports that it inserted a record');
select is(create_exhibition('10000000-0000-0000-0000-000000000001', ' Draft exhibition ', null, null, null,
    '[{"id":"introduction","body":"Private introduction"}]', '[]')->>'_created', 'false', 'same creation ID and payload is reported as a replay');
select is(get_exhibition('10000000-0000-0000-0000-000000000001')->>'state', 'draft', 'new exhibitions start private');
select is((select count(*) from knowledge_documents where subject_type = 'exhibition'), 1::bigint,
    'a retried create preserves a single document');
select throws_ok($$select create_exhibition('10000000-0000-0000-0000-000000000001', 'Different', null, null, null,
    '[]', '[]')$$, '23505', 'Exhibition creation ID already used with different input', 'different payload conflicts on the same ID');
select throws_ok($$select create_exhibition('10000000-0000-0000-0000-000000000009', 'Invalid date', '2026-11-13', null, null,
    '[]', '[]')$$, '23514', null, 'exhibition dates are a pair');
select throws_ok($$select create_exhibition('10000000-0000-0000-0000-000000000009', 'Wrong sections', null, null, null,
    '[{"id":"notes","body":"wrong kind"}]', '[]')$$, '22023', 'Invalid or duplicate knowledge section', 'section IDs are subject-specific');
select ok(not exists (select 1 from exhibitions where id = '10000000-0000-0000-0000-000000000009'),
    'invalid document rolls back its parent insert');

select is(create_exhibition('10000000-0000-0000-0000-000000000002', 'Other exhibition', null, null, null,
    '[{"id":"introduction","body":"Newline\nQuote\" and backslash\\"}]', '[]')->>'_created', 'true',
    'creation fingerprint handles multiline text, quotes, and backslashes');
select is(create_exhibition('10000000-0000-0000-0000-000000000002', 'Other exhibition', null, null, null,
    '[{"id":"introduction","body":"Newline\nQuote\" and backslash\\"}]', '[]')->>'_created', 'false',
    'creation with escaped JSON content can be replayed');
select is(list_exhibitions()#>>'{0,id}', '10000000-0000-0000-0000-000000000001',
    'exhibition list breaks equal updated times by ID');
select lives_ok($$select create_artwork('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
    1, 'Draft title', null, null, null, '[{"id":"notes","body":"Private notes"}]', '[]')$$, 'artist creates an artwork and linked document');
select lives_ok($$select create_artwork('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
    1, 'Draft title', null, null, null, '[{"id":"notes","body":"Private notes"}]', '[]')$$, 'artwork creation retries with the same ID and payload');
select throws_ok($$select create_artwork('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
    1, 'Duplicate number', null, null, null, '[]', '[]')$$, '23505', null, 'artwork number is unique within the exhibition');
select throws_ok($$update exhibitions set state = 'published'$$, '42501', 'permission denied for table exhibitions',
    'artists cannot update gates directly');
select throws_ok($$update publications set revoked_at = now()$$, '42501', 'permission denied for table publications',
    'artists cannot edit publications directly');

select throws_ok($$select update_exhibition('10000000-0000-0000-0000-000000000001', 1, 'Partial write', null, null, null,
    9, '[]', '[]')$$, '40001', 'Knowledge document revision conflict', 'combined save checks the document revision');
select is(get_exhibition('10000000-0000-0000-0000-000000000001')->>'title', 'Draft exhibition', 'a stale document rolls back the entity update');

reset role;
-- Make creation order differ from update order and add a deleted artwork to the count fixture.
update exhibitions set created_at = now() - interval '2 days', updated_at = now() - interval '2 days'
where id = '10000000-0000-0000-0000-000000000001';
update exhibitions set updated_at = now() - interval '1 day'
where id = '10000000-0000-0000-0000-000000000002';
insert into artworks(id, owner_id, exhibition_id, number, title, create_fingerprint, deleted_at) values (
    '20000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001', 9, 'Deleted work', sha256('fingerprint'::bytea), now()
);
set local role authenticated;
select is(list_exhibitions()#>>'{0,id}', '10000000-0000-0000-0000-000000000002',
    'exhibition list initially places the most recently updated first');
select is(update_exhibition('10000000-0000-0000-0000-000000000001', 1, ' Revised exhibition ',
    '2026-11-13', '2026-11-14', ' Gallery ', 1, '[{"id":"introduction","body":"Private introduction"}]', '[]')->>'revision',
    '2', 'an exhibition update saves valid dates with its metadata');
select is(list_exhibitions()#>>'{0,id}', '10000000-0000-0000-0000-000000000001',
    'exhibition update reorders the list by updated_at');
select is(list_exhibitions()#>>'{0,start_date}', '2026-11-13', 'exhibition list includes saved start date');
select is(list_exhibitions()#>>'{0,end_date}', '2026-11-14', 'exhibition list includes saved end date');
select is(list_exhibitions()#>>'{0,place}', 'Gallery', 'exhibition list includes the saved and trimmed place');
select is(list_exhibitions()#>'{0,artwork_count}', '1'::jsonb, 'exhibition count excludes deleted artworks');
select is(list_exhibitions()#>'{1,artwork_count}', '0'::jsonb, 'empty exhibitions have zero artworks');
select is(jsonb_array_length(list_artworks('10000000-0000-0000-0000-000000000001')), 1,
    'the owner artwork list includes only live works in the exhibition');

select throws_ok($$select update_knowledge_document('artwork', '20000000-0000-0000-0000-000000000001', 1,
    '[{"id":"notes","body":"Private notes"}]', (select jsonb_build_array(jsonb_build_object(
        'kind', 'document', 'section_id', 'notes', 'source_document_id', id, 'source_section_id', 'introduction', 'source_revision', revision
    )) from knowledge_documents where subject_type = 'exhibition' and subject_id = '10000000-0000-0000-0000-000000000002'))$$,
    'P1002', 'Document source is outside the subject scope or unavailable', 'a document from another exhibition is outside scope');
select throws_ok($$select update_knowledge_document('artwork', '20000000-0000-0000-0000-000000000001', 1,
    '[{"id":"notes","body":"Private notes"}]', (select jsonb_build_array(jsonb_build_object(
        'kind', 'document', 'section_id', 'notes', 'source_document_id', id, 'source_section_id', 'bio', 'source_revision', 1
    )) from knowledge_documents where subject_type = 'artist'))$$, 'P1001', 'Source document revision conflict',
    'a linked source revision must be current when saved');
select is(update_knowledge_document('artwork', '20000000-0000-0000-0000-000000000001', 1,
    '[{"id":"notes","body":"Private notes"}]', (select jsonb_agg(jsonb_build_object(
        'kind', 'document', 'section_id', 'notes', 'source_document_id', id, 'source_section_id', source_section, 'source_revision', revision
    ) order by source_section) from knowledge_documents cross join (values ('bio'), ('practice')) as source(source_section)
    where subject_type = 'artist'))->>'revision', '2', 'a work can link the matching version of its own artist source');
select throws_ok($$select update_knowledge_document('artwork', '20000000-0000-0000-0000-000000000001', 2,
    '[{"id":"description","body":"Another section"},{"id":"notes","body":"Private notes"}]',
    (select jsonb_build_array(jsonb_build_object('kind', 'document', 'section_id', 'description', 'source_document_id', id,
        'source_section_id', 'notes', 'source_revision', revision)) from knowledge_documents where subject_type = 'artwork'))$$,
    'P1002', 'Document source is outside the subject scope or unavailable', 'a document cannot reference one of its own sections');
select is(update_knowledge_document('artist', (select id from artist_profiles), 2,
    '[{"id":"bio","body":"Updated private biography"},{"id":"practice","body":"Private practice"}]', '[]')->>'revision',
    '3', 'the artist source can be revised independently');
select is(get_knowledge_document('artwork', '20000000-0000-0000-0000-000000000001')#>'{source_warnings,0}',
    (select jsonb_build_object('code', 'source_changed', 'kind', 'document', 'section_id', 'notes',
        'source_document_id', id, 'source_section_id', 'bio', 'source_revision', 2, 'current_revision', 3)
    from knowledge_documents where subject_type = 'artist'),
    'an owner read reports the changed ancestor and saved and current revisions');
select is(get_knowledge_document('artwork', '20000000-0000-0000-0000-000000000001')#>'{source_warnings,1}',
    (select jsonb_build_object('code', 'source_changed', 'kind', 'document', 'section_id', 'notes',
        'source_document_id', id, 'source_section_id', 'practice', 'source_revision', 2, 'current_revision', 3)
    from knowledge_documents where subject_type = 'artist'),
    'warnings distinguish links to different source sections of the same ancestor revision');
select is(update_artwork('20000000-0000-0000-0000-000000000001', 1, 1, 'Title after source edit',
    null, null, null, 2, '[{"id":"notes","body":"Private notes"}]',
    (select source_refs from knowledge_documents where subject_id = '20000000-0000-0000-0000-000000000001'))#>>'{document,revision}',
    '2', 'a title-only save succeeds without incrementing the document revision for a stale source');
select is(get_artwork('20000000-0000-0000-0000-000000000001')#>>'{document,source_refs,0,source_revision}', '2',
    'the source remains pinned to the saved ancestor revision');
select throws_ok($$select update_knowledge_document('artwork', '20000000-0000-0000-0000-000000000001', 2,
    '[{"id":"description","body":"Moved reference"}]', (select jsonb_build_array(jsonb_set(source_refs->0,
        '{section_id}', '"description"')) from knowledge_documents where subject_id = '20000000-0000-0000-0000-000000000001'))$$,
    'P1001', 'Source document revision conflict', 'moving a stale reference to a new section requires validation');
select throws_ok($$select update_knowledge_document('artwork', '20000000-0000-0000-0000-000000000001', 2,
    '[{"id":"notes","body":"Private notes"}]', (select source_refs || source_refs
        from knowledge_documents where subject_id = '20000000-0000-0000-0000-000000000001'))$$,
    'P1001', 'Source document revision conflict', 'a newly duplicated stale reference requires validation');
select throws_ok($$select create_artwork('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
    2, 'Copied stale reference', null, null, null, '[{"id":"notes","body":"Private notes"}]',
    (select source_refs from knowledge_documents where subject_id = '20000000-0000-0000-0000-000000000001'))$$,
    'P1001', 'Source document revision conflict', 'copying a stale reference to a new artwork requires validation');
select is(update_knowledge_document('artist', (select id from artist_profiles), 3,
    '[{"id":"practice","body":"Private practice"}]', '[]')->>'revision',
    '4', 'the ancestor section can be removed');
select is(update_knowledge_document('artwork', '20000000-0000-0000-0000-000000000001', 2,
    '[{"id":"notes","body":"Private notes"}]',
    (select source_refs from knowledge_documents where subject_id = '20000000-0000-0000-0000-000000000001'))#>'{source_warnings,0}',
    (select jsonb_build_object('code', 'source_unavailable', 'kind', 'document', 'section_id', 'notes',
        'source_document_id', id, 'source_section_id', 'bio', 'source_revision', 2) from knowledge_documents where subject_type = 'artist'),
    'an unchanged reference to a removed section is retained and reported as unavailable');
select throws_ok($$select update_knowledge_document('artwork', '20000000-0000-0000-0000-000000000001', 2,
    '[{"id":"notes","body":"Private notes"}]', (select jsonb_build_array(jsonb_set(source_refs->0,
        '{source_revision}', '4')) from knowledge_documents where subject_id = '20000000-0000-0000-0000-000000000001'))$$,
    'P1002', 'Source section is unavailable', 'a revised link to a removed section fails even with the latest revision');

reset role;
insert into materials (id, owner_id, exhibition_id, kind, state, storage_key, byte_size, pages) values
    ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000001', 'pdf', 'ready', '00000000-0000-0000-0000-000000000001/catalog.pdf', 123, 2),
    ('40000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000002', 'pdf', 'ready', '00000000-0000-0000-0000-000000000001/other.pdf', 456, 2);

set local role authenticated;
select throws_ok($$select update_knowledge_document('artwork', '20000000-0000-0000-0000-000000000001', 2,
    '[{"id":"notes","body":"Private notes"}]', '[{"section_id":"notes","kind":"material",
    "material_id":"40000000-0000-0000-0000-000000000002","page_start":1,"page_end":2}]')$$,
    'P1002', 'Material source is outside the subject scope or unavailable', 'a PDF in another exhibition cannot be cited');
select throws_ok($$select update_knowledge_document('artwork', '20000000-0000-0000-0000-000000000001', 2,
    '[{"id":"notes","body":"Private notes"}]', '[{"section_id":"notes","kind":"material",
    "material_id":"40000000-0000-0000-0000-000000000001","page_start":2,"page_end":1}]')$$,
    '22023', 'Invalid PDF page range', 'PDF source page range must be ordered');
select is(update_knowledge_document('artwork', '20000000-0000-0000-0000-000000000001', 2,
    '[{"id":"notes","body":"Private notes"}]', '[{"section_id":"notes","kind":"material",
    "material_id":"40000000-0000-0000-0000-000000000001","page_start":1,"page_end":2}]')->>'revision',
    '3', 'a work can cite the PDF source of its own exhibition');

reset role;
update materials set state = 'revoked' where id = '40000000-0000-0000-0000-000000000001';
-- Simulate a legacy draft stored before body whitespace normalization.
update knowledge_documents set sections = '[{"id":"notes","body":"  Private notes  "}]'
where artwork_id = '20000000-0000-0000-0000-000000000001';
set local role authenticated;
select is(update_knowledge_document('artwork', '20000000-0000-0000-0000-000000000001', 3,
    '[{"id":"notes","body":"Private notes"}]',
    (select source_refs from knowledge_documents where subject_id = '20000000-0000-0000-0000-000000000001'))->'source_warnings',
    '[{"code":"source_unavailable","section_id":"notes","kind":"material","material_id":"40000000-0000-0000-0000-000000000001"}]'::jsonb,
    'an unchanged reference to a revoked material is retained and reported as unavailable');
select is(get_artwork('20000000-0000-0000-0000-000000000001')#>'{document,sections,0,body}', '"  Private notes  "'::jsonb,
    'a semantically unchanged legacy body remains stored as entered');
select is(get_artwork('20000000-0000-0000-0000-000000000001')#>>'{document,revision}', '3',
    'a normalized legacy body and a retained unavailable source leave the document revision unchanged');
select throws_ok($$select update_knowledge_document('artwork', '20000000-0000-0000-0000-000000000001', 3,
    '[{"id":"notes","body":"Private notes"}]', '[{"section_id":"notes","kind":"material",
    "material_id":"40000000-0000-0000-0000-000000000001","page_start":1,"page_end":3}]')$$,
    'P1002', 'Material source is outside the subject scope or unavailable', 'changing the bounds of a revoked reference fails');
select is(update_knowledge_document('artist', (select id from artist_profiles), 4,
    jsonb_build_array(jsonb_build_object('id', 'bio', 'body', U&'\0009\3000' || repeat('x', 5000) || U&'\00A0')), '[]')#>>'{sections,0,body}',
    repeat('x', 5000), 'the database trims changed section bodies before checking length and saving');

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';

select is(get_artist_profile()->>'display_name', null, 'second artist starts with a blank profile');
select is((select count(*) from exhibitions), 0::bigint, 'owner RLS hides other exhibitions');
select is((select count(*) from knowledge_documents), 1::bigint, 'owner RLS hides other documents');
select throws_ok($$select count(*) from materials$$,'42501','permission denied for table materials',
    'authenticated users cannot read raw storage metadata');
select throws_ok($$select list_materials('exhibition','10000000-0000-0000-0000-000000000001')$$,
    'P0002','Subject not found','material list hides foreign exhibition');
select is(list_exhibitions(), '[]'::jsonb, 'artist RPC list is scoped to the owner');
select throws_ok($$select get_artwork('20000000-0000-0000-0000-000000000001')$$, 'P0002', 'Subject not found',
    'artist RPC hides a foreign artwork');
select throws_ok($$select create_artwork('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
    2, 'Invalid owner', null, null, null, '[]', '[]')$$, 'P0002', 'Subject not found', 'artist RPC refuses a foreign exhibition');
select throws_ok($$select get_knowledge_document('artwork', '20000000-0000-0000-0000-000000000001')$$, 'P0002', 'Subject not found',
    'artist RPC hides foreign documents');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000002","is_anonymous":true}';
select throws_ok($$select list_exhibitions()$$, '42501', 'Artist sign-in is required',
    'an anonymous Auth session cannot invoke the exhibition list');
select is((select count(*) from knowledge_documents), 0::bigint, 'owner RLS also hides documents from anonymous Auth sessions');
set local request.jwt.claims = '{}';

reset role;
select throws_ok($$insert into artworks(id, owner_id, exhibition_id, number, title, create_fingerprint) values (
    '20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001', 2, 'Foreign parent', sha256('fingerprint'::bytea))$$,
    '23503', null, 'composite foreign keys enforce matching owner for artwork and exhibition');
select throws_ok($$insert into knowledge_documents (owner_id, exhibition_id, artwork_id) values (
    '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001')$$,
    '23514', null, 'a knowledge document has exactly one concrete parent');
select throws_ok($$insert into materials (owner_id, exhibition_id, kind, text_body) values (
    '00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'text', 'Foreign source')$$,
    '23503', null, 'material owner must match the subject owner');

set local role anon;
select throws_ok($$select * from knowledge_documents$$, '42501', 'permission denied for table knowledge_documents',
    'anon has no access to raw documents');
select throws_ok($$select get_artist_profile()$$, '42501', 'permission denied for function get_artist_profile',
    'anon cannot invoke artist RPCs');
select is(get_public_exhibition('10000000-0000-0000-0000-000000000001'), null, 'anon cannot discover the draft exhibition');
reset role;

-- Seed a structurally valid trusted snapshot for the original public gate tests.
insert into publications (
    id, owner_id, exhibition_id, artwork_id, version, number, title, image_key, evidence, narration_text, narration_hash,
    audio_key, audio_text_hash, approved_by, narration_citations
) values (
    '30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
    1, 1, 'Public artwork', 'private/approved-image.webp', jsonb_build_object('schemaVersion',1,'items',jsonb_build_array(jsonb_build_object(
        'id','40000000-0000-0000-0000-000000000001','version',1,
        'ownerId','00000000-0000-0000-0000-000000000001','exhibitionId','10000000-0000-0000-0000-000000000001',
        'publicationId','30000000-0000-0000-0000-000000000001','artworkId','20000000-0000-0000-0000-000000000001',
        'scope','artwork','sourceLabel','Artist','body','Approved excerpt','contentHash',encode(sha256('Approved excerpt'::bytea),'hex')))), 'Approved narration',
    sha256('Approved narration'::bytea), 'private/approved-audio.mp3', sha256('Approved narration'::bytea),
    '00000000-0000-0000-0000-000000000001','[{"id":"40000000-0000-0000-0000-000000000001","version":1}]'
);
update artworks set state = 'published', active_publication_id = '30000000-0000-0000-0000-000000000001'
where id = '20000000-0000-0000-0000-000000000001';
update exhibitions set state = 'published', public_title = 'Public exhibition', public_artist_display_name = 'Public artist'
where id = '10000000-0000-0000-0000-000000000001';

select throws_ok($$update publications set title = 'Overwrite'$$, '55000', 'Approved publication snapshots are immutable',
    'a trusted writer still cannot rewrite an approved snapshot');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select is(update_artwork('20000000-0000-0000-0000-000000000001', 2, 2, 'Edited draft', null, null, null,
    3, '[]', '[]')->>'title', 'Edited draft', 'artist can revise the draft after publication');
select is(create_artwork('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
    1, 'Draft title', null, null, null, '[{"id":"notes","body":"Private notes"}]', '[]')->>'title', 'Edited draft',
    'create replay after edit returns current data without restoring initial input');

reset role;
set local role anon;
select is(get_public_exhibition('10000000-0000-0000-0000-000000000001')->>'title', 'Public exhibition',
    'public exhibition uses the approved exhibition fields');
select is(get_public_exhibition('10000000-0000-0000-0000-000000000001')#>>'{artworks,0,title}', 'Public artwork',
    'public artwork list uses the snapshot title after draft editing');
select is(get_public_artwork('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'),
    '{"id":"20000000-0000-0000-0000-000000000001","number":1,"title":"Public artwork","creation_year":null,"medium":null,
    "dimensions":null,"publication_id":"30000000-0000-0000-0000-000000000001","narration_text":"Approved narration"}'::jsonb,
    'public artwork returns only approved display fields and narration');
select is(get_public_artwork('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001'), null,
    'public artwork cannot be read under a different exhibition ID');

reset role;
update publications set revoked_at = now() where id = '30000000-0000-0000-0000-000000000001';
set local role anon;
select is(get_public_artwork('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'), null,
    'a revoked snapshot is unavailable despite the active pointer');
select is(get_public_exhibition('10000000-0000-0000-0000-000000000001'), null,
    'public exhibition is unavailable without an eligible artwork');

reset role;
select * from finish();
rollback;
