begin;

create or replace function yeoback_private.exhibition_publication_rules(p_owner uuid,p_exhibition_id uuid)
returns text[] language plpgsql stable set search_path = '' as $$
declare e public.exhibitions%rowtype; reasons text[]; blocker jsonb; blocker_code text;
begin
    perform yeoback_private.subject_scope(p_owner,'exhibition',p_exhibition_id);
    select * into strict e from public.exhibitions where id=p_exhibition_id and owner_id=p_owner;
    select coalesce(array_agg(code order by ord),'{}') into reasons from (values
        (1,'EXHIBITION_TITLE_REQUIRED',e.title is null or e.title !~ '[^[:space:]]'),
        (2,'EXHIBITION_PERIOD_REQUIRED',e.start_date is null or e.end_date is null),
        (3,'EXHIBITION_PERIOD_INVALID',e.start_date > e.end_date),
        (4,'EXHIBITION_PLACE_REQUIRED',e.place is null or e.place !~ '[^[:space:]]'),
        (5,'ARTWORK_REQUIRED',not exists(select 1 from public.artworks a where a.exhibition_id=e.id and a.deleted_at is null)),
        (6,'ARTIST_NAME_REQUIRED',not exists(select 1 from public.artist_profiles a where a.owner_id=p_owner and nullif(btrim(a.display_name),'') is not null))
    ) rules(ord,code,blocked) where blocked;
    if e.authoring_step is not null then
        if e.authoring_step <> 'artworks' then
            reasons := array_append(reasons,'EXHIBITION_AUTHORING_INCOMPLETE');
        end if;
        for blocker in select value from jsonb_array_elements(yeoback_private.exhibition_authoring_blockers(e)) loop
            blocker_code := 'EXHIBITION_' || (blocker->>'code');
            if not blocker_code = any(reasons) then reasons := array_append(reasons,blocker_code); end if;
        end loop;
    end if;
    return reasons;
end;
$$;
revoke all on function yeoback_private.exhibition_publication_rules(uuid,uuid) from public,anon,authenticated,service_role;

commit;
