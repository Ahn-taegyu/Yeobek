begin;

insert into public.app_policies(key,value) values ('automation_jobs_per_day',100);
alter table public.ai_jobs drop constraint ai_jobs_kind_shape,
    alter column artwork_id drop not null,alter column document_id drop not null,
    alter column expected_revision drop not null,alter column expected_document_revision drop not null,
    add column automation_event_id uuid unique references public.automation_events(id),
    add constraint ai_jobs_kind_shape check (
        (kind in ('narration','audio') and automation_event_id is null
            and num_nonnulls(artwork_id,document_id,expected_revision,expected_document_revision) = 4
            and (
                (kind = 'narration' and strategy is not null
                    and num_nonnulls(audio_approval_id,voice_config_version,voice_fingerprint) = 0)
                or (kind = 'audio' and strategy is null
                    and num_nonnulls(audio_approval_id,voice_config_version,voice_fingerprint) = 3
                    and octet_length(voice_fingerprint) = 32)
            ))
        or (kind in ('automation_notify','automation_support','automation_gap_digest','automation_triage',
            'automation_briefing','automation_intake') and automation_event_id is not null
            and num_nonnulls(artwork_id,document_id,expected_revision,expected_document_revision,
                strategy,audio_approval_id,voice_config_version,voice_fingerprint) = 0
            and source_fingerprint = '{}' and source_ids = '[]' and result is null)
    );

create or replace function yeoback_private.assert_ai_quota(p_owner uuid)
returns void language plpgsql set search_path = '' as $$
declare day_start timestamptz := date_trunc('day',statement_timestamp(),'UTC');
begin
    if (select count(*) from public.ai_job_attempts a join public.ai_jobs j on j.id = a.job_id
        where a.owner_id = p_owner and j.kind in ('narration','audio')
        and a.reserved_at >= day_start and a.reserved_at < day_start + interval '24 hours')
        >= yeoback_private.policy_integer('author_jobs_per_day') then
        raise exception 'Daily author job limit reached' using errcode = 'P1004';
    end if;
end;
$$;

