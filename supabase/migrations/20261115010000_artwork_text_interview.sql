begin;

do $migration$
declare shape text;
begin
 select pg_get_expr(conbin,conrelid) into strict shape from pg_catalog.pg_constraint
 where conrelid='public.ai_jobs'::regclass and conname='ai_jobs_kind_shape';
 alter table public.ai_jobs drop constraint ai_jobs_kind_shape;
 execute format($sql$alter table public.ai_jobs add constraint ai_jobs_kind_shape check ((%s) or
 (kind='artwork_interview' and num_nonnulls(artwork_id,document_id,expected_revision,expected_document_revision)=4
 and num_nonnulls(strategy,audio_approval_id,voice_config_version,voice_fingerprint,automation_event_id,qa_exhibition_id)=0))$sql$,shape);
end $migration$;

create table public.artwork_interview_questions (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null, artwork_id uuid not null,
 slot integer not null check(slot between 1 and 5), question text not null check(char_length(question) between 1 and 500 and question ~ '[^[:space:]]'),
 status text not null default 'pending' check(status in ('pending','answered','skipped','approved')),
 version integer not null default 1 check(version>0), evidence_id uuid,
 created_at timestamptz not null default statement_timestamp(),
 unique(owner_id,artwork_id,slot), unique(owner_id,id),
 foreign key(owner_id,artwork_id) references public.artworks(owner_id,id),
 check ((status in ('answered','approved')) = (evidence_id is not null))
);
create table public.artwork_interview_answers (
 owner_id uuid not null, question_id uuid primary key, body text not null
 check(char_length(body) between 1 and 2000 and body ~ '[^[:space:]]'),
 foreign key(owner_id,question_id) references public.artwork_interview_questions(owner_id,id)
);
-- Preserve provenance even after an answer is edited or skipped, so an old
-- evidence identifier cannot later be approved through the generic API.
create table yeoback_private.artwork_interview_evidence (
 owner_id uuid not null, question_id uuid not null, evidence_id uuid primary key,
 foreign key(owner_id,question_id) references public.artwork_interview_questions(owner_id,id)
);
alter table yeoback_private.artwork_interview_evidence enable row level security;
revoke all on yeoback_private.artwork_interview_evidence from public,anon,authenticated,service_role;
alter table public.artwork_interview_questions enable row level security;
alter table public.artwork_interview_answers enable row level security;
revoke all on public.artwork_interview_questions,public.artwork_interview_answers from public,anon,authenticated,service_role;
grant select on public.artwork_interview_questions,public.artwork_interview_answers to authenticated;
create policy interview_owner_read on public.artwork_interview_questions for select to authenticated using
 (owner_id=(select auth.uid()) and exists(select 1 from public.artworks a join public.exhibitions e on e.id=a.exhibition_id
 where a.id=artwork_interview_questions.artwork_id and a.owner_id=artwork_interview_questions.owner_id and a.deleted_at is null and e.deleted_at is null));
create policy interview_answer_owner_read on public.artwork_interview_answers for select to authenticated using
 (owner_id=(select auth.uid()) and exists(select 1 from public.artwork_interview_questions q
 where q.owner_id=artwork_interview_answers.owner_id and q.id=artwork_interview_answers.question_id));

create or replace function yeoback_private.assert_ai_quota(p_owner uuid)
returns void language plpgsql set search_path='' as $$
declare day_start timestamptz := date_trunc('day',clock_timestamp(),'UTC');
begin
 if (select count(*) from public.ai_job_attempts a join public.ai_jobs j on j.id=a.job_id
 where a.owner_id=p_owner and j.kind in ('narration','audio','organize','expected_qa','preview_answer','qa_rewrite','artwork_interview')
 and a.reserved_at>=day_start and a.reserved_at<day_start+interval '24 hours')
 + (select count(*) from yeoback_private.material_reads r where r.owner_id=p_owner
 and r.reserved_at>=day_start and r.reserved_at<day_start+interval '24 hours')
 >= yeoback_private.policy_integer('author_jobs_per_day') then
 raise exception 'Daily author job limit reached' using errcode='P1004'; end if;
end $$;

-- Add only explicitly approved interview evidence to narration, with versioned
-- identities in the same fingerprint used by reservation and completion.
alter function yeoback_private.narration_inputs(uuid,uuid,boolean) rename to narration_inputs_before_interview;
create function yeoback_private.narration_inputs(p_owner uuid,p_artwork_id uuid,p_edit boolean default false)
returns jsonb language plpgsql set search_path='' as $$
declare inputs jsonb; sources jsonb:='[]'; pins jsonb:='[]'; e public.evidence_items%rowtype;
 scope uuid[]; source jsonb; used integer:=0;
