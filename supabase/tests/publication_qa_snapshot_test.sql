begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id,email) values
    ('00000000-0000-0000-0000-000000000001','publication@example.invalid'),
    ('00000000-0000-0000-0000-000000000002','other-publication@example.invalid');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select create_exhibition('10000000-0000-0000-0000-000000000001','One',null,null,null,
    '[{"id":"introduction","body":"Private exhibition introduction"}]','[]');
select create_exhibition('10000000-0000-0000-0000-000000000002','Two',null,null,null,'[]','[]');
select update_artist_profile(1,'Public artist',1,'[{"id":"bio","body":"Approved source. Private tail."}]','[]');
select create_artwork('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
    1,'One',null,null,null,'[]','[]');
select create_artwork('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001',
    2,'Unready',null,null,null,'[]','[]');
select create_artwork('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000002',
    1,'Three',null,null,null,'[]','[]');
select save_narration_draft('20000000-0000-0000-0000-000000000001',1,'First narration');
select save_narration_draft('20000000-0000-0000-0000-000000000003',1,'Second narration');

reset role;
update app_features set enabled = false where key = 'voice_required';
update exhibitions set start_time='09:30',end_time='18:00' where id='10000000-0000-0000-0000-000000000001';
insert into materials(id,owner_id,artwork_id,kind,state,storage_key,byte_size) values
    ('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',
     '20000000-0000-0000-0000-000000000001','image','ready','00000000-0000-0000-0000-000000000001/image1',100),
    ('30000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001',
     '20000000-0000-0000-0000-000000000003','image','ready','00000000-0000-0000-0000-000000000001/image3',100);
insert into materials(id,owner_id,exhibition_id,kind,state,storage_key,byte_size,content_type,content_hash)
values ('70000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001','image','ready',
    '00000000-0000-0000-0000-000000000001/poster.png',32,'image/png',sha256('Poster'::bytea));
update exhibitions set poster_material_id='70000000-0000-0000-0000-000000000001'
    where id='10000000-0000-0000-0000-000000000001';
-- First artwork deliberately has no image: exercise legacy public.publish.
update artworks set image_material_id = '30000000-0000-0000-0000-000000000003' where id = '20000000-0000-0000-0000-000000000003';
select set_config('test.bio_document',(select id::text from knowledge_documents
    where owner_id = '00000000-0000-0000-0000-000000000001' and artist_id is not null),true);

set local role authenticated;
select set_config('test.evidence1',upsert_evidence('10000000-0000-0000-0000-000000000001',null,'artist','Approved excerpt','Approved source.',
    jsonb_build_object('kind','document','source_document_id',current_setting('test.bio_document'),'source_section_id','bio','source_revision',2)
)->>'id',true);
select set_config('test.evidence2',upsert_evidence('10000000-0000-0000-0000-000000000002',null,'artist','Approved excerpt','Approved source.',
    jsonb_build_object('kind','document','source_document_id',current_setting('test.bio_document'),'source_section_id','bio','source_revision',2)
)->>'id',true);
select approve_evidence(current_setting('test.evidence1')::uuid,1);
select approve_evidence(current_setting('test.evidence2')::uuid,1);
select set_config('test.qa',upsert_evidence('10000000-0000-0000-0000-000000000001',null,'exhibition',
    'FAQ','Additional approved answer.','{"kind":"direct"}')->>'id',true);
select approve_evidence(current_setting('test.qa')::uuid,1);
select approve_narration('20000000-0000-0000-0000-000000000001',2,
    jsonb_build_array(jsonb_build_object('id',current_setting('test.evidence1'),'version',1)));
select approve_narration('20000000-0000-0000-0000-000000000003',2,
    jsonb_build_array(jsonb_build_object('id',current_setting('test.evidence2'),'version',1)));

select set_config('test.select1','[{"artwork_id":"20000000-0000-0000-0000-000000000001","expected_revision":2}]',true);
select set_config('test.select2','[{"artwork_id":"20000000-0000-0000-0000-000000000003","expected_revision":2}]',true);
select set_config('test.intro1',jsonb_build_object('bio',jsonb_build_object('id',current_setting('test.evidence1'),'version',1),
    'introduction',null,'theme',null)::text,true);


reset role;
-- Synthetic approved candidates: no real author data or external generation.
insert into yeoback_private.qa_item_versions(id,version,owner_id,exhibition_id,artwork_id,origin,
    source_job_id,source_attempt,question,answer,content_hash,source_fingerprint,citations,mock,state,evidence_pins,approved_at,withdrawn_at)
