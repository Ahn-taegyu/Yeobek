begin;

create or replace function public.list_visitor_audio_cleanup(p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
    if p_limit is null or p_limit not between 1 and 100 then
        raise exception 'Invalid visitor audio cleanup limit' using errcode = '22023';
    end if;
    with due as (
        select a.id from public.visitor_audio_assets a where a.cleanup_after <= statement_timestamp()
            order by a.cleanup_after,a.id limit p_limit for update skip locked
    ), claimed as (
        update public.visitor_audio_assets a set cleanup_claimed = true from due d where d.id = a.id
        returning a.id,a.storage_key,a.cleanup_after
    ) select coalesce(jsonb_agg(jsonb_build_object('id',id,'storageKey',storage_key) order by cleanup_after,id),'[]') into result from claimed;
    return result;
end;
$$;

commit;
