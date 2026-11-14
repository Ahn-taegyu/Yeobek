begin;

create function yeoback_private.guard_training_retry()
returns trigger language plpgsql set search_path = '' as $$
begin
    -- Both retry RPCs already hold the owner AI-job advisory lock. Read the
    -- mapping and sibling leases without taking another advisory or row lock.
    if exists (
        select 1 from yeoback_private.training_targets target
        join yeoback_private.training_targets sibling on sibling.batch_id = target.batch_id and sibling.id <> target.id
        join public.ai_jobs job on job.id = sibling.job_id
        where target.job_id = new.id and job.status = 'running'
            and job.lease_until > clock_timestamp() and job.expires_at > clock_timestamp()
    ) then
        raise exception 'A training target is already running' using errcode = 'P1006';
    end if;
    return new;
end;
$$;
create trigger guard_training_retry before update of attempt on public.ai_jobs for each row
    when (new.attempt > old.attempt) execute function yeoback_private.guard_training_retry();
revoke all on function yeoback_private.guard_training_retry() from public,anon,authenticated,service_role;

commit;
