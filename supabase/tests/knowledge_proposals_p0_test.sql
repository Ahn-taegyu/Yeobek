begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
select set_config('test.p0_owner',gen_random_uuid()::text,true);
select set_config('test.p0_exhibition',gen_random_uuid()::text,true);
insert into auth.users(id,email) values(current_setting('test.p0_owner')::uuid,'p0-proposal@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.p0_owner'),true);
select create_exhibition(current_setting('test.p0_exhibition')::uuid,'P0 source',null,null,null,'[]','[]');
select update_artist_profile(1,'P0 artist',1,
    '[{"id":"bio","body":"Untouched biography"},{"id":"artist_motivation","body":"Motivation original"},
      {"id":"artist_methods","body":"Methods original"},{"id":"artist_activities","body":"Activities original"}]',
    '[{"kind":"direct","section_id":"bio"},{"kind":"direct","section_id":"artist_motivation"},
      {"kind":"direct","section_id":"artist_methods"},{"kind":"direct","section_id":"artist_activities"}]');
select set_config('test.p0_document',(select id::text from knowledge_documents
    where owner_id=auth.uid() and subject_type='artist'),true);
select set_config('test.p0_context',get_organize_context(current_setting('test.p0_document')::uuid)::text,true);
select is(jsonb_array_length(current_setting('test.p0_context')::jsonb->'sections'),4,
    'organizer reads more than two W10 sections including activity history');
reset role;
-- Rotate exact source bodies across three reviewed destination sections.
select set_config('test.p0_selection',(select jsonb_build_object('sections',jsonb_agg(jsonb_build_object(
    'id',destination,'sourceIds',jsonb_build_array(source->'id')) order by destination))::text
    from (values('artist_motivation','artist_methods'),('artist_methods','artist_activities'),
        ('artist_activities','artist_motivation')) mapping(destination,origin)
    cross join lateral (select value source from jsonb_array_elements(current_setting('test.p0_context')::jsonb->'sources')
        where value#>>'{ref,sectionId}'=origin) sources),true);
select set_config('test.p0_pins',(select jsonb_agg(jsonb_build_object('id',source->'id','revision',source->'revision',
    'hash',repeat('a',64)) order by choice->>'id')::text
    from jsonb_array_elements(current_setting('test.p0_selection')::jsonb->'sections') choice
    cross join lateral (select value source from jsonb_array_elements(current_setting('test.p0_context')::jsonb->'sources')
        where value->'id'=choice#>'{sourceIds,0}') sources),true);
select set_config('test.p0_plan',yeoback_private.organize_plan(current_setting('test.p0_context')::jsonb,
    current_setting('test.p0_selection')::jsonb,current_setting('test.p0_pins')::jsonb)::text,true);
select ok(current_setting('test.p0_plan')::jsonb->'sections' @> '[{"id":"bio","body":"Untouched biography"}]',
    'selection preserves untouched W10 document sections');
select throws_ok($$select yeoback_private.organize_plan(
    current_setting('test.p0_context')::jsonb || '{"subjectType":"exhibition"}',
    current_setting('test.p0_selection')::jsonb,current_setting('test.p0_pins')::jsonb)$$,
    '22023','Invalid organization selection','artist sections cannot target an exhibition');
set local role service_role;
select set_config('test.p0_reservation',reserve_organize_job(current_setting('test.p0_owner')::uuid,
    gen_random_uuid(),current_setting('test.p0_document')::uuid,2,true)::text,true);
select set_config('test.p0_job',current_setting('test.p0_reservation')::jsonb#>>'{job,id}',true);
select is(complete_organize_job(current_setting('test.p0_owner')::uuid,current_setting('test.p0_job')::uuid,1,
    jsonb_build_object('proposal',jsonb_build_object('id',current_setting('test.p0_job'),'ownerId',current_setting('test.p0_owner'),
        'documentId',current_setting('test.p0_document'),'targetRevision',2,'pluginVersion','yeobek@0.11.0',
        'expiresAt',current_setting('test.p0_reservation')::jsonb->'proposalExpiresAt',
        'selection',current_setting('test.p0_selection')::jsonb,'sourcePins',current_setting('test.p0_pins')::jsonb,
        'sections',current_setting('test.p0_plan')::jsonb->'sections','sourceRefs',current_setting('test.p0_plan')::jsonb->'sourceRefs',
        'appliedRevision',null),'resultCode','OK','routing','none','usage','[]'::jsonb,'steps','[]'::jsonb,
        'elapsedMs',0,'mock',true))->>'status','succeeded','three-section W10 candidate persists through the worker contract');
set local role authenticated;
select is(load_proposal(current_setting('test.p0_job')::uuid)#>'{proposal,sections}',
    current_setting('test.p0_plan')::jsonb->'sections','owner sees exactly the proposed sections');
select is(commit_proposal(current_setting('test.p0_job')::uuid,true)->>'documentRevision','3',
    'explicit review applies all three selected W10 sections');
select is(get_organize_context(current_setting('test.p0_document')::uuid)->'sections',
    current_setting('test.p0_plan')::jsonb->'sections','saved document matches the reviewed candidate');
select is(list_document_history(current_setting('test.p0_document')::uuid,null,50)#>'{items,0,sections}',
    current_setting('test.p0_context')::jsonb->'sections','history retains original W10 sections');
select is(list_document_history(current_setting('test.p0_document')::uuid,null,50)#>'{items,0,sourceRefs}',
    current_setting('test.p0_context')::jsonb->'sourceRefs','history retains exact original source references');
select is(commit_proposal(current_setting('test.p0_job')::uuid,true)->>'documentRevision','3',
    'W10 apply replay does not add a revision');
reset role;
-- Both W2 and W11 now share the same author quota on fresh and upgraded schemas.
update app_policies set value='1' where key='author_jobs_per_day';
select throws_ok($$select yeoback_private.assert_ai_quota(current_setting('test.p0_owner')::uuid)$$,
    'P1004','Daily author job limit reached','completed organize attempt consumes the shared author quota');
select * from finish();
rollback;
