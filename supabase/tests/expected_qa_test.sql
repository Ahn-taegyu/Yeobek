begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public,extensions;
select no_plan();

select set_config('test.qa_owner',gen_random_uuid()::text,true);
select set_config('test.qa_other_owner',gen_random_uuid()::text,true);
select set_config('test.qa_exhibition',gen_random_uuid()::text,true);
select set_config('test.qa_other_exhibition',gen_random_uuid()::text,true);
select set_config('test.qa_artwork',gen_random_uuid()::text,true);
select set_config('test.qa_request',gen_random_uuid()::text,true);
insert into auth.users(id,email) values (current_setting('test.qa_owner')::uuid,'qa-owner@example.invalid'),
    (current_setting('test.qa_other_owner')::uuid,'qa-other-owner@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.qa_owner'),true);
select create_exhibition(current_setting('test.qa_exhibition')::uuid,'Q&A exhibition',null,null,null,
    '[{"id":"introduction","body":"Owner approved source excerpt"}]','[]');
select create_exhibition(current_setting('test.qa_other_exhibition')::uuid,'Other exhibition',null,null,null,
    '[{"id":"introduction","body":"Other exhibition private source"}]','[]');
select create_artwork(current_setting('test.qa_artwork')::uuid,current_setting('test.qa_exhibition')::uuid,1,
    'Q&A artwork',null,null,null,'[{"id":"notes","body":"Selected artwork private source"}]','[]');
reset role;

set local role authenticated;
select throws_ok($$ select reserve_expected_qa_job(current_setting('test.qa_owner')::uuid,
    current_setting('test.qa_request')::uuid,current_setting('test.qa_exhibition')::uuid,null,1,1,false) $$,
    '42501',null,'owner cannot directly drive the worker reservation');
set local role service_role;
select throws_ok($$ select reserve_expected_qa_job(current_setting('test.qa_owner')::uuid,
    gen_random_uuid(),current_setting('test.qa_other_exhibition')::uuid,current_setting('test.qa_artwork')::uuid,1,1,false) $$,
    'P0002','Subject not found','a same-owner artwork from another exhibition is rejected');
select set_config('test.qa_reserved',reserve_expected_qa_job(current_setting('test.qa_owner')::uuid,
    current_setting('test.qa_request')::uuid,current_setting('test.qa_exhibition')::uuid,null,1,1,false)::text,true);