begin
 perform yeoback_private.lock_publication(p_owner);
 inputs:=yeoback_private.narration_inputs_before_interview(p_owner,p_artwork_id,p_edit);
 scope:=yeoback_private.subject_scope(p_owner,'artwork',p_artwork_id);
 for e in select evidence.* from public.evidence_items evidence
 join public.artwork_interview_questions q on q.evidence_id=evidence.id and q.owner_id=evidence.owner_id
 where q.owner_id=p_owner and q.artwork_id=p_artwork_id and q.status='approved'
 and yeoback_private.evidence_is_current(evidence) order by q.slot for share of evidence
 loop
  pins:=pins||jsonb_build_array(jsonb_build_array(e.id,e.version,encode(e.content_hash,'hex')));
  if jsonb_array_length(sources)<12 and used+char_length(e.body)<=8000 then
   sources:=sources||jsonb_build_array(jsonb_build_object('id',e.id,'owner_id',p_owner,'artist_id',scope[1],
    'subject_type','artwork','subject_id',p_artwork_id,'exhibition_id',scope[2],
    'revision',e.version,'text',e.body,'ref',jsonb_build_object('kind','direct','section_id','description')));
   used:=used+char_length(e.body);
  end if;
 end loop;
 if pins='[]' then return inputs; end if;
 for source in select value from jsonb_array_elements(inputs->'context'->'sources') loop
  if jsonb_array_length(sources)<12 and used+char_length(source->>'text')<=8000 then
   sources:=sources||jsonb_build_array(source); used:=used+char_length(source->>'text');
  end if;
 end loop;
 inputs:=jsonb_set(inputs,'{fingerprint}',(inputs->'fingerprint')||jsonb_build_array(pins));
 return jsonb_set(inputs,'{context,sources}',sources);
end $$;
revoke all on function yeoback_private.narration_inputs_before_interview(uuid,uuid,boolean),
 yeoback_private.narration_inputs(uuid,uuid,boolean) from public,anon,authenticated,service_role;

create function yeoback_private.interview_inputs(p_owner uuid,p_artwork_id uuid)
returns jsonb language plpgsql set search_path='' as $$
declare inputs jsonb; a public.artworks%rowtype; m public.materials%rowtype; prior jsonb;
begin
 inputs:=yeoback_private.narration_inputs(p_owner,p_artwork_id);
 select * into strict a from public.artworks where owner_id=p_owner and id=p_artwork_id for share;
 select * into m from public.materials where id=a.image_material_id and owner_id=p_owner and artwork_id=a.id
 and deleted_at is null and state='ready' and kind='image' and content_hash is not null and storage_key is not null for share;
 if not found then raise exception 'Representative image unavailable' using errcode='P1002'; end if;
 select coalesce(jsonb_agg(question order by slot),'[]') into prior from public.artwork_interview_questions
 where owner_id=p_owner and artwork_id=p_artwork_id;
 return jsonb_build_object('fingerprint',jsonb_build_array(inputs->'fingerprint',m.id,m.version,encode(m.content_hash,'hex'),prior),
 'artworkRevision',inputs->'artwork_revision','documentId',inputs->'document_id','documentRevision',inputs->'document_revision',
 'context',jsonb_build_object('image',jsonb_build_object('id',m.id,'version',m.version,'storageKey',m.storage_key,
 'contentType',m.content_type,'byteSize',m.byte_size,'contentHash',encode(m.content_hash,'hex')),
 'sources',yeoback_private.narration_camelize(inputs->'context'->'sources'),
 'priorQuestions',prior,'maxQuestions',5-jsonb_array_length(prior)));
end $$;

