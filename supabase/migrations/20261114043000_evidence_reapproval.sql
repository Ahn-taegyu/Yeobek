begin;

-- Withdrawal is permanent for the pinned source version, not for every future
-- version of the same evidence identity. A changed source needs fresh approval.
create or replace function yeoback_private.prevent_withdrawn_evidence()
returns trigger language plpgsql set search_path = '' as $$
begin
    if new.state = 'approved' and exists (
        select 1 from public.withdrawn_evidence_sources s where s.owner_id = new.owner_id
        and s.source_key = yeoback_private.evidence_source_key(new)
    ) then raise exception 'Evidence source is withdrawn' using errcode = '40001'; end if;
    return new;
end;
$$;

commit;
