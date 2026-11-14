begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
select set_config('test.owner',gen_random_uuid()::text,true),set_config('test.other',gen_random_uuid()::text,true),
 set_config('test.exhibition',gen_random_uuid()::text,true),set_config('test.artwork',gen_random_uuid()::text,true),
 set_config('test.image',gen_random_uuid()::text,true),set_config('test.request',gen_random_uuid()::text,true);
insert into auth.users(id,email) values(current_setting('test.owner')::uuid,'interview-owner@example.invalid'),
 (current_setting('test.other')::uuid,'interview-other@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
select create_exhibition(current_setting('test.exhibition')::uuid,'Interview',null,null,null,'[]','[]');
select create_artwork(current_setting('test.artwork')::uuid,current_setting('test.exhibition')::uuid,1,'Work',null,null,null,
 '[{"id":"notes","body":"Existing text"}]','[]');
reset role;
insert into public.materials(id,owner_id,artwork_id,kind,state,storage_key,byte_size,content_type,content_hash)
values(current_setting('test.image')::uuid,current_setting('test.owner')::uuid,current_setting('test.artwork')::uuid,
 'image','ready',current_setting('test.owner')||'/materials/image.jpg',10,'image/jpeg',decode(repeat('ab',32),'hex'));
update public.artworks set image_material_id=current_setting('test.image')::uuid where id=current_setting('test.artwork')::uuid;
set local role service_role;
select set_config('test.claim',reserve_artwork_interview(current_setting('test.owner')::uuid,current_setting('test.request')::uuid,
 current_setting('test.artwork')::uuid,false)::text,true);
select is(current_setting('test.claim')::jsonb->>'claimed','true','owner reservation claims work');
select is(current_setting('test.claim')::jsonb#>>'{context,image,contentHash}',repeat('ab',32),'worker receives verified image identity');
select is(reserve_artwork_interview(current_setting('test.owner')::uuid,current_setting('test.request')::uuid,
 current_setting('test.artwork')::uuid,false)->>'claimed','false','replay does not claim a second attempt');
select set_config('test.job',current_setting('test.claim')::jsonb#>>'{job,id}',true);
select throws_ok($$select complete_artwork_interview(current_setting('test.owner')::uuid,current_setting('test.job')::uuid,1,
 '{"status":"succeeded","mock":false,"questions":["1","2","3","4","5","6"]}')$$,
 '22023','Invalid questions','six questions are rejected');
select set_config('test.result',complete_artwork_interview(current_setting('test.owner')::uuid,current_setting('test.job')::uuid,1,
 '{"status":"succeeded","mock":false,"questions":["Why this medium?"]}')::text,true);
select set_config('test.question',current_setting('test.result')::jsonb#>>'{questions,0,id}',true);
set local role authenticated;
select is(save_artwork_interview_answer(current_setting('test.artwork')::uuid,current_setting('test.question')::uuid,1,
 'An answer',false,false)#>>'{questions,0,status}','answered','answer creates a private draft');
select ok(not (get_narration_context(current_setting('test.artwork')::uuid)->'sources' @>
 '[{"text":"An answer"}]'::jsonb),'draft answer is absent from narration inputs');
select set_config('test.evidence',list_artwork_interview(current_setting('test.artwork')::uuid)#>>'{questions,0,evidenceId}',true);
select throws_ok($$select approve_evidence(current_setting('test.evidence')::uuid,1)$$,'P1006',
 'Approve this evidence in the interview','generic evidence approval cannot bypass the interview action');
select throws_ok($$select save_artwork_interview_answer(current_setting('test.artwork')::uuid,current_setting('test.question')::uuid,1,
 null,false,true)$$,'40001','Question version conflict','stale approval cannot approve a changed answer');
select is(save_artwork_interview_answer(current_setting('test.artwork')::uuid,current_setting('test.question')::uuid,2,
 null,false,true)#>>'{questions,0,status}','approved','explicit approval promotes the saved answer');
select ok(get_narration_context(current_setting('test.artwork')::uuid)->'sources' @>
 '[{"text":"An answer"}]'::jsonb,'approved answer is included in narration inputs');
reset role;
select ok(yeoback_private.qa_inputs(current_setting('test.owner')::uuid,current_setting('test.exhibition')::uuid,
 current_setting('test.artwork')::uuid)->'context'->'sources' @> '[{"body":"An answer"}]'::jsonb,
 'approved answer is included in Q&A inputs');
set local role authenticated;
select save_artwork_interview_answer(current_setting('test.artwork')::uuid,current_setting('test.question')::uuid,3,
 'A revised answer',false,false);
select upsert_evidence(current_setting('test.exhibition')::uuid,current_setting('test.artwork')::uuid,'artwork',
 'Old answer','An answer','{"kind":"direct"}',current_setting('test.evidence')::uuid,2);
select throws_ok($$select approve_evidence(current_setting('test.evidence')::uuid,3)$$,'P1006',
 'Approve this evidence in the interview','retired interview evidence cannot be revived by generic editing');
set local role service_role;
select set_config('test.stale',reserve_artwork_interview(current_setting('test.owner')::uuid,gen_random_uuid(),
 current_setting('test.artwork')::uuid,false)#>>'{job,id}',true);
reset role;
update public.materials set version=version+1 where id=current_setting('test.image')::uuid;
set local role service_role;
select is(complete_artwork_interview(current_setting('test.owner')::uuid,current_setting('test.stale')::uuid,1,
 '{"status":"succeeded","mock":false,"questions":["A stale photo question?"]}')#>>'{job,resultCode}',
 'REVISION_CONFLICT','changed photo invalidates generation');
select set_config('test.stale',reserve_artwork_interview(current_setting('test.owner')::uuid,gen_random_uuid(),
 current_setting('test.artwork')::uuid,false)#>>'{job,id}',true);
reset role;
update public.knowledge_documents set revision=revision+1 where artwork_id=current_setting('test.artwork')::uuid;
set local role service_role;
select is(complete_artwork_interview(current_setting('test.owner')::uuid,current_setting('test.stale')::uuid,1,
 '{"status":"succeeded","mock":false,"questions":["A stale text question?"]}')#>>'{job,resultCode}',
 'REVISION_CONFLICT','changed text revision invalidates generation');
select set_config('test.fill',reserve_artwork_interview(current_setting('test.owner')::uuid,gen_random_uuid(),
 current_setting('test.artwork')::uuid,false)#>>'{job,id}',true);
select is(jsonb_array_length(complete_artwork_interview(current_setting('test.owner')::uuid,current_setting('test.fill')::uuid,1,
 '{"status":"succeeded","mock":false,"questions":["Two?","Three?","Four?","Five?"]}')->'questions'),5,
 'remaining lifetime slots can be filled');
select throws_ok($$select reserve_artwork_interview(current_setting('test.owner')::uuid,gen_random_uuid(),
 current_setting('test.artwork')::uuid,false)$$,'P1006','Interview is full','five lifetime slots prevent further generation');
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.other'),true);
select throws_ok($$select list_artwork_interview(current_setting('test.artwork')::uuid)$$,'P0002','Subject not found',
 'other owner cannot list interview');
select is((select count(*)::integer from public.artwork_interview_questions),0,'RLS hides questions from other owner');
select is((select count(*)::integer from public.artwork_interview_answers),0,'RLS hides answers from other owner');
select * from finish();
rollback;
