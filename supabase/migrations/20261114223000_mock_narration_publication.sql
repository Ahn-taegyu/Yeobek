begin;

-- Provenance survives job expiry; private tables never expose narration text.
create table yeoback_private.mock_narration_hashes (
    owner_id uuid not null references auth.users(id),
    artwork_id uuid not null references public.artworks(id),
    text_hash bytea not null,
    primary key(owner_id,artwork_id,text_hash)
);
create table yeoback_private.narration_provenance (
    owner_id uuid not null references auth.users(id),
    artwork_id uuid not null references public.artworks(id),
    revision integer not null,
    text_hash bytea,
    mock boolean not null,
    primary key(owner_id,artwork_id,revision)
);
revoke all on yeoback_private.mock_narration_hashes,yeoback_private.narration_provenance from public,anon,authenticated,service_role;

insert into yeoback_private.mock_narration_hashes
select owner_id,artwork_id,sha256(convert_to(result#>>'{selected,answer}','UTF8')) from public.ai_jobs
where kind='narration' and status='succeeded' and (mock or result->'mock'='true')
    and result#>>'{selected,answer}' is not null on conflict do nothing;

create function yeoback_private.remember_mock_narration() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
    if new.kind='narration' and new.status='succeeded' and (new.mock or new.result->'mock'='true')
        and new.result#>>'{selected,answer}' is not null then
        insert into yeoback_private.mock_narration_hashes values
            (new.owner_id,new.artwork_id,sha256(convert_to(new.result#>>'{selected,answer}','UTF8')))
            on conflict do nothing;
    end if;
    return new;
end;
$$;
revoke all on function yeoback_private.remember_mock_narration() from public,anon,authenticated,service_role;
create trigger remember_mock_narration after insert or update of result,status on public.ai_jobs
    for each row execute function yeoback_private.remember_mock_narration();

-- Manual edits of a simulated draft retain its provenance. A verified live job
-- is the explicit replacement path; omitting sourceJobId cannot clear the marker.
alter function yeoback_private.save_narration_draft(uuid,integer,text,uuid) rename to save_narration_draft_without_provenance;
create function yeoback_private.save_narration_draft(p_artwork_id uuid,p_expected_revision integer,p_text text,p_source_job_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare owner uuid := yeoback_private.require_owner(); saved jsonb; simulated boolean;
begin
    saved := yeoback_private.save_narration_draft_without_provenance(p_artwork_id,p_expected_revision,p_text,p_source_job_id);
    if p_source_job_id is not null then
        select j.mock or coalesce(j.result->'mock'='true',false) into simulated
        from public.ai_jobs j where j.id=p_source_job_id and j.owner_id=owner;
    else
        select p.mock into simulated from yeoback_private.narration_provenance p
        where p.owner_id=owner and p.artwork_id=p_artwork_id and p.revision<=p_expected_revision
        order by p.revision desc limit 1;
    end if;
    simulated := coalesce(simulated,false) or exists(select 1 from yeoback_private.mock_narration_hashes h
        where h.owner_id=owner and h.artwork_id=p_artwork_id and h.text_hash=sha256(convert_to(p_text,'UTF8')));
    insert into yeoback_private.narration_provenance values
        (owner,p_artwork_id,p_expected_revision+1,sha256(convert_to(p_text,'UTF8')),simulated);
    return saved;
end;
$$;
revoke all on function yeoback_private.save_narration_draft(uuid,integer,text,uuid),
    yeoback_private.save_narration_draft_without_provenance(uuid,integer,text,uuid) from public,anon,authenticated,service_role;

-- Backfill the currently saved draft when a retained job proves its origin.
insert into yeoback_private.narration_provenance
select a.owner_id,a.id,a.revision,sha256(convert_to(a.narration_draft,'UTF8')),true
from public.artworks a join yeoback_private.mock_narration_hashes h on h.owner_id=a.owner_id
    and h.artwork_id=a.id and h.text_hash=sha256(convert_to(a.narration_draft,'UTF8'));

create function yeoback_private.narration_is_mock(p public.narration_approvals)
returns boolean language sql stable set search_path = '' as $$
    select coalesce((select n.mock from yeoback_private.narration_provenance n
        where n.owner_id=p.owner_id and n.artwork_id=p.artwork_id and n.revision<=p.artwork_revision
        and n.text_hash=p.text_hash order by n.revision desc limit 1),false)
    or exists(select 1 from yeoback_private.mock_narration_hashes h where h.owner_id=p.owner_id
        and h.artwork_id=p.artwork_id and h.text_hash=p.text_hash);
$$;
revoke all on function yeoback_private.narration_is_mock(public.narration_approvals) from public,anon,authenticated,service_role;

create table yeoback_private.publication_narration_provenance (
    publication_id uuid primary key references public.publications(id),
    mock boolean not null
);
revoke all on yeoback_private.publication_narration_provenance from public,anon,authenticated,service_role;
insert into yeoback_private.publication_narration_provenance
select p.id,exists(select 1 from public.narration_approvals n where n.owner_id=p.owner_id
    and n.artwork_id=p.artwork_id and n.text_hash=p.narration_hash and yeoback_private.narration_is_mock(n))
from public.publications p;
create function yeoback_private.pin_publication_narration_origin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
    insert into yeoback_private.publication_narration_provenance values(new.id,
        yeoback_private.narration_is_mock(yeoback_private.current_narration_approval(new.owner_id,new.artwork_id)));
    return new;
end;
$$;
revoke all on function yeoback_private.pin_publication_narration_origin() from public,anon,authenticated,service_role;
create trigger pin_publication_narration_origin after insert on public.publications
    for each row execute function yeoback_private.pin_publication_narration_origin();

alter function yeoback_private.publish_with_audio(uuid,uuid,uuid,integer,jsonb,jsonb,boolean,boolean)
    rename to publish_with_audio_without_mock_guard;
create function yeoback_private.publish_with_audio(p_owner uuid,p_exhibition_id uuid,p_request_id uuid,p_expected_revision integer,
    p_artworks jsonb,p_intro jsonb,p_voice_required boolean,p_attach_audio boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare blocked jsonb; e public.exhibitions%rowtype; old_request public.publication_requests%rowtype; replay_mock boolean;
begin
    perform yeoback_private.lock_publication(p_owner);
    perform yeoback_private.subject_scope(p_owner,'exhibition',p_exhibition_id);
    select * into old_request from public.publication_requests where owner_id=p_owner and request_id=p_request_id;
    if found then
        if old_request.fingerprint<>sha256(convert_to(jsonb_build_array(p_exhibition_id,p_expected_revision,p_artworks,p_intro)::text,'UTF8')) then
            raise exception 'Request ID already used with different input' using errcode='P1005';
        end if;
        select coalesce(bool_or(n.mock),false) into replay_mock
        from jsonb_array_elements(old_request.result->'publications') r
        join yeoback_private.publication_narration_provenance n on n.publication_id=(r->>'publicationId')::uuid;
        if not replay_mock or current_setting('yeobek.notification_mock',true)='true' then
            return old_request.result || '{"created":false}'::jsonb;
        end if;
        raise exception 'Publication contains mock narration' using errcode='40001';
    end if;
    if coalesce(current_setting('yeobek.notification_mock',true),'')<>'true' then
        select coalesce(jsonb_agg(jsonb_build_object('artworkId',a.id,'reasons',jsonb_build_array('MOCK_NARRATION_NOT_ALLOWED'))),'[]')
        into blocked from public.artworks a
        where a.owner_id=p_owner and a.exhibition_id=p_exhibition_id and a.deleted_at is null and (
            (a.id in (select (x->>'artwork_id')::uuid from jsonb_array_elements(p_artworks) x)
                and yeoback_private.narration_is_mock(yeoback_private.current_narration_approval(p_owner,a.id)))
            or (a.id not in (select (x->>'artwork_id')::uuid from jsonb_array_elements(p_artworks) x)
                and exists(select 1 from public.publications p join yeoback_private.publication_narration_provenance n on n.publication_id=p.id
                    where p.id=a.active_publication_id and p.revoked_at is null and n.mock)));
        if blocked<>'[]' then
            select * into e from public.exhibitions where id=p_exhibition_id;
            return jsonb_build_object('exhibitionId',e.id,'revision',e.revision,'state',e.state,
                'publications','[]'::jsonb,'blocked',blocked,'created',false);
        end if;
    end if;
    return yeoback_private.publish_with_audio_without_mock_guard(p_owner,p_exhibition_id,p_request_id,p_expected_revision,
        p_artworks,p_intro,p_voice_required,p_attach_audio);
end;
$$;
revoke all on function yeoback_private.publish_with_audio(uuid,uuid,uuid,integer,jsonb,jsonb,boolean,boolean),
    yeoback_private.publish_with_audio_without_mock_guard(uuid,uuid,uuid,integer,jsonb,jsonb,boolean,boolean)
    from public,anon,authenticated,service_role;

create or replace function public.resume_with_audio_mode(p_owner uuid,p_exhibition_id uuid,p_expected_revision integer,
    p_voice_required boolean,p_mock boolean,p_artwork_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
    if p_mock is null then raise exception 'Invalid audio mode' using errcode = '22023'; end if;
    perform yeoback_private.lock_publication(p_owner);
    perform yeoback_private.subject_scope(p_owner,'exhibition',p_exhibition_id);
    if p_artwork_id is not null and not exists (
        select 1 from public.artworks a where a.owner_id = p_owner and a.exhibition_id = p_exhibition_id
            and a.id = p_artwork_id and a.deleted_at is null
    ) then raise exception 'Subject not found' using errcode = 'P0002'; end if;

    if not p_mock and exists (
        select 1 from public.artworks a
        join public.publications p on p.id = a.active_publication_id
        join public.audio_assets audio on audio.storage_key = p.audio_key and audio.owner_id = p_owner
        where a.owner_id = p_owner and a.exhibition_id = p_exhibition_id and a.deleted_at is null
            and ((p_artwork_id is null and a.state = 'published') or a.id = p_artwork_id)
            and yeoback_private.publication_is_valid(p) and audio.mock
    ) then raise exception 'Publication contains mock audio' using errcode = '40001'; end if;

    if not p_mock and exists(select 1 from public.artworks a
        join public.publications p on p.id=a.active_publication_id
        join yeoback_private.publication_narration_provenance n on n.publication_id=p.id
        where a.owner_id=p_owner and a.exhibition_id=p_exhibition_id and a.deleted_at is null
        and ((p_artwork_id is null and a.state='published') or a.id=p_artwork_id)
        and p.revoked_at is null and n.mock) then
        raise exception 'Publication contains mock narration' using errcode='40001';
    end if;

    return yeoback_private.change_publication_state(p_owner,p_exhibition_id,p_expected_revision,p_artwork_id,true,p_voice_required);
end;
$$;

revoke all on function public.resume_with_audio_mode(uuid,uuid,integer,boolean,boolean,uuid)
    from public,anon,authenticated,service_role;
grant execute on function public.resume_with_audio_mode(uuid,uuid,integer,boolean,boolean,uuid) to service_role;

create or replace function public.resume(p_owner uuid,p_exhibition_id uuid,p_expected_revision integer,p_voice_required boolean,p_artwork_id uuid default null)
returns jsonb language sql security definer set search_path = '' as $$
    select public.resume_with_audio_mode(p_owner,p_exhibition_id,p_expected_revision,p_voice_required,false,p_artwork_id);
$$;

commit;
