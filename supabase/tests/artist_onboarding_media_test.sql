begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public,extensions;
select no_plan();

insert into auth.users(id, email, email_confirmed_at) values
    ('00000000-0000-4000-8000-000000170001', 'onboarding-owner@example.invalid', null),
    ('00000000-0000-4000-8000-000000170002', 'onboarding-other@example.invalid', now());
select set_config('test.onboarding_keywords', '{"fields":["일러스트","기타"],"moods":["차분한"],"topics":["기억"]}', true);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000170001';
select set_config('test.onboarding_artist', get_artist_profile()->>'id', true);
select is(get_artist_profile()->'keywords', '{"fields":[],"moods":[],"topics":[]}'::jsonb, 'new and legacy profiles default to no keywords');
select is(get_artist_profile()->>'onboarding_complete', 'false', 'existing profiles are initially incomplete');
select is(update_artist_profile(1, '기존 작가', 1, '[{"id":"practice","body":"기존 작품 세계"}]', '[]')->>'revision',
    '2', 'legacy profile and document update still work');
select throws_ok($$select update_artist_onboarding(2, '김이름', '작가명', current_setting('test.onboarding_keywords')::jsonb, true)$$,
    '42501', 'Verified email is required to complete onboarding', 'a signed-in owner cannot complete onboarding with an unverified email');
select is(update_artist_onboarding(2, null, '작가명', current_setting('test.onboarding_keywords')::jsonb, false)->>'onboarding_complete',
    'false', 'onboarding drafts allow a nullable name with an unverified email');
select throws_ok($$select update_artist_onboarding(2, '김이름', '작가명', current_setting('test.onboarding_keywords')::jsonb, false)$$,
    '40001', 'Artist revision conflict', 'a stale revision cannot overwrite a draft');
select throws_ok($$select update_artist_onboarding(3, '김이름', '작가명', '{"fields":["기타","기타"],"moods":[],"topics":[]}', false)$$,
    '22023', 'Invalid onboarding input', 'duplicate selections are rejected');
select throws_ok($$select update_artist_onboarding(3, '김이름', '작가명', '{"fields":[],"moods":["기타"],"topics":[]}', false)$$,
    '22023', 'Invalid onboarding input', 'values from one category cannot be used in another');
select throws_ok($$select update_artist_onboarding(3, '김이름', '작가명', '{"fields":[],"moods":[],"topics":[],"extra":[]}', false)$$,
    '22023', 'Invalid onboarding input', 'unknown keyword categories are rejected');
select throws_ok($$select update_artist_onboarding(3, '김이름', '작가명', '{"fields":[],"moods":[]}', false)$$,
    '22023', 'Invalid onboarding input', 'keyword categories must all be present');
select throws_ok($$select update_artist_onboarding(3, '김이름', '작가명', '{"fields":{},"moods":[],"topics":[]}', false)$$,
    '22023', 'Invalid onboarding input', 'keyword categories must be arrays');
select throws_ok($$select update_artist_onboarding(3, U&'\200B\3164', '작가명', current_setting('test.onboarding_keywords')::jsonb, true)$$,
    '22023', 'Invalid artist name', 'invisible format characters and fillers cannot constitute a name');
select throws_ok($$select update_artist_onboarding(3, repeat('김', 101), '작가명', current_setting('test.onboarding_keywords')::jsonb, false)$$,
    '22023', 'Invalid artist name', 'name length is bounded');
select throws_ok($$select update_artist_onboarding(3, '김이름', null, current_setting('test.onboarding_keywords')::jsonb, true)$$,
    '22023', 'Artist names are required to complete onboarding', 'completion requires the artist display name');

reset role;
update auth.users set email_confirmed_at = now() where id = '00000000-0000-4000-8000-000000170001';
set local role authenticated;
select is(update_artist_onboarding(3, U&'\00A0김이름\3000', ' 작가명 ', current_setting('test.onboarding_keywords')::jsonb, true)->>'onboarding_complete',
    'true', 'verified owner can complete onboarding');
