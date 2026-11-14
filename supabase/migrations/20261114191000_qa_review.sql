begin;

create or replace function yeoback_private.qa_inputs(p_owner uuid,p_exhibition uuid,p_artwork uuid)
returns jsonb language plpgsql set search_path = '' as $$
declare
    scope uuid[] := yeoback_private.qa_scope(p_owner,p_exhibition,p_artwork);
    target public.knowledge_documents%rowtype;
    exhibition_revision integer;
    artwork_revision integer;
    documents jsonb := '[]';
    sources jsonb := '[]';
    item record;
    excerpt text;
    approved public.evidence_items%rowtype;
    approved_fingerprint jsonb := '[]';
    excerpt_limit integer := least(2000,yeoback_private.policy_integer('evidence_body_chars'));
    used_chars integer := 0;
begin
    perform yeoback_private.lock_publication(p_owner);
    perform 1 from public.artist_profiles where owner_id = p_owner and id = scope[1] for share;
    select revision into exhibition_revision from public.exhibitions where owner_id = p_owner and id = p_exhibition
        and deleted_at is null for share;
    if not found then raise exception 'Subject not found' using errcode = 'P0002'; end if;
    if p_artwork is not null then
        select revision into artwork_revision from public.artworks where owner_id = p_owner and id = p_artwork
            and deleted_at is null for share;
        if not found then raise exception 'Subject not found' using errcode = 'P0002'; end if;
    end if;
    for item in select d.id,d.revision from public.knowledge_documents d where d.owner_id = p_owner
        and (d.artist_id = scope[1] or d.exhibition_id = p_exhibition or d.artwork_id = p_artwork)
        order by case d.subject_type when 'artwork' then 0 when 'exhibition' then 1 else 2 end for share
    loop
        documents := documents || jsonb_build_array(jsonb_build_array(item.id,item.revision));
    end loop;
    select * into strict target from public.knowledge_documents d where d.owner_id = p_owner
        and (d.artwork_id = p_artwork or (p_artwork is null and d.exhibition_id = p_exhibition));
    for approved in select e.* from public.evidence_items e
        where e.owner_id = p_owner and e.exhibition_id = p_exhibition and (e.artwork_id is null or e.artwork_id = p_artwork)
            and yeoback_private.evidence_is_current(e) order by e.scope,e.id,e.version for share
    loop
        exit when jsonb_array_length(sources) >= 12 or used_chars = 8000;
        if char_length(approved.body) > least(2000,8000 - used_chars) then continue; end if;
        perform yeoback_private.validate_evidence_source(approved,
            yeoback_private.evidence_scope(p_owner,p_exhibition,approved.artwork_id,approved.scope));
        used_chars := used_chars + char_length(approved.body);
        sources := sources || jsonb_build_array(jsonb_build_object('id',approved.id,'version',approved.version,
            'scope',approved.scope,'sourceLabel',approved.source_label,'body',approved.body,
            'bodyHash',encode(approved.content_hash,'hex'),'evidenceId',approved.id));
        approved_fingerprint := approved_fingerprint || jsonb_build_array(jsonb_build_array(
            approved.id,approved.version,encode(approved.content_hash,'hex')));
    end loop;
    for item in select d.id,d.revision,d.subject_type,s.value->>'id' as section_id,s.value->>'body' as body
        from public.knowledge_documents d cross join lateral jsonb_array_elements(d.sections) s
        where d.owner_id = p_owner and (d.artist_id = scope[1] or d.exhibition_id = p_exhibition or d.artwork_id = p_artwork)
        order by case d.subject_type when 'artwork' then 0 when 'exhibition' then 1 else 2 end,s.value->>'id'
    loop
        exit when jsonb_array_length(sources) >= 12 or used_chars = 8000;
        excerpt := btrim(item.body);
        if char_length(excerpt) > excerpt_limit then
            -- A bounded introductory sentence is an explicit excerpt, including its terminator.
            excerpt := substring(excerpt from '^[^.!?。！？]+[.!?。！？](?=[[:space:]]|$)');
        end if;
        if excerpt is null or excerpt !~ '[^[:space:]]' or char_length(excerpt) > least(excerpt_limit,8000 - used_chars)
            or exists (select 1 from jsonb_array_elements(sources) s where s->>'scope' = item.subject_type
                and s->>'body' = excerpt) then continue; end if;
        used_chars := used_chars + char_length(excerpt);
        sources := sources || jsonb_build_array(jsonb_build_object(
            'id',yeoback_private.narration_source_id(item.id,item.section_id,item.revision),
            'version',item.revision,'body',excerpt,'scope',item.subject_type,'sourceLabel',item.section_id,
            'sourceDocumentId',item.id,'sectionId',item.section_id,
            'bodyHash',encode(sha256(convert_to(excerpt,'UTF8')),'hex')));
    end loop;
    return jsonb_build_object('fingerprint',jsonb_build_array(exhibition_revision,artwork_revision,documents,
        (select coalesce(jsonb_agg(s->'bodyHash'),'[]') from jsonb_array_elements(sources) s)) ||
        case when approved_fingerprint = '[]' then '[]'::jsonb else jsonb_build_array(approved_fingerprint) end,
        'context',jsonb_build_object('ownerId',p_owner,'scope',target.subject_type,'exhibitionId',p_exhibition,
            'artworkId',p_artwork,'documentId',target.id,'revision',coalesce(artwork_revision,exhibition_revision),
            'documentRevision',target.revision,'sources',sources));
end;
$$;

create or replace function yeoback_private.qa_worker_context(inputs jsonb)
returns jsonb language sql immutable strict set search_path = '' as $$
    select (inputs->'context') || jsonb_build_object('sources',coalesce(jsonb_agg(s - array['sourceDocumentId','sectionId','bodyHash','evidenceId']),'[]'))
    from jsonb_array_elements(inputs->'context'->'sources') s;
