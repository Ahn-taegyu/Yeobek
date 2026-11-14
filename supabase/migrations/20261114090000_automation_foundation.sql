begin;
insert into public.app_policies(key,value) values ('automation_event_lease_seconds',120),
    ('automation_dispatch_lease_seconds',60),('automation_event_max_attempts',3),('automation_event_retention_days',30);
create table public.operators(user_id uuid primary key references auth.users(id),enabled boolean not null default true);
create table public.automation_policies(
    kind text primary key check (kind in ('notify','support','gap_digest','triage','briefing','intake')),
    mode text not null default 'draft' check (mode in ('off','draft','auto')),
    allowed_categories text[] not null default '{}'
        check (allowed_categories <@ array['transactional','marketing','usage','status']),
    revision integer not null default 1 check (revision > 0)
);
insert into public.automation_policies(kind,allowed_categories) values
    ('notify',array['transactional']),('support',array['usage','status']),('gap_digest','{}'),
    ('triage','{}'),('briefing','{}'),('intake','{}');
create table public.automation_events(
    id uuid primary key default gen_random_uuid(),
    kind text not null references public.automation_policies(kind),
    trigger_kind text not null check (trigger_kind in ('exhibition_created','draft_ready','approval_due','published',
        'gap_recorded','job_failed','exhibition_ended','support_received','transcript_ready','daily_briefing')),
    dedupe_key text not null check (dedupe_key ~ '^[A-Za-z0-9._:/-]{1,200}$'),
    owner_id uuid references auth.users(id),
    exhibition_id uuid,
    source_revision integer check (source_revision > 0),
    mock boolean not null,
    state text not null default 'queued' check (state in ('queued','running','processed','escalated','failed','suppressed')),
    attempt integer not null default 0 check (attempt >= 0),
    lease_until timestamptz,
    completion_fingerprint bytea,
    expires_at timestamptz not null,
    result_code text check (result_code ~ '^[A-Z][A-Z0-9_]{0,63}$'),
    created_at timestamptz not null default statement_timestamp(),
    unique(kind,dedupe_key),
    foreign key (owner_id,exhibition_id) references public.exhibitions(owner_id,id),
    check (exhibition_id is null or owner_id is not null),
    check (kind not in ('notify','gap_digest','intake') or owner_id is not null)
);
create index automation_events_queue on public.automation_events(state,created_at,id) where state in ('queued','running');
create table public.contact_consents(
    owner_id uuid not null references auth.users(id),
    category text not null check (category in ('transactional','marketing')),
    granted boolean not null default false,
    revision integer not null check (revision > 0),
    updated_at timestamptz not null default statement_timestamp(),
    primary key(owner_id,category)
);
create table public.help_articles(
    id uuid primary key default gen_random_uuid(),
    title text not null check (char_length(title) between 1 and 200),
    body text not null check (char_length(body) between 1 and 5000),
    revision integer not null default 1 check (revision > 0),
    published boolean not null default false
);
create table public.automation_bindings(
    provider text not null check (provider in ('alt','channeltalk')),
    provider_scope text not null check (provider_scope ~ '^[A-Za-z0-9_-]{1,200}$'),
    external_id text not null check (external_id ~ '^[A-Za-z0-9_-]{1,200}$'),
    owner_id uuid not null references auth.users(id),
    enabled boolean not null default true,
    primary key(provider,provider_scope,external_id)
);
create table public.outbound_messages(
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null unique references public.automation_events(id),
    owner_id uuid not null references auth.users(id),
    channel text not null check (channel in ('mail','support')),
    category text not null check (category in ('transactional','marketing','usage','status')),
    body text not null check (char_length(body) between 1 and 2000 and body ~ '[^[:space:]]'),
    binding_scope text check (binding_scope ~ '^[A-Za-z0-9_-]{1,200}$'),
    binding_id text check (binding_id ~ '^[A-Za-z0-9_-]{1,200}$'),
    destination_id text check (destination_id ~ '^[A-Za-z0-9_-]{1,200}$'),
    state text not null check (state in ('draft','approved','sending','accepted','unknown','rejected','suppressed','failed')),
    revision integer not null default 1 check (revision > 0),
    policy_revision integer not null check (policy_revision > 0),
    approved_by uuid references public.operators(user_id),
    approved_at timestamptz,
    send_attempt uuid,
    dispatch_checked_at timestamptz,
    lease_until timestamptz,
    result_code text check (result_code ~ '^[A-Z][A-Z0-9_]{0,63}$'),
    provider_message_id text check (provider_message_id ~ '^[A-Za-z0-9_-]{1,200}$'),
    mock boolean not null,
    created_at timestamptz not null default statement_timestamp(),
    check ((channel = 'mail' and category in ('transactional','marketing') and num_nonnulls(binding_scope,binding_id,destination_id) = 0)
        or (channel = 'support' and category in ('usage','status') and num_nonnulls(binding_scope,binding_id,destination_id) = 3))
);
create index outbound_queue on public.outbound_messages(state,created_at,id) where state in ('approved','sending');
alter table public.operators enable row level security;
alter table public.automation_policies enable row level security;
alter table public.automation_events enable row level security;
alter table public.contact_consents enable row level security;
alter table public.help_articles enable row level security;
alter table public.automation_bindings enable row level security;
alter table public.outbound_messages enable row level security;
revoke all on public.operators,public.automation_policies,public.automation_events,public.contact_consents,
    public.help_articles,public.automation_bindings,public.outbound_messages from public,anon,authenticated,service_role;
