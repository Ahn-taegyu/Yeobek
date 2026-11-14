begin;

-- Finds an unconfirmed self-service signup account for the same email, regardless
-- of its original request ID. The signup flow uses this to restart verification
-- with a fresh password, request ID and code. Confirmed, operator-issued, OAuth
-- and anonymous accounts are never returned.
create function public.get_pending_signup_user(p_email text)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare
    normalized_email text := lower(btrim(p_email));
    pending_user uuid;
begin
    if normalized_email is null or normalized_email = '' or char_length(p_email) > 254 then
        raise exception 'Invalid signup email' using errcode = '22023';
    end if;

    select u.id into pending_user from auth.users u
    where lower(u.email) = normalized_email and u.email_confirmed_at is null
        and u.deleted_at is null and u.is_anonymous is not true
        and u.raw_app_meta_data->>'provider' = 'email'
        and u.raw_app_meta_data ? 'yeobek_signup_request_id'
    order by u.created_at, u.id
    limit 1;
    return pending_user;
end;
$$;
revoke all on function public.get_pending_signup_user(text) from public,anon,authenticated,service_role;
grant execute on function public.get_pending_signup_user(text) to service_role;

commit;