select is(current_setting('test.qa_reserved')::jsonb->>'claimed','true','worker reserves an exhibition job');
select is(current_setting('test.qa_reserved')::jsonb#>>'{job,scope}','exhibition','exhibition work has its own scope');
select is(current_setting('test.qa_reserved')::jsonb#>'{context,sources,0,body}',
    '"Owner approved source excerpt"'::jsonb,'exhibition job reads its own section');
select is(jsonb_array_length(current_setting('test.qa_reserved')::jsonb#>'{context,sources}'),1,
    'exhibition context excludes selected and other-exhibition artwork and other exhibitions');
select is(reserve_expected_qa_job(current_setting('test.qa_owner')::uuid,current_setting('test.qa_request')::uuid,
    current_setting('test.qa_exhibition')::uuid,null,1,1,false)->>'claimed','false','same request returns an unclaimed replay');
select throws_ok($$ select reserve_expected_qa_job(current_setting('test.qa_owner')::uuid,
    current_setting('test.qa_request')::uuid,current_setting('test.qa_exhibition')::uuid,null,1,1,true) $$,
    'P1005','Request ID already used with different input','mock policy is bound to an attempt request');

select set_config('test.qa_job',current_setting('test.qa_reserved')::jsonb#>>'{job,id}',true);
select set_config('test.qa_candidate',jsonb_build_object('question','What is this exhibition about?',
    'answer','It uses the supplied source.', 'citations',jsonb_build_array(current_setting('test.qa_reserved')::jsonb#>'{context,sources,0,id}'))::text,true);
select throws_ok($$ select complete_expected_qa_job(current_setting('test.qa_owner')::uuid,current_setting('test.qa_job')::uuid,1,
    jsonb_build_object('status','succeeded','items',(select jsonb_agg(current_setting('test.qa_candidate')::jsonb) from generate_series(1,6)))) $$,
    '22023','Too many Q&A candidates','exhibition SQL cap rejects six candidates');
select throws_ok($$ select complete_expected_qa_job(current_setting('test.qa_owner')::uuid,current_setting('test.qa_job')::uuid,1,
    jsonb_build_object('status','succeeded','items',jsonb_build_array(current_setting('test.qa_candidate')::jsonb ||
        jsonb_build_object('citations',jsonb_build_array(gen_random_uuid()))))) $$,
    '22023','Invalid Q&A citations','provider cannot introduce a citation outside reserved input');
select set_config('test.qa_result',jsonb_build_object('status','succeeded','items',
    jsonb_build_array(current_setting('test.qa_candidate')::jsonb))::text,true);
select set_config('test.qa_item',complete_expected_qa_job(current_setting('test.qa_owner')::uuid,
    current_setting('test.qa_job')::uuid,1,current_setting('test.qa_result')::jsonb)#>>'{result,itemIds,0}',true);
select is(complete_expected_qa_job(current_setting('test.qa_owner')::uuid,current_setting('test.qa_job')::uuid,1,
    current_setting('test.qa_result')::jsonb)#>>'{result,itemIds,0}',current_setting('test.qa_item'),
    'completion replay preserves the same versioned item');

set local role authenticated;
select is(jsonb_array_length(list_qa_items(current_setting('test.qa_exhibition')::uuid,null)),1,'the owner sees one Q&A draft');
select is(jsonb_array_length(list_qa_items(current_setting('test.qa_exhibition')::uuid,current_setting('test.qa_artwork')::uuid)),0,
    'exhibition drafts do not leak into the artwork listing');
select set_config('test.qa_other_pin',upsert_evidence(current_setting('test.qa_exhibition')::uuid,null,'exhibition','Unrelated',
    'Owner approved source excerpt','{"kind":"direct"}',null,null)->>'id',true);
select approve_evidence(current_setting('test.qa_other_pin')::uuid,1);
select throws_ok($$ select approve_qa_item(current_setting('test.qa_item')::uuid,1,
    jsonb_build_array(jsonb_build_object('id',current_setting('test.qa_other_pin'),'version',1))) $$,
    '22023','Q&A approval pins must match cited sources','a coincidentally identical direct quote lacks the cited provenance');
select set_config('test.qa_pin',upsert_evidence(current_setting('test.qa_exhibition')::uuid,null,'exhibition','Approved excerpt',
    'Owner approved source excerpt',jsonb_build_object('kind','document',
        'source_document_id',current_setting('test.qa_reserved')::jsonb#>'{context,documentId}',
        'source_section_id','introduction','source_revision',1),null,null)->>'id',true);
select approve_evidence(current_setting('test.qa_pin')::uuid,1);
select is(approve_qa_item(current_setting('test.qa_item')::uuid,1,
    jsonb_build_array(jsonb_build_object('id',current_setting('test.qa_pin'),'version',1)))->>'state','approved',
    'approval requires the exact approved document excerpt');
select is(withdraw_qa_item(current_setting('test.qa_item')::uuid,1)->>'state','withdrawn','owner can withdraw the pinned version');
select set_config('request.jwt.claim.sub',current_setting('test.qa_other_owner'),true);
select throws_ok($$ select get_expected_qa_job(current_setting('test.qa_job')::uuid) $$,
    'P0002','Job not found','another artist cannot load a Q&A generation job');

reset role;
update app_policies set value = 2 where key = 'expected_qa_exhibition_max';
set local role service_role;
select set_config('test.qa_capped',reserve_expected_qa_job(current_setting('test.qa_owner')::uuid,
    gen_random_uuid(),current_setting('test.qa_exhibition')::uuid,null,1,1,false)::text,true);
select set_config('test.qa_capped_job',current_setting('test.qa_capped')::jsonb#>>'{job,id}',true);
select is(current_setting('test.qa_capped')::jsonb#>>'{context,maxItems}','2',
    'reservation returns the effective policy limit to the model');
select set_config('test.qa_capped_candidates',jsonb_build_array(
    jsonb_build_object('question','What is shown?','answer','The exhibition is shown.',
        'citations',jsonb_build_array(current_setting('test.qa_capped')::jsonb#>'{context,sources,0,id}')),
    jsonb_build_object('question','What can one see?','answer','The exhibition is available.',
        'citations',jsonb_build_array(current_setting('test.qa_capped')::jsonb#>'{context,sources,0,id}'))
    )::text,true);
reset role;
update app_policies set value = 1 where key = 'expected_qa_exhibition_max';
set local role service_role;
select throws_ok($$select complete_expected_qa_job(current_setting('test.qa_owner')::uuid,
    current_setting('test.qa_capped_job')::uuid,1,jsonb_build_object('status','succeeded','items',
        current_setting('test.qa_capped_candidates')::jsonb || (current_setting('test.qa_capped_candidates')::jsonb->0)))$$,
    '22023','Too many Q&A candidates','completion rejects results above the reserved bound');
select is(jsonb_array_length(complete_expected_qa_job(current_setting('test.qa_owner')::uuid,
    current_setting('test.qa_capped_job')::uuid,1,jsonb_build_object('status','succeeded','items',
        current_setting('test.qa_capped_candidates')::jsonb))#>'{result,itemIds}'),2,
    'in-flight completion retains its reserved bound after the policy changes');
select set_config('test.qa_retry_job',reserve_expected_qa_job(current_setting('test.qa_owner')::uuid,
    gen_random_uuid(),current_setting('test.qa_exhibition')::uuid,null,1,1,false)#>>'{job,id}',true);
select complete_expected_qa_job(current_setting('test.qa_owner')::uuid,current_setting('test.qa_retry_job')::uuid,1,
    '{"status":"failed","resultCode":"PROVIDER_UNAVAILABLE"}');
reset role;
update app_policies set value = 100 where key = 'expected_qa_exhibition_max';
set local role service_role;
select set_config('test.qa_retried',retry_expected_qa_job(current_setting('test.qa_owner')::uuid,
    current_setting('test.qa_retry_job')::uuid,gen_random_uuid(),1,false)::text,true);
select is(current_setting('test.qa_retried')::jsonb#>>'{context,maxItems}','5',
    'retry snapshots current policy within the product cap');
reset role;
update ai_jobs set lease_until = statement_timestamp() - interval '1 second'
where id = current_setting('test.qa_retry_job')::uuid;
set local role service_role;
select is(complete_expected_qa_job(current_setting('test.qa_owner')::uuid,current_setting('test.qa_retry_job')::uuid,2,
    jsonb_build_object('status','succeeded','items',current_setting('test.qa_capped_candidates')::jsonb))->>'resultCode',
    'REQUEST_TIMEOUT','an expired attempt cannot commit a valid provider payload');
reset role;
select is((select count(*) from yeoback_private.qa_item_versions where source_job_id = current_setting('test.qa_retry_job')::uuid),
    0::bigint,'an expired callback inserts no private drafts');

select * from finish();
rollback;
