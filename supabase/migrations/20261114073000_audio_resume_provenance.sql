begin;

create function public.resume_with_audio_mode(p_owner uuid,p_exhibition_id uuid,p_expected_revision integer,
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

    return yeoback_private.change_publication_state(p_owner,p_exhibition_id,p_expected_revision,p_artwork_id,true,p_voice_required);
end;
$$;

revoke all on function public.resume_with_audio_mode(uuid,uuid,integer,boolean,boolean,uuid)
    from public,anon,authenticated,service_role;
grant execute on function public.resume_with_audio_mode(uuid,uuid,integer,boolean,boolean,uuid) to service_role;

commit;
