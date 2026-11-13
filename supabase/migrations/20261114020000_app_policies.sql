begin;

-- Mutable business limits. The CHECK is only a technical integer bound.
create table public.app_policies (
    key text primary key check (key ~ '^[a-z][a-z0-9_]{0,63}$'),
    value bigint not null check (value between 1 and 2147483647),
    updated_at timestamptz not null default now()
);
alter table public.app_policies enable row level security;
revoke all on table public.app_policies from public, anon, authenticated;
grant select, insert, update, delete on table public.app_policies to service_role;

insert into public.app_policies(key, value) values
    ('visitor_requests_per_minute', 6),
    ('exhibition_requests_per_day', 1000),
    ('author_jobs_per_day', 100),
    ('gap_retention_days', 30),
    ('answer_ttl_seconds', 3600),
    ('job_retention_days', 30),
    ('proposal_ttl_seconds', 86400);

-- Called by owner/publication checked SECURITY DEFINER RPCs, never by browsers.
create function yeoback_private.policy_integer(p_key text)
returns bigint language plpgsql stable set search_path = '' as $$
declare result bigint;
begin
    select value into result from public.app_policies where key = p_key;
    if result is null then
        raise exception using errcode = 'P1003', message = 'Application policy unavailable';
    end if;
    return result;
end;
$$;
revoke all on function yeoback_private.policy_integer(text) from public, anon, authenticated;

commit;
