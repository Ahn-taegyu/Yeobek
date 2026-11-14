begin;

create table public.automation_notify_signals (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null,
    exhibition_id uuid not null,
    trigger_kind text not null check (trigger_kind in ('exhibition_created','draft_ready','published')),
    dedupe_key text not null unique,
    source_revision integer not null,
    exhibition_revision integer not null,
    source_job_id uuid,
    source_mock boolean,
    consumed_at timestamptz,
    created_at timestamptz not null default statement_timestamp(),
    expires_at timestamptz not null default (statement_timestamp() +
        yeoback_private.policy_integer('automation_event_retention_days') * interval '1 day'),
    foreign key (owner_id,exhibition_id) references public.exhibitions(owner_id,id)
);
create index automation_notify_pending on public.automation_notify_signals(created_at,id) where consumed_at is null;
create index automation_notify_expiry on public.automation_notify_signals(expires_at,id);
alter table public.automation_notify_signals enable row level security;
revoke all on public.automation_notify_signals from public,anon,authenticated,service_role;

create function yeoback_private.signal_exhibition_notification()
returns trigger language plpgsql set search_path = '' as $$
declare trigger_kind text;
    origin_mock boolean;
    runtime_mode text := current_setting('yeobek.notification_mock',true);
begin
    if tg_op = 'INSERT' then trigger_kind := 'exhibition_created';
    elsif new.state = 'published' and new.revision > old.revision then
        trigger_kind := 'published';
        -- Publication does not record a general provider mode. An attached
        -- known mock asset pins this signal to mock; otherwise the mode is unknown.
        if runtime_mode in ('true','false') then
            origin_mock := runtime_mode::boolean;
        elsif exists (select 1 from public.artworks a join public.publications p on p.id = a.active_publication_id
            join public.audio_assets v on v.storage_key = p.audio_key
            where a.exhibition_id = new.id and a.state = 'published' and v.mock) then origin_mock := true; end if;
    else return new;
    end if;
    insert into public.automation_notify_signals(owner_id,exhibition_id,trigger_kind,dedupe_key,
        source_revision,exhibition_revision,source_mock)
    values(new.owner_id,new.id,trigger_kind,trigger_kind || ':' || new.id || ':' || new.revision,
        new.revision,new.revision,origin_mock) on conflict(dedupe_key) do nothing;
    return new;
end;
$$;
create trigger exhibition_created_notify after insert on public.exhibitions
    for each row execute function yeoback_private.signal_exhibition_notification();
create trigger exhibition_published_notify after update of public_title on public.exhibitions
    for each row execute function yeoback_private.signal_exhibition_notification();

