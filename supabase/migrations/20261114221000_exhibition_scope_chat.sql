begin;

-- Common-only retrieval uses one current immutable publication as its revocable dependency.
-- Public artworkId/number remain null: selecting a technical snapshot never selects a UI artwork.
create function yeoback_private.publication_context_evidence(p public.publications,p_common boolean)
returns jsonb language sql stable set search_path = '' as $$
    select (case when p_common then coalesce((select jsonb_agg(e) from jsonb_array_elements(p.evidence->'items') e
        where e->>'scope' in ('artist','exhibition') and e->'artworkId'='null'), '[]') else p.evidence->'items' end) || coalesce((select jsonb_agg(jsonb_build_object(
        'id',qa->'id','version',qa->'version','ownerId',p.owner_id,'exhibitionId',p.exhibition_id,
        'publicationId',p.id,'artworkId',qa->'artworkId','scope',qa->'scope',
        'sourceLabel','승인 예상 Q&A','body',body,
        'contentHash',encode(sha256(convert_to(body,'UTF8')),'hex')) order by qa->>'id')
        from (select value as qa from jsonb_array_elements(coalesce(p.evidence->'approvedQa','[]'))
            where not p_common or (value->>'scope'='exhibition' and value->'artworkId'='null')
            order by (value->>'approvedAt')::timestamptz desc,value->>'id' limit 100) candidates
        cross join lateral (select '질문: ' || (qa->>'question') || E'\n답변: ' || (qa->>'answer') as body) content), '[]');
$$;
revoke all on function yeoback_private.publication_context_evidence(public.publications,boolean)
    from public,anon,authenticated,service_role;

create or replace function public.load_publication_context(p_exhibition_id uuid,p_artwork_id uuid,p_number integer)
returns jsonb language sql stable security definer set search_path = '' as $$
    select jsonb_build_object('ownerId',p.owner_id,'exhibitionId',p.exhibition_id,'artworkId',case when p_artwork_id is null and p_number is null then null else p.artwork_id end,
        'publicationId',p.id,'version',p.version,'number',case when p_artwork_id is null and p_number is null then null else p.number end,
        'title',case when p_artwork_id is null and p_number is null then '전시' else p.title end,
        'evidence',yeoback_private.publication_context_evidence(p,p_artwork_id is null and p_number is null),
        'narration',case when p_artwork_id is null and p_number is null then null else jsonb_build_object('text',p.narration_text,'citations',
            (select jsonb_agg(pin->'id' order by ord) from jsonb_array_elements(p.narration_citations) with ordinality x(pin,ord))) end)
    from yeoback_private.public_artworks(p_exhibition_id) p
    where ((p_artwork_id is not null and p_number is null and p.artwork_id = p_artwork_id)
        or (p_artwork_id is null and p_number is not null and p.number = p_number)
        or (p_artwork_id is null and p_number is null))
    order by p.number,p.artwork_id limit 1;
$$;

create or replace function yeoback_private.complete_visitor_request(p_session_hash text,p_id uuid,p_result jsonb,
    p_failure_code text default null,p_steps jsonb default '[]')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    sid bytea := yeoback_private.visitor_hash(p_session_hash);
    row public.api_requests%rowtype;
    exhibition uuid;
    ref jsonb := p_result->'publication';
    pub public.publications%rowtype;