create or replace function public.get_ai_job(p_job_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    owner uuid := yeoback_private.require_owner();
    job public.ai_jobs%rowtype;
begin
    select * into job from public.ai_jobs where owner_id = owner and id = p_job_id and kind in ('narration','audio');
    if not found or job.expires_at <= statement_timestamp() then
        raise exception 'Job not found' using errcode = 'P0002';
    end if;
    perform yeoback_private.subject_scope(owner,'artwork',job.artwork_id);
    return yeoback_private.ai_job_json(job);
end;
$$;

-- The event row is always locked first. The trigger closes a reserved
-- attempt when the queue advances or suppresses it without a worker callback.
create function yeoback_private.settle_abandoned_automation_job()
returns trigger language plpgsql set search_path = '' as $$
declare abandoned public.ai_jobs%rowtype;
    code text := coalesce(new.result_code,'REQUEST_TIMEOUT');
begin
    if old.state <> 'running' or new.completion_fingerprint is not null or not (
        new.attempt > old.attempt or new.state in ('failed','suppressed')
    ) then return new; end if;
    update public.ai_jobs j set status = case when new.state = 'suppressed' then 'abstained' else 'failed' end,
        routing = case when new.state = 'suppressed' then 'none' else 'operator' end,
        result_code = code,updated_at = statement_timestamp()
    where j.automation_event_id = old.id and j.attempt = old.attempt and j.status = 'running'
    returning j.* into abandoned;
    if found then
        update public.ai_job_attempts set completed_at = statement_timestamp(),result_code = code
        where job_id = abandoned.id and attempt = abandoned.attempt and completed_at is null;
    end if;
    return new;
end;
$$;
create trigger settle_abandoned_automation_job after update on public.automation_events
    for each row execute function yeoback_private.settle_abandoned_automation_job();
revoke all on function yeoback_private.settle_abandoned_automation_job() from public,anon,authenticated,service_role;

alter function public.claim_automation_events(integer,boolean) set schema yeoback_private;
revoke all on function yeoback_private.claim_automation_events(integer,boolean) from public,anon,authenticated,service_role;
create function public.claim_automation_events(p_limit integer,p_mock boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
    if p_limit is null or p_limit not between 1 and 100 or p_mock is null then
        raise exception 'Invalid automation claim' using errcode = '22023';
    end if;
    with expired as (
        select e.id from public.automation_events e where e.mock = p_mock and e.state in ('running','queued')
            and e.expires_at <= statement_timestamp() order by e.expires_at,e.id limit p_limit for update skip locked
    )
    update public.automation_events e set state = 'failed',result_code = 'EVENT_EXPIRED',lease_until = null
    from expired x where e.id = x.id;
    return yeoback_private.claim_automation_events(p_limit,p_mock);
end;
$$;
revoke all on function public.claim_automation_events(integer,boolean) from public,anon,authenticated,service_role;
grant execute on function public.claim_automation_events(integer,boolean) to service_role;

create function public.reserve_automation_job(p_event_id uuid,p_event_attempt integer,p_mock boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    event_row public.automation_events%rowtype;
    job public.ai_jobs%rowtype;
    job_owner uuid;
    request_uuid uuid;
    day_start timestamptz;
    effective_mode text;
begin
    select * into event_row from public.automation_events where id = p_event_id for update;
    if not found or event_row.mock is distinct from p_mock then raise exception 'Not found' using errcode = 'P0002'; end if;
    if event_row.attempt is distinct from p_event_attempt then
        raise exception 'Automation attempt is not active' using errcode = '40001';
    end if;
    select * into job from public.ai_jobs where automation_event_id = p_event_id;
    if job.id is not null and job.attempt = p_event_attempt then
        return jsonb_build_object('jobId',job.id,'attempt',job.attempt,'claimed',false);
    end if;
    if event_row.state <> 'running' or event_row.lease_until <= clock_timestamp()
        or event_row.expires_at <= clock_timestamp() then
        raise exception 'Automation attempt is not active' using errcode = '40001';
    end if;
    select mode into strict effective_mode from public.automation_policies where kind = event_row.kind for share;
    if effective_mode = 'off' or (event_row.exhibition_id is not null and not exists (
        select 1 from public.exhibitions where id = event_row.exhibition_id and owner_id = event_row.owner_id and deleted_at is null
    )) then
        update public.automation_events set state = 'suppressed',lease_until = null,
            result_code = case when effective_mode = 'off' then 'POLICY_OFF' else 'TARGET_UNAVAILABLE' end
        where id = event_row.id;
        return jsonb_build_object('jobId',job.id,'attempt',event_row.attempt,'claimed',false);
    end if;
    if job.id is not null then
        job_owner := job.owner_id;
    else
        job_owner := event_row.owner_id;
    end if;
    if event_row.owner_id is null then
        if job_owner is null then
            select user_id into job_owner from public.operators where enabled order by user_id limit 1 for share;
        else
            perform 1 from public.operators where user_id = job_owner and enabled for share;
        end if;
        if not found then raise exception 'Automation operator is not configured' using errcode = 'P1003'; end if;
    end if;
    perform pg_advisory_xact_lock(hashtextextended('yeobek:ai-jobs:' || job_owner::text,0));
    select * into job from public.ai_jobs where automation_event_id = p_event_id for update;
    if event_row.lease_until <= clock_timestamp() or event_row.expires_at <= clock_timestamp() then
        raise exception 'Automation attempt is not active' using errcode = '40001';
    end if;
    day_start := date_trunc('day',clock_timestamp(),'UTC');
    if (select count(*) from public.ai_job_attempts a join public.ai_jobs j on j.id = a.job_id
        where a.owner_id = job_owner and j.automation_event_id is not null
        and a.reserved_at >= day_start and a.reserved_at < day_start + interval '24 hours')
        >= yeoback_private.policy_integer('automation_jobs_per_day') then
        raise exception 'Daily automation job limit reached' using errcode = 'P1030';
    end if;
    request_uuid := gen_random_uuid();
    if job.id is null then
        insert into public.ai_jobs(owner_id,request_id,kind,automation_event_id,source_fingerprint,source_ids,
            attempt,lease_until,expires_at,mock)
        values (job_owner,request_uuid,'automation_' || event_row.kind,event_row.id,'{}','[]',event_row.attempt,
            event_row.lease_until,event_row.expires_at,p_mock) returning * into job;
    else
        update public.ai_job_attempts set completed_at = statement_timestamp(),result_code = 'REQUEST_TIMEOUT'
            where job_id = job.id and attempt = job.attempt and completed_at is null;
        update public.ai_jobs set attempt = event_row.attempt,status = 'running',routing = 'none',result_code = null,
            lease_until = event_row.lease_until,updated_at = statement_timestamp()
        where id = job.id returning * into job;
    end if;
    insert into public.ai_job_attempts(owner_id,job_id,attempt,request_id,reserved_at)
    values (job_owner,job.id,job.attempt,request_uuid,clock_timestamp());
    return jsonb_build_object('jobId',job.id,'attempt',job.attempt,'claimed',true);
end;
$$;

-- Once an event has a ledger row, only combined completion may settle it.
alter function public.complete_automation_event(uuid,integer,text,text,jsonb) set schema yeoback_private;
revoke all on function yeoback_private.complete_automation_event(uuid,integer,text,text,jsonb)
    from public,anon,authenticated,service_role;
create function public.complete_automation_event(p_id uuid,p_attempt integer,p_state text,p_result_code text,p_outbound jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
    perform 1 from public.automation_events where id = p_id for update;
    if exists (select 1 from public.ai_jobs where automation_event_id = p_id) then
        raise exception 'Automation job completion is required' using errcode = '40001';
    end if;
    return yeoback_private.complete_automation_event(p_id,p_attempt,p_state,p_result_code,p_outbound);
end;
$$;
revoke all on function public.complete_automation_event(uuid,integer,text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.complete_automation_event(uuid,integer,text,text,jsonb) to service_role;

create function public.complete_automation_job(p_event_id uuid,p_job_id uuid,p_attempt integer,p_state text,
    p_result_code text,p_outbound jsonb default null,p_usage jsonb default '[]',p_steps jsonb default '[]',
    p_elapsed_ms integer default 0)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    event_row public.automation_events%rowtype;
    job public.ai_jobs%rowtype;
    prior bytea;
    fingerprint bytea := sha256(convert_to(jsonb_build_array(p_state,p_result_code,p_outbound,p_usage,p_steps,p_elapsed_ms)::text,'UTF8'));
    event_result jsonb;
    call jsonb;
    token jsonb;
begin
    select * into event_row from public.automation_events where id = p_event_id for update;
    if not found then raise exception 'Not found' using errcode = 'P0002'; end if;
    select * into job from public.ai_jobs where id = p_job_id and automation_event_id = p_event_id for update;
    if not found then raise exception 'Not found' using errcode = 'P0002'; end if;
    if p_attempt is null or p_attempt <> job.attempt or p_attempt <> event_row.attempt then
        raise exception 'Automation attempt is not active' using errcode = '40001';
    end if;
    if job.status <> 'running' then
        select completion_fingerprint into prior from public.ai_job_attempts where job_id = job.id and attempt = p_attempt;
        if prior is distinct from fingerprint then
            raise exception 'Automation job already completed' using errcode = '40001';
        end if;
        return jsonb_build_object('jobId',job.id,'attempt',job.attempt,'state',job.status,
            'event',yeoback_private.automation_event_json(event_row));
    end if;
    if job.lease_until <= clock_timestamp() or event_row.lease_until <= clock_timestamp() then
        raise exception 'Automation attempt is not active' using errcode = '40001';
    end if;
    perform yeoback_private.validate_visitor_steps(p_steps);
    if p_elapsed_ms is null or p_elapsed_ms not between 0 and 300000 or jsonb_typeof(p_usage) is distinct from 'array' then
        raise exception 'Invalid automation usage' using errcode = '22023';
    end if;
    if jsonb_array_length(p_usage) > 8 then raise exception 'Invalid automation usage' using errcode = '22023'; end if;
    for call in select value from jsonb_array_elements(p_usage) loop
        if jsonb_typeof(call) is distinct from 'object'
            or call - array['provider','model','mock','usage'] <> '{}'
            or coalesce(call->>'provider','') not in ('liner','openai','typecast','exaone','mock')
            or jsonb_typeof(call->'model') is distinct from 'string'
            or coalesce(call->>'model','') !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$'
            or (call ? 'mock' and jsonb_typeof(call->'mock') is distinct from 'boolean')
            or (call ? 'usage' and jsonb_typeof(call->'usage') is distinct from 'object') then
            raise exception 'Invalid automation usage' using errcode = '22023';
        end if;
        if call ? 'usage' then
            if (call->'usage') - array['inputTokens','outputTokens','totalTokens'] <> '{}' then
                raise exception 'Invalid automation usage' using errcode = '22023';
            end if;
            for token in select value from jsonb_each(call->'usage') loop
                if jsonb_typeof(token) is distinct from 'number' or token::text !~ '^[0-9]{1,16}$' then
                    raise exception 'Invalid automation usage' using errcode = '22023';
                end if;
                if (token::text)::numeric > 9007199254740991 then
                    raise exception 'Invalid automation usage' using errcode = '22023';
                end if;
            end loop;
        end if;
    end loop;
    event_result := yeoback_private.complete_automation_event(p_event_id,p_attempt,p_state,p_result_code,p_outbound);
    update public.ai_jobs set status = case event_result->>'state'
        when 'processed' then 'succeeded' when 'failed' then 'failed' else 'abstained' end,
        routing = case when event_result->>'state' in ('escalated','failed') then 'operator' else 'none' end,
        result_code = event_result->>'resultCode',updated_at = statement_timestamp()
    where id = job.id returning * into job;
    update public.ai_job_attempts set completed_at = statement_timestamp(),result_code = job.result_code,
        completion_fingerprint = fingerprint,duration_ms = p_elapsed_ms,usage = p_usage,steps = p_steps
    where job_id = job.id and attempt = p_attempt;
    return jsonb_build_object('jobId',job.id,'attempt',job.attempt,'state',job.status,'event',event_result);
end;
$$;

revoke all on function public.reserve_automation_job(uuid,integer,boolean),
    public.complete_automation_job(uuid,uuid,integer,text,text,jsonb,jsonb,jsonb,integer)
    from public,anon,authenticated,service_role;
grant execute on function public.reserve_automation_job(uuid,integer,boolean),
    public.complete_automation_job(uuid,uuid,integer,text,text,jsonb,jsonb,jsonb,integer) to service_role;
commit;
