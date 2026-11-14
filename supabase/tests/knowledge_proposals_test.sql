begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public,extensions;
select no_plan();

select ok(not has_table_privilege('authenticated','knowledge_proposals','SELECT'),'proposal storage is private');
select ok(not has_table_privilege('service_role','knowledge_document_history','UPDATE'),'history cannot be rewritten by the worker');
select ok(not has_function_privilege('authenticated','complete_organize_job(uuid,uuid,integer,jsonb)','EXECUTE'),'authors cannot supply a worker completion');
select ok(not has_function_privilege('anon','commit_proposal(uuid,boolean)','EXECUTE'),'anonymous review cannot apply a proposal');

insert into auth.users(id,email) values
    ('00000000-0000-4000-8000-000000130001','organize-one@example.invalid'),
    ('00000000-0000-4000-8000-000000130002','organize-two@example.invalid');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000130001';
select create_exhibition('00000000-0000-4000-8000-000000130003','Exhibition',null,null,null,
    '[{"id":"introduction","body":"Exhibition source"}]','[{"kind":"direct","section_id":"introduction"}]');
select create_artwork('00000000-0000-4000-8000-000000130004','00000000-0000-4000-8000-000000130003',1,'Artwork',
    null,null,null,'[{"id":"description","body":"Artwork original"}]','[{"kind":"direct","section_id":"description"}]');
