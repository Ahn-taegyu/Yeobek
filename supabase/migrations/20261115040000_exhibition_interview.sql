begin;

-- Exhibition-level chat interview (SRC-073): 10 questions first, 5 required, then 5 more each time the artist continues.
insert into public.app_policies(key,value) values
 ('exhibition_interview_initial',10),('exhibition_interview_batch',5),('exhibition_interview_required',5),('exhibition_interview_max',50)
on conflict (key) do nothing;

do $migration$
declare shape text;
begin
 select pg_get_expr(conbin,conrelid) into strict shape from pg_catalog.pg_constraint
 where conrelid='public.ai_jobs'::regclass and conname='ai_jobs_kind_shape';
 alter table public.ai_jobs drop constraint ai_jobs_kind_shape;
 execute format($sql$alter table public.ai_jobs add constraint ai_jobs_kind_shape check ((%s) or
 (kind='exhibition_interview' and num_nonnulls(qa_exhibition_id,document_id,expected_revision,expected_document_revision)=4
 and num_nonnulls(artwork_id,strategy,audio_approval_id,voice_config_version,voice_fingerprint,automation_event_id)=0))$sql$,shape);
end $migration$;

create table public.exhibition_interview_questions (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null, exhibition_id uuid not null,
 seq integer not null check(seq between 1 and 100),
 question text not null check(char_length(question) between 1 and 500 and question ~ '[^[:space:]]'),
 answer text check(answer is null or (char_length(answer) between 1 and 2000 and answer ~ '[^[:space:]]')),
 status text not null default 'pending' check(status in ('pending','answered','skipped')),
 version integer not null default 1 check(version>0), evidence_id uuid,
 created_at timestamptz not null default statement_timestamp(), answered_at timestamptz,
 unique(owner_id,exhibition_id,seq), unique(owner_id,id),
 foreign key(owner_id,exhibition_id) references public.exhibitions(owner_id,id),
 check((status='answered') = (answer is not null and evidence_id is not null))
);
alter table public.exhibition_interview_questions enable row level security;
revoke all on public.exhibition_interview_questions from public,anon,authenticated,service_role;
grant select on public.exhibition_interview_questions to authenticated;
create policy exhibition_interview_owner_read on public.exhibition_interview_questions for select to authenticated using
 (owner_id=(select auth.uid()) and exists(select 1 from public.exhibitions e
 where e.id=exhibition_interview_questions.exhibition_id and e.owner_id=exhibition_interview_questions.owner_id and e.deleted_at is null));

