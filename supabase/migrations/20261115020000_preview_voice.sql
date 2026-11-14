begin;

-- Preview audio is never public; recordings are never persisted. One owner has
-- at most 20 combined new STT/TTS reservations in a rolling 24 hours.
create table yeoback_private.preview_voice_requests (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null, request_id uuid not null,
 exhibition_id uuid not null, answer_id uuid, kind text not null check (kind in ('transcription','speech')),
 input_hash text not null, mock boolean not null, state text not null default 'running' check (state in ('running','succeeded','failed')),
 failure_code text, result jsonb, audio bytea, created_at timestamptz not null default clock_timestamp(),
 lease_until timestamptz not null default (clock_timestamp() + interval '120 seconds'),
 expires_at timestamptz not null default (clock_timestamp() + interval '24 hours'), unique(owner_id,request_id)
);
create index preview_voice_owner_time on yeoback_private.preview_voice_requests(owner_id,created_at);
create index preview_voice_expiry on yeoback_private.preview_voice_requests(expires_at,id);
revoke all on yeoback_private.preview_voice_requests from public,anon,authenticated,service_role;

create function yeoback_private.preview_voice_source(p_owner uuid,p_answer uuid)
returns public.ai_jobs language plpgsql stable set search_path = '' as $$
declare j public.ai_jobs%rowtype;
begin
 select * into j from public.ai_jobs where id=p_answer and owner_id=p_owner and kind='preview_answer'
   and status='succeeded' and expires_at > statement_timestamp();
 if not found then raise exception 'Preview answer not found' using errcode='P0002'; end if;
 perform yeoback_private.qa_scope(p_owner,j.qa_exhibition_id,j.artwork_id);
 return j;
end; $$;

create function public.reserve_preview_voice(p_owner uuid,p_exhibition uuid,p_answer uuid,p_request uuid,p_kind text,p_hash text,p_mock boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r yeoback_private.preview_voice_requests%rowtype; j public.ai_jobs%rowtype; claimed boolean := false;
begin
 if p_owner is null or p_exhibition is null or p_request is null or p_mock is null or p_kind is null
  or p_kind not in ('transcription','speech') or coalesce(p_hash,'') !~ '^[a-f0-9]{64}$'
  or ((p_kind='speech') is distinct from (p_answer is not null)) then
  raise exception 'Invalid preview voice request' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('yeobek:preview-voice:' || p_owner::text,0));
 perform yeoback_private.qa_scope(p_owner,p_exhibition,null);
 if p_kind='speech' then
  j := yeoback_private.preview_voice_source(p_owner,p_answer);
  if j.qa_exhibition_id is distinct from p_exhibition then raise exception 'Preview answer not found' using errcode='P0002'; end if;
 end if;
 select * into r from yeoback_private.preview_voice_requests where owner_id=p_owner and request_id=p_request for update;
 if found then
  if r.exhibition_id<>p_exhibition or r.answer_id is distinct from p_answer or r.kind<>p_kind or r.input_hash<>p_hash or r.mock<>p_mock then
   raise exception 'Request ID already used with different input' using errcode='P1005'; end if;
  if r.expires_at<=clock_timestamp() then raise exception 'Request expired' using errcode='P1012'; end if;
  if r.state='running' and r.lease_until<=clock_timestamp() then
   update yeoback_private.preview_voice_requests set state='failed',failure_code='REQUEST_TIMEOUT' where id=r.id returning * into r;
  end if;
 else
  if (select count(*) from yeoback_private.preview_voice_requests where owner_id=p_owner and created_at>clock_timestamp()-interval '24 hours')>=20 then
   raise exception 'Preview voice limit reached' using errcode='P1004'; end if;
  insert into yeoback_private.preview_voice_requests(owner_id,request_id,exhibition_id,answer_id,kind,input_hash,mock)
   values(p_owner,p_request,p_exhibition,p_answer,p_kind,p_hash,p_mock) returning * into r;
  claimed := true;
 end if;
 return jsonb_build_object('id',r.id,'claimed',claimed,'status',r.state,'failureCode',r.failure_code,'mock',r.mock);
end; $$;

