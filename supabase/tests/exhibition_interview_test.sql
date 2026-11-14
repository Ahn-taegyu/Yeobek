begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
select set_config('test.owner',gen_random_uuid()::text,true),set_config('test.other',gen_random_uuid()::text,true),
 set_config('test.exhibition',gen_random_uuid()::text,true),set_config('test.artwork',gen_random_uuid()::text,true),
 set_config('test.request',gen_random_uuid()::text,true);
insert into auth.users(id,email) values(current_setting('test.owner')::uuid,'exhibition-interview-owner@example.invalid'),
 (current_setting('test.other')::uuid,'exhibition-interview-other@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
select create_exhibition(current_setting('test.exhibition')::uuid,'Interview Show',null,null,null,
 '[{"id":"exhibition_background","body":"Existing background"}]','[]');
select create_artwork(current_setting('test.artwork')::uuid,current_setting('test.exhibition')::uuid,1,'Work',null,null,null,
 '[{"id":"notes","body":"Existing text"}]','[]');
reset role;

set local role service_role;
select set_config('test.claim',reserve_exhibition_interview(current_setting('test.owner')::uuid,current_setting('test.request')::uuid,
 current_setting('test.exhibition')::uuid,false)::text,true);
select is(current_setting('test.claim')::jsonb->>'claimed','true','owner reservation claims the first batch');
select is(current_setting('test.claim')::jsonb#>>'{context,maxQuestions}','10','first batch asks for ten questions');
select is(reserve_exhibition_interview(current_setting('test.owner')::uuid,current_setting('test.request')::uuid,
 current_setting('test.exhibition')::uuid,false)->>'claimed','false','replay does not claim a second attempt');
select set_config('test.job',current_setting('test.claim')::jsonb#>>'{job,id}',true);
select throws_ok($$select complete_exhibition_interview(current_setting('test.owner')::uuid,current_setting('test.job')::uuid,1,
 '{"status":"succeeded","mock":false,"questions":["1","2","3","4","5","6","7","8","9","10","11"]}')$$,
 '22023','Invalid questions','more than ten questions are rejected');
select is(jsonb_array_length(complete_exhibition_interview(current_setting('test.owner')::uuid,current_setting('test.job')::uuid,1,
 '{"status":"succeeded","mock":false,"questions":["Q1?","Q2?","Q3?","Q4?","Q5?","Q6?","Q7?","Q8?","Q9?","Q10?"]}')#>'{interview,questions}'),
 10,'ten questions are stored in order');
select throws_ok($$select reserve_exhibition_interview(current_setting('test.owner')::uuid,gen_random_uuid(),
 current_setting('test.exhibition')::uuid,false)$$,'P1006','Questions already prepared','no new batch while more than five remain');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.other'),true);
select throws_ok($$select list_exhibition_interview(current_setting('test.exhibition')::uuid)$$,'P0002',null,'another artist cannot read it');
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
select is(list_exhibition_interview(current_setting('test.exhibition')::uuid)->>'requiredCount','5','five answers are required');
select is((select count(*)::integer from (select save_exhibition_interview_answer(current_setting('test.exhibition')::uuid,q.id,q.version,
 'Answer '||q.seq,false) from exhibition_interview_questions q where q.exhibition_id=current_setting('test.exhibition')::uuid and q.seq<=5) answered),5,'owner answers the required five');
reset role;
select is((select count(*)::integer from evidence_items where exhibition_id=current_setting('test.exhibition')::uuid
 and scope='exhibition' and state='approved' and body like 'Answer %'),5,'answers become approved exhibition evidence');
select set_config('test.q1',(select id::text from exhibition_interview_questions where exhibition_id=current_setting('test.exhibition')::uuid and seq=1),true);
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
select is(save_exhibition_interview_answer(current_setting('test.exhibition')::uuid,current_setting('test.q1')::uuid,2,null,true)
 #>>'{questions,0,status}','skipped','skipping withdraws the earlier answer');
reset role;
select is((select count(*)::integer from evidence_items e where e.exhibition_id=current_setting('test.exhibition')::uuid
 and e.body='Answer 1' and e.state='withdrawn'),1,'the skipped answer evidence is withdrawn');
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
select throws_ok($$select save_exhibition_interview_answer(current_setting('test.exhibition')::uuid,current_setting('test.q1')::uuid,2,'Late',false)$$,
 '40001',null,'stale versions are rejected');
reset role;

set local role service_role;
select is(reserve_exhibition_interview(current_setting('test.owner')::uuid,gen_random_uuid(),
 current_setting('test.exhibition')::uuid,false)#>>'{context,maxQuestions}','5','continuing prepares the next five');
reset role;
select ok((select count(*) from jsonb_array_elements(yeoback_private.narration_inputs(current_setting('test.owner')::uuid,
 current_setting('test.artwork')::uuid)#>'{context,sources}') s where s->>'text' like 'Answer %')=4,'answered evidence feeds narration');
select * from finish();
rollback;
