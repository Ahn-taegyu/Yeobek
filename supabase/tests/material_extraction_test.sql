begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
select set_config('test.read_owner',gen_random_uuid()::text,true);
select set_config('test.read_other',gen_random_uuid()::text,true);
select set_config('test.read_exhibition',gen_random_uuid()::text,true);
select set_config('test.read_m1',gen_random_uuid()::text,true);
select set_config('test.read_m2',gen_random_uuid()::text,true);
select set_config('test.read_image',gen_random_uuid()::text,true);
select set_config('test.read_request',gen_random_uuid()::text,true);
select set_config('test.read_alias',gen_random_uuid()::text,true);
insert into auth.users(id,email) values(current_setting('test.read_owner')::uuid,'read-owner@example.invalid'),
    (current_setting('test.read_other')::uuid,'read-other@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.read_owner'),true);
select create_exhibition(current_setting('test.read_exhibition')::uuid,'Read fixture',null,null,null,'[]','[]');
select set_config('test.read_document',(select id::text from knowledge_documents where exhibition_id=current_setting('test.read_exhibition')::uuid),true);
reset role;

create function pg_temp.read_fixture(p_id uuid,p_kind text,p_hash text,p_pages integer default null) returns void language plpgsql as $$
declare reservation jsonb;
begin
    reservation:=public.request_upload(current_setting('test.read_owner')::uuid,p_id,'exhibition',current_setting('test.read_exhibition')::uuid,
        p_kind,case p_kind when 'pdf' then 'reference.pdf' else 'reference.png' end,
        case p_kind when 'pdf' then 'application/pdf' else 'image/png' end,64);
    insert into storage.objects(bucket_id,name,metadata) values('artist-materials',reservation->>'finalKey',
        jsonb_build_object('size',64,'mimetype',case p_kind when 'pdf' then 'application/pdf' else 'image/png' end));
    perform public.complete_upload(current_setting('test.read_owner')::uuid,p_id,1,p_hash,64,
        case p_kind when 'pdf' then 'application/pdf' else 'image/png' end,p_pages,
        case p_kind when 'image' then 8 end,case p_kind when 'image' then 8 end);
end;
$$;
select pg_temp.read_fixture(current_setting('test.read_m1')::uuid,'pdf',repeat('a',64),2);
select pg_temp.read_fixture(current_setting('test.read_m2')::uuid,'pdf',repeat('a',64),2);
select pg_temp.read_fixture(current_setting('test.read_image')::uuid,'image',repeat('b',64));
select ok(not has_table_privilege('authenticated','yeoback_private.material_reads','SELECT'),'raw extracted bodies are inaccessible to browser roles');
select ok(not has_function_privilege('authenticated','reserve_material_read(uuid,uuid,uuid,integer,uuid,integer,boolean)','EXECUTE'),
    'browser cannot choose owner or bypass explicit server action');
select is(jsonb_array_length(get_organize_context(current_setting('test.read_document')::uuid)->'sources'),0,'upload alone supplies no AI source');

set local role service_role;
select throws_ok($$select reserve_material_read(current_setting('test.read_other')::uuid,gen_random_uuid(),current_setting('test.read_m1')::uuid,1,
    current_setting('test.read_document')::uuid,1,true)$$,'P0002','Material not found','foreign material access is hidden');
select set_config('test.read_reservation',reserve_material_read(current_setting('test.read_owner')::uuid,current_setting('test.read_request')::uuid,
    current_setting('test.read_m1')::uuid,1,current_setting('test.read_document')::uuid,1,true)::text,true);
