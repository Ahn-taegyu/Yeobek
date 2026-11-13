begin;

create function public.record_visitor_execution(p_session_hash text,p_id uuid,p_steps jsonb,p_usage jsonb,p_elapsed_ms integer)
returns void language plpgsql security definer set search_path = '' as $$
declare
    sid bytea := yeoback_private.visitor_hash(p_session_hash);
    request_row public.api_requests%rowtype;
    call jsonb;
    token jsonb;
    payload jsonb;
begin
    select * into request_row from public.api_requests
        where session_hash = sid and id = p_id and expires_at > statement_timestamp() for update;
    if not found then raise exception 'Visitor request not found' using errcode = 'P0002'; end if;
    if request_row.state not in ('ready','failed') then
        raise exception 'Visitor execution is not complete' using errcode = 'P1011';
    end if;
    perform yeoback_private.validate_visitor_steps(p_steps);
    if p_elapsed_ms is null or p_elapsed_ms not between 0 and 300000
        or jsonb_typeof(p_usage) is distinct from 'array' then
        raise exception 'Invalid visitor execution metadata' using errcode = '22023';
    end if;
    if jsonb_array_length(p_usage) > 8 then
        raise exception 'Invalid visitor execution metadata' using errcode = '22023';
    end if;
    for call in select value from jsonb_array_elements(p_usage) loop
        if jsonb_typeof(call) is distinct from 'object'
            or call - array['provider','model','mock','usage'] <> '{}'
            or coalesce(call->>'provider','') not in ('liner','openai','typecast','exaone','mock')
            or jsonb_typeof(call->'model') is distinct from 'string'
            or coalesce(call->>'model','') !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$'
            or (call ? 'mock' and jsonb_typeof(call->'mock') is distinct from 'boolean')
            or (call ? 'usage' and jsonb_typeof(call->'usage') is distinct from 'object') then
            raise exception 'Invalid visitor execution metadata' using errcode = '22023';
        end if;
        if call ? 'usage' then
            if (call->'usage') - array['inputTokens','outputTokens','totalTokens'] <> '{}' then
                raise exception 'Invalid visitor execution metadata' using errcode = '22023';
            end if;
            for token in select value from jsonb_each(call->'usage') loop
                if jsonb_typeof(token) is distinct from 'number'
                    or token::text !~ '^[0-9]{1,16}$' then
                    raise exception 'Invalid visitor execution metadata' using errcode = '22023';
                end if;
                if (token::text)::numeric > 9007199254740991 then
                    raise exception 'Invalid visitor execution metadata' using errcode = '22023';
                end if;
            end loop;
        end if;
    end loop;
    payload := jsonb_build_object('calls',p_usage,'elapsedMs',p_elapsed_ms);
    if request_row.usage <> '{}' then
        if request_row.usage is distinct from payload or request_row.steps is distinct from p_steps then
            raise exception 'Visitor execution already recorded' using errcode = 'P1011';
        end if;
        return;
    end if;
    update public.api_requests set usage = payload,steps = p_steps where id = request_row.id;
end;
$$;

-- Preserve the existing step-only entry point for requests with no execution
-- record. Once written, the combined record cannot be rewritten piecemeal.
create or replace function public.record_visitor_steps(p_session_hash text,p_id uuid,p_steps jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
    sid bytea := yeoback_private.visitor_hash(p_session_hash);
    request_row public.api_requests%rowtype;
begin
    select * into request_row from public.api_requests where session_hash = sid and id = p_id
        and expires_at > statement_timestamp() for update;
    if not found then raise exception 'Visitor request not found' using errcode = 'P0002'; end if;
    perform yeoback_private.validate_visitor_steps(p_steps);
    if request_row.usage <> '{}' then
        if request_row.steps is distinct from p_steps then
            raise exception 'Visitor execution already recorded' using errcode = 'P1011';
        end if;
        return;
    end if;
    update public.api_requests set steps = p_steps where id = request_row.id;
end;
$$;

revoke all on function public.record_visitor_execution(text,uuid,jsonb,jsonb,integer)
    from public,anon,authenticated,service_role;
grant execute on function public.record_visitor_execution(text,uuid,jsonb,jsonb,integer) to service_role;
commit;
