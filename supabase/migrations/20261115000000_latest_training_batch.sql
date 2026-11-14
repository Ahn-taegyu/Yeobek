begin;

-- Legacy manifests recorded only expiry. Preserve their expiry ordering using
-- the original 30-day retention; this is an estimate, not recovered history.
alter table yeoback_private.training_batches add column created_at timestamptz;
update yeoback_private.training_batches set created_at = expires_at - interval '30 days';
alter table yeoback_private.training_batches
    alter column created_at set default clock_timestamp(),
    alter column created_at set not null;
create index training_batches_latest on yeoback_private.training_batches
    (owner_id,exhibition_id,created_at desc,id desc);

create function public.get_latest_training_batch(p_exhibition_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
    owner uuid := yeoback_private.require_owner();
    batch yeoback_private.training_batches%rowtype;
begin
    -- Check the live owned exhibition even when it has no manifest.
    perform yeoback_private.qa_scope(owner,p_exhibition_id,null);
    select * into batch from yeoback_private.training_batches
        where owner_id = owner and exhibition_id = p_exhibition_id
            and expires_at > statement_timestamp()
        order by created_at desc,id desc limit 1;
    if not found then return null; end if;
    return yeoback_private.training_batch_json(batch);
end;
$$;
revoke all on function public.get_latest_training_batch(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_latest_training_batch(uuid) to authenticated;

commit;
