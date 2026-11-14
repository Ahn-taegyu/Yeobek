begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
insert into auth.users(id,email)
values ('6e8b3420-79aa-4974-9d69-7dda5e50a001','b-qa-resume-repro@example.invalid');

set local role authenticated;
set local request.jwt.claim.sub = '6e8b3420-79aa-4974-9d69-7dda5e50a001';
select create_exhibition('6e8b3420-79aa-4974-9d69-7dda5e50a002','Synthetic exhibition',
    '2026-11-14','2026-11-15','Test gallery','[]','[]');
select update_artist_profile(1,'Test artist',1,'[]','[]');
select create_artwork('6e8b3420-79aa-4974-9d69-7dda5e50a003','6e8b3420-79aa-4974-9d69-7dda5e50a002',
    1,'Synthetic artwork',null,null,null,'[]','[]');
select save_narration_draft('6e8b3420-79aa-4974-9d69-7dda5e50a003',1,'Manually written narration about layers.');
select set_config('test.ab_review_evidence',upsert_evidence('6e8b3420-79aa-4974-9d69-7dda5e50a002',null,'exhibition',
    'Reviewed source','The artwork uses three layers.','{"kind":"direct"}')->>'id',true);
select approve_evidence(current_setting('test.ab_review_evidence')::uuid,1);
select approve_narration('6e8b3420-79aa-4974-9d69-7dda5e50a003',2,
    jsonb_build_array(jsonb_build_object('id',current_setting('test.ab_review_evidence'),'version',1)));

reset role;
insert into yeoback_private.qa_item_versions(id,version,owner_id,exhibition_id,artwork_id,origin,
    source_job_id,source_attempt,question,answer,content_hash,source_fingerprint,citations,mock,state,evidence_pins,approved_at)
values ('6e8b3420-79aa-4974-9d69-7dda5e50a004',1,'6e8b3420-79aa-4974-9d69-7dda5e50a001',
    '6e8b3420-79aa-4974-9d69-7dda5e50a002','6e8b3420-79aa-4974-9d69-7dda5e50a003','expected',gen_random_uuid(),1,
    'Why layered?','Mock Q&A only.',sha256('QA content'::bytea),'{}','[]',true,'approved',
    jsonb_build_array(jsonb_build_object('id',current_setting('test.ab_review_evidence'),'version',1)),now());
select is(yeoback_private.narration_is_mock(yeoback_private.current_narration_approval('6e8b3420-79aa-4974-9d69-7dda5e50a001','6e8b3420-79aa-4974-9d69-7dda5e50a003')),false,'manual narration isolates the QA boundary');
set local role service_role;
select is(get_approved_qa_for_publication('6e8b3420-79aa-4974-9d69-7dda5e50a001','6e8b3420-79aa-4974-9d69-7dda5e50a002','6e8b3420-79aa-4974-9d69-7dda5e50a003',false),'[]'::jsonb,'live approval port excludes mock QA');
select is(publish_with_audio_config('6e8b3420-79aa-4974-9d69-7dda5e50a001','6e8b3420-79aa-4974-9d69-7dda5e50a002','6e8b3420-79aa-4974-9d69-7dda5e50a005',1,'[{"artwork_id":"6e8b3420-79aa-4974-9d69-7dda5e50a003","expected_revision":2}]','{"bio":null,"introduction":null,"theme":null}',false,null,true)->>'created','true','development publishes approved mock QA');
select throws_ok($$select publish_with_audio_config('6e8b3420-79aa-4974-9d69-7dda5e50a001','6e8b3420-79aa-4974-9d69-7dda5e50a002','6e8b3420-79aa-4974-9d69-7dda5e50a005',1,'[{"artwork_id":"6e8b3420-79aa-4974-9d69-7dda5e50a003","expected_revision":2}]','{"bio":null,"introduction":null,"theme":null}',false,null,false)$$,'40001','Publication contains mock QA','live replay rejects pinned mock QA');
select is(publish_with_audio_config('6e8b3420-79aa-4974-9d69-7dda5e50a001','6e8b3420-79aa-4974-9d69-7dda5e50a002',gen_random_uuid(),2,'[]','{"bio":null,"introduction":null,"theme":null}',false,null,false)#>>'{blocked,0,reasons,0}',
    'MOCK_QA_NOT_ALLOWED','metadata-only live publish cannot retain mock QA');
select is(publish_with_audio_config('6e8b3420-79aa-4974-9d69-7dda5e50a001','6e8b3420-79aa-4974-9d69-7dda5e50a002','6e8b3420-79aa-4974-9d69-7dda5e50a005',1,'[{"artwork_id":"6e8b3420-79aa-4974-9d69-7dda5e50a003","expected_revision":2}]','{"bio":null,"introduction":null,"theme":null}',false,null,true)->>'created','false','development replay remains idempotent');
select is(publish_with_audio_config('6e8b3420-79aa-4974-9d69-7dda5e50a001','6e8b3420-79aa-4974-9d69-7dda5e50a002','6e8b3420-79aa-4974-9d69-7dda5e50a006',2,'[]','{"bio":null,"introduction":null,"theme":null}',false,null,true)->>'created','true','development metadata publish retains QA');
select throws_ok($$select publish_with_audio_config('6e8b3420-79aa-4974-9d69-7dda5e50a001','6e8b3420-79aa-4974-9d69-7dda5e50a002','6e8b3420-79aa-4974-9d69-7dda5e50a006',2,'[]','{"bio":null,"introduction":null,"theme":null}',false,null,false)$$,'40001','Publication contains mock QA','metadata replay also checks retained QA');
set local role authenticated;
select pause('6e8b3420-79aa-4974-9d69-7dda5e50a002',3,null);
set local role service_role;
select throws_ok($$select resume_with_audio_mode('6e8b3420-79aa-4974-9d69-7dda5e50a001','6e8b3420-79aa-4974-9d69-7dda5e50a002',4,false,false,null)$$,'40001','Publication contains mock QA','live exhibition resume rejects mock QA');
select throws_ok($$select resume('6e8b3420-79aa-4974-9d69-7dda5e50a001','6e8b3420-79aa-4974-9d69-7dda5e50a002',4,false,null)$$,'40001','Publication contains mock QA','legacy resume rejects mock QA');
select lives_ok($$select resume_with_audio_mode('6e8b3420-79aa-4974-9d69-7dda5e50a001','6e8b3420-79aa-4974-9d69-7dda5e50a002',4,false,true,null)$$,'development resume remains supported');
select is(publish_with_audio_config('6e8b3420-79aa-4974-9d69-7dda5e50a001','6e8b3420-79aa-4974-9d69-7dda5e50a002',gen_random_uuid(),5,
    '[{"artwork_id":"6e8b3420-79aa-4974-9d69-7dda5e50a003","expected_revision":3}]','{"bio":null,"introduction":null,"theme":null}',false,null,false)->>'created',
    'true','explicit live republish removes mock QA while keeping manual narration');
reset role;
select is((select jsonb_array_length(p.evidence->'approvedQa') from public.publications p join public.artworks a on a.active_publication_id=p.id where a.id='6e8b3420-79aa-4974-9d69-7dda5e50a003'),0,'replacement live snapshot contains no mock QA');
select * from finish();
rollback;
