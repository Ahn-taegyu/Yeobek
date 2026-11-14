begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public,extensions;
select no_plan();

select set_config('test.review_qa_owner',gen_random_uuid()::text,true);
select set_config('test.review_qa_exhibition',gen_random_uuid()::text,true);
select set_config('test.review_qa_request',gen_random_uuid()::text,true);
select set_config('test.review_qa_evaluation',gen_random_uuid()::text,true);
insert into auth.users(id,email) values (current_setting('test.review_qa_owner')::uuid,'review-qa@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.review_qa_owner'),true);
select create_exhibition(current_setting('test.review_qa_exhibition')::uuid,'Review fixture',null,null,null,'[]','[]');
select set_config('test.review_qa_source',upsert_evidence(current_setting('test.review_qa_exhibition')::uuid,null,
    'exhibition','Owner source','Artist chose mineral pigments.','{"kind":"direct"}',null,null)->>'id',true);
select approve_evidence(current_setting('test.review_qa_source')::uuid,1);

set local role service_role;
select set_config('test.review_qa_preview',reserve_preview_answer(current_setting('test.review_qa_owner')::uuid,
    current_setting('test.review_qa_exhibition')::uuid,null,current_setting('test.review_qa_request')::uuid,
    'What material was used?',false)::text,true);