select ('80000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,1,
    '00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
    case when n=2 then null else '20000000-0000-0000-0000-000000000001'::uuid end,'expected',gen_random_uuid(),1,
    'Why layered?', 'Layers preserve memory.',sha256('QA content'::bytea),'{}','[]',n=5,
    case when n=3 then 'draft' when n=4 then 'withdrawn' else 'approved' end,
    jsonb_build_array(jsonb_build_object('id',current_setting('test.evidence1'),'version',1)),
    case when n=2 then now()-interval '1 day' when n<>3 then now() end,case when n=4 then now() end
from generate_series(1,105) n;
reset role;
update public.exhibitions set start_date='2026-11-14',end_date='2026-11-15',place='Test gallery';
set local role service_role;
select set_config('test.publish1',publish('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',1,current_setting('test.select1')::jsonb,
    current_setting('test.intro1')::jsonb,false)::text,true);
select set_config('test.pub',current_setting('test.publish1')::jsonb#>>'{publications,0,publicationId}',true);
reset role;
select is((select evidence->>'schemaVersion' from publications where id=current_setting('test.pub')::uuid),'2','new publish writes schema v2');
select is((select jsonb_array_length(evidence->'approvedQa') from publications where id=current_setting('test.pub')::uuid),102,
    'all live approved QA are snapshotted without a hidden publication quota');
set local role service_role;
select set_config('test.context',load_publication_context('10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',null)::text,true);
select is(jsonb_array_length(current_setting('test.context')::jsonb->'evidence'),102,'bounded QA retrieval adds 100 candidates alongside two source excerpts');
select is(current_setting('test.context')::jsonb#>>'{narration,text}','First narration','QA never replaces approved narration');
select ok(exists(select 1 from jsonb_array_elements(current_setting('test.context')::jsonb->'evidence') e
    where e->>'id'='80000000-0000-0000-0000-000000000001'
    and e->>'contentHash'=encode(sha256(convert_to(e->>'body','UTF8')),'hex')),'QA retrieval body has a verifiable content hash');
select ok(not (get_public_artwork('10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001') ? 'approvedQa'),'public artwork response does not dump QA provenance');

-- More than 100 newer artwork QAs must not displace an approved common QA.
select ok(exists(select 1 from jsonb_array_elements(load_publication_context(
    '10000000-0000-0000-0000-000000000001',null,null)->'evidence') e
    where e->>'id'='80000000-0000-0000-0000-000000000002'),
    'common QA scope is filtered before the candidate limit');

-- A newer draft changes the next publication candidate, not this frozen version.
reset role;
insert into yeoback_private.qa_item_versions(id,version,owner_id,exhibition_id,artwork_id,origin,
    source_job_id,source_attempt,question,answer,content_hash,source_fingerprint,citations,mock)
select id,2,owner_id,exhibition_id,artwork_id,origin,source_job_id,source_attempt,'New private question','Private draft',
    content_hash,source_fingerprint,citations,mock from yeoback_private.qa_item_versions
where id='80000000-0000-0000-0000-000000000001';
set local role service_role;
select ok(not exists(select 1 from jsonb_array_elements(get_approved_qa_for_publication('00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',false)) q
    where q->>'id'='80000000-0000-0000-0000-000000000001'),'new draft excluded from next snapshot');
select is(load_publication_context('10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',null),current_setting('test.context')::jsonb,'published QA stays fixed until explicit withdrawal');

select set_config('test.sid',repeat('a',64),true);
select set_config('test.answer',reserve_visitor_request(current_setting('test.sid'),'10000000-0000-0000-0000-000000000001',
    '90000000-0000-0000-0000-000000000001',repeat('b',64),false)->>'id',true);
select is(complete_visitor_request(current_setting('test.sid'),current_setting('test.answer')::uuid,
    jsonb_build_object('answerId',current_setting('test.answer'),'requestId','90000000-0000-0000-0000-000000000001',
        'contextSequence',1,'inputMode','text','outputMode','voice','answer','Generated answer from QA.',
        'citations',jsonb_build_array('80000000-0000-0000-0000-000000000001'),'outcome','answered','source','generated','mock',false,
        'publication',jsonb_build_object('exhibitionId','10000000-0000-0000-0000-000000000001',
            'artworkId','20000000-0000-0000-0000-000000000001','publicationId',current_setting('test.pub'),'version',1)))->>'status',
    'succeeded','generated answer may cite its approved QA snapshot');
select ok(load_visitor_answer(current_setting('test.sid'),current_setting('test.answer')::uuid) is not null,'answer available before withdrawal');
select set_config('test.voice',reserve_visitor_voice(current_setting('test.sid'),'10000000-0000-0000-0000-000000000001',
    '90000000-0000-0000-0000-000000000002',repeat('c',64),'reply_audio',false,current_setting('test.answer')::uuid,repeat('d',64))->>'id',true);
set local role authenticated;
select withdraw_qa_item('80000000-0000-0000-0000-000000000001',1);
set local role service_role;
select is(load_publication_context('10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',null),null,'QA withdrawal closes the old context');
select is(load_visitor_answer(current_setting('test.sid'),current_setting('test.answer')::uuid),null,'cached answer is unavailable after QA withdrawal');
select throws_ok($$select reserve_visitor_voice(current_setting('test.sid'),'10000000-0000-0000-0000-000000000001',
    '90000000-0000-0000-0000-000000000003',repeat('e',64),'reply_audio',false,current_setting('test.answer')::uuid,repeat('d',64))$$,
    'P0002',null,'speech cannot synthesize an answer after QA withdrawal');
select is(complete_visitor_voice(current_setting('test.sid'),current_setting('test.voice')::uuid,'{}')->>'failureCode',
    'CONTENT_CHANGED','in-flight speech cannot complete after QA withdrawal');
select is(load_visitor_voice(current_setting('test.sid'),current_setting('test.voice')::uuid),null,
    'voice result cannot be loaded after dependency withdrawal');
select is(is_publication_current('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
    current_setting('test.pub')::uuid,1),false,'version check closes the revoked QA dependency');
reset role;
select * from finish();
rollback;
