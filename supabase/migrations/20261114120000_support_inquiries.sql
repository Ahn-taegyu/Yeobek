begin;

alter table public.automation_bindings add column revision integer not null default 1 check (revision > 0);
create function yeoback_private.bump_support_binding_revision()
returns trigger language plpgsql set search_path = '' as $$
begin
    new.revision := old.revision + case when (new.owner_id,new.enabled)
        is distinct from (old.owner_id,old.enabled) then 1 else 0 end;
    return new;
end;
$$;
create trigger bump_support_binding_revision before update on public.automation_bindings
    for each row execute function yeoback_private.bump_support_binding_revision();

create function yeoback_private.bump_help_article_revision()
returns trigger language plpgsql set search_path = '' as $$
begin
    new.revision := old.revision + case when (new.title,new.body,new.published)
        is distinct from (old.title,old.body,old.published) then 1 else 0 end;
    return new;
end;
$$;
create trigger bump_help_article_revision before update on public.help_articles
    for each row execute function yeoback_private.bump_help_article_revision();

create table public.support_inquiries (
    id uuid primary key default gen_random_uuid(),
    channel_id text not null check (channel_id ~ '^[A-Za-z0-9_-]{1,200}$'),
    user_id text not null check (user_id ~ '^[A-Za-z0-9_-]{1,200}$'),
    chat_id text not null check (chat_id ~ '^[A-Za-z0-9_-]{1,200}$'),
    message_id text not null check (message_id ~ '^[A-Za-z0-9_-]{1,200}$'),
    question text check (char_length(question) between 1 and 2000),
    truncated boolean not null,
    provider_created_at timestamptz not null,
    owner_id uuid references auth.users(id),
    binding_revision integer check (binding_revision > 0),
    event_id uuid not null unique references public.automation_events(id) on delete cascade,
    mock boolean not null,
    expires_at timestamptz not null,
    context_revision text check (context_revision ~ '^[a-f0-9]{64}$'),
    completion_fingerprint bytea check (octet_length(completion_fingerprint) = 32),
    unique(channel_id,message_id,mock),
    check ((owner_id is null) = (binding_revision is null))
);
alter table public.support_inquiries enable row level security;
revoke all on public.support_inquiries from public,anon,authenticated,service_role;