grant select,insert,update on public.operators,public.automation_policies,public.help_articles,public.automation_bindings to service_role;

create function yeoback_private.require_operator()
returns uuid language plpgsql stable set search_path = '' as $$
declare actor uuid := auth.uid();
begin
    if actor is null or auth.jwt()->>'is_anonymous' = 'true'
        or not exists (select 1 from public.operators where user_id = actor and enabled) then
        raise exception 'Not found' using errcode = 'P0002';
    end if;
    return actor;
end;
$$;

create function yeoback_private.bump_automation_policy()
returns trigger language plpgsql set search_path = '' as $$
begin
    if (new.mode,new.allowed_categories) is distinct from (old.mode,old.allowed_categories) then
        new.revision := old.revision + 1;
    else
        new.revision := old.revision;
    end if;
    return new;
end;
$$;
create trigger automation_policy_revision before update on public.automation_policies
for each row execute function yeoback_private.bump_automation_policy();

create function public.set_contact_consent(p_category text,p_granted boolean,p_expected_revision integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    owner uuid := yeoback_private.require_owner();
    consent public.contact_consents%rowtype;
begin
    if p_category is null or p_category not in ('transactional','marketing') or p_granted is null
        or p_expected_revision is null or p_expected_revision < 0 then
        raise exception 'Invalid consent input' using errcode = '22023';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('yeobek:automation-consent:' || owner::text,0));
    select * into consent from public.contact_consents where owner_id = owner and category = p_category;
    if coalesce(consent.revision,0) <> p_expected_revision then
        raise exception 'Consent revision conflict' using errcode = '40001';
    end if;
    insert into public.contact_consents(owner_id,category,granted,revision)
    values(owner,p_category,p_granted,1) on conflict(owner_id,category) do update
        set granted = excluded.granted,revision = public.contact_consents.revision + 1,updated_at = statement_timestamp()
    returning * into consent;
    return jsonb_build_object('category',consent.category,'granted',consent.granted,
        'revision',consent.revision,'updatedAt',consent.updated_at);
end;
$$;