select is(get_artist_profile()->>'full_name', '김이름', 'Unicode whitespace is trimmed from the private name');
select ok((get_artist_profile()->>'onboarding_completed_at') is not null, 'the first completion timestamp is stored');
select is(get_artist_profile()#>>'{document,sections,0,body}', '기존 작품 세계', 'onboarding preserves the legacy document');
select is(update_artist_profile(4, null, 2, '[{"id":"practice","body":"기존 작품 세계"}]', '[]')->>'onboarding_complete',
    'false', 'legacy PATCH may still clear the display name and completion reflects current inputs');
select is(get_artist_profile()->'keywords', current_setting('test.onboarding_keywords')::jsonb, 'legacy PATCH preserves the new keyword fields');
select is(get_artist_profile()->>'full_name', '김이름', 'legacy PATCH preserves the private name');
select ok((get_artist_profile()->>'onboarding_completed_at') is not null, 'legacy PATCH preserves the completion history');
select is(update_artist_profile(5, '작가명', 2, '[{"id":"practice","body":"기존 작품 세계"}]', '[]')->>'onboarding_complete',
    'true', 'restoring the old display name restores completion');

reset role;
update auth.users set email_confirmed_at = null where id = '00000000-0000-4000-8000-000000170001';
set local role authenticated;
select is(get_artist_profile()->>'onboarding_complete', 'false', 'current verification is required after completion too');
select create_exhibition('00000000-0000-4000-8000-000000170011', '첫 전시', null, null, null, '[]', '[]');
select create_exhibition('00000000-0000-4000-8000-000000170012', '두 번째 전시', null, null, null, '[]', '[]');

set local role service_role;
select set_config('test.onboarding_avatar', request_upload('00000000-0000-4000-8000-000000170001',
    '00000000-0000-4000-8000-000000170021', 'artist', current_setting('test.onboarding_artist')::uuid,
    'image', 'avatar.jpg', 'image/jpeg', 64)->>'finalKey', true);
select set_config('test.onboarding_poster', request_upload('00000000-0000-4000-8000-000000170001',
    '00000000-0000-4000-8000-000000170022', 'exhibition', '00000000-0000-4000-8000-000000170011',
    'image', 'poster.jpg', 'image/jpeg', 64)->>'finalKey', true);

set local role authenticated;
select throws_ok($$select set_artist_avatar(6, '00000000-0000-4000-8000-000000170021')$$,
    'P0002', 'Material not found', 'pending uploads cannot attach');

reset role;
-- As in the upload tests, represent objects after the worker validates the encoded bytes.
insert into storage.objects(bucket_id, name, metadata) values
    ('artist-materials', current_setting('test.onboarding_avatar'), '{"size":64,"mimetype":"image/jpeg"}'),
    ('artist-materials', current_setting('test.onboarding_poster'), '{"size":64,"mimetype":"image/jpeg"}');
set local role service_role;
select complete_upload('00000000-0000-4000-8000-000000170001', '00000000-0000-4000-8000-000000170021',
    1, repeat('a', 64), 64, 'image/jpeg', null, 10, 10);
select complete_upload('00000000-0000-4000-8000-000000170001', '00000000-0000-4000-8000-000000170022',
    1, repeat('b', 64), 64, 'image/jpeg', null, 10, 10);
update app_policies set value = 63 where key = 'image_max_bytes';
set local role authenticated;
select throws_ok($$select set_artist_avatar(6, '00000000-0000-4000-8000-000000170021')$$,
    'P0002', 'Material not found', 'attachment enforces a policy reduced after upload');
set local role service_role;
update app_policies set value = 3145728 where key = 'image_max_bytes';
set local role authenticated;
select throws_ok($$select set_artist_avatar(6, '00000000-0000-4000-8000-000000170022')$$,
    'P0002', 'Material not found', 'an exhibition upload cannot be used as the avatar');
select is(set_artist_avatar(6, '00000000-0000-4000-8000-000000170021')->>'avatar_material_id',
    '00000000-0000-4000-8000-000000170021', 'the ready owner-scoped avatar attaches');
select is(set_artist_avatar(7, '00000000-0000-4000-8000-000000170021')->>'revision', '7', 'reapplying the same avatar does not advance the revision');
select throws_ok($$select set_artist_avatar(6, null)$$, '40001', 'Artist revision conflict', 'stale avatar removal fails');
select throws_ok($$select delete_material('00000000-0000-4000-8000-000000170021', 1)$$,
    'P1021', 'Material is in use', 'attached avatar cannot be deleted');
select is(set_artist_avatar(7, null)->>'avatar_material_id', null, 'avatar can be cleared explicitly');
select is(delete_material('00000000-0000-4000-8000-000000170021', 1)->>'state', 'revoked', 'detached avatar enters normal cleanup');
select throws_ok($$select set_artist_avatar(8, '00000000-0000-4000-8000-000000170021')$$,
    'P0002', 'Material not found', 'revoked avatars cannot be attached again');

select throws_ok($$select set_exhibition_poster('00000000-0000-4000-8000-000000170012', 1, '00000000-0000-4000-8000-000000170022')$$,
    'P0002', 'Material not found', 'same-owner material for another exhibition is rejected');
select is(set_exhibition_poster('00000000-0000-4000-8000-000000170011', 1, '00000000-0000-4000-8000-000000170022')->>'poster_material_id',
    '00000000-0000-4000-8000-000000170022', 'the ready exhibition-scoped poster attaches');
select throws_ok($$select set_exhibition_poster('00000000-0000-4000-8000-000000170011', 1, null)$$,
    '40001', 'Exhibition revision conflict', 'stale poster removal fails');
select throws_ok($$select delete_material('00000000-0000-4000-8000-000000170022', 1)$$,
    'P1021', 'Material is in use', 'attached poster cannot be deleted');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000170002';
select throws_ok($$select set_exhibition_poster('00000000-0000-4000-8000-000000170011', 2, null)$$,
    'P0002', 'Exhibition not found', 'another owner cannot remove the poster');
select is(get_artist_profile()->>'onboarding_complete', 'false', 'completion and profile readers are scoped to the requesting owner');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000170001';
select is(set_exhibition_poster('00000000-0000-4000-8000-000000170011', 2, null)->>'poster_material_id', null, 'poster can be cleared explicitly');
select is(delete_material('00000000-0000-4000-8000-000000170022', 1)->>'state', 'revoked', 'detached poster enters normal cleanup');

reset role;
select * from finish();
rollback;