create function yeoback_private.interview_list(p_owner uuid,p_artwork_id uuid)
returns jsonb language plpgsql set search_path='' as $$
declare a public.artworks%rowtype; questions jsonb; ready boolean;
begin
 perform yeoback_private.subject_scope(p_owner,'artwork',p_artwork_id);
 select * into strict a from public.artworks where owner_id=p_owner and id=p_artwork_id and deleted_at is null;
 select exists(select 1 from public.materials m where m.id=a.image_material_id and m.owner_id=p_owner
 and m.artwork_id=a.id and m.kind='image' and m.state='ready' and m.deleted_at is null
 and m.content_hash is not null and m.storage_key is not null) into ready;
 select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'slot',q.slot,'question',q.question,'answer',answer.body,
 'status',q.status,'version',q.version,'evidenceId',q.evidence_id) order by q.slot),'[]') into questions
 from public.artwork_interview_questions q left join public.artwork_interview_answers answer on answer.owner_id=q.owner_id and answer.question_id=q.id
 where q.owner_id=p_owner and q.artwork_id=p_artwork_id;
 return jsonb_build_object('exhibitionId',a.exhibition_id,'artworkTitle',a.title,'imageReady',ready,'questions',questions);
end $$;

create function public.list_artwork_interview(p_artwork_id uuid) returns jsonb
language sql security definer set search_path='' as $$
 select yeoback_private.interview_list(yeoback_private.require_owner(),p_artwork_id)
$$;

