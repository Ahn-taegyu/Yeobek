begin;

create function yeoback_private.publication_has_mock_qa(p_publication_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
    select exists(select 1 from public.publications p,
        jsonb_array_elements(coalesce(p.evidence->'approvedQa','[]'::jsonb)) qa
        where p.id=p_publication_id and qa->>'mock'='true');
$$;
revoke all on function yeoback_private.publication_has_mock_qa(uuid) from public,anon,authenticated,service_role;

alter function yeoback_private.publish_with_audio(uuid,uuid,uuid,integer,jsonb,jsonb,boolean,boolean)
    rename to publish_with_audio_without_qa_mode_guard;
create function yeoback_private.publish_with_audio(p_owner uuid,p_exhibition_id uuid,p_request_id uuid,p_expected_revision integer,
    p_artworks jsonb,p_intro jsonb,p_voice_required boolean,p_attach_audio boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare old_request public.publication_requests%rowtype; blocked jsonb; e public.exhibitions%rowtype;
begin
    perform yeoback_private.lock_publication(p_owner);
    perform yeoback_private.subject_scope(p_owner,'exhibition',p_exhibition_id);
    if coalesce(current_setting('yeobek.notification_mock',true),'')<>'true' then
        select * into old_request from public.publication_requests where owner_id=p_owner and request_id=p_request_id;
        if found then
            if old_request.fingerprint<>sha256(convert_to(jsonb_build_array(p_exhibition_id,p_expected_revision,p_artworks,p_intro)::text,'UTF8')) then
                raise exception 'Request ID already used with different input' using errcode='P1005';
            end if;
            if exists(select 1 from jsonb_array_elements(old_request.result->'publications') r
                where yeoback_private.publication_has_mock_qa((r->>'publicationId')::uuid)) or exists (
                select 1 from public.artworks a join public.publications p on p.id=a.active_publication_id
                where a.owner_id=p_owner and a.exhibition_id=p_exhibition_id and a.deleted_at is null and p.revoked_at is null
                    and a.id not in (select (x->>'artwork_id')::uuid from jsonb_array_elements(p_artworks) x)
                    and yeoback_private.publication_has_mock_qa(p.id)
            ) then
                raise exception 'Publication contains mock QA' using errcode='40001';
            end if;
            -- Check pinned selected publications plus retained unselected snapshots, never later drafts.
            return yeoback_private.publish_with_audio_without_qa_mode_guard(p_owner,p_exhibition_id,p_request_id,
                p_expected_revision,p_artworks,p_intro,p_voice_required,p_attach_audio);
        end if;
        select coalesce(jsonb_agg(jsonb_build_object('artworkId',a.id,'reasons',jsonb_build_array('MOCK_QA_NOT_ALLOWED'))),'[]')
        into blocked from public.artworks a join public.publications p on p.id=a.active_publication_id
        where a.owner_id=p_owner and a.exhibition_id=p_exhibition_id and a.deleted_at is null and p.revoked_at is null
            and a.id not in (select (x->>'artwork_id')::uuid from jsonb_array_elements(p_artworks) x)
            and yeoback_private.publication_has_mock_qa(p.id);
        if blocked<>'[]' then
            select * into e from public.exhibitions where id=p_exhibition_id;
            return jsonb_build_object('exhibitionId',e.id,'revision',e.revision,'state',e.state,
                'publications','[]'::jsonb,'blocked',blocked,'created',false);
        end if;
    end if;
    return yeoback_private.publish_with_audio_without_qa_mode_guard(p_owner,p_exhibition_id,p_request_id,
        p_expected_revision,p_artworks,p_intro,p_voice_required,p_attach_audio);
end;
$$;
revoke all on function yeoback_private.publish_with_audio(uuid,uuid,uuid,integer,jsonb,jsonb,boolean,boolean),
    yeoback_private.publish_with_audio_without_qa_mode_guard(uuid,uuid,uuid,integer,jsonb,jsonb,boolean,boolean)
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
        select 1 from public.artworks a join public.publications p on p.id=a.active_publication_id
        where a.owner_id=p_owner and a.exhibition_id=p_exhibition_id and a.deleted_at is null
            and ((p_artwork_id is null and a.state='published') or a.id=p_artwork_id)
            and p.revoked_at is null and yeoback_private.publication_has_mock_qa(p.id)
    ) then raise exception 'Publication contains mock QA' using errcode='40001'; end if;

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

commit;