create or replace function public.publish_with_audio_config(p_owner uuid,p_exhibition_id uuid,p_request_id uuid,p_expected_revision integer,
    p_artworks jsonb,p_intro jsonb,p_voice_required boolean,p_voice_fingerprint text,p_mock boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    previous_mode text := current_setting('yeobek.notification_mock',true);
    result jsonb;
begin
    if p_mock is null then raise exception 'Invalid notification mode' using errcode = '22023'; end if;
    if p_voice_fingerprint is null and p_voice_required is distinct from false then
        raise exception 'Voice configuration is required for publication' using errcode = 'P1003';
    end if;
    perform yeoback_private.lock_publication(p_owner);
    if p_voice_fingerprint is not null then
        perform public.sync_audio_config(p_voice_fingerprint,p_mock);
    end if;
    perform set_config('yeobek.notification_mock',p_mock::text,true);
    result := yeoback_private.publish_with_audio(p_owner,p_exhibition_id,p_request_id,p_expected_revision,
        p_artworks,p_intro,p_voice_required,p_voice_fingerprint is not null);
    perform set_config('yeobek.notification_mock',coalesce(previous_mode,''),true);
    return result;
end;
$$;

create function yeoback_private.signal_narration_notification()
returns trigger language plpgsql set search_path = '' as $$
begin
    if new.kind <> 'narration' or old.status = 'succeeded' or new.status <> 'succeeded' then return new; end if;
    insert into public.automation_notify_signals(owner_id,exhibition_id,trigger_kind,dedupe_key,
        source_revision,exhibition_revision,source_job_id,source_mock)
    select new.owner_id,e.id,'draft_ready','draft_ready:' || new.id || ':' || new.attempt,
        new.expected_revision,e.revision,new.id,new.mock
    from public.artworks a join public.exhibitions e on e.id = a.exhibition_id
    where a.id = new.artwork_id and a.owner_id = new.owner_id and a.deleted_at is null and e.deleted_at is null
    on conflict(dedupe_key) do nothing;
    return new;
end;
$$;
create trigger narration_ready_notify after update of status on public.ai_jobs
    for each row execute function yeoback_private.signal_narration_notification();

create function yeoback_private.notification_target_current(s public.automation_notify_signals,e public.exhibitions)
returns boolean language sql stable set search_path = '' as $$
    select e.id is not null and e.owner_id = s.owner_id and e.id = s.exhibition_id and e.deleted_at is null
        and e.revision = s.exhibition_revision
        and case s.trigger_kind
            when 'exhibition_created' then e.state = 'draft'
            when 'published' then exists (select 1 from yeoback_private.public_artworks(e.id))
            when 'draft_ready' then exists (
                select 1 from public.ai_jobs j join public.artworks a on a.id = j.artwork_id and a.owner_id = j.owner_id
                    join public.knowledge_documents d on d.id = j.document_id and d.owner_id = j.owner_id
                where j.id = s.source_job_id and j.owner_id = s.owner_id and j.kind = 'narration'
                    and j.status = 'succeeded' and j.expires_at > statement_timestamp()
                    and a.exhibition_id = s.exhibition_id and a.deleted_at is null
                    and a.revision = j.expected_revision and d.revision = j.expected_document_revision
            )
            else false end;
$$;

create function public.schedule_automation_notifications(p_limit integer,p_mock boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    signal public.automation_notify_signals%rowtype;
    exhibit public.exhibitions%rowtype;
    scheduled integer := 0;
    discarded integer := 0;
begin
    if p_mock is null or p_limit is null or p_limit not between 1 and 100 then
        raise exception 'Invalid notification schedule' using errcode = '22023';
    end if;
    with due as (
        select n.id from public.automation_notify_signals n where n.expires_at <= statement_timestamp()
        order by n.expires_at,n.id limit p_limit for update skip locked
    ) delete from public.automation_notify_signals n using due where n.id = due.id;
    for signal in select * from public.automation_notify_signals
        where consumed_at is null and expires_at > statement_timestamp() and (source_mock is null or source_mock = p_mock)
        order by created_at,id limit p_limit for update skip locked
    loop
        select * into exhibit from public.exhibitions where id = signal.exhibition_id;
        if yeoback_private.notification_target_current(signal,exhibit) then
            perform public.enqueue_automation_event('notify',signal.trigger_kind,signal.dedupe_key,
                signal.owner_id,signal.exhibition_id,signal.source_revision,p_mock);
            scheduled := scheduled + 1;
        else discarded := discarded + 1;
        end if;
        update public.automation_notify_signals set consumed_at = statement_timestamp() where id = signal.id;
    end loop;
    return jsonb_build_object('scheduled',scheduled,'discarded',discarded);
end;
$$;

-- A notify-only runner must never lease work owned by other automations.
create function public.claim_automation_notifications(p_limit integer,p_mock boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    e public.automation_events%rowtype;
    claimed jsonb := '[]';
    policy_mode text;
begin
    if p_limit is null or p_limit not between 1 and 100 or p_mock is null then
        raise exception 'Invalid automation claim' using errcode = '22023';
    end if;
    with expired as (
        select x.id from public.automation_events x where x.kind = 'notify' and x.mock = p_mock
            and x.state in ('running','queued') and x.expires_at <= statement_timestamp()
        order by x.expires_at,x.id limit p_limit for update skip locked
    )
    update public.automation_events x set state = 'failed',result_code = 'EVENT_EXPIRED',lease_until = null
    from expired where x.id = expired.id;
    for e in select * from public.automation_events where kind = 'notify' and mock = p_mock
        and expires_at > statement_timestamp()
        and (state = 'queued' or (state = 'running' and lease_until <= statement_timestamp()))
        order by created_at,id limit p_limit for update skip locked
    loop
        select mode into strict policy_mode from public.automation_policies where kind = 'notify';
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

create function public.get_notification_context(p_event_id uuid,p_attempt integer,p_mock boolean)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
    event_row public.automation_events%rowtype;
    signal public.automation_notify_signals%rowtype;
    exhibit public.exhibitions%rowtype;
begin
    select * into event_row from public.automation_events where id = p_event_id and kind = 'notify'
        and state = 'running' and attempt = p_attempt and mock = p_mock
        and lease_until > statement_timestamp() and expires_at > statement_timestamp();
    if not found or not exists (select 1 from public.automation_policies where kind = 'notify' and mode <> 'off') then return null; end if;
    select * into signal from public.automation_notify_signals where dedupe_key = event_row.dedupe_key
        and consumed_at is not null and expires_at > statement_timestamp() and owner_id = event_row.owner_id and exhibition_id = event_row.exhibition_id
        and trigger_kind = event_row.trigger_kind and source_revision = event_row.source_revision
        and (source_mock is null or source_mock = event_row.mock);
    if not found then return null; end if;
    select * into exhibit from public.exhibitions where id = signal.exhibition_id;
    if not coalesce(yeoback_private.notification_target_current(signal,exhibit),false) then return null; end if;
    return jsonb_build_object('eventId',event_row.id,'trigger',signal.trigger_kind,'sourceRevision',signal.source_revision,
        'exhibitionId',exhibit.id,'exhibitionRevision',exhibit.revision,'exhibitionState',exhibit.state,
        'artworkCount',(select count(*) from public.artworks a where a.exhibition_id = exhibit.id and a.deleted_at is null),
        'approvedCount',(select count(*) from public.artworks a where a.exhibition_id = exhibit.id and a.deleted_at is null
            and (yeoback_private.current_narration_approval(exhibit.owner_id,a.id)).id is not null),
        'publishedCount',(select count(*) from yeoback_private.public_artworks(exhibit.id)));
end;
$$;

revoke all on function yeoback_private.signal_exhibition_notification(),yeoback_private.signal_narration_notification(),
    yeoback_private.notification_target_current(public.automation_notify_signals,public.exhibitions),
    public.schedule_automation_notifications(integer,boolean),public.claim_automation_notifications(integer,boolean),
    public.get_notification_context(uuid,integer,boolean)
    from public,anon,authenticated,service_role;
grant execute on function public.schedule_automation_notifications(integer,boolean),public.claim_automation_notifications(integer,boolean),
    public.get_notification_context(uuid,integer,boolean) to service_role;

commit;