begin
    select exhibition_id into exhibition from public.api_requests where session_hash = sid and id = p_id;
    if not found then raise exception 'Visitor request not found' using errcode = 'P0002'; end if;
    -- Use the same ordering as reserve; the publication lock is shared with pause/revoke.
    perform yeoback_private.visitor_public_lock(exhibition,false);
    select * into row from public.api_requests where session_hash = sid and id = p_id for update;
    if not found then raise exception 'Visitor request not found' using errcode = 'P0002'; end if;
    if row.expires_at <= statement_timestamp() then raise exception 'Visitor request expired' using errcode = 'P1012'; end if;
    if row.state <> 'running' then
        if row.failure_code is not distinct from p_failure_code and
            (row.result - 'gapRecorded') is not distinct from p_result then
            if row.publication_id is not null and not exists (
                select 1 from yeoback_private.public_artworks(exhibition) p where p.id = row.publication_id
            ) then raise exception 'Publication changed' using errcode = '40001'; end if;
            return yeoback_private.visitor_envelope(row,false);
        end if;
        raise exception 'Visitor request already completed' using errcode = 'P1011';
    end if;
    if row.lease_until <= statement_timestamp() then
        update public.api_requests set state = 'failed',failure_code = 'REQUEST_TIMEOUT',updated_at = statement_timestamp()
            where id = row.id returning * into row;
        return yeoback_private.visitor_envelope(row,false);
    end if;
    perform yeoback_private.validate_visitor_steps(p_steps);
    if p_failure_code is not null then
        if p_result is not null or p_failure_code !~ '^[A-Z][A-Z0-9_]{0,63}$' then
            raise exception 'Invalid visitor failure' using errcode = '22023';
        end if;
        update public.api_requests set state = 'failed',failure_code = p_failure_code,steps = p_steps,
            updated_at = statement_timestamp() where id = row.id returning * into row;
        return yeoback_private.visitor_envelope(row,false);
    end if;
    if jsonb_typeof(p_result) is distinct from 'object' or
        p_result - array['answerId','requestId','contextSequence','inputMode','outputMode','answer',
            'citations','outcome','publication','source','mock'] <> '{}' or
        not p_result ?& array['answerId','requestId','contextSequence','inputMode','outputMode','answer',
            'citations','outcome','publication','source','mock'] or
        (p_result->>'answerId') is distinct from row.id::text or
        (p_result->>'requestId') is distinct from row.request_id::text or
        jsonb_typeof(p_result->'contextSequence') is distinct from 'number' or
        coalesce(p_result->>'contextSequence','') !~ '^[0-9]{1,16}$' or
        (p_result->>'contextSequence')::numeric > 9007199254740991 or
        coalesce(p_result->>'inputMode','') not in ('text','voice') or
        coalesce(p_result->>'outputMode','') not in ('text','voice') or
        coalesce(p_result->>'outcome','') not in ('answered','clarify','insufficient_evidence') or
        coalesce(p_result->>'source','') not in ('approved_narration','generated','fixed') or
        p_result->'mock' is distinct from to_jsonb(row.mock) or
        jsonb_typeof(p_result->'answer') is distinct from 'string' or
        coalesce(p_result->>'answer','') !~ '[^[:space:]]' or
        char_length(p_result->>'answer') > (case when p_result->>'source' = 'approved_narration' then 2000 else 600 end) or
        jsonb_typeof(p_result->'citations') is distinct from 'array'
        then raise exception 'Invalid visitor result' using errcode = '22023'; end if;
    if jsonb_array_length(p_result->'citations') > 12 or
        (p_result->>'outcome' = 'answered') <> (jsonb_array_length(p_result->'citations') > 0) or
        (p_result->>'outcome' = 'answered') = (p_result->>'source' = 'fixed') or
        (select count(distinct item) from jsonb_array_elements(p_result->'citations') item)
            <> jsonb_array_length(p_result->'citations')
        then raise exception 'Invalid visitor citations' using errcode = '22023'; end if;
    if ref = 'null'::jsonb then
        if p_result->>'outcome' <> 'clarify' then raise exception 'Publication required' using errcode = '22023'; end if;
        if not exists (select 1 from yeoback_private.public_artworks(exhibition)) then
            update public.api_requests set state = 'failed',failure_code = 'CONTENT_CHANGED',steps = p_steps,
                updated_at = statement_timestamp() where id = row.id returning * into row;
            return yeoback_private.visitor_envelope(row,false);
        end if;
    else
        if jsonb_typeof(ref) is distinct from 'object' or
            not ref ?& array['exhibitionId','artworkId','publicationId','version'] or
            ref - array['exhibitionId','artworkId','publicationId','version'] <> '{}' or
            (jsonb_typeof(ref->'artworkId') is distinct from 'string' and ref->'artworkId' is distinct from 'null'::jsonb) or
            jsonb_typeof(ref->'publicationId') is distinct from 'string' or
            jsonb_typeof(ref->'version') is distinct from 'number' or
            (ref->>'exhibitionId') is distinct from exhibition::text then
            raise exception 'Invalid visitor publication' using errcode = '22023';
        end if;
        select * into pub from yeoback_private.public_artworks(exhibition) p
            where p.id::text = ref->>'publicationId' and (ref->'artworkId' = 'null'::jsonb or p.artwork_id::text = ref->>'artworkId')
                and to_jsonb(p.version) = ref->'version';
        if not found then
            update public.api_requests set state = 'failed',failure_code = 'CONTENT_CHANGED',steps = p_steps,
                updated_at = statement_timestamp() where id = row.id returning * into row;
            return yeoback_private.visitor_envelope(row,false);
        end if;
        if exists (select 1 from jsonb_array_elements(p_result->'citations') item
            where jsonb_typeof(item) <> 'string' or not exists (
                select 1 from jsonb_array_elements(yeoback_private.publication_context_evidence(pub,ref->'artworkId'='null'::jsonb)) e where e->'id' = item
                    and (ref->'artworkId' <> 'null'::jsonb or e->>'scope' in ('artist','exhibition'))
            )) then raise exception 'Invalid visitor citations' using errcode = '22023'; end if;
        if p_result->>'source' = 'approved_narration' and (
            ref->'artworkId' = 'null'::jsonb or
            pub.narration_text is distinct from p_result->>'answer' or p_result->'citations' is distinct from (
                select jsonb_agg(c->'id' order by ord) from jsonb_array_elements(pub.narration_citations) with ordinality t(c,ord)
            )
        ) then raise exception 'Invalid approved narration' using errcode = '22023'; end if;
    end if;
    update public.api_requests set state = 'ready',result = p_result,steps = p_steps,
        artwork_id = pub.artwork_id,publication_id = pub.id,updated_at = statement_timestamp()
        where id = row.id returning * into row;
    return yeoback_private.visitor_envelope(row,false);
