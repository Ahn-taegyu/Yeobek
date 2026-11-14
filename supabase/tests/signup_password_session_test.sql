begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public,extensions;
select no_plan();

select set_config('test.w9_owner',gen_random_uuid()::text,true);
select set_config('test.w9_exhibition',gen_random_uuid()::text,true);
select set_config('test.w9_artwork',gen_random_uuid()::text,true);
select set_config('test.w9_publication',gen_random_uuid()::text,true);
select set_config('test.w9_evidence',gen_random_uuid()::text,true);
select set_config('test.w9_legacy',gen_random_uuid()::text,true);
select set_config('test.w9_app_metadata',jsonb_build_object('yeobek_signup_request_id',gen_random_uuid())::text,true);
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values
    (current_setting('test.w9_owner')::uuid,current_setting('test.w9_owner') || '@example.invalid',
        now(),current_setting('test.w9_app_metadata')::jsonb),
    (current_setting('test.w9_legacy')::uuid,current_setting('test.w9_legacy') || '@example.invalid',now(),'{}');
insert into operators(user_id) values (current_setting('test.w9_owner')::uuid),(current_setting('test.w9_legacy')::uuid);

set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object(
    'sub',current_setting('test.w9_owner'),'app_metadata',current_setting('test.w9_app_metadata')::jsonb,
    'amr','[{"method":"password","timestamp":1}]'::jsonb)::text,true);
select lives_ok($$select get_artist_profile()$$,'password sign-in reaches the artist RPC');
select lives_ok($$select list_outbox()$$,'password sign-in preserves explicitly granted operator access');
select create_exhibition(current_setting('test.w9_exhibition')::uuid,'Published fixture',null,null,null,'[]','[]');
select create_artwork(current_setting('test.w9_artwork')::uuid,current_setting('test.w9_exhibition')::uuid,
    1,'Fixture work',null,null,null,'[]','[]');
reset role;

insert into publications(id,owner_id,exhibition_id,artwork_id,version,number,title,image_key,evidence,
    narration_text,narration_hash,narration_citations,approved_by)
values (current_setting('test.w9_publication')::uuid,current_setting('test.w9_owner')::uuid,
    current_setting('test.w9_exhibition')::uuid,current_setting('test.w9_artwork')::uuid,
    1,1,'Fixture work','fixture/image',
    jsonb_build_object('schemaVersion',1,'items',jsonb_build_array(jsonb_build_object(
        'id',current_setting('test.w9_evidence'),'version',1,'ownerId',current_setting('test.w9_owner'),
        'exhibitionId',current_setting('test.w9_exhibition'),'publicationId',current_setting('test.w9_publication'),
        'artworkId',current_setting('test.w9_artwork'),'scope','artwork','sourceLabel','Approved fixture source',
        'body','Approved fixture narration','contentHash',encode(sha256('Approved fixture narration'::bytea),'hex')))),
    'Approved fixture narration',sha256('Approved fixture narration'::bytea),
    jsonb_build_array(jsonb_build_object('id',current_setting('test.w9_evidence'),'version',1)),
    current_setting('test.w9_owner')::uuid);
update artworks set state = 'published',active_publication_id = current_setting('test.w9_publication')::uuid
where id = current_setting('test.w9_artwork')::uuid;
update exhibitions set state = 'published',public_title = 'Published fixture',public_artist_display_name = 'Fixture artist'
where id = current_setting('test.w9_exhibition')::uuid;

set local role authenticated;
select is((select count(*) from artist_profiles),1::bigint,'password session sees its own profile through RLS');
select is((select count(*) from exhibitions),1::bigint,'password session sees its own exhibition through RLS');
select is((select count(*) from artworks),1::bigint,'password session sees its own artwork through RLS');
select is((select count(*) from knowledge_documents),3::bigint,'password session sees its own documents through RLS');
select is((select count(*) from publications),1::bigint,'password session sees its own publication through RLS');

select set_config('request.jwt.claims',jsonb_build_object(
    'sub',current_setting('test.w9_owner'),'app_metadata',current_setting('test.w9_app_metadata')::jsonb,
    'amr','[{"method":"otp","timestamp":2}]'::jsonb,
    'user_metadata','{"amr":[{"method":"password"}]}'::jsonb)::text,true);
select throws_ok($$select get_artist_profile()$$,
    '42501','Artist sign-in is required','OTP session cannot enter the artist RPC');
select throws_ok($$select list_outbox()$$,
    'P0002','Not found','OTP session cannot enter operator RPCs even for an enabled operator');
select is((select count(*) from artist_profiles),0::bigint,'OTP session cannot read profile rows');
select is((select count(*) from exhibitions),0::bigint,'OTP session cannot read exhibition rows');
select is((select count(*) from artworks),0::bigint,'OTP session cannot read artwork rows');
select is((select count(*) from knowledge_documents),0::bigint,'OTP session cannot read knowledge documents');
select is((select count(*) from publications),0::bigint,'OTP session cannot read publication rows directly');
select throws_ok($$select count(*) from materials$$,'42501',null,'materials direct reads remain forbidden');
select is(get_public_exhibition(current_setting('test.w9_exhibition')::uuid)->>'title',
    'Published fixture','OTP session can use the same public exhibition RPC as a visitor');

select set_config('request.jwt.claims',jsonb_build_object(
    'sub',current_setting('test.w9_owner'),'app_metadata',current_setting('test.w9_app_metadata')::jsonb,
    'amr','{"method":"password"}'::jsonb)::text,true);
select throws_ok($$select get_artist_profile()$$,
    '42501','Artist sign-in is required','malformed AMR is denied');
select is((select count(*) from artist_profiles),0::bigint,'RLS also denies malformed AMR');

select set_config('request.jwt.claims',jsonb_build_object(
    'sub',current_setting('test.w9_legacy'),'user_metadata',current_setting('test.w9_app_metadata')::jsonb)::text,true);
select lives_ok($$select get_artist_profile()$$,'legacy accounts may use existing sessions without AMR');
select lives_ok($$select list_outbox()$$,'legacy operator access is preserved');
select is((select count(*) from artist_profiles),1::bigint,'legacy session keeps its RLS ownership checks');

set local role anon;
select set_config('request.jwt.claims','{}',true);
select is(get_public_exhibition(current_setting('test.w9_exhibition')::uuid)->>'title',
    'Published fixture','anonymous visitors can still read the published exhibition through the existing RPC');
select throws_ok($$select get_artist_profile()$$,'42501',null,'anonymous visitors still cannot call the artist RPC');

select * from finish();
rollback;