create function public.reserve_artwork_interview(p_owner uuid,p_request_id uuid,p_artwork_id uuid,p_mock boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.ai_jobs%rowtype; inputs jsonb; replay public.ai_job_attempts%rowtype;
begin
 if p_owner is null or p_request_id is null or p_artwork_id is null or p_mock is null then
 raise exception 'Invalid input' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('yeobek:ai-jobs:'||p_owner::text,0));
 perform yeoback_private.subject_scope(p_owner,'artwork',p_artwork_id);
 select * into replay from public.ai_job_attempts where owner_id=p_owner and request_id=p_request_id;
 if found then
  select * into strict job from public.ai_jobs where id=replay.job_id;
  if job.kind<>'artwork_interview' or job.artwork_id<>p_artwork_id or job.mock is distinct from p_mock then
   raise exception 'Request ID already used' using errcode='P1005'; end if;
  if job.expires_at<=statement_timestamp() then raise exception 'Job not found' using errcode='P0002'; end if;
  return jsonb_build_object('job',yeoback_private.ai_job_json(job),'claimed',false,'context',null);
 end if;
 inputs:=yeoback_private.interview_inputs(p_owner,p_artwork_id);
 if (inputs#>>'{context,maxQuestions}')::integer<=0 then raise exception 'Interview is full' using errcode='P1006'; end if;
 if exists(select 1 from public.ai_jobs where owner_id=p_owner and artwork_id=p_artwork_id and kind='artwork_interview'
 and status='running' and lease_until>statement_timestamp()) then raise exception 'Interview already running' using errcode='P1006'; end if;
 perform yeoback_private.assert_ai_quota(p_owner);
 insert into public.ai_jobs(owner_id,artwork_id,document_id,request_id,expected_revision,expected_document_revision,
 kind,source_fingerprint,source_ids,mock,lease_until,expires_at)
 values(p_owner,p_artwork_id,(inputs->>'documentId')::uuid,p_request_id,(inputs->>'artworkRevision')::integer,
 (inputs->>'documentRevision')::integer,'artwork_interview',inputs->'fingerprint','[]',p_mock,
 statement_timestamp()+yeoback_private.policy_integer('job_lease_seconds')*interval '1 second',
 statement_timestamp()+yeoback_private.policy_integer('job_retention_days')*interval '1 day') returning * into job;
 insert into public.ai_job_attempts(owner_id,job_id,attempt,request_id) values(p_owner,job.id,1,p_request_id);
 return jsonb_build_object('job',yeoback_private.ai_job_json(job),'claimed',true,'context',inputs->'context');
end $$;

create function public.complete_artwork_interview(p_owner uuid,p_job_id uuid,p_attempt integer,p_result jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.ai_jobs%rowtype; inputs jsonb; q jsonb; slot_no integer; code text; status_value text;
 fingerprint bytea:=sha256(convert_to(coalesce(p_result,'null')::text,'UTF8')); saved bytea;
begin
 select * into job from public.ai_jobs where owner_id=p_owner and id=p_job_id and kind='artwork_interview' for update;
 if not found or job.expires_at<=statement_timestamp() then raise exception 'Job not found' using errcode='P0002'; end if;
 perform yeoback_private.subject_scope(p_owner,'artwork',job.artwork_id);
 if p_attempt is distinct from job.attempt then raise exception 'Attempt conflict' using errcode='P1006'; end if;
 if job.status<>'running' then
  select completion_fingerprint into saved from public.ai_job_attempts where job_id=job.id and attempt=job.attempt;
  if saved is distinct from fingerprint then raise exception 'Completion conflict' using errcode='P1006'; end if;
  return jsonb_build_object('job',yeoback_private.ai_job_json(job),'questions',yeoback_private.interview_list(p_owner,job.artwork_id)->'questions');
 end if;
 if job.lease_until<=statement_timestamp() then raise exception 'Lease expired' using errcode='P1006'; end if;
 if p_result->>'status'='succeeded' then
  if jsonb_typeof(p_result->'questions') is distinct from 'array' or p_result->'mock' is distinct from to_jsonb(job.mock)
  or jsonb_array_length(p_result->'questions') > 5
  or exists(select 1 from jsonb_array_elements(p_result->'questions') x where jsonb_typeof(x)<>'string'
    or char_length(x#>>'{}')>500 or (x#>>'{}') !~ '[^[:space:]]')
  or (select count(distinct lower(btrim(x#>>'{}'))) from jsonb_array_elements(p_result->'questions') x)<>jsonb_array_length(p_result->'questions')
  then raise exception 'Invalid questions' using errcode='22023'; end if;
  begin
   inputs:=yeoback_private.interview_inputs(p_owner,job.artwork_id);
  exception when sqlstate 'P1002' then inputs:=null;
  end;
  if inputs->'fingerprint' is distinct from job.source_fingerprint then status_value:='failed'; code:='REVISION_CONFLICT';
  elsif jsonb_array_length(p_result->'questions')>(inputs#>>'{context,maxQuestions}')::integer
  or exists(select 1 from jsonb_array_elements_text(p_result->'questions') x join public.artwork_interview_questions old
   on old.owner_id=p_owner and old.artwork_id=job.artwork_id and lower(btrim(old.question))=lower(btrim(x))) then
   raise exception 'Question limit or duplicate' using errcode='22023';
  else
   for q in select value from jsonb_array_elements(p_result->'questions') loop
    select s into slot_no from generate_series(1,5) s where not exists(select 1 from public.artwork_interview_questions
     where owner_id=p_owner and artwork_id=job.artwork_id and slot=s) order by s limit 1;
    insert into public.artwork_interview_questions(owner_id,artwork_id,slot,question) values(p_owner,job.artwork_id,slot_no,btrim(q#>>'{}'));
   end loop;
   status_value:='succeeded'; code:='OK';
  end if;
 elsif p_result->>'status' in ('failed','cancelled') and p_result->>'resultCode' ~ '^[A-Z][A-Z0-9_]{0,63}$' then
  status_value:=p_result->>'status'; code:=p_result->>'resultCode';
 else raise exception 'Invalid result' using errcode='22023'; end if;
 update public.ai_jobs set status=status_value,result_code=code,routing=case when status_value='succeeded' then 'none' else 'operator' end,
 updated_at=statement_timestamp() where id=job.id returning * into job;
 update public.ai_job_attempts set completed_at=statement_timestamp(),result_code=code,completion_fingerprint=fingerprint,
 usage=case when jsonb_typeof(p_result->'usage')='array' and octet_length(p_result->>'usage')<=16384 then p_result->'usage' end,
 steps=case when jsonb_typeof(p_result->'steps')='array' and octet_length(p_result->>'steps')<=16384 then p_result->'steps' end,
 duration_ms=case when p_result->>'elapsedMs' ~ '^[0-9]{1,8}$' then (p_result->>'elapsedMs')::integer end
 where job_id=job.id and attempt=job.attempt;
 return jsonb_build_object('job',yeoback_private.ai_job_json(job),'questions',yeoback_private.interview_list(p_owner,job.artwork_id)->'questions');
end $$;

create function public.save_artwork_interview_answer(p_artwork_id uuid,p_question_id uuid,p_expected_version integer,
 p_answer text,p_skip boolean,p_approve boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner uuid:=yeoback_private.require_owner(); q public.artwork_interview_questions%rowtype; saved_answer text;
 a public.artworks%rowtype; evidence uuid; ev_version integer;
begin
 perform yeoback_private.lock_publication(owner);
 perform yeoback_private.subject_scope(owner,'artwork',p_artwork_id);
 select * into q from public.artwork_interview_questions where owner_id=owner and artwork_id=p_artwork_id and id=p_question_id for update;
 if not found then raise exception 'Question not found' using errcode='P0002'; end if;
 select body into saved_answer from public.artwork_interview_answers where owner_id=owner and question_id=q.id;
 if p_expected_version is distinct from q.version then raise exception 'Question version conflict' using errcode='40001'; end if;
 if p_skip is null or p_approve is null or (p_skip and p_approve) or
 ((p_skip or p_approve) and p_answer is not null) or (not p_skip and not p_approve and (p_answer is null or p_answer !~ '[^[:space:]]' or char_length(p_answer)>2000)) then
  raise exception 'Invalid answer' using errcode='22023'; end if;
 if p_approve and q.status<>'answered' then
  raise exception 'Save answer before approval' using errcode='40001'; end if;
 select * into strict a from public.artworks where owner_id=owner and id=p_artwork_id;
 if q.evidence_id is not null then
  select coalesce(max(version),0) into ev_version from public.evidence_items where owner_id=owner and id=q.evidence_id;
 end if;
 if p_approve then
  if not exists(select 1 from public.evidence_items where owner_id=owner and id=q.evidence_id and version=ev_version
   and state='draft' and body=saved_answer) then raise exception 'Evidence version conflict' using errcode='40001'; end if;
  update public.evidence_items set state='approved',approved_at=statement_timestamp() where owner_id=owner and id=q.evidence_id and version=ev_version;
  update public.artwork_interview_questions set status='approved',version=version+1 where id=q.id;
 else
  if q.evidence_id is not null then
   insert into public.evidence_items(id,version,owner_id,exhibition_id,artwork_id,scope,source_label,body,content_hash,source_kind,state,withdrawn_at)
   select id,ev_version+1,owner_id,exhibition_id,artwork_id,scope,source_label,body,content_hash,source_kind,'withdrawn',statement_timestamp()
   from public.evidence_items where owner_id=owner and id=q.evidence_id and version=ev_version;
  end if;
  if not p_skip then
   evidence:=gen_random_uuid();
   insert into public.evidence_items(id,version,owner_id,exhibition_id,artwork_id,scope,source_label,body,content_hash,source_kind)
   values(evidence,1,owner,a.exhibition_id,a.id,'artwork','작품 인터뷰 답변',p_answer,sha256(convert_to(p_answer,'UTF8')),'direct');
   insert into yeoback_private.artwork_interview_evidence(owner_id,question_id,evidence_id) values(owner,q.id,evidence);
   insert into public.artwork_interview_answers(owner_id,question_id,body) values(owner,q.id,p_answer)
   on conflict(question_id) do update set body=excluded.body;
  else
   delete from public.artwork_interview_answers where owner_id=owner and question_id=q.id;
  end if;
  update public.artwork_interview_questions set status=case when p_skip then 'skipped' else 'answered' end,
   evidence_id=evidence,version=version+1 where id=q.id;
 end if;
 return yeoback_private.interview_list(owner,p_artwork_id);
end $$;

-- Interview drafts can only be approved through the version-checked interview action.
alter function public.approve_evidence(uuid,integer) rename to approve_evidence_before_interview;
alter function public.approve_evidence_before_interview(uuid,integer) set schema yeoback_private;
revoke all on function yeoback_private.approve_evidence_before_interview(uuid,integer) from public,anon,authenticated,service_role;
create function public.approve_evidence(p_evidence_id uuid,p_version integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner uuid:=yeoback_private.require_owner();
begin
 perform yeoback_private.lock_publication(owner);
 if exists(select 1 from yeoback_private.artwork_interview_evidence where owner_id=owner and evidence_id=p_evidence_id) then
  raise exception 'Approve this evidence in the interview' using errcode='P1006';
 end if;
 return yeoback_private.approve_evidence_before_interview(p_evidence_id,p_version);
end $$;
revoke all on function public.approve_evidence(uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.approve_evidence(uuid,integer) to authenticated;

revoke all on function yeoback_private.interview_inputs(uuid,uuid),yeoback_private.interview_list(uuid,uuid),
 public.list_artwork_interview(uuid),public.reserve_artwork_interview(uuid,uuid,uuid,boolean),
 public.complete_artwork_interview(uuid,uuid,integer,jsonb),public.save_artwork_interview_answer(uuid,uuid,integer,text,boolean,boolean)
 from public,anon,authenticated,service_role;
grant execute on function public.list_artwork_interview(uuid),public.save_artwork_interview_answer(uuid,uuid,integer,text,boolean,boolean) to authenticated;
grant execute on function public.reserve_artwork_interview(uuid,uuid,uuid,boolean),public.complete_artwork_interview(uuid,uuid,integer,jsonb) to service_role;

commit;
