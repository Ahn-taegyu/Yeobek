begin;

create or replace function yeoback_private.ensure_artist(p_owner uuid) returns uuid
language plpgsql set search_path = '' as $$
declare
    artist uuid;
    signup_profile jsonb;
    full_name text;
    display_name text;
begin
    select a.id into artist from public.artist_profiles a where a.owner_id = p_owner;
    if found then return artist; end if;

    select u.raw_app_meta_data->'yeobek_signup_profile' into signup_profile
        from auth.users u
        where u.id = p_owner and u.email_confirmed_at is not null
            and u.raw_app_meta_data ? 'yeobek_signup_request_id';

    full_name := yeoback_private.onboarding_name(signup_profile->>'fullName');
    display_name := yeoback_private.onboarding_name(signup_profile->>'displayName');

    insert into public.artist_profiles (owner_id, full_name, display_name)
    values (p_owner,
        case when char_length(full_name) <= 100 and yeoback_private.visible_onboarding_name(full_name) then full_name end,
        case when char_length(display_name) <= 100 and yeoback_private.visible_onboarding_name(display_name) then display_name end)
    on conflict (owner_id) do nothing returning id into artist;
    if found then
        perform yeoback_private.add_document(p_owner, 'artist', artist, '[]', '[]');
    else
        select a.id into artist from public.artist_profiles a where a.owner_id = p_owner;
    end if;
    return artist;
end;
$$;

commit;
