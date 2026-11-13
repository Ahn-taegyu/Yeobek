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
select is(update_artist_profile(1, ' Artist one ', 1, '[{"id":"bio","body":"Private biography"}]', '[]')->>'display_name',
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

select throws_ok($$select update_knowledge_document('artwork', '20000000-0000-0000-0000-000000000001', 1,
    '[{"id":"notes","body":"Private notes"}]', (select jsonb_build_array(jsonb_build_object(
        'kind', 'document', 'section_id', 'notes', 'source_document_id', id, 'source_section_id', 'introduction', 'source_revision', revision
    )) from knowledge_documents where subject_type = 'exhibition' and subject_id = '10000000-0000-0000-0000-000000000002'))$$,
    '22023', 'Document source is outside the subject scope or unavailable', 'a document from another exhibition is outside scope');
select throws_ok($$select update_knowledge_document('artwork', '20000000-0000-0000-0000-000000000001', 1,
    '[{"id":"notes","body":"Private notes"}]', (select jsonb_build_array(jsonb_build_object(
        'kind', 'document', 'section_id', 'notes', 'source_document_id', id, 'source_section_id', 'bio', 'source_revision', 1
    )) from knowledge_documents where subject_type = 'artist'))$$, '40001', 'Source document revision conflict',
    'a linked source revision must be current when saved');
select is(update_knowledge_document('artwork', '20000000-0000-0000-0000-000000000001', 1,
    '[{"id":"notes","body":"Private notes"}]', (select jsonb_build_array(jsonb_build_object(
        'kind', 'document', 'section_id', 'notes', 'source_document_id', id, 'source_section_id', 'bio', 'source_revision', revision
    )) from knowledge_documents where subject_type = 'artist'))->>'revision', '2', 'a work can link the matching version of its own artist source');
select throws_ok($$select update_knowledge_document('artwork', '20000000-0000-0000-0000-000000000001', 2,
    '[{"id":"description","body":"Another section"},{"id":"notes","body":"Private notes"}]',
    (select jsonb_build_array(jsonb_build_object('kind', 'document', 'section_id', 'description', 'source_document_id', id,
        'source_section_id', 'notes', 'source_revision', revision)) from knowledge_documents where subject_type = 'artwork'))$$,
    '22023', 'Document source is outside the subject scope or unavailable', 'a document cannot reference one of its own sections');
select is(update_knowledge_document('artist', (select id from artist_profiles), 2,
    '[{"id":"bio","body":"Updated private biography"}]', '[]')->>'revision', '3', 'the artist source can be revised independently');
select throws_ok($$select update_knowledge_document('artwork', '20000000-0000-0000-0000-000000000001', 2,
    '[{"id":"notes","body":"Private notes"}]', (select source_refs from knowledge_documents where subject_type = 'artwork'))$$,
    '40001', 'Source document revision conflict', 'resubmitting an existing reference after an ancestor edit requires a fresh source revision');

reset role;
insert into materials (id, owner_id, exhibition_id, kind, state, storage_key, byte_size) values
    ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000001', 'pdf', 'ready', '00000000-0000-0000-0000-000000000001/catalog.pdf', 123),
    ('40000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000002', 'pdf', 'ready', '00000000-0000-0000-0000-000000000001/other.pdf', 456);

set local role authenticated;
select throws_ok($$select update_knowledge_document('artwork', '20000000-0000-0000-0000-000000000001', 2,
    '[{"id":"notes","body":"Private notes"}]', '[{"section_id":"notes","kind":"material",
    "material_id":"40000000-0000-0000-0000-000000000002","page_start":1,"page_end":2}]')$$,
    '22023', 'Material source is outside the subject scope or unavailable', 'a PDF in another exhibition cannot be cited');
select throws_ok($$select update_knowledge_document('artwork', '20000000-0000-0000-0000-000000000001', 2,
    '[{"id":"notes","body":"Private notes"}]', '[{"section_id":"notes","kind":"material",
    "material_id":"40000000-0000-0000-0000-000000000001","page_start":2,"page_end":1}]')$$,
    '22023', 'Invalid PDF page range', 'PDF source page range must be ordered');
select is(update_knowledge_document('artwork', '20000000-0000-0000-0000-000000000001', 2,
    '[{"id":"notes","body":"Private notes"}]', '[{"section_id":"notes","kind":"material",
    "material_id":"40000000-0000-0000-0000-000000000001","page_start":1,"page_end":2}]')->>'revision',
    '3', 'a work can cite the PDF source of its own exhibition');

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';

select is(get_artist_profile()->>'display_name', null, 'second artist starts with a blank profile');
select is((select count(*) from exhibitions), 0::bigint, 'owner RLS hides other exhibitions');
select is((select count(*) from knowledge_documents), 1::bigint, 'owner RLS hides other documents');
select is((select count(*) from materials), 0::bigint, 'owner RLS hides other private storage metadata');
select is(list_exhibitions(), '[]'::jsonb, 'artist RPC list is scoped to the owner');
select throws_ok($$select get_artwork('20000000-0000-0000-0000-000000000001')$$, 'P0002', 'Subject not found',
    'artist RPC hides a foreign artwork');
select throws_ok($$select create_artwork('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
    2, 'Invalid owner', null, null, null, '[]', '[]')$$, 'P0002', 'Subject not found', 'artist RPC refuses a foreign exhibition');
select throws_ok($$select get_knowledge_document('artwork', '20000000-0000-0000-0000-000000000001')$$, 'P0002', 'Subject not found',
    'artist RPC hides foreign documents');

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

-- Seed an approved publication as the trusted database role. There is no artist-facing publishing workflow yet.
insert into publications (
    id, owner_id, exhibition_id, artwork_id, version, number, title, image_key, evidence, narration_text, narration_hash,
    audio_key, audio_text_hash, approved_by
) values (
    '30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
    1, 1, 'Public artwork', 'private/approved-image.webp', '[{"excerpt":"Approved excerpt"}]', 'Approved narration',
    sha256('Approved narration'::bytea), 'private/approved-audio.mp3', sha256('Approved narration'::bytea),
    '00000000-0000-0000-0000-000000000001'
);
update artworks set state = 'published', active_publication_id = '30000000-0000-0000-0000-000000000001'
where id = '20000000-0000-0000-0000-000000000001';
update exhibitions set state = 'published', public_title = 'Public exhibition', public_artist_display_name = 'Public artist'
where id = '10000000-0000-0000-0000-000000000001';

select throws_ok($$update publications set title = 'Overwrite'$$, '55000', 'Approved publication snapshots are immutable',
    'a trusted writer still cannot rewrite an approved snapshot');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select is(update_artwork('20000000-0000-0000-0000-000000000001', 1, 2, 'Edited draft', null, null, null,
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
