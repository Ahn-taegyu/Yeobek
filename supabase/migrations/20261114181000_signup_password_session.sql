begin;

create function yeoback_private.artist_password_session_allowed()
returns boolean language sql stable set search_path = '' as $$
    select not coalesce((claims->'app_metadata') ? 'yeobek_signup_request_id',false)
        or coalesce(jsonb_typeof(claims->'amr') = 'array'
            and (claims->'amr') @> '[{"method":"password"}]'::jsonb,false)
    from (select auth.jwt() as claims) jwt_claims;
$$;
revoke all on function yeoback_private.artist_password_session_allowed() from public,anon,authenticated,service_role;

create or replace function yeoback_private.require_owner() returns uuid
language plpgsql stable set search_path = '' as $$
declare owner uuid := auth.uid();
begin
    if owner is null or auth.jwt()->>'is_anonymous' = 'true'
        or not yeoback_private.artist_password_session_allowed() then
        raise exception 'Artist sign-in is required' using errcode = '42501';
    end if;
    return owner;
end;
$$;

create or replace function yeoback_private.require_operator()
returns uuid language plpgsql stable set search_path = '' as $$
declare actor uuid := auth.uid();
begin
    if actor is null or auth.jwt()->>'is_anonymous' = 'true'
        or not yeoback_private.artist_password_session_allowed()
        or not exists (select 1 from public.operators where user_id = actor and enabled) then
        raise exception 'Not found' using errcode = 'P0002';
    end if;
    return actor;
end;
$$;

-- Match the helper without granting authenticated users access to the private schema.
do $migration$
declare table_name text;
begin
    foreach table_name in array array['artist_profiles','exhibitions','artworks',
        'knowledge_documents','materials','publications'] loop
        execute format($policy$
            create policy artist_password_session on public.%I as restrictive for select to authenticated
            using ((select not coalesce((claims->'app_metadata') ? 'yeobek_signup_request_id',false)
                or coalesce(jsonb_typeof(claims->'amr') = 'array'
                    and (claims->'amr') @> '[{"method":"password"}]'::jsonb,false)
                from (select auth.jwt() as claims) jwt_claims))
        $policy$,table_name);
    end loop;
end;
$migration$;

commit;