end;
$$;

create or replace function public.check_publication_versions(p_exhibition_id uuid,p_publications jsonb)
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
            where ((r->'artworkId') = 'null'::jsonb or p.artwork_id = (r->>'artworkId')::uuid) and p.id = (r->>'publicationId')::uuid
                and p.version = (r->>'version')::integer)) order by ord)
        from jsonb_array_elements(p_publications) with ordinality t(r,ord)),'[]'::jsonb));
end;
$$;
create or replace function public.record_gap(p_session_hash text,p_request_id uuid,p_question text,p_enabled boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
    sid bytea := yeoback_private.visitor_hash(p_session_hash);
    row public.api_requests%rowtype;
    exhibition uuid;
    normalized text;
begin
    if p_enabled is not true then return false; end if;
    normalized := btrim(regexp_replace(p_question,'[[:space:]]+',' ','g'));
    if normalized is null or char_length(normalized) not between 1 and 500 or char_length(p_question) > 500 then
        raise exception 'Invalid gap question' using errcode = '22023';
    end if;
    select exhibition_id into exhibition from public.api_requests where session_hash = sid and request_id = p_request_id;
    if not found then return false; end if;
    perform yeoback_private.visitor_public_lock(exhibition,false);
    select * into row from public.api_requests where session_hash = sid and request_id = p_request_id for update;
    if not found or row.state <> 'ready' or row.expires_at <= statement_timestamp()
        or row.result#>'{publication,artworkId}' = 'null'::jsonb
        or row.result->>'outcome' is distinct from 'insufficient_evidence' or row.publication_id is null
        or not exists (select 1 from yeoback_private.public_artworks(exhibition) p where p.id = row.publication_id)
        then return false; end if;
    if row.result->'gapRecorded' = 'true'::jsonb then return true; end if;
    delete from public.qa_gaps where publication_id = row.publication_id and question_key = lower(normalized)
        and status = 'open' and expires_at <= statement_timestamp();
    insert into public.qa_gaps(exhibition_id,artwork_id,publication_id,publication_version,question,question_key,expires_at)
    values (exhibition,row.artwork_id,row.publication_id,(row.result#>>'{publication,version}')::integer,
        normalized,lower(normalized),statement_timestamp() + yeoback_private.policy_integer('gap_retention_days') * interval '1 day')
    on conflict (publication_id,question_key) where status = 'open'
        do update set occurrences = public.qa_gaps.occurrences + 1;
    update public.api_requests set result = row.result || '{"gapRecorded":true}'::jsonb where id = row.id;
    return true;
end;
$$;


create or replace function public.is_publication_current(p_exhibition_id uuid,p_artwork_id uuid,p_publication_id uuid,p_version integer)
returns boolean language sql stable security definer set search_path = '' as $$
    select exists(select 1 from yeoback_private.public_artworks(p_exhibition_id) p
        where (p_artwork_id is null or p.artwork_id = p_artwork_id) and p.id = p_publication_id and p.version = p_version);
$$;
commit;