select set_config('test.organize_doc',(select id::text from knowledge_documents where artwork_id='00000000-0000-4000-8000-000000130004'),true);
select set_config('test.organize_exhibition',(select id::text from knowledge_documents where exhibition_id='00000000-0000-4000-8000-000000130003'),true);
select set_config('test.organize_artist',(select id::text from knowledge_documents where subject_type='artist' and owner_id=auth.uid()),true);
select is(get_organize_context(current_setting('test.organize_artist')::uuid)->>'subjectType','artist','artist document has an organizer context');
select is(jsonb_array_length(get_organize_context(current_setting('test.organize_exhibition')::uuid)->'sources'),1,'exhibition does not include the artwork document');
select set_config('test.organize_context',get_organize_context(current_setting('test.organize_doc')::uuid)::text,true);
select is(current_setting('test.organize_context')::jsonb #>> '{sources,0,text}','Artwork original','target source is first');
select is(current_setting('test.organize_context')::jsonb #>> '{sources,1,text}','Exhibition source','artwork may include parent exhibition');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000130002';
select throws_ok($$select get_organize_context(current_setting('test.organize_doc')::uuid)$$,
    'P0002','Knowledge document not found','foreign context is hidden');

set local role service_role;
select set_config('test.organize_reservation',reserve_organize_job('00000000-0000-4000-8000-000000130001',
    '00000000-0000-4000-8000-000000130005',current_setting('test.organize_doc')::uuid,1,true)::text,true);
select is(current_setting('test.organize_reservation')::jsonb #>> '{job,kind}','organize','reservation uses the shared job ledger');
select is(reserve_organize_job('00000000-0000-4000-8000-000000130001','00000000-0000-4000-8000-000000130005',
    current_setting('test.organize_doc')::uuid,1,true)->>'claimed','false','identical reservation replays');
select throws_ok($$select reserve_organize_job('00000000-0000-4000-8000-000000130001','00000000-0000-4000-8000-000000130005',
    current_setting('test.organize_doc')::uuid,1,false)$$,
    'P1005','Request ID already used with different input','a mock reservation cannot replay as real');
select set_config('test.organize_job',current_setting('test.organize_reservation')::jsonb #>> '{job,id}',true);
select set_config('test.organize_result',(select jsonb_build_object('proposal',jsonb_build_object(
    'id',current_setting('test.organize_job')::uuid,'ownerId','00000000-0000-4000-8000-000000130001',
    'documentId',ctx->'documentId','targetRevision',1,'pluginVersion','yeobek@0.10.0:123456abcdef',
    'expiresAt',current_setting('test.organize_reservation')::jsonb->'proposalExpiresAt',
    'selection',jsonb_build_object('sections',jsonb_build_array(jsonb_build_object('id','description','sourceIds',jsonb_build_array(src->'id')))),
    'sourcePins',jsonb_build_array(jsonb_build_object('id',src->'id','revision',src->'revision','hash',repeat('a',64))),
    'sections',jsonb_build_array(jsonb_build_object('id','description','body',src->'text')),
    'sourceRefs',jsonb_build_array((src->'ref') || '{"sectionId":"description"}'::jsonb),'appliedRevision',null),
    'resultCode','OK','routing','none','usage','[]'::jsonb,'steps','[]'::jsonb,'elapsedMs',0,'mock',true)
    from (select current_setting('test.organize_context')::jsonb ctx) context cross join lateral
    (select ctx #> '{sources,1}' src) source)::text,true);
select throws_ok($$select complete_organize_job('00000000-0000-4000-8000-000000130001',
    current_setting('test.organize_job')::uuid,1,jsonb_set(current_setting('test.organize_result')::jsonb,'{proposal,sections,0,body}','"Forged"'))$$,
    '22023','Proposal does not match selected sources','worker cannot save text beyond selected sources');
select is(complete_organize_job('00000000-0000-4000-8000-000000130001',current_setting('test.organize_job')::uuid,1,
    current_setting('test.organize_result')::jsonb)->>'status','succeeded','validated proposal and ledger settle atomically');
select is(complete_organize_job('00000000-0000-4000-8000-000000130001',current_setting('test.organize_job')::uuid,1,
    current_setting('test.organize_result')::jsonb)->>'status','succeeded','exact completion replay succeeds');
select throws_ok($$select complete_organize_job('00000000-0000-4000-8000-000000130001',
    current_setting('test.organize_job')::uuid,1,jsonb_set(current_setting('test.organize_result')::jsonb,'{elapsedMs}','1'))$$,
    'P1006','Job attempt completed with different result','changed replay is rejected');

set local role authenticated;
select throws_ok($$select load_proposal(current_setting('test.organize_job')::uuid)$$,
    'P0002','Knowledge proposal not found','foreign proposal is hidden');
select throws_ok($$select commit_proposal(current_setting('test.organize_job')::uuid,true)$$,
    'P0002','Knowledge proposal not found','foreign proposal cannot be applied');
select throws_ok($$select list_document_history(current_setting('test.organize_doc')::uuid,null,50)$$,
    'P0002','Knowledge document not found','foreign history is hidden');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000130001';
select is(load_proposal(current_setting('test.organize_job')::uuid) #>> '{before,sections,0,body}','Artwork original','proposal stores immutable before text');
select is(get_ai_job(current_setting('test.organize_job')::uuid) #>> '{result,proposalId}',current_setting('test.organize_job'),'owner can read the organize job receipt');
select throws_ok($$select commit_proposal(current_setting('test.organize_job')::uuid,false)$$,
    '22023','Knowledge proposal review is required','apply requires explicit review');
select is(commit_proposal(current_setting('test.organize_job')::uuid,true)->>'documentRevision','2','apply advances the document once');
select is(commit_proposal(current_setting('test.organize_job')::uuid,true)->>'documentRevision','2','apply replay preserves original receipt');
select is(jsonb_array_length(list_document_history(current_setting('test.organize_doc')::uuid,null,50)->'items'),1,'replay adds no history');
select is(list_document_history(current_setting('test.organize_doc')::uuid,null,50) #>> '{items,0,sections,0,body}','Artwork original','before body is retained');
select is(list_document_history(current_setting('test.organize_doc')::uuid,null,50) #>> '{items,0,sourceRefs,0,kind}','direct','before reference is retained');
select is(get_organize_context(current_setting('test.organize_doc')::uuid) #>> '{sections,0,body}','Exhibition source','target receives exactly selected text');

-- Reuse the same exhibition source after application, so the rebuilt candidate is a no-op.
set local role service_role;
select set_config('test.organize_noop',reserve_organize_job('00000000-0000-4000-8000-000000130001',
    '00000000-0000-4000-8000-000000130008',current_setting('test.organize_doc')::uuid,2,true)::text,true);
select set_config('test.organize_stale',reserve_organize_job('00000000-0000-4000-8000-000000130001',
    '00000000-0000-4000-8000-000000130009',current_setting('test.organize_doc')::uuid,2,true)::text,true);
select set_config('test.organize_expired',reserve_organize_job('00000000-0000-4000-8000-000000130001',
    '00000000-0000-4000-8000-000000130010',current_setting('test.organize_doc')::uuid,2,true)::text,true);
select is(complete_organize_job('00000000-0000-4000-8000-000000130001',(res#>>'{job,id}')::uuid,1,
    result || jsonb_build_object('proposal',(result->'proposal') ||
        jsonb_build_object('id',res#>>'{job,id}','targetRevision',2,'expiresAt',res->'proposalExpiresAt')))->>'status',
    'succeeded','same-source candidate can be reviewed independently')
from (select current_setting(setting)::jsonb res,current_setting('test.organize_result')::jsonb result
    from unnest(array['test.organize_noop','test.organize_stale','test.organize_expired']) as vars(setting)) fixtures;

set local role authenticated;
select is(commit_proposal((current_setting('test.organize_noop')::jsonb#>>'{job,id}')::uuid,true)->>'documentRevision',
    '2','no-op application retains the revision');
select is(commit_proposal((current_setting('test.organize_noop')::jsonb#>>'{job,id}')::uuid,true)->>'documentRevision',
    '2','no-op replay retains the recorded result');
select is(jsonb_array_length(list_document_history(current_setting('test.organize_doc')::uuid,2,1)->'items'),
    1,'no-op and replay add no version above original history');
select is(jsonb_array_length(list_document_history(current_setting('test.organize_doc')::uuid,null,50)->'items'),
    1,'no-op and replay create no history');
select is(list_document_history(current_setting('test.organize_doc')::uuid,1,1)->'items',
    '[]'::jsonb,'history cursor excludes its own revision');
select throws_ok($$select list_document_history(current_setting('test.organize_doc')::uuid,null,51)$$,
    '22023','Invalid knowledge history page','history limits are enforced');

reset role;
update public.knowledge_proposals set expires_at = clock_timestamp() - interval '1 second'
where id = (current_setting('test.organize_expired')::jsonb#>>'{job,id}')::uuid;
update public.knowledge_documents set sections = '[{"id":"introduction","body":"Changed exhibition source"}]',
    revision = revision + 1 where id = current_setting('test.organize_exhibition')::uuid;
set local role authenticated;
select throws_ok($$select load_proposal((current_setting('test.organize_expired')::jsonb#>>'{job,id}')::uuid)$$,
    'P1008','Knowledge proposal expired','expired unapplied proposal is unavailable for review');
select throws_ok($$select commit_proposal((current_setting('test.organize_expired')::jsonb#>>'{job,id}')::uuid,true)$$,
    'P1008','Knowledge proposal expired','expired proposal cannot apply');
select throws_ok($$select commit_proposal((current_setting('test.organize_stale')::jsonb#>>'{job,id}')::uuid,true)$$,
    '40001','Knowledge source revision conflict','changed ancestor invalidates the saved proposal');
select is(get_organize_context(current_setting('test.organize_doc')::uuid)->>'revision','2',
    'refused proposals do not advance the target revision');
select is(jsonb_array_length(list_document_history(current_setting('test.organize_doc')::uuid,null,50)->'items'),
    1,'refused proposals do not advance history');

set local role service_role;
select set_config('test.organize_failed',reserve_organize_job('00000000-0000-4000-8000-000000130001',
    '00000000-0000-4000-8000-000000130006',current_setting('test.organize_doc')::uuid,2,true)#>>'{job,id}',true);
select is(complete_organize_job('00000000-0000-4000-8000-000000130001',current_setting('test.organize_failed')::uuid,1,
    '{"proposal":null,"resultCode":"REQUEST_CANCELLED","routing":"none","usage":[],"steps":[],"elapsedMs":0,"mock":true}')->>'status',
    'cancelled','caller cancellation settles the author attempt');
select is(retry_organize_job('00000000-0000-4000-8000-000000130001',current_setting('test.organize_failed')::uuid,
    '00000000-0000-4000-8000-000000130007',1,true)#>>'{job,attempt}','2','cancelled attempt can retry within quota');
select is(retry_organize_job('00000000-0000-4000-8000-000000130001',current_setting('test.organize_failed')::uuid,
    '00000000-0000-4000-8000-000000130007',1,true)->>'claimed','false','retry request is replay-safe');
select throws_ok($$select retry_organize_job('00000000-0000-4000-8000-000000130001',current_setting('test.organize_failed')::uuid,
    '00000000-0000-4000-8000-000000130007',1,false)$$,
    'P1005','Request ID already used with different input','replayed retry is bound to mock mode');

reset role;

-- Exercise the real cleanup chain against applied and expired pending proposals.
reset role;
update ai_jobs set expires_at=statement_timestamp()-interval '1 second'
where owner_id='00000000-0000-4000-8000-000000130001';
set local role service_role;
select lives_ok($$select purge_expired()$$,'proposal history no longer blocks the shared job cleanup');
reset role;
select is((select count(*) from ai_jobs where owner_id='00000000-0000-4000-8000-000000130001'),0::bigint,
    'expired organize jobs are actually removed');
select is((select count(*) from knowledge_document_history where document_id=current_setting('test.organize_doc')::uuid),1::bigint,
    'cleanup preserves applied document history');
select ok((select proposal='{}' and before_sections='[]' and before_source_refs='[]' and payload_purged_at is not null
    from knowledge_proposals where id=(current_setting('test.organize_expired')::jsonb#>>'{job,id}')::uuid),
    'expired unapplied private payload is cleared while its tombstone remains');
set local role authenticated;
select is(load_proposal(current_setting('test.organize_job')::uuid)->>'mock','true',
    'applied proposal retains mock provenance after its job expires');
select is(commit_proposal(current_setting('test.organize_job')::uuid,true)->>'documentRevision','2',
    'applied proposal replay survives job cleanup');
select throws_ok($$select load_proposal((current_setting('test.organize_expired')::jsonb#>>'{job,id}')::uuid)$$,
    'P1008','Knowledge proposal expired','expired lookup keeps its error after payload cleanup');
select throws_ok($$select commit_proposal((current_setting('test.organize_expired')::jsonb#>>'{job,id}')::uuid,true)$$,
    'P1008','Knowledge proposal expired','cleared expired proposal remains inapplicable');
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000130002';
select throws_ok($$select load_proposal(current_setting('test.organize_job')::uuid)$$,
    'P0002','Knowledge proposal not found','retained applied proposal remains owner-only');

select * from finish();
rollback;