create function yeoback_private.exhibition_interview_inputs(p_owner uuid,p_exhibition uuid)
returns jsonb language plpgsql set search_path='' as $$
declare inputs jsonb; prior jsonb; works jsonb; total integer; pending integer; max_questions integer;
begin
 inputs:=yeoback_private.qa_inputs(p_owner,p_exhibition,null);
 select coalesce(jsonb_agg(jsonb_build_object('question',q.question,'answer',q.answer) order by q.seq),'[]'),
  count(*),count(*) filter (where q.status='pending')
 into prior,total,pending from public.exhibition_interview_questions q where q.owner_id=p_owner and q.exhibition_id=p_exhibition;
 select coalesce(jsonb_agg(jsonb_build_object('number',coalesce(a.draft_number,a.number),'title',a.title)
  order by coalesce(a.draft_number,a.number)),'[]') into works
 from public.artworks a where a.owner_id=p_owner and a.exhibition_id=p_exhibition and a.deleted_at is null;
 max_questions:=least(case when total=0 then yeoback_private.policy_integer('exhibition_interview_initial')
  else yeoback_private.policy_integer('exhibition_interview_batch') end,
  yeoback_private.policy_integer('exhibition_interview_max')-total);
 -- Only exhibition and document revisions: saving answers (approved evidence) must not invalidate a running generation.
 return jsonb_build_object('fingerprint',jsonb_build_array(inputs#>'{context,revision}',inputs#>'{context,documentRevision}',total),
  'exhibitionRevision',inputs#>'{context,revision}','documentId',inputs#>'{context,documentId}',
  'documentRevision',inputs#>'{context,documentRevision}','total',total,'pending',pending,
  'context',jsonb_build_object('sources',coalesce((select jsonb_agg(jsonb_build_object('text',s->>'body')) from jsonb_array_elements(inputs#>'{context,sources}') s),'[]'),
   'artworks',works,'priorQuestions',prior,'maxQuestions',greatest(max_questions,0)));
end $$;

create function yeoback_private.exhibition_interview_list(p_owner uuid,p_exhibition uuid)
returns jsonb language plpgsql set search_path='' as $$
declare e public.exhibitions%rowtype; questions jsonb; running boolean;
begin
 perform yeoback_private.qa_scope(p_owner,p_exhibition,null);
 select * into strict e from public.exhibitions where owner_id=p_owner and id=p_exhibition and deleted_at is null;
 select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'seq',q.seq,'question',q.question,'answer',q.answer,
  'status',q.status,'version',q.version) order by q.seq),'[]') into questions
 from public.exhibition_interview_questions q where q.owner_id=p_owner and q.exhibition_id=p_exhibition;
 select exists(select 1 from public.ai_jobs where owner_id=p_owner and qa_exhibition_id=p_exhibition and kind='exhibition_interview'
  and status='running' and lease_until>statement_timestamp()) into running;
 return jsonb_build_object('exhibitionId',e.id,'requiredCount',yeoback_private.policy_integer('exhibition_interview_required'),
  'batchSize',yeoback_private.policy_integer('exhibition_interview_batch'),'generating',running,'questions',questions);
end $$;

create function public.list_exhibition_interview(p_exhibition_id uuid) returns jsonb
language sql security definer set search_path='' as $$
 select yeoback_private.exhibition_interview_list(yeoback_private.require_owner(),p_exhibition_id)
$$;

create function public.reserve_exhibition_interview(p_owner uuid,p_request_id uuid,p_exhibition_id uuid,p_mock boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.ai_jobs%rowtype; inputs jsonb; replay public.ai_job_attempts%rowtype;
begin
 if p_owner is null or p_request_id is null or p_exhibition_id is null or p_mock is null then
  raise exception 'Invalid input' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('yeobek:ai-jobs:'||p_owner::text,0));
 perform yeoback_private.qa_scope(p_owner,p_exhibition_id,null);
 select * into replay from public.ai_job_attempts where owner_id=p_owner and request_id=p_request_id;
 if found then
  select * into strict job from public.ai_jobs where id=replay.job_id;
  if job.kind<>'exhibition_interview' or job.qa_exhibition_id<>p_exhibition_id or job.mock is distinct from p_mock then
   raise exception 'Request ID already used' using errcode='P1005'; end if;
  if job.expires_at<=statement_timestamp() then raise exception 'Job not found' using errcode='P0002'; end if;
  return jsonb_build_object('job',yeoback_private.ai_job_json(job),'claimed',false,'context',null);
 end if;
 inputs:=yeoback_private.exhibition_interview_inputs(p_owner,p_exhibition_id);
 if (inputs#>>'{context,maxQuestions}')::integer<=0 then raise exception 'Interview is full' using errcode='P1006'; end if;
 -- Keep at most one batch ahead of the artist: generate only when the remaining pending questions fit in a batch.
 if (inputs->>'pending')::integer>yeoback_private.policy_integer('exhibition_interview_batch') then
  raise exception 'Questions already prepared' using errcode='P1006'; end if;
 if exists(select 1 from public.ai_jobs where owner_id=p_owner and qa_exhibition_id=p_exhibition_id and kind='exhibition_interview'
  and status='running' and lease_until>statement_timestamp()) then raise exception 'Interview already running' using errcode='P1006'; end if;
 perform yeoback_private.assert_ai_quota(p_owner);
 insert into public.ai_jobs(owner_id,qa_exhibition_id,document_id,request_id,expected_revision,expected_document_revision,
  kind,source_fingerprint,source_ids,mock,lease_until,expires_at)
 values(p_owner,p_exhibition_id,(inputs->>'documentId')::uuid,p_request_id,(inputs->>'exhibitionRevision')::integer,
  (inputs->>'documentRevision')::integer,'exhibition_interview',inputs->'fingerprint','[]',p_mock,
  statement_timestamp()+yeoback_private.policy_integer('job_lease_seconds')*interval '1 second',
  statement_timestamp()+yeoback_private.policy_integer('job_retention_days')*interval '1 day') returning * into job;
 insert into public.ai_job_attempts(owner_id,job_id,attempt,request_id) values(p_owner,job.id,1,p_request_id);
 return jsonb_build_object('job',yeoback_private.ai_job_json(job),'claimed',true,'context',inputs->'context');
end $$;

create function public.complete_exhibition_interview(p_owner uuid,p_job_id uuid,p_attempt integer,p_result jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.ai_jobs%rowtype; inputs jsonb; q jsonb; next_seq integer; code text; status_value text;
 fingerprint bytea:=sha256(convert_to(coalesce(p_result,'null')::text,'UTF8')); saved bytea;
begin
 select * into job from public.ai_jobs where owner_id=p_owner and id=p_job_id and kind='exhibition_interview' for update;
 if not found or job.expires_at<=statement_timestamp() then raise exception 'Job not found' using errcode='P0002'; end if;
 perform yeoback_private.qa_scope(p_owner,job.qa_exhibition_id,null);
 if p_attempt is distinct from job.attempt then raise exception 'Attempt conflict' using errcode='P1006'; end if;
 if job.status<>'running' then
  select completion_fingerprint into saved from public.ai_job_attempts where job_id=job.id and attempt=job.attempt;
  if saved is distinct from fingerprint then raise exception 'Completion conflict' using errcode='P1006'; end if;
  return jsonb_build_object('job',yeoback_private.ai_job_json(job),'interview',yeoback_private.exhibition_interview_list(p_owner,job.qa_exhibition_id));
 end if;
 if job.lease_until<=statement_timestamp() then raise exception 'Lease expired' using errcode='P1006'; end if;
 if p_result->>'status'='succeeded' then
  if jsonb_typeof(p_result->'questions') is distinct from 'array' or p_result->'mock' is distinct from to_jsonb(job.mock)
  or jsonb_array_length(p_result->'questions')>yeoback_private.policy_integer('exhibition_interview_initial')
  or exists(select 1 from jsonb_array_elements(p_result->'questions') x where jsonb_typeof(x)<>'string'
   or char_length(x#>>'{}')>500 or (x#>>'{}') !~ '[^[:space:]]')
  or (select count(distinct lower(btrim(x#>>'{}'))) from jsonb_array_elements(p_result->'questions') x)<>jsonb_array_length(p_result->'questions')
  then raise exception 'Invalid questions' using errcode='22023'; end if;
  inputs:=yeoback_private.exhibition_interview_inputs(p_owner,job.qa_exhibition_id);
  if inputs->'fingerprint' is distinct from job.source_fingerprint then status_value:='failed'; code:='REVISION_CONFLICT';
  elsif jsonb_array_length(p_result->'questions')>(inputs#>>'{context,maxQuestions}')::integer
  or exists(select 1 from jsonb_array_elements_text(p_result->'questions') x join public.exhibition_interview_questions old
   on old.owner_id=p_owner and old.exhibition_id=job.qa_exhibition_id and lower(btrim(old.question))=lower(btrim(x))) then
   raise exception 'Question limit or duplicate' using errcode='22023';
  else
   select coalesce(max(seq),0) into next_seq from public.exhibition_interview_questions where owner_id=p_owner and exhibition_id=job.qa_exhibition_id;
   for q in select value from jsonb_array_elements(p_result->'questions') loop
    next_seq:=next_seq+1;
    insert into public.exhibition_interview_questions(owner_id,exhibition_id,seq,question) values(p_owner,job.qa_exhibition_id,next_seq,btrim(q#>>'{}'));
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
 return jsonb_build_object('job',yeoback_private.ai_job_json(job),'interview',yeoback_private.exhibition_interview_list(p_owner,job.qa_exhibition_id));
end $$;

-- Answers are the artist's own words, so saving one records approved exhibition evidence directly.
create function public.save_exhibition_interview_answer(p_exhibition_id uuid,p_question_id uuid,p_expected_version integer,
 p_answer text,p_skip boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare owner uuid:=yeoback_private.require_owner(); q public.exhibition_interview_questions%rowtype; evidence uuid; body text;
begin
 perform yeoback_private.lock_publication(owner);
 perform yeoback_private.qa_scope(owner,p_exhibition_id,null);
 select * into q from public.exhibition_interview_questions where owner_id=owner and exhibition_id=p_exhibition_id and id=p_question_id for update;
 if not found then raise exception 'Question not found' using errcode='P0002'; end if;
 if p_expected_version is distinct from q.version then raise exception 'Question version conflict' using errcode='40001'; end if;
 body:=btrim(p_answer);
 if p_skip is null or (not p_skip and (body is null or char_length(body) not between 1 and 2000 or body !~ '[^[:space:]]'))
  or (p_skip and p_answer is not null) then raise exception 'Invalid answer' using errcode='22023'; end if;
 if q.evidence_id is not null then
  insert into public.evidence_items(id,version,owner_id,exhibition_id,artwork_id,scope,source_label,body,content_hash,source_kind,state,withdrawn_at)
  select e.id,e.version+1,e.owner_id,e.exhibition_id,e.artwork_id,e.scope,e.source_label,e.body,e.content_hash,e.source_kind,'withdrawn',statement_timestamp()
  from public.evidence_items e where e.owner_id=owner and e.id=q.evidence_id
  and e.version=(select max(version) from public.evidence_items where owner_id=owner and id=q.evidence_id) and e.state<>'withdrawn';
 end if;
 if p_skip then
  update public.exhibition_interview_questions set status='skipped',answer=null,evidence_id=null,answered_at=statement_timestamp(),version=version+1 where id=q.id;
 else
  evidence:=gen_random_uuid();
  insert into public.evidence_items(id,version,owner_id,exhibition_id,artwork_id,scope,source_label,body,content_hash,source_kind,state,approved_at)
  values(evidence,1,owner,p_exhibition_id,null,'exhibition',left('작가 인터뷰 · '||q.question,200),body,sha256(convert_to(body,'UTF8')),'direct','approved',statement_timestamp());
  update public.exhibition_interview_questions set status='answered',answer=body,evidence_id=evidence,answered_at=statement_timestamp(),version=version+1 where id=q.id;
 end if;
 return yeoback_private.exhibition_interview_list(owner,p_exhibition_id);
end $$;

create or replace function yeoback_private.assert_ai_quota(p_owner uuid)
returns void language plpgsql set search_path='' as $$
declare day_start timestamptz := date_trunc('day',clock_timestamp(),'UTC');
begin
 if (select count(*) from public.ai_job_attempts a join public.ai_jobs j on j.id=a.job_id
 where a.owner_id=p_owner and j.kind in ('narration','audio','organize','expected_qa','preview_answer','qa_rewrite','artwork_interview','exhibition_interview')
 and a.reserved_at>=day_start and a.reserved_at<day_start+interval '24 hours')
 + (select count(*) from yeoback_private.material_reads r where r.owner_id=p_owner
 and r.reserved_at>=day_start and r.reserved_at<day_start+interval '24 hours')
 >= yeoback_private.policy_integer('author_jobs_per_day') then
 raise exception 'Daily author job limit reached' using errcode='P1004'; end if;
end $$;

revoke all on function yeoback_private.exhibition_interview_inputs(uuid,uuid),yeoback_private.exhibition_interview_list(uuid,uuid),
 public.list_exhibition_interview(uuid),public.reserve_exhibition_interview(uuid,uuid,uuid,boolean),
 public.complete_exhibition_interview(uuid,uuid,integer,jsonb),public.save_exhibition_interview_answer(uuid,uuid,integer,text,boolean)
 from public,anon,authenticated,service_role;
grant execute on function public.list_exhibition_interview(uuid),public.save_exhibition_interview_answer(uuid,uuid,integer,text,boolean) to authenticated;
grant execute on function public.reserve_exhibition_interview(uuid,uuid,uuid,boolean),public.complete_exhibition_interview(uuid,uuid,integer,jsonb) to service_role;

commit;

-- Retraining uses answered interview evidence. Expected Q&A inputs already include approved evidence;
-- append it to narration inputs with versioned identities in the fingerprint, as the artwork interview does.
alter function yeoback_private.narration_inputs(uuid,uuid,boolean) rename to narration_inputs_before_exhibition_interview;
create function yeoback_private.narration_inputs(p_owner uuid,p_artwork_id uuid,p_edit boolean default false)
returns jsonb language plpgsql set search_path='' as $$
declare inputs jsonb; sources jsonb; pins jsonb:='[]'; e public.evidence_items%rowtype; subject uuid[]; used integer;
begin
 inputs:=yeoback_private.narration_inputs_before_exhibition_interview(p_owner,p_artwork_id,p_edit);
 subject:=yeoback_private.subject_scope(p_owner,'artwork',p_artwork_id);
 sources:=coalesce(inputs#>'{context,sources}','[]');
 select coalesce(sum(char_length(s->>'text')),0) into used from jsonb_array_elements(sources) s;
 for e in select evidence.* from public.evidence_items evidence
  join public.exhibition_interview_questions q on q.evidence_id=evidence.id and q.owner_id=evidence.owner_id
  where q.owner_id=p_owner and q.exhibition_id=subject[2] and q.status='answered'
  and yeoback_private.evidence_is_current(evidence) order by q.seq for share of evidence
 loop
  pins:=pins||jsonb_build_array(jsonb_build_array(e.id,e.version,encode(e.content_hash,'hex')));
  if jsonb_array_length(sources)<12 and used+char_length(e.body)<=8000 then
   sources:=sources||jsonb_build_array(jsonb_build_object('id',e.id,'owner_id',p_owner,'artist_id',subject[1],
    'subject_type','exhibition','subject_id',subject[2],'exhibition_id',subject[2],
    'revision',e.version,'text',e.body,'ref',jsonb_build_object('kind','direct','section_id','introduction')));
   used:=used+char_length(e.body);
  end if;
 end loop;
 if pins='[]' then return inputs; end if;
 inputs:=jsonb_set(inputs,'{fingerprint}',(inputs->'fingerprint')||jsonb_build_array(pins));
 return jsonb_set(inputs,'{context,sources}',sources);
end $$;

revoke all on function yeoback_private.narration_inputs_before_exhibition_interview(uuid,uuid,boolean),
 yeoback_private.narration_inputs(uuid,uuid,boolean) from public,anon,authenticated,service_role;