create function public.complete_preview_voice(p_owner uuid,p_id uuid,p_result jsonb,p_audio text,p_failure text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r yeoback_private.preview_voice_requests%rowtype; j public.ai_jobs%rowtype; bytes bytea;
begin
 select * into r from yeoback_private.preview_voice_requests where owner_id=p_owner and id=p_id for update;
 if not found or r.expires_at<=clock_timestamp() then raise exception 'Request not found' using errcode='P0002'; end if;
 if r.state<>'running' then raise exception 'Request already completed' using errcode='P1006'; end if;
 if r.lease_until<=clock_timestamp() then p_failure:='REQUEST_TIMEOUT'; p_result:=null; p_audio:=null; end if;
 if p_failure is not null then
  if p_failure !~ '^[A-Z][A-Z0-9_]{0,63}$' or p_result is not null or p_audio is not null then raise exception 'Invalid failure' using errcode='22023'; end if;
 else
  perform yeoback_private.qa_scope(p_owner,r.exhibition_id,null);
  if r.kind='speech' then
   j:=yeoback_private.preview_voice_source(p_owner,r.answer_id);
   if p_result is not null or p_audio is null or length(p_audio)>2796204 then raise exception 'Invalid audio' using errcode='22023'; end if;
   bytes:=decode(p_audio,'base64');
   if octet_length(bytes)=0 or octet_length(bytes)>2097152 then raise exception 'Invalid audio' using errcode='22023'; end if;
  elsif p_audio is not null or jsonb_typeof(p_result) is distinct from 'object'
   or p_result - array['requestId','transcript','mock'] <> '{}'::jsonb
   or p_result->>'requestId' is distinct from r.request_id::text or p_result->'mock' is distinct from to_jsonb(r.mock)
   or jsonb_typeof(p_result->'transcript') is distinct from 'string' or coalesce(p_result->>'transcript','') !~ '[^[:space:]]'
   or char_length(p_result->>'transcript')>4000 then raise exception 'Invalid transcript' using errcode='22023';
  end if;
 end if;
 update yeoback_private.preview_voice_requests set state=case when p_failure is null then 'succeeded' else 'failed' end,
  failure_code=p_failure,result=p_result,audio=bytes where id=r.id returning * into r;
 return jsonb_build_object('id',r.id,'status',r.state,'failureCode',r.failure_code);
end; $$;

create function public.load_preview_voice(p_owner uuid,p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r yeoback_private.preview_voice_requests%rowtype; j public.ai_jobs%rowtype;
begin
 select * into r from yeoback_private.preview_voice_requests where owner_id=p_owner and id=p_id and state='succeeded' and expires_at>statement_timestamp();
 if not found then raise exception 'Request not found' using errcode='P0002'; end if;
 perform yeoback_private.qa_scope(p_owner,r.exhibition_id,null);
 if r.kind='speech' then j:=yeoback_private.preview_voice_source(p_owner,r.answer_id); end if;
 return jsonb_build_object('result',r.result,'audio',case when r.audio is null then null else encode(r.audio,'base64') end,'mock',r.mock);
end; $$;

alter function public.purge_expired() rename to purge_expired_before_preview_voice;
alter function public.purge_expired_before_preview_voice() set schema yeoback_private;
revoke all on function yeoback_private.purge_expired_before_preview_voice() from public,anon,authenticated,service_role;
create function public.purge_expired() returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
 result:=yeoback_private.purge_expired_before_preview_voice();
 delete from yeoback_private.preview_voice_requests where id in (select id from yeoback_private.preview_voice_requests
  where expires_at<=statement_timestamp() order by expires_at,id limit 1000 for update skip locked);
 return result;
end; $$;
revoke all on function yeoback_private.preview_voice_source(uuid,uuid),public.reserve_preview_voice(uuid,uuid,uuid,uuid,text,text,boolean),
 public.complete_preview_voice(uuid,uuid,jsonb,text,text),public.load_preview_voice(uuid,uuid),public.purge_expired() from public,anon,authenticated,service_role;
grant execute on function public.reserve_preview_voice(uuid,uuid,uuid,uuid,text,text,boolean),
 public.complete_preview_voice(uuid,uuid,jsonb,text,text),public.load_preview_voice(uuid,uuid),public.purge_expired() to service_role;
commit;