$$;

create or replace function yeoback_private.qa_candidate_citations(p_candidate jsonb,p_inputs jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare citations jsonb;
begin
    if jsonb_typeof(p_candidate) is distinct from 'object'
        or p_candidate - array['question','answer','citations'] <> '{}'
        or jsonb_typeof(p_candidate->'question') is distinct from 'string'
        or jsonb_typeof(p_candidate->'answer') is distinct from 'string'
        or (p_candidate->>'question') !~ '[^[:space:]]' or char_length(p_candidate->>'question') > 500
        or (p_candidate->>'answer') !~ '[^[:space:]]' or char_length(p_candidate->>'answer') > 600
        or jsonb_typeof(p_candidate->'citations') is distinct from 'array' then
        raise exception 'Invalid Q&A candidate' using errcode = '22023';
    end if;
    if jsonb_array_length(p_candidate->'citations') not between 1 and 12 then
        raise exception 'Invalid Q&A citations' using errcode = '22023';
    end if;
    select coalesce(jsonb_agg(source order by source->>'id'),'[]') into citations
    from jsonb_array_elements(p_inputs->'context'->'sources') source
    where p_candidate->'citations' @> jsonb_build_array(source->'id');
    if jsonb_array_length(citations) <> jsonb_array_length(p_candidate->'citations') then
        raise exception 'Invalid Q&A citations' using errcode = '22023';
    end if;
    return citations;
end;
$$;

create or replace function public.approve_qa_item(p_item_id uuid,p_expected_version integer,p_evidence_pins jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    owner uuid := yeoback_private.require_owner();
    item yeoback_private.qa_item_versions%rowtype;
    pin jsonb;
    evidence public.evidence_items%rowtype;
    matched jsonb;
    matched_ids jsonb := '[]';
    pins jsonb;
    current_fingerprint jsonb;
begin
    if jsonb_typeof(p_evidence_pins) is distinct from 'array' then
        raise exception 'Invalid Q&A approval pins' using errcode = '22023';
    end if;
    if jsonb_array_length(p_evidence_pins) not between 1 and 12 then
        raise exception 'Invalid Q&A approval pins' using errcode = '22023';
    end if;
    perform yeoback_private.lock_publication(owner);
    select * into item from yeoback_private.qa_item_versions where owner_id = owner and id = p_item_id
        order by version desc limit 1 for update;
    if not found then raise exception 'Q&A item not found' using errcode = 'P0002'; end if;
    perform yeoback_private.qa_scope(owner,item.exhibition_id,item.artwork_id);
    if item.version is distinct from p_expected_version then raise exception 'Q&A version conflict' using errcode = '40001'; end if;
    select jsonb_agg(value order by value) into pins from jsonb_array_elements(p_evidence_pins);
    if item.state = 'approved' and item.evidence_pins = pins then return yeoback_private.qa_item_json(item); end if;
    if item.state <> 'draft' then raise exception 'Q&A item cannot be approved' using errcode = '40001'; end if;
    current_fingerprint := yeoback_private.qa_inputs(owner,item.exhibition_id,item.artwork_id)->'fingerprint';
    if jsonb_build_array(item.source_fingerprint->0,item.source_fingerprint->1,item.source_fingerprint->2)
        is distinct from jsonb_build_array(current_fingerprint->0,current_fingerprint->1,current_fingerprint->2) then
        raise exception 'Q&A source revision conflict' using errcode = '40001';
    end if;
    for pin in select value from jsonb_array_elements(pins) loop
        if jsonb_typeof(pin) is distinct from 'object' or pin - array['id','version'] <> '{}'
            or jsonb_typeof(pin->'id') is distinct from 'string' or jsonb_typeof(pin->'version') is distinct from 'number' then
            raise exception 'Invalid Q&A approval pin' using errcode = '22023';
        end if;
        select * into evidence from public.evidence_items e where e.owner_id = owner and e.exhibition_id = item.exhibition_id
            and (e.artwork_id is null or e.artwork_id = item.artwork_id)
            and e.id = (pin->>'id')::uuid and e.version = (pin->>'version')::integer for share;
        if not found or not yeoback_private.evidence_is_current(evidence) then
            raise exception 'Q&A evidence is unavailable' using errcode = 'P1002';
        end if;
        perform yeoback_private.validate_evidence_source(evidence,
            yeoback_private.evidence_scope(owner,item.exhibition_id,evidence.artwork_id,evidence.scope));
        select c into matched from jsonb_array_elements(item.citations) c
        where c->>'bodyHash' = encode(evidence.content_hash,'hex') and c->>'scope' = evidence.scope
            and ((evidence.source_kind = 'document' and c->>'sourceDocumentId' = evidence.source_document_id::text
                and c->>'sectionId' = evidence.source_section_id and (c->>'version')::integer = evidence.source_revision)
                or (c->>'evidenceId' = evidence.id::text and (c->>'version')::integer = evidence.version));
        if not found or matched_ids @> jsonb_build_array(matched->'id') then
            raise exception 'Q&A approval pins must match cited sources' using errcode = '22023';
        end if;
        matched_ids := matched_ids || jsonb_build_array(matched->'id');
    end loop;
    if jsonb_array_length(matched_ids) <> jsonb_array_length(item.citations) then
        raise exception 'Q&A approval pins must match cited sources' using errcode = '22023';
    end if;
    update yeoback_private.qa_item_versions set state = 'approved',approved_at = statement_timestamp(),evidence_pins = pins
    where id = item.id and version = item.version returning * into item;
    return yeoback_private.qa_item_json(item);
exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Invalid Q&A approval pin' using errcode = '22023';
end;
$$;

alter table public.qa_gaps add column recheck_publication_id uuid,
    add column recheck_at timestamptz,
    add column closed_recheck_publication_id uuid,
    add foreign key (exhibition_id,artwork_id,recheck_publication_id) references public.publications(exhibition_id,artwork_id,id),
    add constraint qa_gaps_recheck_shape check (num_nonnulls(recheck_publication_id,recheck_at) in (0,2)
        and (recheck_publication_id is null or status = 'open'));

create or replace function yeoback_private.answer_previous_gaps()
returns trigger language plpgsql set search_path = '' as $$
begin
    if new.active_publication_id is not null and old.active_publication_id is distinct from new.active_publication_id then
        update public.qa_gaps set recheck_publication_id = new.active_publication_id,recheck_at = statement_timestamp()
        where artwork_id = new.id and status = 'open' and publication_id <> new.active_publication_id
            and expires_at > statement_timestamp();
    end if;
    return new;
end;
$$;

create or replace function yeoback_private.gap_json(g public.qa_gaps)
returns jsonb language sql stable strict set search_path = '' as $$
    select jsonb_build_object('id',g.id,'exhibitionId',g.exhibition_id,'artworkId',g.artwork_id,
        'publicationId',g.publication_id,'publicationVersion',g.publication_version,'question',g.question,
        'count',g.occurrences,'status',g.status,'createdAt',g.created_at,'expiresAt',g.expires_at)
        || case when g.recheck_publication_id is null then '{}'::jsonb else jsonb_build_object(
            'needsRecheck',true,'recheckPublicationId',g.recheck_publication_id,'recheckAt',g.recheck_at) end;
$$;

create function yeoback_private.close_gap(p_owner uuid,p_id uuid,p_expected_publication_id uuid,p_enabled boolean)
returns jsonb language plpgsql set search_path = '' as $$
declare gap public.qa_gaps%rowtype;
begin
    if p_enabled is not true then raise exception 'Not found' using errcode = 'P0002'; end if;
    perform yeoback_private.lock_publication(p_owner);
    select g.* into gap from public.qa_gaps g join public.exhibitions e on e.id = g.exhibition_id
        where g.id = p_id and e.owner_id = p_owner and e.deleted_at is null
            and g.expires_at > statement_timestamp() for update of g;
    if not found then raise exception 'Gap not found' using errcode = 'P0002'; end if;
    if gap.status = 'dismissed' and gap.closed_recheck_publication_id = p_expected_publication_id then
        return yeoback_private.gap_json(gap);
    end if;
    if gap.recheck_publication_id is distinct from p_expected_publication_id then
        raise exception 'Gap publication changed' using errcode = '40001';
    end if;
    if gap.status = 'open' then
        update public.qa_gaps set status = 'dismissed',closed_recheck_publication_id = recheck_publication_id,
            recheck_publication_id = null,recheck_at = null
        where id = gap.id returning * into gap;
    end if;
    return yeoback_private.gap_json(gap);
end;
$$;

create or replace function public.dismiss_gap(p_owner uuid,p_id uuid,p_enabled boolean)
returns jsonb language sql security definer set search_path = '' as $$
    select yeoback_private.close_gap(p_owner,p_id,null,p_enabled);
$$;

create function public.close_gap_recheck(p_owner uuid,p_id uuid,p_expected_publication_id uuid,p_enabled boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
    if p_enabled is not true then raise exception 'Not found' using errcode = 'P0002'; end if;
    if p_expected_publication_id is null then raise exception 'Expected publication is required' using errcode = '22023'; end if;
    return yeoback_private.close_gap(p_owner,p_id,p_expected_publication_id,p_enabled);
end;
$$;

create function yeoback_private.qa_review_counts(p_owner uuid,p_exhibition uuid,p_artwork uuid)
returns jsonb language sql stable set search_path = '' as $$
    select jsonb_build_object('draft',count(*) filter (where state = 'draft'),
        'approved',count(*) filter (where state = 'approved'),'withdrawn',count(*) filter (where state = 'withdrawn'))
    from yeoback_private.qa_item_versions q where q.owner_id = p_owner and q.exhibition_id = p_exhibition
        and q.artwork_id is not distinct from p_artwork;
$$;

alter function public.get_review_bundle(uuid) rename to get_review_bundle_with_public_intro;
alter function public.get_review_bundle_with_public_intro(uuid) set schema yeoback_private;
revoke all on function yeoback_private.get_review_bundle_with_public_intro(uuid) from public,anon,authenticated,service_role;
create function public.get_review_bundle(p_artwork_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
    owner uuid := yeoback_private.require_owner();
    scope uuid[] := yeoback_private.subject_scope(owner,'artwork',p_artwork_id);
begin
    return yeoback_private.get_review_bundle_with_public_intro(p_artwork_id) || jsonb_build_object('expectedQa',
        jsonb_build_object('artwork',yeoback_private.qa_review_counts(owner,scope[2],p_artwork_id),
            'exhibition',yeoback_private.qa_review_counts(owner,scope[2],null)));
end;
$$;

create table yeoback_private.qa_job_requests (
    job_id uuid primary key references public.ai_jobs(id) on delete cascade,
    question text not null check (char_length(question) between 1 and 500 and question ~ '[^[:space:]]'),
    target_kind text check (target_kind in ('preview','qa','gap')),
    target_id uuid,
    target_version integer,
    instruction text,
    previous_answer text,
    rewrite_sources jsonb,
    target_recheck_publication_id uuid,
    check ((target_kind is null) = (instruction is null))
);
create table yeoback_private.preview_evaluations (
    id uuid primary key default gen_random_uuid(),
    answer_id uuid not null references public.ai_jobs(id) on delete cascade,
    owner_id uuid not null,
    request_id uuid not null,
    rating text not null check (rating in ('accurate','needs_revision')),
    created_at timestamptz not null default statement_timestamp(),
    unique (owner_id,request_id)
);
create index preview_evaluations_answer on yeoback_private.preview_evaluations(answer_id,created_at,id);
revoke all on yeoback_private.qa_job_requests,yeoback_private.preview_evaluations from public,anon,authenticated,service_role;

create or replace function yeoback_private.qa_job_json(job public.ai_jobs)
returns jsonb language sql stable strict set search_path = '' as $$
    select yeoback_private.ai_job_json(job) - 'strategy' || jsonb_build_object('exhibitionId',job.qa_exhibition_id,
        'scope',case when job.artwork_id is null then 'exhibition' else 'artwork' end)
        || case when job.kind = 'qa_rewrite' then coalesce((select jsonb_build_object(
            'targetKind',r.target_kind,'targetId',r.target_id,'targetVersion',r.target_version)
            from yeoback_private.qa_job_requests r where r.job_id = job.id),'{}') else '{}'::jsonb end;
$$;

create function yeoback_private.qa_preview_json(job public.ai_jobs,question text)
returns jsonb language sql stable strict set search_path = '' as $$
    select yeoback_private.qa_job_json(job) || jsonb_build_object('question',question);
$$;

create function public.reserve_preview_answer(p_owner uuid,p_exhibition_id uuid,p_artwork_id uuid,p_request_id uuid,
    p_question text,p_mock boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    job public.ai_jobs%rowtype;
    saved yeoback_private.qa_job_requests%rowtype;
    inputs jsonb;
    reservation jsonb;
begin
    if p_question is null or char_length(p_question) not between 1 and 500 or p_question !~ '[^[:space:]]' then
        raise exception 'Invalid preview question' using errcode = '22023';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('yeobek:ai-jobs:' || p_owner::text,0));
    select j.* into job from public.ai_jobs j join public.ai_job_attempts a on a.job_id = j.id
        where a.owner_id = p_owner and a.request_id = p_request_id;
    if found then
        select * into saved from yeoback_private.qa_job_requests where job_id = job.id;
        if saved.question is distinct from p_question then
            raise exception 'Request ID already used with different input' using errcode = 'P1005';
        end if;
        reservation := yeoback_private.reserve_qa_job(p_owner,p_request_id,p_exhibition_id,p_artwork_id,
            job.expected_revision,job.expected_document_revision,p_mock,'preview_answer');
    else
        inputs := yeoback_private.qa_inputs(p_owner,p_exhibition_id,p_artwork_id);
        reservation := yeoback_private.reserve_qa_job(p_owner,p_request_id,p_exhibition_id,p_artwork_id,
            (inputs#>>'{context,revision}')::integer,(inputs#>>'{context,documentRevision}')::integer,p_mock,'preview_answer');
        insert into yeoback_private.qa_job_requests(job_id,question) values ((reservation#>>'{job,id}')::uuid,p_question);
    end if;
    return jsonb_set(reservation,'{job}',(reservation->'job') || jsonb_build_object('question',p_question));
end;
$$;

create function public.get_preview_answer(p_answer_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
    owner uuid := yeoback_private.require_owner();
    job public.ai_jobs%rowtype;
    question text;
begin
    select * into job from public.ai_jobs where owner_id = owner and id = p_answer_id and kind = 'preview_answer';
    if not found or job.expires_at <= statement_timestamp() then raise exception 'Preview answer not found' using errcode = 'P0002'; end if;
    perform yeoback_private.qa_scope(owner,job.qa_exhibition_id,job.artwork_id);
    select r.question into strict question from yeoback_private.qa_job_requests r where r.job_id = job.id;
    return yeoback_private.qa_preview_json(job,question) || jsonb_build_object('evaluations',coalesce((
        select jsonb_agg(jsonb_build_object('id',e.id,'answerId',e.answer_id,'requestId',e.request_id,
            'rating',e.rating,'createdAt',e.created_at) order by e.created_at,e.id)
        from (select * from yeoback_private.preview_evaluations where answer_id = job.id
            order by created_at desc,id desc limit 50) e),'[]'));
end;
$$;

create function public.record_preview_evaluation(p_answer_id uuid,p_request_id uuid,p_rating text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    owner uuid := yeoback_private.require_owner();
    job public.ai_jobs%rowtype;
    evaluation yeoback_private.preview_evaluations%rowtype;
begin
    if p_request_id is null or p_rating is null or p_rating not in ('accurate','needs_revision') then
        raise exception 'Invalid preview evaluation' using errcode = '22023';
    end if;
    select * into job from public.ai_jobs where owner_id = owner and id = p_answer_id and kind = 'preview_answer'
        and status = 'succeeded' and expires_at > statement_timestamp() for share;
    if not found then raise exception 'Preview answer not found' using errcode = 'P0002'; end if;
    perform yeoback_private.qa_scope(owner,job.qa_exhibition_id,job.artwork_id);
    insert into yeoback_private.preview_evaluations(answer_id,owner_id,request_id,rating)
    values (p_answer_id,owner,p_request_id,p_rating) on conflict (owner_id,request_id) do nothing returning * into evaluation;
    if not found then
        select * into strict evaluation from yeoback_private.preview_evaluations where owner_id = owner and request_id = p_request_id;
        if evaluation.answer_id <> p_answer_id or evaluation.rating <> p_rating then
            raise exception 'Request ID already used with different input' using errcode = 'P1005';
        end if;
    end if;
    return jsonb_build_object('id',evaluation.id,'answerId',evaluation.answer_id,'requestId',evaluation.request_id,
        'rating',evaluation.rating,'createdAt',evaluation.created_at);
end;
$$;

create function yeoback_private.qa_review_target(p_owner uuid,p_kind text,p_id uuid,p_version integer)
returns jsonb language plpgsql set search_path = '' as $$
declare
    job public.ai_jobs%rowtype;
    item yeoback_private.qa_item_versions%rowtype;
    gap public.qa_gaps%rowtype;
    question text;
begin
    if p_id is null or p_kind is null or p_kind not in ('preview','qa','gap')
        or (p_kind = 'qa' and (p_version is null or p_version < 1))
        or (p_kind <> 'qa' and p_version is not null) then
        raise exception 'Invalid Q&A review target' using errcode = '22023';
    end if;
    if p_kind = 'preview' then
        select * into job from public.ai_jobs where id = p_id and owner_id = p_owner and kind = 'preview_answer'
            and status = 'succeeded' and expires_at > statement_timestamp();
        if not found then raise exception 'Preview answer not found' using errcode = 'P0002'; end if;
        select r.question into strict question from yeoback_private.qa_job_requests r where r.job_id = job.id;
        return jsonb_build_object('exhibitionId',job.qa_exhibition_id,'artworkId',job.artwork_id,
            'question',question,'previousAnswer',job.result->'answer','mock',job.mock);
    elsif p_kind = 'qa' then
        select * into item from yeoback_private.qa_item_versions where owner_id = p_owner and id = p_id
            order by version desc limit 1;
        if not found then raise exception 'Q&A item not found' using errcode = 'P0002'; end if;
        if item.version <> p_version or item.state = 'withdrawn' then
            raise exception 'Q&A version conflict' using errcode = '40001';
        end if;
        return jsonb_build_object('exhibitionId',item.exhibition_id,'artworkId',item.artwork_id,
            'question',item.question,'previousAnswer',item.answer,'mock',item.mock);
    end if;
    select g.* into gap from public.qa_gaps g join public.exhibitions e on e.id = g.exhibition_id
    where g.id = p_id and e.owner_id = p_owner and e.deleted_at is null and g.status = 'open' and g.expires_at > statement_timestamp();
    if not found then raise exception 'Gap not found' using errcode = 'P0002'; end if;
    return jsonb_build_object('exhibitionId',gap.exhibition_id,'artworkId',gap.artwork_id,
        'question',gap.question,'previousAnswer',null,'recheckPublicationId',gap.recheck_publication_id,'mock',false);
end;
$$;

create table yeoback_private.qa_correction_evidence (
    owner_id uuid not null,
    request_id uuid not null,
    target_kind text not null check (target_kind in ('preview','qa','gap')),
    target_id uuid not null,
    target_version integer,
    target_recheck_publication_id uuid,
    evidence_id uuid not null,
    evidence_version integer not null,
    input_hash bytea not null,
    primary key(owner_id,request_id),
    unique(evidence_id,evidence_version),
    foreign key(evidence_id,evidence_version) references public.evidence_items(id,version)
);
revoke all on yeoback_private.qa_correction_evidence from public,anon,authenticated,service_role;

create function public.create_qa_correction_evidence(p_target_kind text,p_target_id uuid,p_target_version integer,
    p_request_id uuid,p_source_label text,p_source_body text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    owner uuid := yeoback_private.require_owner();
    target jsonb;
    evidence jsonb;
    prior yeoback_private.qa_correction_evidence%rowtype;
    fingerprint bytea := sha256(convert_to(jsonb_build_array(p_target_kind,p_target_id,p_target_version,
        p_source_label,p_source_body)::text,'UTF8'));
    artwork_id uuid;
    created_evidence_id uuid;
begin
    if p_request_id is null then raise exception 'Invalid Q&A correction request' using errcode = '22023'; end if;
    perform yeoback_private.lock_publication(owner);
    select * into prior from yeoback_private.qa_correction_evidence where owner_id = owner and request_id = p_request_id;
    if found then
        if prior.input_hash <> fingerprint then raise exception 'Request ID already used with different input' using errcode = 'P1005'; end if;
        return (select yeoback_private.evidence_json(e) from public.evidence_items e
            where e.id = prior.evidence_id and e.version = prior.evidence_version);
    end if;
    target := yeoback_private.qa_review_target(owner,p_target_kind,p_target_id,p_target_version);
    artwork_id := (target->>'artworkId')::uuid;
    evidence := public.upsert_evidence((target->>'exhibitionId')::uuid,artwork_id,
        case when artwork_id is null then 'exhibition' else 'artwork' end,
        p_source_label,p_source_body,'{"kind":"direct"}',null,null);
    created_evidence_id := (evidence->>'id')::uuid;
    insert into yeoback_private.qa_correction_evidence(owner_id,request_id,target_kind,target_id,target_version,
        target_recheck_publication_id,evidence_id,evidence_version,input_hash)
    values (owner,p_request_id,p_target_kind,p_target_id,p_target_version,(target->>'recheckPublicationId')::uuid,
        created_evidence_id,(evidence->>'version')::integer,fingerprint);
    return evidence;
end;
$$;

create function yeoback_private.qa_rewrite_sources(p_owner uuid,p_exhibition uuid,p_artwork uuid,p_pins jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare
    pin jsonb;
    e public.evidence_items%rowtype;
    sources jsonb := '[]';
    source_chars integer := 0;
begin
    if jsonb_typeof(p_pins) is distinct from 'array' then raise exception 'Invalid Q&A evidence pins' using errcode = '22023'; end if;
    if jsonb_array_length(p_pins) not between 1 and 12 then raise exception 'Invalid Q&A evidence pins' using errcode = '22023'; end if;
    for pin in select value from jsonb_array_elements(p_pins) order by value loop
        if jsonb_typeof(pin) is distinct from 'object' or pin - array['id','version'] <> '{}'
            or jsonb_typeof(pin->'id') is distinct from 'string' or jsonb_typeof(pin->'version') is distinct from 'number' then
            raise exception 'Invalid Q&A evidence pin' using errcode = '22023';
        end if;
        select * into e from public.evidence_items where owner_id = p_owner and exhibition_id = p_exhibition
            and (artwork_id is null or artwork_id = p_artwork) and id = (pin->>'id')::uuid and version = (pin->>'version')::integer
            for share;
        if not found or not yeoback_private.evidence_is_current(e) then
            raise exception 'Q&A evidence is unavailable' using errcode = 'P1002';
        end if;
        perform yeoback_private.validate_evidence_source(e,yeoback_private.evidence_scope(p_owner,p_exhibition,e.artwork_id,e.scope));
        if exists (select 1 from jsonb_array_elements(sources) s where (s->>'id')::uuid = e.id) then
            raise exception 'Duplicate Q&A evidence pin' using errcode = '22023';
        end if;
        source_chars := source_chars + char_length(e.body);
        if source_chars > 8000 or char_length(e.body) > 2000 then
            raise exception 'Q&A evidence exceeds source limit' using errcode = '22023';
        end if;
        sources := sources || jsonb_build_array(jsonb_build_object('id',e.id,'version',e.version,'scope',e.scope,
            'sourceLabel',e.source_label,'body',e.body,'bodyHash',encode(e.content_hash,'hex'),'evidenceId',e.id));
    end loop;
    return sources;
exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Invalid Q&A evidence pin' using errcode = '22023';
end;
$$;

create function public.complete_preview_answer(p_owner uuid,p_answer_id uuid,p_attempt integer,p_result jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    job public.ai_jobs%rowtype;
    question text;
    inputs jsonb;
    result_status text := p_result->>'status';
    result_code text := p_result->>'resultCode';
    routing text := coalesce(p_result->>'routing','none');
    completed jsonb;
begin
    if p_attempt is null or jsonb_typeof(p_result) is distinct from 'object' then
        raise exception 'Invalid preview result' using errcode = '22023';
    end if;
    select * into job from public.ai_jobs where owner_id = p_owner and id = p_answer_id and kind = 'preview_answer' for update;
    if not found or job.expires_at <= clock_timestamp() then raise exception 'Preview answer not found' using errcode = 'P0002'; end if;
    perform yeoback_private.qa_scope(p_owner,job.qa_exhibition_id,job.artwork_id);
    select r.question into strict question from yeoback_private.qa_job_requests r where r.job_id = job.id;
    if p_attempt <> job.attempt or (job.status = 'running' and job.lease_until <= clock_timestamp()) then
        return yeoback_private.qa_preview_json(job,question);
    end if;
    if job.status <> 'running' then
        if not exists (select 1 from public.ai_job_attempts where job_id = job.id and attempt = p_attempt
            and completion_fingerprint = sha256(convert_to(p_result::text,'UTF8'))) then
            raise exception 'Job attempt completed with different result' using errcode = 'P1006';
        end if;
        return yeoback_private.qa_preview_json(job,question);
    end if;
    inputs := yeoback_private.qa_inputs(p_owner,job.qa_exhibition_id,job.artwork_id);
    if inputs->'fingerprint' is distinct from job.source_fingerprint then
        completed := yeoback_private.finish_qa_attempt(job,'failed','REVISION_CONFLICT','author',null,p_result);
    elsif result_status in ('abstained','failed','cancelled') and result_code ~ '^[A-Z][A-Z0-9_]{0,63}$'
        and routing in ('author','operator','none') then
        completed := yeoback_private.finish_qa_attempt(job,result_status,result_code,routing,null,p_result);
    elsif result_status = 'succeeded' then
        perform yeoback_private.qa_candidate_citations(jsonb_build_object('question',question,
            'answer',p_result->'answer','citations',p_result->'citations'),inputs);
        completed := yeoback_private.finish_qa_attempt(job,'succeeded','OK','none',
            jsonb_build_object('answer',p_result->'answer','citations',p_result->'citations',
                'mock',job.mock or coalesce(p_result->'mock' = 'true'::jsonb,false)),p_result);
    else
        raise exception 'Invalid preview result' using errcode = '22023';
    end if;
    return completed || jsonb_build_object('question',question);
end;
$$;

create table yeoback_private.qa_rewrite_provenance (
    item_id uuid not null,
    item_version integer not null,
    target_kind text not null check (target_kind in ('preview','qa','gap')),
    target_id uuid not null,
    target_version integer,
    target_recheck_publication_id uuid,
    instruction text not null,
    previous_answer text,
    primary key (item_id,item_version),
    foreign key (item_id,item_version) references yeoback_private.qa_item_versions(id,version)
);
revoke all on yeoback_private.qa_rewrite_provenance from public,anon,authenticated,service_role;

create function yeoback_private.qa_rewrite_context(p_inputs jsonb,p_sources jsonb,p_saved yeoback_private.qa_job_requests)
returns jsonb language sql stable set search_path = '' as $$
    select yeoback_private.qa_worker_context(jsonb_set(p_inputs,'{context,sources}',p_sources))
        || jsonb_build_object('question',p_saved.question,'previousAnswer',p_saved.previous_answer,'instruction',p_saved.instruction);
$$;

create function public.reserve_qa_rewrite_job(p_owner uuid,p_request_id uuid,p_target_kind text,p_target_id uuid,
    p_target_version integer,p_instruction text,p_evidence_pins jsonb,p_mock boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    prior public.ai_jobs%rowtype;
    saved yeoback_private.qa_job_requests%rowtype;
    target jsonb;
    inputs jsonb;
    sources jsonb;
    pins jsonb;
    reservation jsonb;
    exhibition uuid;
    artwork uuid;
begin
    if num_nulls(p_owner,p_request_id,p_instruction,p_mock) <> 0
        or char_length(p_instruction) not between 1 and 2000 or p_instruction !~ '[^[:space:]]'
        or jsonb_typeof(p_evidence_pins) is distinct from 'array' then
        raise exception 'Invalid Q&A rewrite request' using errcode = '22023';
    end if;
    select coalesce(jsonb_agg(value order by value),'[]') into pins from jsonb_array_elements(p_evidence_pins);
    perform pg_advisory_xact_lock(hashtextextended('yeobek:ai-jobs:' || p_owner::text,0));
    select j.* into prior from public.ai_jobs j join public.ai_job_attempts a on a.job_id = j.id
        where a.owner_id = p_owner and a.request_id = p_request_id;
    if found then
        select * into saved from yeoback_private.qa_job_requests where job_id = prior.id;
        if saved.target_kind is distinct from p_target_kind or saved.target_id is distinct from p_target_id
            or saved.target_version is distinct from p_target_version or saved.instruction is distinct from p_instruction
            or saved.rewrite_sources is distinct from pins then
            raise exception 'Request ID already used with different input' using errcode = 'P1005';
        end if;
        return yeoback_private.reserve_qa_job(p_owner,p_request_id,prior.qa_exhibition_id,prior.artwork_id,
            prior.expected_revision,prior.expected_document_revision,p_mock,'qa_rewrite');
    end if;
    perform yeoback_private.lock_publication(p_owner);
    target := yeoback_private.qa_review_target(p_owner,p_target_kind,p_target_id,p_target_version);
    exhibition := (target->>'exhibitionId')::uuid;
    artwork := (target->>'artworkId')::uuid;
    inputs := yeoback_private.qa_inputs(p_owner,exhibition,artwork);
    sources := yeoback_private.qa_rewrite_sources(p_owner,exhibition,artwork,pins);
    reservation := yeoback_private.reserve_qa_job(p_owner,p_request_id,exhibition,artwork,
        (inputs#>>'{context,revision}')::integer,(inputs#>>'{context,documentRevision}')::integer,p_mock,'qa_rewrite');
    insert into yeoback_private.qa_job_requests(job_id,question,target_kind,target_id,target_version,instruction,
        previous_answer,rewrite_sources,target_recheck_publication_id)
    values ((reservation#>>'{job,id}')::uuid,target->>'question',p_target_kind,p_target_id,p_target_version,p_instruction,
        target->>'previousAnswer',pins,(target->>'recheckPublicationId')::uuid) returning * into saved;
    return jsonb_set(reservation,'{context}',yeoback_private.qa_rewrite_context(inputs,sources,saved))
        || jsonb_build_object('job',reservation->'job' || jsonb_build_object('targetKind',saved.target_kind,
            'targetId',saved.target_id,'targetVersion',saved.target_version));
end;
$$;

create function public.retry_qa_rewrite_job(p_owner uuid,p_job_id uuid,p_request_id uuid,p_expected_attempt integer,p_mock boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    job public.ai_jobs%rowtype;
    saved yeoback_private.qa_job_requests%rowtype;
    target jsonb;
    inputs jsonb;
    reservation jsonb;
    sources jsonb;
begin
    perform pg_advisory_xact_lock(hashtextextended('yeobek:ai-jobs:' || p_owner::text,0));
    perform yeoback_private.lock_publication(p_owner);
    reservation := yeoback_private.retry_qa_job(p_owner,p_job_id,p_request_id,p_expected_attempt,p_mock,'qa_rewrite');
    if reservation->'claimed' = 'false'::jsonb then return reservation; end if;
    select * into strict job from public.ai_jobs where id = p_job_id;
    select * into strict saved from yeoback_private.qa_job_requests where job_id = p_job_id;
    target := yeoback_private.qa_review_target(p_owner,saved.target_kind,saved.target_id,saved.target_version);
    if (target->>'recheckPublicationId')::uuid is distinct from saved.target_recheck_publication_id then
        raise exception 'Gap publication changed' using errcode = '40001';
    end if;
    inputs := yeoback_private.qa_inputs(p_owner,job.qa_exhibition_id,job.artwork_id);
    sources := yeoback_private.qa_rewrite_sources(p_owner,job.qa_exhibition_id,job.artwork_id,saved.rewrite_sources);
    return jsonb_set(reservation,'{context}',yeoback_private.qa_rewrite_context(inputs,sources,saved));
end;
$$;

create function public.get_qa_rewrite_job(p_job_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
    owner uuid := yeoback_private.require_owner();
    job public.ai_jobs%rowtype;
begin
    select * into job from public.ai_jobs where owner_id = owner and id = p_job_id and kind = 'qa_rewrite';
    if not found or job.expires_at <= statement_timestamp() then raise exception 'Job not found' using errcode = 'P0002'; end if;
    perform yeoback_private.qa_scope(owner,job.qa_exhibition_id,job.artwork_id);
    return yeoback_private.qa_job_json(job);
end;
$$;

create function public.complete_qa_rewrite_job(p_owner uuid,p_job_id uuid,p_attempt integer,p_result jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    job public.ai_jobs%rowtype;
    saved yeoback_private.qa_job_requests%rowtype;
    target jsonb;
    inputs jsonb;
    sources jsonb;
    candidate jsonb;
    citations jsonb;
    item_id uuid;
    item_version integer;
    origin text;
    result_status text := p_result->>'status';
    result_code text := p_result->>'resultCode';
    routing text := coalesce(p_result->>'routing','none');
    result_mock boolean;
begin
    if p_attempt is null or jsonb_typeof(p_result) is distinct from 'object' then
        raise exception 'Invalid Q&A rewrite result' using errcode = '22023';
    end if;
    perform yeoback_private.lock_publication(p_owner);
    select * into job from public.ai_jobs where owner_id = p_owner and id = p_job_id and kind = 'qa_rewrite' for update;
    if not found or job.expires_at <= clock_timestamp() then raise exception 'Job not found' using errcode = 'P0002'; end if;
    perform yeoback_private.qa_scope(p_owner,job.qa_exhibition_id,job.artwork_id);
    if p_attempt <> job.attempt or (job.status = 'running' and job.lease_until <= clock_timestamp()) then
        return yeoback_private.qa_job_json(job);
    end if;
    if job.status <> 'running' then
        if not exists (select 1 from public.ai_job_attempts where job_id = job.id and attempt = p_attempt
            and completion_fingerprint = sha256(convert_to(p_result::text,'UTF8'))) then
            raise exception 'Job attempt completed with different result' using errcode = 'P1006';
        end if;
        return yeoback_private.qa_job_json(job);
    end if;
    inputs := yeoback_private.qa_inputs(p_owner,job.qa_exhibition_id,job.artwork_id);
    if inputs->'fingerprint' is distinct from job.source_fingerprint then
        return yeoback_private.finish_qa_attempt(job,'failed','REVISION_CONFLICT','author',null,p_result);
    end if;
    if result_status in ('abstained','failed','cancelled') and result_code ~ '^[A-Z][A-Z0-9_]{0,63}$'
        and routing in ('author','operator','none') then
        return yeoback_private.finish_qa_attempt(job,result_status,result_code,routing,null,p_result);
    end if;
    if result_status is distinct from 'succeeded' or jsonb_typeof(p_result->'items') is distinct from 'array' then
        raise exception 'Invalid Q&A rewrite result' using errcode = '22023';
    end if;
    if jsonb_array_length(p_result->'items') <> 1 then
        raise exception 'Rewrite must return exactly one Q&A item' using errcode = '22023';
    end if;
    select * into strict saved from yeoback_private.qa_job_requests where job_id = p_job_id;
    begin
        target := yeoback_private.qa_review_target(p_owner,saved.target_kind,saved.target_id,saved.target_version);
        sources := yeoback_private.qa_rewrite_sources(p_owner,job.qa_exhibition_id,job.artwork_id,saved.rewrite_sources);
    exception when sqlstate 'P0002' or sqlstate 'P1002' or sqlstate '40001' or sqlstate 'P1001' then
        return yeoback_private.finish_qa_attempt(job,'failed','REVISION_CONFLICT','author',null,p_result);
    end;
    if (target->>'recheckPublicationId')::uuid is distinct from saved.target_recheck_publication_id then
        return yeoback_private.finish_qa_attempt(job,'failed','REVISION_CONFLICT','author',null,p_result);
    end if;
    candidate := p_result#>'{items,0}';
    if candidate->>'question' is distinct from saved.question then
        raise exception 'Rewrite must preserve the original question' using errcode = '22023';
    end if;
    citations := yeoback_private.qa_candidate_citations(candidate,jsonb_set(inputs,'{context,sources}',sources));
    if saved.target_kind = 'qa' then
        item_id := saved.target_id;
        item_version := saved.target_version + 1;
    else
        item_id := gen_random_uuid();
        item_version := 1;
    end if;
    origin := case when saved.target_kind = 'gap' then 'gap' else 'rewrite' end;
    result_mock := job.mock or coalesce(p_result->'mock' = 'true'::jsonb,false);
    insert into yeoback_private.qa_item_versions(id,version,owner_id,exhibition_id,artwork_id,origin,
        source_job_id,source_attempt,question,answer,content_hash,source_fingerprint,citations,mock)
    values (item_id,item_version,p_owner,job.qa_exhibition_id,job.artwork_id,origin,job.id,job.attempt,saved.question,
        candidate->>'answer',sha256(convert_to(jsonb_build_array(saved.question,candidate->>'answer')::text,'UTF8')),
        job.source_fingerprint,citations,result_mock);
    insert into yeoback_private.qa_rewrite_provenance(item_id,item_version,target_kind,target_id,target_version,
        target_recheck_publication_id,instruction,previous_answer)
    values (item_id,item_version,saved.target_kind,saved.target_id,saved.target_version,saved.target_recheck_publication_id,
        saved.instruction,saved.previous_answer);
    return yeoback_private.finish_qa_attempt(job,'succeeded','OK','none',
        jsonb_build_object('itemIds',jsonb_build_array(item_id),'mock',result_mock),p_result);
end;
$$;

revoke all on function yeoback_private.close_gap(uuid,uuid,uuid,boolean),
    yeoback_private.qa_review_counts(uuid,uuid,uuid),yeoback_private.qa_preview_json(public.ai_jobs,text),
    yeoback_private.qa_review_target(uuid,text,uuid,integer),yeoback_private.qa_rewrite_sources(uuid,uuid,uuid,jsonb),
    yeoback_private.qa_rewrite_context(jsonb,jsonb,yeoback_private.qa_job_requests),
    public.close_gap_recheck(uuid,uuid,uuid,boolean),public.get_review_bundle(uuid),
    public.reserve_preview_answer(uuid,uuid,uuid,uuid,text,boolean),public.complete_preview_answer(uuid,uuid,integer,jsonb),
    public.get_preview_answer(uuid),public.record_preview_evaluation(uuid,uuid,text),
    public.create_qa_correction_evidence(text,uuid,integer,uuid,text,text),
    public.reserve_qa_rewrite_job(uuid,uuid,text,uuid,integer,text,jsonb,boolean),
    public.retry_qa_rewrite_job(uuid,uuid,uuid,integer,boolean),public.get_qa_rewrite_job(uuid),
    public.complete_qa_rewrite_job(uuid,uuid,integer,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.get_review_bundle(uuid),public.get_preview_answer(uuid),
    public.record_preview_evaluation(uuid,uuid,text),public.create_qa_correction_evidence(text,uuid,integer,uuid,text,text),
    public.get_qa_rewrite_job(uuid) to authenticated;
grant execute on function public.close_gap_recheck(uuid,uuid,uuid,boolean),
    public.reserve_preview_answer(uuid,uuid,uuid,uuid,text,boolean),public.complete_preview_answer(uuid,uuid,integer,jsonb),
    public.reserve_qa_rewrite_job(uuid,uuid,text,uuid,integer,text,jsonb,boolean),
    public.retry_qa_rewrite_job(uuid,uuid,uuid,integer,boolean),
    public.complete_qa_rewrite_job(uuid,uuid,integer,jsonb) to service_role;

commit;