select set_config('test.read_id',current_setting('test.read_reservation')::jsonb#>>'{read,id}',true);
select is(current_setting('test.read_reservation')::jsonb->>'claimed','true','first hash reserves one execution');
select is(reserve_material_read(current_setting('test.read_owner')::uuid,current_setting('test.read_alias')::uuid,
    current_setting('test.read_m2')::uuid,1,current_setting('test.read_document')::uuid,1,true)->>'claimed','false','same hash waits without a second execution');
select throws_ok($$select reserve_material_read(current_setting('test.read_owner')::uuid,current_setting('test.read_request')::uuid,
    current_setting('test.read_image')::uuid,1,current_setting('test.read_document')::uuid,1,true)$$,
    'P1005','Request ID already used with different input','idempotency key is bound to exact source');
select throws_ok($$select complete_material_read(current_setting('test.read_owner')::uuid,current_setting('test.read_request')::uuid,
    current_setting('test.read_id')::uuid,'vision','[{"pageStart":1,"pageEnd":1,"unexpected":"private"}]','OK')$$,
    '22023','Invalid read chunk','missing text is rejected rather than passing NULL validation');
reset role;
update materials set state='revoked',deleted_at=clock_timestamp(),version=version+1 where id=current_setting('test.read_m1')::uuid;
set local role service_role;
select is(complete_material_read(current_setting('test.read_owner')::uuid,current_setting('test.read_request')::uuid,
    current_setting('test.read_id')::uuid,'vision','[{"pageStart":1,"pageEnd":1,"text":"Private PDF reference"}]','OK')->>'status',
    'succeeded','another valid alias survives deletion of initiating material');
set local role authenticated;
select is(get_material_read(current_setting('test.read_alias')::uuid)->>'status','succeeded','waiting alias can poll without another POST or read');
select set_config('test.read_context',get_organize_context(current_setting('test.read_document')::uuid)::text,true);
select is(current_setting('test.read_context')::jsonb#>>'{sources,0,ref,materialId}',current_setting('test.read_m2'),'alias is connected on completion');
select is(current_setting('test.read_context')::jsonb#>>'{sources,0,ref,pageStart}','1','PDF source carries exact page range');
select is(jsonb_array_length(current_setting('test.read_context')::jsonb->'sections'),0,'extracted body is not auto-applied to knowledge');
select is(current_setting('test.read_context')::jsonb->>'materialMock','true','mock provenance remains visible to worker guard');
select set_config('request.jwt.claim.sub',current_setting('test.read_other'),true);
select throws_ok($$select get_material_read(current_setting('test.read_alias')::uuid)$$,'P0002','Material read not found','foreign read polling returns not found');
select set_config('request.jwt.claim.sub',current_setting('test.read_owner'),true);
set local role service_role;
select throws_ok($$select reserve_organize_job(current_setting('test.read_owner')::uuid,gen_random_uuid(),current_setting('test.read_document')::uuid,1,false)$$,
    '22023','Mock materials cannot be used in live organization','simulated extraction cannot enter a live organization job');
reset role;
select is((select count(*)::integer from yeoback_private.material_reads where owner_id=current_setting('test.read_owner')::uuid),1,'aliases debit only one extraction');
update app_policies set value=1 where key='author_jobs_per_day';
select throws_ok($$select yeoback_private.assert_ai_quota(current_setting('test.read_owner')::uuid)$$,
    'P1004','Daily author job limit reached','reads consume the existing author daily quota');
update app_policies set value=100 where key='author_jobs_per_day';

-- Independent live cache for the same bytes is preferred without destroying mock.
select set_config('test.read_live_request',gen_random_uuid()::text,true);
select set_config('test.read_live',reserve_material_read(current_setting('test.read_owner')::uuid,current_setting('test.read_live_request')::uuid,
    current_setting('test.read_m2')::uuid,1,current_setting('test.read_document')::uuid,1,false)::text,true);
select complete_material_read(current_setting('test.read_owner')::uuid,current_setting('test.read_live_request')::uuid,
    (current_setting('test.read_live')::jsonb#>>'{read,id}')::uuid,'text_pdf','[{"pageStart":1,"pageEnd":1,"text":"Real local PDF reference"}]','OK');
select is(get_organize_context(current_setting('test.read_document')::uuid)#>>'{sources,0,text}','Real local PDF reference','real extraction takes precedence over mock');
select is((select count(*)::integer from yeoback_private.material_read_links where material_id=current_setting('test.read_m2')::uuid),2,'both modes retain their own link');

-- Image result has no PDF-only reference fields and can pass normal W2 apply.
select set_config('test.read_image_request',gen_random_uuid()::text,true);
select set_config('test.read_image_reservation',reserve_material_read(current_setting('test.read_owner')::uuid,current_setting('test.read_image_request')::uuid,
    current_setting('test.read_image')::uuid,1,current_setting('test.read_document')::uuid,1,true)::text,true);
select complete_material_read(current_setting('test.read_owner')::uuid,current_setting('test.read_image_request')::uuid,
    (current_setting('test.read_image_reservation')::jsonb#>>'{read,id}')::uuid,'vision','[{"pageStart":1,"pageEnd":1,"text":"Private reference image text"}]','OK');
select set_config('test.read_context',get_organize_context(current_setting('test.read_document')::uuid)::text,true);
select set_config('test.read_source',(select value::text from jsonb_array_elements(current_setting('test.read_context')::jsonb->'sources')
    where value#>>'{ref,materialId}'=current_setting('test.read_image')),true);
select ok(not (current_setting('test.read_source')::jsonb->'ref' ? 'pageStart'),'image source omits PDF page ranges');
select set_config('test.read_selection',jsonb_build_object('sections',jsonb_build_array(jsonb_build_object('id','introduction',
    'sourceIds',jsonb_build_array(current_setting('test.read_source')::jsonb->'id'))))::text,true);
select set_config('test.read_pins',jsonb_build_array(jsonb_build_object('id',current_setting('test.read_source')::jsonb->'id',
    'revision',1,'hash',repeat('c',64)))::text,true);
select set_config('test.read_plan',yeoback_private.organize_plan(current_setting('test.read_context')::jsonb,
    current_setting('test.read_selection')::jsonb,current_setting('test.read_pins')::jsonb)::text,true);
select set_config('test.read_job',reserve_organize_job(current_setting('test.read_owner')::uuid,gen_random_uuid(),current_setting('test.read_document')::uuid,1,true)::text,true);
select complete_organize_job(current_setting('test.read_owner')::uuid,(current_setting('test.read_job')::jsonb#>>'{job,id}')::uuid,1,
    jsonb_build_object('proposal',jsonb_build_object('id',current_setting('test.read_job')::jsonb#>'{job,id}','ownerId',current_setting('test.read_owner'),
        'documentId',current_setting('test.read_document'),'targetRevision',1,'pluginVersion','yeobek@0.13.0',
        'expiresAt',current_setting('test.read_job')::jsonb->'proposalExpiresAt',
        'selection',current_setting('test.read_selection')::jsonb,'sourcePins',current_setting('test.read_pins')::jsonb,
        'sections',current_setting('test.read_plan')::jsonb->'sections','sourceRefs',current_setting('test.read_plan')::jsonb->'sourceRefs',
        'appliedRevision',null),'resultCode','OK','routing','none','usage','[]'::jsonb,'steps','[]'::jsonb,'elapsedMs',0,'mock',true));
set local role authenticated;
select is(commit_proposal((current_setting('test.read_job')::jsonb#>>'{job,id}')::uuid,true)->>'documentRevision','2','image candidate applies only after explicit review');
select is(list_document_history(current_setting('test.read_document')::uuid,null,50)#>'{items,0,sections}','[]'::jsonb,'apply retains prior empty document in history');
reset role;
select is((select count(*)::integer from publications where owner_id=current_setting('test.read_owner')::uuid),0,'read and apply never publish a source');
select set_config('test.read_big',gen_random_uuid()::text,true);
select pg_temp.read_fixture(current_setting('test.read_big')::uuid,'pdf',repeat('d',64),21);
select throws_ok($$select reserve_material_read(current_setting('test.read_owner')::uuid,gen_random_uuid(),current_setting('test.read_big')::uuid,1,
    current_setting('test.read_document')::uuid,2,true)$$,'22023','Material page limit exceeded','default twenty-page limit is enforced in the reservation');
update app_policies set value=1 where key='material_extraction_max_pages';
select throws_ok($$select reserve_material_read(current_setting('test.read_owner')::uuid,gen_random_uuid(),current_setting('test.read_m2')::uuid,1,
    current_setting('test.read_document')::uuid,2,true)$$,'22023','Material page limit exceeded','lower persisted page policy applies to new requests including cache hits');
update app_policies set value=20 where key='material_extraction_max_pages';
set local role authenticated;
select create_artwork(current_setting('test.read_exhibition')::uuid,current_setting('test.read_exhibition')::uuid,1,'Same UUID different type',null,null,null,'[]','[]');
select set_config('test.read_wrong_doc',(select id::text from knowledge_documents where artwork_id=current_setting('test.read_exhibition')::uuid),true);
reset role;
select throws_ok($$select reserve_material_read(current_setting('test.read_owner')::uuid,gen_random_uuid(),current_setting('test.read_m2')::uuid,1,
    current_setting('test.read_wrong_doc')::uuid,1,true)$$,'P0002','Knowledge document not found','UUID collision across subject types cannot bind the wrong document');
select set_config('test.read_expired_request',gen_random_uuid()::text,true);
select set_config('test.read_expired',reserve_material_read(current_setting('test.read_owner')::uuid,current_setting('test.read_expired_request')::uuid,
    current_setting('test.read_image')::uuid,1,current_setting('test.read_document')::uuid,2,false)::text,true);
update yeoback_private.material_reads set lease_until=clock_timestamp()-interval '1 second'
    where id=(current_setting('test.read_expired')::jsonb#>>'{read,id}')::uuid;
select is(complete_material_read(current_setting('test.read_owner')::uuid,current_setting('test.read_expired_request')::uuid,
    (current_setting('test.read_expired')::jsonb#>>'{read,id}')::uuid,'vision','[{"pageStart":1,"pageEnd":1,"text":"Late text"}]','OK')->>'resultCode',
    'EXPIRED','late worker cannot store extracted text');
select is(reserve_material_read(current_setting('test.read_owner')::uuid,current_setting('test.read_expired_request')::uuid,
    current_setting('test.read_image')::uuid,1,current_setting('test.read_document')::uuid,2,false)->>'claimed','false','timeout replay does not grant another model attempt');
select * from finish();
rollback;
