begin;

-- A single DB snapshot avoids one network round trip per displayed artwork.
create function public.check_publication_versions(p_exhibition_id uuid,p_publications jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
    if p_exhibition_id is null or jsonb_typeof(p_publications) is distinct from 'array'
        or jsonb_array_length(p_publications) > 100 then
        raise exception 'Invalid publication references' using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_array_elements(p_publications) r where
        jsonb_typeof(r) <> 'object' or r - array['artworkId','publicationId','version'] <> '{}'
        or not r ?& array['artworkId','publicationId','version']
        or jsonb_typeof(r->'version') is distinct from 'number'
        or coalesce(r->>'version','') !~ '^[1-9][0-9]{0,9}$'
        or (r->>'version')::numeric > 2147483647) then
        raise exception 'Invalid publication references' using errcode = '22023';
    end if;
    return jsonb_build_object('publications',coalesce((select jsonb_agg(jsonb_build_object(
        'exhibitionId',p_exhibition_id,'artworkId',(r->>'artworkId')::uuid,
        'publicationId',(r->>'publicationId')::uuid,'version',(r->>'version')::integer,
        'current',exists(select 1 from yeoback_private.public_artworks(p_exhibition_id) p
            where p.artwork_id = (r->>'artworkId')::uuid and p.id = (r->>'publicationId')::uuid
                and p.version = (r->>'version')::integer)) order by ord)
        from jsonb_array_elements(p_publications) with ordinality t(r,ord)),'[]'::jsonb));
end;
$$;
revoke all on function public.check_publication_versions(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.check_publication_versions(uuid,jsonb) to service_role;
commit;