create function public.get_contact_consents()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare owner uuid := yeoback_private.require_owner();
begin
    return (select jsonb_agg(jsonb_build_object('category',x.category,'granted',coalesce(c.granted,false),
        'revision',coalesce(c.revision,0),'updatedAt',c.updated_at) order by x.category)
    from (values ('transactional'),('marketing')) x(category)
    left join public.contact_consents c on c.owner_id = owner and c.category = x.category);
end;
$$;

create function yeoback_private.outbox_json(m public.outbound_messages)
returns jsonb language sql stable strict set search_path = '' as $$
    select jsonb_build_object('id',m.id,'eventId',m.event_id,'channel',m.channel,'category',m.category,
        'body',m.body,'state',m.state,'revision',m.revision,'mock',m.mock,'resultCode',m.result_code,'createdAt',m.created_at);
$$;
create function public.list_outbox(p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
    perform yeoback_private.require_operator();
    if p_limit is null or p_limit not between 1 and 100 then raise exception 'Invalid list limit' using errcode = '22023'; end if;
    return coalesce((select jsonb_agg(yeoback_private.outbox_json(m) order by m.created_at desc,m.id)
        from (select * from public.outbound_messages order by created_at desc,id limit p_limit) m),'[]');
end;
$$;
create function public.decide_outbox(p_id uuid,p_expected_revision integer,p_approve boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    actor uuid := yeoback_private.require_operator();
    m public.outbound_messages%rowtype;
    policy public.automation_policies%rowtype;
begin
    select * into m from public.outbound_messages where id = p_id for update;
    if not found then raise exception 'Not found' using errcode = 'P0002'; end if;
    if m.revision is distinct from p_expected_revision or m.state <> 'draft' or p_approve is null then
        raise exception 'Outbox revision conflict' using errcode = '40001';
    end if;
    select p.* into strict policy from public.automation_policies p join public.automation_events e on e.kind = p.kind
        where e.id = m.event_id for share of p;
    if p_approve and policy.mode = 'off' then raise exception 'Automation is disabled' using errcode = '40001'; end if;
    update public.outbound_messages set state = case when p_approve then 'approved' else 'rejected' end,
        revision = revision + 1,policy_revision = policy.revision,approved_by = case when p_approve then actor end,
        approved_at = case when p_approve then statement_timestamp() end where id = m.id returning * into m;
    return yeoback_private.outbox_json(m);
end;
$$;

create function yeoback_private.automation_event_json(e public.automation_events)
returns jsonb language sql stable strict set search_path = '' as $$
    select jsonb_build_object('id',e.id,'kind',e.kind,'triggerKind',e.trigger_kind,'ownerId',e.owner_id,'exhibitionId',e.exhibition_id,
        'sourceRevision',e.source_revision,'state',e.state,'attempt',e.attempt,'mock',e.mock,
        'leaseUntil',e.lease_until,'resultCode',e.result_code);
$$;

create function public.enqueue_automation_event(p_kind text,p_trigger_kind text,p_dedupe_key text,p_owner uuid,p_exhibition_id uuid,
    p_source_revision integer,p_mock boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e public.automation_events%rowtype;
begin
    if p_exhibition_id is not null then
        perform yeoback_private.subject_scope(p_owner,'exhibition',p_exhibition_id);
    end if;
    insert into public.automation_events(kind,trigger_kind,dedupe_key,owner_id,exhibition_id,source_revision,mock,expires_at)
        values(p_kind,p_trigger_kind,p_dedupe_key,p_owner,p_exhibition_id,p_source_revision,p_mock,statement_timestamp() + yeoback_private.policy_integer('automation_event_retention_days') * interval '1 day')
        on conflict(kind,dedupe_key) do nothing returning * into e;
    if not found then
        select * into strict e from public.automation_events where kind = p_kind and dedupe_key = p_dedupe_key;
        if (e.trigger_kind,e.owner_id,e.exhibition_id,e.source_revision,e.mock) is distinct from (p_trigger_kind,p_owner,p_exhibition_id,p_source_revision,p_mock) then
            raise exception 'Request ID already used with different input' using errcode = 'P1005';
        end if;
    end if;
    return yeoback_private.automation_event_json(e);
end;
$$;

create function public.claim_automation_events(p_limit integer,p_mock boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    e public.automation_events%rowtype;
    claimed jsonb := '[]';
    policy_mode text;
begin
    if p_limit is null or p_limit not between 1 and 100 or p_mock is null then
        raise exception 'Invalid automation claim' using errcode = '22023';
    end if;
    for e in select * from public.automation_events
        where mock = p_mock and expires_at > statement_timestamp() and (state = 'queued' or (state = 'running' and lease_until <= statement_timestamp()))
        order by created_at,id limit p_limit for update skip locked
    loop
        select mode into strict policy_mode from public.automation_policies where kind = e.kind;
        if policy_mode = 'off' or e.attempt >= yeoback_private.policy_integer('automation_event_max_attempts') then
            update public.automation_events set state = case when policy_mode = 'off' then 'suppressed' else 'failed' end,
                result_code = case when policy_mode = 'off' then 'POLICY_OFF' else 'REQUEST_TIMEOUT' end,
                lease_until = null where id = e.id;
        else
            update public.automation_events set state = 'running',attempt = attempt + 1,
                lease_until = least(e.expires_at,statement_timestamp() + yeoback_private.policy_integer('automation_event_lease_seconds') * interval '1 second') where id = e.id returning * into e;
            claimed := claimed || jsonb_build_array(yeoback_private.automation_event_json(e));
        end if;
    end loop;
    return claimed;
end;
$$;

create function public.complete_automation_event(p_id uuid,p_attempt integer,p_state text,p_result_code text,p_outbound jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    e public.automation_events%rowtype;
    policy public.automation_policies%rowtype;
    outbound_state text;
    category text := p_outbound->>'category';
    channel text := p_outbound->>'channel';
    fingerprint bytea := sha256(convert_to(jsonb_build_array(p_state,p_result_code,p_outbound)::text,'UTF8'));
begin
    select * into e from public.automation_events where id = p_id for update;
    if not found then raise exception 'Not found' using errcode = 'P0002'; end if;
    if e.state <> 'running' and e.attempt = p_attempt and e.completion_fingerprint = fingerprint then
        return yeoback_private.automation_event_json(e);
    end if;
    if e.state <> 'running' or e.attempt is distinct from p_attempt or e.lease_until <= clock_timestamp() then
        raise exception 'Automation attempt is not active' using errcode = '40001';
    end if;
    if p_state is null or p_state not in ('processed','escalated','failed') or p_result_code is null
        or p_result_code !~ '^[A-Z][A-Z0-9_]{0,63}$' then
        raise exception 'Invalid automation result' using errcode = '22023';
    end if;
    select * into strict policy from public.automation_policies where kind = e.kind for share;
    if policy.mode = 'off' then
        p_state := 'suppressed';
        p_result_code := 'POLICY_OFF';
    elsif p_outbound is not null then
        -- For support, destinationId must come from a server-owned verified
        -- inbox record. The binding below authenticates the user, not the chat.
        if p_state <> 'processed' or e.owner_id is null or jsonb_typeof(p_outbound) is distinct from 'object'
            or p_outbound - array['category','channel','body','bindingScope','bindingId','destinationId'] <> '{}'
            or jsonb_typeof(p_outbound->'body') is distinct from 'string'
            or coalesce(channel,'') not in ('mail','support')
            or (channel = 'mail' and (e.kind not in ('notify','gap_digest')
                or coalesce(category,'') not in ('transactional','marketing')
                or p_outbound ?| array['bindingScope','bindingId','destinationId']))
            or (channel = 'support' and (e.kind <> 'support' or coalesce(category,'') not in ('usage','status')
                or not exists (select 1 from public.automation_bindings b where b.provider = 'channeltalk' and b.enabled
                    and b.owner_id = e.owner_id and b.provider_scope = p_outbound->>'bindingScope'
                    and b.external_id = p_outbound->>'bindingId'))) then
            raise exception 'Invalid automation outbox payload' using errcode = '22023';
        end if;
        outbound_state := case when policy.mode = 'auto' and category <> 'marketing'
            and category = any(policy.allowed_categories) then 'approved' else 'draft' end;
        insert into public.outbound_messages(event_id,owner_id,channel,category,body,binding_scope,binding_id,destination_id,
            state,policy_revision,mock)
        values(e.id,e.owner_id,channel,category,p_outbound->>'body',p_outbound->>'bindingScope',p_outbound->>'bindingId',
            p_outbound->>'destinationId',outbound_state,policy.revision,e.mock);
    end if;
    update public.automation_events set state = p_state,result_code = p_result_code,lease_until = null,completion_fingerprint = fingerprint
        where id = e.id returning * into e;
    return yeoback_private.automation_event_json(e);
end;
$$;

-- Returns a terminal reason when policy, identity, or consent blocks dispatch.
-- Callers hold the message row first; consent changes take only the owner lock.
create function yeoback_private.outbound_blocker(m public.outbound_messages)
returns text language plpgsql set search_path = '' as $$
declare policy public.automation_policies%rowtype;
    event_expiry timestamptz;
begin
    select expires_at into strict event_expiry from public.automation_events where id = m.event_id;
    if event_expiry <= clock_timestamp() then return 'EVENT_EXPIRED'; end if;
    select p.* into strict policy from public.automation_policies p join public.automation_events e on e.kind = p.kind
        where e.id = m.event_id for share of p;
    if policy.mode = 'off' then return 'POLICY_OFF'; end if;
    if m.policy_revision <> policy.revision then return 'POLICY_CHANGED'; end if;
    if m.approved_by is null and (policy.mode <> 'auto' or m.category = 'marketing'
        or not (m.category = any(policy.allowed_categories))) then return 'POLICY_CHANGED'; end if;
    if m.channel = 'mail' then
        perform pg_advisory_xact_lock(hashtextextended('yeobek:automation-consent:' || m.owner_id::text,0));
        if not exists (select 1 from public.contact_consents c where c.owner_id = m.owner_id
            and c.category = m.category and c.granted) then return 'CONSENT_REQUIRED'; end if;
        if not exists (select 1 from auth.users u where u.id = m.owner_id and u.email_confirmed_at is not null
            and nullif(u.email,'') is not null) then return 'CONTACT_UNAVAILABLE'; end if;
    elsif not exists (select 1 from public.automation_bindings b where b.provider = 'channeltalk' and b.enabled
        and b.owner_id = m.owner_id and b.provider_scope = m.binding_scope and b.external_id = m.binding_id) then
        return 'BINDING_UNAVAILABLE';
    end if;
    return null;
end;
$$;

create function yeoback_private.outbound_dispatch_json(m public.outbound_messages)
returns jsonb language sql stable strict set search_path = '' as $$
    select jsonb_build_object('id',m.id,'attempt',m.send_attempt,'channel',m.channel,'category',m.category,'body',m.body,
        'mock',m.mock,'recipient',case when m.channel = 'mail' then (select email from auth.users where id = m.owner_id) end,
        'channelId',m.binding_scope,'chatId',m.destination_id);
$$;

create function public.claim_outbound_messages(p_limit integer,p_mock boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    m public.outbound_messages%rowtype;
    claimed jsonb := '[]';
    blocked text;
begin
    if p_limit is null or p_limit not between 1 and 100 or p_mock is null then
        raise exception 'Invalid dispatch claim' using errcode = '22023';
    end if;
    for m in select * from public.outbound_messages
        where mock = p_mock and (state = 'approved' or (state = 'sending' and lease_until <= statement_timestamp()))
        order by created_at,id limit p_limit for update skip locked
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

create function public.check_outbound_dispatch(p_id uuid,p_attempt uuid,p_mock boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    m public.outbound_messages%rowtype;
    blocked text;
begin
    select * into m from public.outbound_messages where id = p_id and state = 'sending' and send_attempt = p_attempt
        and mock = p_mock and dispatch_checked_at is null and lease_until > clock_timestamp() for update;
    if not found then return null; end if;
    blocked := yeoback_private.outbound_blocker(m);
    if blocked is not null then
        update public.outbound_messages set state = case when blocked = 'POLICY_CHANGED' then 'draft' else 'suppressed' end,
            result_code = blocked,approved_by = null,approved_at = null,revision = revision + 1,
            send_attempt = null,lease_until = null where id = m.id;
        return null;
    end if;
    update public.outbound_messages set dispatch_checked_at = statement_timestamp()
        where id = m.id returning * into m;
    return yeoback_private.outbound_dispatch_json(m);
end;
$$;

create function public.complete_outbound_message(p_id uuid,p_attempt uuid,p_status text,p_provider_id text,p_result_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.outbound_messages%rowtype;
begin
    if p_status is null or p_status not in ('accepted','unknown','rejected','failed') or p_result_code is null
        or p_result_code !~ '^[A-Z][A-Z0-9_]{0,63}$' or (p_provider_id is not null and p_status <> 'accepted') then
        raise exception 'Invalid dispatch result' using errcode = '22023';
    end if;
    select * into m from public.outbound_messages where id = p_id for update;
    if not found or m.send_attempt is distinct from p_attempt or p_attempt is null then
        raise exception 'Dispatch attempt is not active' using errcode = '40001';
    end if;
    if m.state <> 'sending' then
        if (m.state,m.provider_message_id,m.result_code) is distinct from (p_status,p_provider_id,p_result_code) then
            raise exception 'Dispatch attempt already completed' using errcode = '40001';
        end if;
        return yeoback_private.outbox_json(m);
    end if;
    if m.dispatch_checked_at is null and p_status <> 'failed' then
        raise exception 'Dispatch payload was not issued' using errcode = '40001';
    end if;
    update public.outbound_messages set state = p_status,provider_message_id = p_provider_id,result_code = p_result_code,
        lease_until = null,revision = revision + 1 where id = m.id returning * into m;
    return yeoback_private.outbox_json(m);
end;
$$;

revoke all on function yeoback_private.require_operator(),yeoback_private.bump_automation_policy(),
    yeoback_private.outbox_json(public.outbound_messages),yeoback_private.automation_event_json(public.automation_events),
    yeoback_private.outbound_blocker(public.outbound_messages),yeoback_private.outbound_dispatch_json(public.outbound_messages),
    public.set_contact_consent(text,boolean,integer),public.get_contact_consents(),public.list_outbox(integer),
    public.decide_outbox(uuid,integer,boolean),public.enqueue_automation_event(text,text,text,uuid,uuid,integer,boolean),
    public.claim_automation_events(integer,boolean),public.complete_automation_event(uuid,integer,text,text,jsonb),
    public.claim_outbound_messages(integer,boolean),public.check_outbound_dispatch(uuid,uuid,boolean),
    public.complete_outbound_message(uuid,uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.set_contact_consent(text,boolean,integer),public.get_contact_consents(),
    public.list_outbox(integer),public.decide_outbox(uuid,integer,boolean) to authenticated;
grant execute on function public.enqueue_automation_event(text,text,text,uuid,uuid,integer,boolean),
    public.claim_automation_events(integer,boolean),public.complete_automation_event(uuid,integer,text,text,jsonb),
    public.claim_outbound_messages(integer,boolean),public.check_outbound_dispatch(uuid,uuid,boolean),
    public.complete_outbound_message(uuid,uuid,text,text,text) to service_role;
commit;
