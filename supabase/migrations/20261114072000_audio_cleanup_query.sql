begin;

create or replace function public.list_audio_cleanup(p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
    if p_limit is null or p_limit not between 1 and 100 then
        raise exception 'Invalid audio cleanup limit' using errcode = '22023';
    end if;
    -- Data-modifying CTEs must be the top-level statement, not a RETURN expression.
    with candidates as (
        select a.id from public.audio_assets a
        where a.cleanup_after <= statement_timestamp() and a.state in ('pending','failed','revoked')
            and not exists (select 1 from public.publications p where p.audio_key = a.storage_key)
        order by a.cleanup_after,a.id limit p_limit for update of a skip locked
    ), claimed as (
        update public.audio_assets a set state = 'revoked' from candidates c where c.id = a.id
        returning a.id,a.owner_id,a.storage_key,a.cleanup_after
    )
    select coalesce(jsonb_agg(jsonb_build_object('id',id,'ownerId',owner_id,'storageKey',storage_key)
        order by cleanup_after,id),'[]') into result from claimed;
    return result;
end;
$$;

commit;