create function public.set_support_binding(p_channel_id text,p_user_id text,p_owner uuid,
    p_enabled boolean,p_expected_revision integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_revision integer;
begin
    perform yeoback_private.require_operator();
    if p_channel_id is null or p_channel_id !~ '^[A-Za-z0-9_-]{1,200}$'
        or p_user_id is null or p_user_id !~ '^[A-Za-z0-9_-]{1,200}$'
        or p_owner is null or p_enabled is null or p_expected_revision is null or p_expected_revision < 0
        or not exists(select 1 from auth.users where id = p_owner and is_anonymous is not true) then
        raise exception 'Invalid support binding' using errcode = '22023';
    end if;
    if p_expected_revision = 0 then
        insert into public.automation_bindings(provider,provider_scope,external_id,owner_id,enabled)
        values('channeltalk',p_channel_id,p_user_id,p_owner,p_enabled)
        on conflict do nothing returning revision into current_revision;
    else
        update public.automation_bindings set owner_id = p_owner,enabled = p_enabled
        where provider = 'channeltalk' and provider_scope = p_channel_id and external_id = p_user_id
            and revision = p_expected_revision returning revision into current_revision;
    end if;
    if current_revision is null then raise exception 'Support binding changed' using errcode = '40001'; end if;
    return jsonb_build_object('revision',current_revision);
end;
$$;

create function public.receive_support_inquiry(p_channel_id text,p_user_id text,p_chat_id text,
    p_message_id text,p_question text,p_truncated boolean,p_created_at timestamptz,p_mock boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    inquiry public.support_inquiries%rowtype;
    binding public.automation_bindings%rowtype;
    question text := case when p_question ~ '[^[:space:]]' then p_question end;
    inquiry_id uuid := gen_random_uuid();
    incoming_event_id uuid;
    received_at timestamptz := statement_timestamp();
    expiry timestamptz := received_at + yeoback_private.policy_integer('automation_event_retention_days') * interval '1 day';
    code text;
begin
    if p_channel_id is null or p_channel_id !~ '^[A-Za-z0-9_-]{1,200}$'
        or p_user_id is null or p_user_id !~ '^[A-Za-z0-9_-]{1,200}$'
        or p_chat_id is null or p_chat_id !~ '^[A-Za-z0-9_-]{1,200}$'
        or p_message_id is null or p_message_id !~ '^[A-Za-z0-9_-]{1,200}$'
        or char_length(p_question) > 2000 or p_truncated is null or p_mock is null
        or p_created_at is null or p_created_at < received_at - interval '30 days'
        or p_created_at > received_at + interval '5 minutes' then
        raise exception 'Invalid support inquiry' using errcode = '22023';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('yeobek:support-inquiry:' ||
        p_channel_id || ':' || p_message_id || ':' || p_mock::text,0));
    select * into inquiry from public.support_inquiries
    where channel_id = p_channel_id and message_id = p_message_id and mock = p_mock;
    if found then
        if (inquiry.user_id,inquiry.chat_id,inquiry.question,inquiry.truncated,inquiry.provider_created_at)
            is distinct from (p_user_id,p_chat_id,question,p_truncated,p_created_at) then
            raise exception 'Message ID already used with different input' using errcode = 'P1005';
        end if;
        return jsonb_build_object('accepted',true,'duplicate',true,'eventId',inquiry.event_id);
    end if;

    select b.* into binding from public.automation_bindings b join auth.users u on u.id = b.owner_id
    where b.provider = 'channeltalk' and b.provider_scope = p_channel_id and b.external_id = p_user_id
        and b.enabled and u.is_anonymous is not true for share of b;
    code := case when binding.owner_id is null then 'UNLINKED_ACCOUNT'
        when question is null or p_truncated then 'UNSUPPORTED_INQUIRY' end;
    insert into public.automation_events(kind,trigger_kind,dedupe_key,owner_id,source_revision,mock,state,expires_at,result_code)
    values('support','support_received','support:' || inquiry_id::text,binding.owner_id,1,p_mock,
        case when code is null then 'queued' else 'escalated' end,expiry,code) returning id into incoming_event_id;
    insert into public.support_inquiries(id,channel_id,user_id,chat_id,message_id,question,truncated,provider_created_at,
        owner_id,binding_revision,event_id,mock,expires_at)
    values(inquiry_id,p_channel_id,p_user_id,p_chat_id,p_message_id,question,p_truncated,p_created_at,
        binding.owner_id,binding.revision,incoming_event_id,p_mock,expiry);
    return jsonb_build_object('accepted',true,'duplicate',false,'eventId',incoming_event_id);
end;
$$;

create function yeoback_private.support_context(inquiry public.support_inquiries)
returns jsonb language sql stable set search_path = '' as $$
    with candidates as (
        select id,title,body,revision from public.help_articles
        where published and body ~ '[^[:space:]]' order by id limit 11
    ), budgeted as (
        select *,row_number() over (order by id) as citation,
            sum(char_length(body)) over (order by id) as budget from candidates
    ), help as (
        select coalesce(jsonb_agg(jsonb_build_object('id','help:' || citation::text,'kind','help','body',body) order by id),'[]') as evidence,
            coalesce(jsonb_agg(jsonb_build_array(id,title,revision) order by id),'[]') as revisions
        from budgeted where budget <= 6000
    ), status as (
        select jsonb_build_object('id','status:account','kind','status','body',format(
            '삭제되지 않은 전시 수입니다. 초안 %s건, 게시 %s건, 일시 중지 %s건.',
            count(*) filter(where state = 'draft'),count(*) filter(where state = 'published'),
            count(*) filter(where state = 'paused'))) as evidence
        from public.exhibitions where owner_id = inquiry.owner_id and deleted_at is null
    )
    select jsonb_build_object('eventId',inquiry.event_id,'question',inquiry.question,
        'evidence',help.evidence || jsonb_build_array(status.evidence),
        'revision',encode(sha256(convert_to(jsonb_build_array(inquiry.event_id,inquiry.owner_id,
            inquiry.binding_revision,inquiry.question,p.revision,help.revisions,help.evidence,status.evidence)::text,'UTF8')),'hex'))
    from help cross join status cross join public.automation_policies p
    join public.automation_bindings b on b.provider = 'channeltalk' and b.provider_scope = inquiry.channel_id
        and b.external_id = inquiry.user_id and b.enabled and b.owner_id = inquiry.owner_id
        and b.revision = inquiry.binding_revision
    join auth.users u on u.id = b.owner_id and u.is_anonymous is not true
    where p.kind = 'support' and p.mode <> 'off' and inquiry.expires_at > statement_timestamp()
        and inquiry.question is not null and not inquiry.truncated;
$$;

create function public.get_support_context(p_event_id uuid,p_attempt integer,p_mock boolean)
returns jsonb language sql stable security definer set search_path = '' as $$
    select yeoback_private.support_context(i)
    from public.automation_events e join public.support_inquiries i on i.event_id = e.id
        and i.owner_id = e.owner_id and i.mock = e.mock
    where e.id = p_event_id and e.kind = 'support' and e.mock = p_mock and e.attempt = p_attempt
        and e.state = 'running' and e.lease_until > statement_timestamp() and e.expires_at > statement_timestamp();
$$;

create function public.complete_support_job(p_event_id uuid,p_job_id uuid,p_attempt integer,p_mock boolean,
    p_context_revision text,p_state text,p_result_code text,p_body text,p_category text,p_usage jsonb,p_steps jsonb,p_elapsed_ms integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    e public.automation_events%rowtype;
    inquiry public.support_inquiries%rowtype;
    result jsonb;
    outbound jsonb;
    verified_revision text;
    fingerprint bytea := sha256(convert_to(jsonb_build_array(p_job_id,p_attempt,p_context_revision,p_state,
        p_result_code,p_body,p_category,p_usage,p_steps,p_elapsed_ms)::text,'UTF8'));
begin
    select * into e from public.automation_events where id = p_event_id and kind = 'support' and mock = p_mock for update;
    if not found then raise exception 'Not found' using errcode = 'P0002'; end if;
    select * into inquiry from public.support_inquiries where event_id = e.id and mock = e.mock
        and owner_id = e.owner_id for update;
    if not found then raise exception 'Not found' using errcode = 'P0002'; end if;
    if e.state <> 'running' and e.attempt = p_attempt and inquiry.completion_fingerprint = fingerprint then
        select jsonb_build_object('jobId',j.id,'attempt',j.attempt,'state',j.status,'event',yeoback_private.automation_event_json(e))
        into result from public.ai_jobs j where j.id = p_job_id and j.automation_event_id = e.id and j.attempt = p_attempt;
        if result is not null then return result; end if;
    end if;
    if e.state <> 'running' or e.attempt is distinct from p_attempt or e.lease_until <= clock_timestamp() then
        raise exception 'Automation attempt is not active' using errcode = '40001';
    end if;
    if p_state is null or p_state not in ('processed','escalated','failed','suppressed')
        or (p_state <> 'processed' and (p_body is not null or p_category is not null)) then
        raise exception 'Invalid support result' using errcode = '22023';
    end if;
    if p_state = 'processed' then
        -- Keep the binding and policy stable while the outbox row is created.
        perform 1 from public.automation_policies where kind = 'support' for share;
        perform 1 from public.automation_bindings where provider = 'channeltalk'
            and provider_scope = inquiry.channel_id and external_id = inquiry.user_id for share;
        verified_revision := public.get_support_context(e.id,p_attempt,p_mock)->>'revision';
        if verified_revision is null or verified_revision is distinct from p_context_revision then
            p_state := 'suppressed';
            p_result_code := 'STALE_CONTEXT';
            verified_revision := null;
        elsif p_body is null or p_category is null or p_category not in ('usage','status') then
            raise exception 'Invalid support reply' using errcode = '22023';
        else
            outbound := jsonb_build_object('channel','support','category',p_category,'body',p_body,
                'bindingScope',inquiry.channel_id,'bindingId',inquiry.user_id,'destinationId',inquiry.chat_id);
        end if;
    end if;
    result := public.complete_automation_job(e.id,p_job_id,p_attempt,p_state,p_result_code,outbound,p_usage,p_steps,p_elapsed_ms);
    update public.support_inquiries i set completion_fingerprint = fingerprint,
        context_revision = case when result->'event'->>'state' = 'processed' then verified_revision end
    where i.id = inquiry.id;
    return result;
end;
$$;

alter function yeoback_private.outbound_blocker(public.outbound_messages) rename to outbound_support_base;
create function yeoback_private.outbound_blocker(m public.outbound_messages)
returns text language plpgsql set search_path = '' as $$
declare blocked text;
    inquiry public.support_inquiries%rowtype;
begin
    blocked := yeoback_private.outbound_support_base(m);
    if blocked is not null then return blocked; end if;
    if m.channel = 'support' then
        select * into inquiry from public.support_inquiries where event_id = m.event_id and mock = m.mock
            and owner_id = m.owner_id and channel_id = m.binding_scope and user_id = m.binding_id and chat_id = m.destination_id;
        if not found or inquiry.context_revision is null
            or (yeoback_private.support_context(inquiry)->>'revision') is distinct from inquiry.context_revision then
            return 'STALE_CONTEXT';
        end if;
    end if;
    return null;
end;
$$;

create function public.claim_support_events(p_limit integer,p_mock boolean,p_channel_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    e public.automation_events%rowtype;
    claimed jsonb := '[]';
    policy_mode text;
begin
    if p_limit is null or p_limit not between 1 and 100 or p_mock is null
        or p_channel_id is null or p_channel_id !~ '^[A-Za-z0-9_-]{1,200}$' then
        raise exception 'Invalid automation claim' using errcode = '22023';
    end if;
    with expired as (
        select x.id from public.automation_events x join public.support_inquiries i on i.event_id = x.id
        where i.channel_id = p_channel_id and x.kind = 'support' and x.mock = p_mock
            and x.state in ('running','queued') and x.expires_at <= statement_timestamp()
        order by x.expires_at,x.id limit p_limit for update of x skip locked
    )
    update public.automation_events x set state = 'failed',result_code = 'EVENT_EXPIRED',lease_until = null
    from expired where x.id = expired.id;
    for e in select queued.* from public.automation_events queued join public.support_inquiries i on i.event_id = queued.id
        where i.channel_id = p_channel_id and queued.kind = 'support' and queued.mock = p_mock
        and queued.expires_at > statement_timestamp()
        and (queued.state = 'queued' or (queued.state = 'running' and queued.lease_until <= statement_timestamp()))
        order by queued.created_at,queued.id limit p_limit for update of queued skip locked
    loop
        select mode into strict policy_mode from public.automation_policies where kind = 'support';
        if policy_mode = 'off' or e.attempt >= yeoback_private.policy_integer('automation_event_max_attempts') then
            update public.automation_events set state = case when policy_mode = 'off' then 'suppressed' else 'failed' end,
                result_code = case when policy_mode = 'off' then 'POLICY_OFF' else 'REQUEST_TIMEOUT' end,
                lease_until = null where id = e.id;
        else
            update public.automation_events set state = 'running',attempt = attempt + 1,
                lease_until = least(e.expires_at,statement_timestamp() +
                    yeoback_private.policy_integer('automation_event_lease_seconds') * interval '1 second')
            where id = e.id returning * into e;
            claimed := claimed || jsonb_build_array(yeoback_private.automation_event_json(e));
        end if;
    end loop;
    return claimed;
end;
$$;

create function public.claim_support_outbound(p_limit integer,p_mock boolean,p_channel_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    m public.outbound_messages%rowtype;
    claimed jsonb := '[]';
    blocked text;
begin
    if p_limit is null or p_limit not between 1 and 100 or p_mock is null
        or p_channel_id is null or p_channel_id !~ '^[A-Za-z0-9_-]{1,200}$' then
        raise exception 'Invalid dispatch claim' using errcode = '22023';
    end if;
    for m in select o.* from public.outbound_messages o join public.automation_events e on e.id = o.event_id
        join public.support_inquiries i on i.event_id = e.id
        where i.channel_id = p_channel_id and e.kind = 'support' and o.channel = 'support' and o.mock = p_mock and (o.state = 'approved' or (o.state = 'sending' and o.lease_until <= statement_timestamp()))
        order by o.created_at,o.id limit p_limit for update of o skip locked
    loop
        if m.state = 'sending' then
            update public.outbound_messages set state = 'unknown',result_code = 'AMBIGUOUS_TRANSPORT',revision = revision + 1,
                lease_until = null where id = m.id;
        else
            blocked := yeoback_private.outbound_blocker(m);
            if blocked is not null then
                update public.outbound_messages set state = case when blocked = 'POLICY_CHANGED' then 'draft' else 'suppressed' end,
                    result_code = blocked,approved_by = null,approved_at = null,revision = revision + 1 where id = m.id;
            else
                update public.outbound_messages set state = 'sending',send_attempt = gen_random_uuid(),dispatch_checked_at = null,revision = revision + 1,
                    lease_until = statement_timestamp() + yeoback_private.policy_integer('automation_dispatch_lease_seconds') * interval '1 second' where id = m.id returning * into m;
                claimed := claimed || jsonb_build_array(jsonb_build_object('id',m.id,'attempt',m.send_attempt,'mock',m.mock));
            end if;
        end if;
    end loop;
    return claimed;
end;
$$;

revoke all on function yeoback_private.bump_support_binding_revision(),yeoback_private.bump_help_article_revision(),
    yeoback_private.support_context(public.support_inquiries),yeoback_private.outbound_blocker(public.outbound_messages)
    from public,anon,authenticated,service_role;
revoke all on function public.set_support_binding(text,text,uuid,boolean,integer)
    from public,anon,authenticated,service_role;
grant execute on function public.set_support_binding(text,text,uuid,boolean,integer) to authenticated;
revoke all on function public.receive_support_inquiry(text,text,text,text,text,boolean,timestamptz,boolean),
    public.get_support_context(uuid,integer,boolean),public.claim_support_events(integer,boolean,text),
    public.claim_support_outbound(integer,boolean,text),
    public.complete_support_job(uuid,uuid,integer,boolean,text,text,text,text,text,jsonb,jsonb,integer)
    from public,anon,authenticated,service_role;
grant execute on function public.receive_support_inquiry(text,text,text,text,text,boolean,timestamptz,boolean),
    public.get_support_context(uuid,integer,boolean),public.claim_support_events(integer,boolean,text),
    public.claim_support_outbound(integer,boolean,text),
    public.complete_support_job(uuid,uuid,integer,boolean,text,text,text,text,text,jsonb,jsonb,integer) to service_role;
commit;
