begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
select set_config('test.pv_owner',gen_random_uuid()::text,true);
select set_config('test.pv_other',gen_random_uuid()::text,true);
select set_config('test.pv_exhibition',gen_random_uuid()::text,true);
select set_config('test.pv_request',gen_random_uuid()::text,true);
insert into auth.users(id,email) values (current_setting('test.pv_owner')::uuid,'preview-voice-owner@example.invalid'),
 (current_setting('test.pv_other')::uuid,'preview-voice-other@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.pv_owner'),true);
select create_exhibition(current_setting('test.pv_exhibition')::uuid,'Preview voice fixture',null,null,null,
 '[{"id":"introduction","body":"Source."}]','[]');
select set_config('test.pv_evidence',upsert_evidence(current_setting('test.pv_exhibition')::uuid,null,
 'exhibition','Owner source','A blue morning.','{"kind":"direct"}',null,null)->>'id',true);
select approve_evidence(current_setting('test.pv_evidence')::uuid,1);
set local role service_role;
select set_config('test.pv_answer',reserve_preview_answer(current_setting('test.pv_owner')::uuid,
 current_setting('test.pv_exhibition')::uuid,null,gen_random_uuid(),'What is shown?',true)#>>'{job,id}',true);
select complete_preview_answer(current_setting('test.pv_owner')::uuid,current_setting('test.pv_answer')::uuid,1,
 jsonb_build_object('status','succeeded','answer','A blue morning.','citations',jsonb_build_array(current_setting('test.pv_evidence'))));
select set_config('test.pv_speech',reserve_preview_voice(current_setting('test.pv_owner')::uuid,current_setting('test.pv_exhibition')::uuid,
 current_setting('test.pv_answer')::uuid,gen_random_uuid(),'speech',repeat('d',64),true)->>'id',true);
select complete_preview_voice(current_setting('test.pv_owner')::uuid,current_setting('test.pv_speech')::uuid,null,encode(convert_to('ID3fixture','UTF8'),'base64'),null);
select is(load_preview_voice(current_setting('test.pv_owner')::uuid,current_setting('test.pv_speech')::uuid)->>'audio',
 encode(convert_to('ID3fixture','UTF8'),'base64'),'private speech bytes replay to worker');
reset role;
update public.ai_jobs set expires_at=statement_timestamp()-interval '1 second' where id=current_setting('test.pv_answer')::uuid;
set local role service_role;
select throws_ok($$select load_preview_voice(current_setting('test.pv_owner')::uuid,current_setting('test.pv_speech')::uuid)$$,
 'P0002',null,'expired answer blocks speech replay');
select set_config('test.pv_id',(reserve_preview_voice(current_setting('test.pv_owner')::uuid,current_setting('test.pv_exhibition')::uuid,
 null,current_setting('test.pv_request')::uuid,'transcription',repeat('a',64),true)->>'id'),true);
select is(reserve_preview_voice(current_setting('test.pv_owner')::uuid,current_setting('test.pv_exhibition')::uuid,
 null,current_setting('test.pv_request')::uuid,'transcription',repeat('a',64),true)->>'claimed','false','replay does not reserve twice');
select throws_ok($$select reserve_preview_voice(current_setting('test.pv_owner')::uuid,current_setting('test.pv_exhibition')::uuid,
 null,current_setting('test.pv_request')::uuid,'transcription',repeat('b',64),true)$$,'P1005',null,'changed input conflicts');
select throws_ok($$select reserve_preview_voice(current_setting('test.pv_other')::uuid,current_setting('test.pv_exhibition')::uuid,
 null,gen_random_uuid(),'transcription',repeat('a',64),true)$$,'P0002',null,'foreign exhibition denied');
select complete_preview_voice(current_setting('test.pv_owner')::uuid,current_setting('test.pv_id')::uuid,
 jsonb_build_object('requestId',current_setting('test.pv_request'),'transcript','fixture','mock',true),null,null);
select is(load_preview_voice(current_setting('test.pv_owner')::uuid,current_setting('test.pv_id')::uuid)#>>'{result,transcript}',
 'fixture','transcript can be replayed');
select throws_ok($$select load_preview_voice(current_setting('test.pv_other')::uuid,current_setting('test.pv_id')::uuid)$$,
 'P0002',null,'foreign owner cannot load');
reset role;
select is((select count(*) from yeoback_private.preview_voice_requests where owner_id=current_setting('test.pv_owner')::uuid),2::bigint,'speech and transcript each use one quota slot');
insert into yeoback_private.preview_voice_requests(owner_id,request_id,exhibition_id,kind,input_hash,mock)
 select current_setting('test.pv_owner')::uuid,gen_random_uuid(),current_setting('test.pv_exhibition')::uuid,'transcription',repeat('c',64),true from generate_series(1,18);
set local role service_role;
select throws_ok($$select reserve_preview_voice(current_setting('test.pv_owner')::uuid,current_setting('test.pv_exhibition')::uuid,
 null,gen_random_uuid(),'transcription',repeat('a',64),true)$$,'P1004',null,'combined daily limit enforced');
reset role;
update public.exhibitions set deleted_at=statement_timestamp() where id=current_setting('test.pv_exhibition')::uuid;
set local role service_role;
select throws_ok($$select load_preview_voice(current_setting('test.pv_owner')::uuid,current_setting('test.pv_id')::uuid)$$,
 'P0002',null,'deleted exhibition blocks replay');
set local role anon;
select throws_ok($$select load_preview_voice(current_setting('test.pv_owner')::uuid,current_setting('test.pv_id')::uuid)$$,
 '42501',null,'anonymous RPC denied');
set local role authenticated;
select throws_ok($$select load_preview_voice(current_setting('test.pv_owner')::uuid,current_setting('test.pv_id')::uuid)$$,
 '42501',null,'authenticated RPC denied');
reset role;
select ok(not has_table_privilege('anon','yeoback_private.preview_voice_requests','SELECT'), 'anon cannot read private ledger bytes');
select ok(not has_table_privilege('authenticated','yeoback_private.preview_voice_requests','SELECT'), 'authenticated cannot read private ledger bytes');
update yeoback_private.preview_voice_requests set expires_at=statement_timestamp()-interval '1 second'
 where id=current_setting('test.pv_speech')::uuid;
set local role service_role;
select purge_expired();
reset role;
select is((select count(*) from yeoback_private.preview_voice_requests where id=current_setting('test.pv_speech')::uuid),
 0::bigint,'purge physically removes expired speech bytes');
select * from finish();
rollback;