select set_config('test.review_qa_answer',current_setting('test.review_qa_preview')::jsonb#>>'{job,id}',true);
select is(current_setting('test.review_qa_preview')::jsonb#>>'{context,sources,0,id}',current_setting('test.review_qa_source'),
    'approved evidence is available with no authored document sections');
select throws_ok($$select reserve_preview_answer(current_setting('test.review_qa_owner')::uuid,
    current_setting('test.review_qa_exhibition')::uuid,null,current_setting('test.review_qa_request')::uuid,
    'Different question?',false)$$,'P1005','Request ID already used with different input','replay is bound to the preview question');
select is(complete_preview_answer(current_setting('test.review_qa_owner')::uuid,current_setting('test.review_qa_answer')::uuid,1,
    jsonb_build_object('status','succeeded','answer','Mineral pigments.',
        'citations',jsonb_build_array(current_setting('test.review_qa_source'))))->>'status','succeeded',
    'preview records a grounded answer without creating a Q&A draft');

set local role authenticated;
select is(jsonb_array_length(list_qa_items(current_setting('test.review_qa_exhibition')::uuid,null)),0,
    'preview answer and reviewable Q&A items are independent');
select set_config('test.review_qa_evaluation_id',record_preview_evaluation(current_setting('test.review_qa_answer')::uuid,
    current_setting('test.review_qa_evaluation')::uuid,'needs_revision')->>'id',true);
select is(record_preview_evaluation(current_setting('test.review_qa_answer')::uuid,current_setting('test.review_qa_evaluation')::uuid,
    'needs_revision')->>'id',current_setting('test.review_qa_evaluation_id'),'evaluation replay does not duplicate history');
select lives_ok($$select record_preview_evaluation(current_setting('test.review_qa_answer')::uuid,gen_random_uuid(),'accurate')$$,
    'a second evaluation is accepted without approval');
select is(jsonb_array_length(get_preview_answer(current_setting('test.review_qa_answer')::uuid)->'evaluations'),2,
    'preview GET shows the two independent evaluations');
select set_config('test.review_qa_correction',create_qa_correction_evidence('preview',current_setting('test.review_qa_answer')::uuid,
    null,gen_random_uuid(),'Owner correction','A mineral pigment was mixed with water.')->>'id',true);
select set_config('test.review_qa_rewrite_req',gen_random_uuid()::text,true);
set local role service_role;
select throws_ok($$select reserve_qa_rewrite_job(current_setting('test.review_qa_owner')::uuid,
    current_setting('test.review_qa_rewrite_req')::uuid,'preview',current_setting('test.review_qa_answer')::uuid,null,
    'Mention the mixing medium.',jsonb_build_array(jsonb_build_object('id',current_setting('test.review_qa_correction'),'version',1)),false)$$,
    'P1002','Q&A evidence is unavailable','rewrite cannot use a correction until the owner approves it');
set local role authenticated;
select approve_evidence(current_setting('test.review_qa_correction')::uuid,1);
set local role service_role;
select set_config('test.review_qa_rewrite',reserve_qa_rewrite_job(current_setting('test.review_qa_owner')::uuid,
    current_setting('test.review_qa_rewrite_req')::uuid,'preview',current_setting('test.review_qa_answer')::uuid,null,
    'Mention the mixing medium.',jsonb_build_array(jsonb_build_object('id',current_setting('test.review_qa_correction'),'version',1)),false)::text,true);
select set_config('test.review_qa_rewrite_job',current_setting('test.review_qa_rewrite')::jsonb#>>'{job,id}',true);
select is(current_setting('test.review_qa_rewrite')::jsonb#>>'{context,previousAnswer}','Mineral pigments.',
    'rewrite context links the immutable prior answer');
select is(current_setting('test.review_qa_rewrite')::jsonb#>>'{context,sources,0,body}','A mineral pigment was mixed with water.',
    'rewrite exposes only independently approved source text as evidence');
select is(current_setting('test.review_qa_rewrite')::jsonb#>>'{job,targetId}',current_setting('test.review_qa_answer'),
    'worker reservation identifies its immutable target');
select set_config('test.review_qa_item',complete_qa_rewrite_job(current_setting('test.review_qa_owner')::uuid,
    current_setting('test.review_qa_rewrite_job')::uuid,1,jsonb_build_object('status','succeeded','items',jsonb_build_array(
        jsonb_build_object('question','What material was used?','answer','Mineral pigment mixed with water.',
            'citations',jsonb_build_array(current_setting('test.review_qa_correction'))))))#>>'{result,itemIds,0}',true);
set local role authenticated;
select is(list_qa_items(current_setting('test.review_qa_exhibition')::uuid,null)#>>'{0,state}','draft',
    'a rewritten answer enters the Q&A review as a draft');
select is(list_qa_items(current_setting('test.review_qa_exhibition')::uuid,null)#>>'{0,citations,0,body}',
    'A mineral pigment was mixed with water.','private review returns the exact used excerpt');
select is(approve_qa_item(current_setting('test.review_qa_item')::uuid,1,
    jsonb_build_array(jsonb_build_object('id',current_setting('test.review_qa_correction'),'version',1)))->>'state','approved',
    'rewritten draft requires its approved exact pin');
select throws_ok($$select create_qa_correction_evidence('gap',gen_random_uuid(),null,gen_random_uuid(),
    'Gap fact','Gap corrections are out of scope.')$$,'P0002','Gap Q&A conversion is unavailable',
    'an authenticated owner cannot convert a gap into correction evidence');

set local role service_role;
select throws_ok($$select reserve_qa_rewrite_job(current_setting('test.review_qa_owner')::uuid,gen_random_uuid(),
    'gap',gen_random_uuid(),null,'Gap conversion',
    jsonb_build_array(jsonb_build_object('id',current_setting('test.review_qa_correction'),'version',1)),false)$$,
    'P0002','Gap Q&A conversion is unavailable','worker cannot reserve a gap-to-Q&A rewrite');
select set_config('test.review_qa_mock_answer',reserve_preview_answer(current_setting('test.review_qa_owner')::uuid,
    current_setting('test.review_qa_exhibition')::uuid,null,gen_random_uuid(),'What was mixed?',true)#>>'{job,id}',true);
select complete_preview_answer(current_setting('test.review_qa_owner')::uuid,current_setting('test.review_qa_mock_answer')::uuid,1,
    jsonb_build_object('status','succeeded','answer','A demo answer about pigments.',
        'citations',jsonb_build_array(current_setting('test.review_qa_correction'))));
select throws_ok($$select reserve_qa_rewrite_job(current_setting('test.review_qa_owner')::uuid,gen_random_uuid(),
    'preview',current_setting('test.review_qa_mock_answer')::uuid,null,'Rewrite demo answer',
    jsonb_build_array(jsonb_build_object('id',current_setting('test.review_qa_correction'),'version',1)),false)$$,
    'P1002','Mock answer cannot be rewritten in live mode','live rewrite rejects a mock predecessor before reserving');
select set_config('test.review_qa_mock_rewrite',reserve_qa_rewrite_job(current_setting('test.review_qa_owner')::uuid,gen_random_uuid(),
    'preview',current_setting('test.review_qa_mock_answer')::uuid,null,'Rewrite demo answer',
    jsonb_build_array(jsonb_build_object('id',current_setting('test.review_qa_correction'),'version',1)),true)#>>'{job,id}',true);
select complete_qa_rewrite_job(current_setting('test.review_qa_owner')::uuid,current_setting('test.review_qa_mock_rewrite')::uuid,1,
    '{"status":"failed","resultCode":"PROVIDER_UNAVAILABLE","mock":true}');
select throws_ok($$select retry_qa_rewrite_job(current_setting('test.review_qa_owner')::uuid,
    current_setting('test.review_qa_mock_rewrite')::uuid,gen_random_uuid(),1,false)$$,
    'P1002','Mock answer cannot be rewritten in live mode','live retry cannot launder a mock predecessor');
select is(retry_qa_rewrite_job(current_setting('test.review_qa_owner')::uuid,
    current_setting('test.review_qa_mock_rewrite')::uuid,gen_random_uuid(),1,true)#>>'{job,attempt}','2',
    'rejected live retry did not consume the next attempt');

select * from finish();
rollback;
