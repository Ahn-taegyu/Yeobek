begin;

insert into public.app_policies(key,value) values ('material_extraction_max_pages',20);

-- Private bodies are not part of ai_jobs.result, logs or public knowledge.
-- Separate mock/live caches prevent a simulated read from satisfying a real read.
create table yeoback_private.material_reads (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references auth.users(id),
    content_hash bytea not null check (octet_length(content_hash)=32),
    mock boolean not null,
    status text not null default 'running' check (status in ('running','succeeded','failed','purged')),
    page_count integer not null check (page_count between 1 and 20),
    method text check (method in ('text_pdf','vision')),
    chunks jsonb not null default '[]' check (jsonb_typeof(chunks)='array'),
    result_code text check (result_code in ('OK','EMPTY','READ_FAILED','SOURCE_CHANGED','EXPIRED')),
    reserved_at timestamptz not null default clock_timestamp(),
    lease_until timestamptz not null default clock_timestamp()+interval '90 seconds',
    completed_at timestamptz,
    unique(owner_id,content_hash,mock), unique(owner_id,id), unique(owner_id,id,mock)
);
create index material_reads_owner_day on yeoback_private.material_reads(owner_id,reserved_at);
create table yeoback_private.material_read_requests (
    owner_id uuid not null references auth.users(id), request_id uuid not null,
    material_id uuid not null references public.materials(id), material_version integer not null,
    document_id uuid not null references public.knowledge_documents(id), document_revision integer not null,
    read_id uuid not null, mock boolean not null,
    primary key(owner_id,request_id),
    foreign key(owner_id,read_id) references yeoback_private.material_reads(owner_id,id)
);
create table yeoback_private.material_read_links (
    owner_id uuid not null references auth.users(id), material_id uuid not null references public.materials(id),
    material_version integer not null, read_id uuid not null, mock boolean not null,
    primary key(owner_id,material_id,mock),
    foreign key(owner_id,read_id,mock) references yeoback_private.material_reads(owner_id,id,mock)
);
alter table yeoback_private.material_reads enable row level security;
alter table yeoback_private.material_read_requests enable row level security;
alter table yeoback_private.material_read_links enable row level security;
revoke all on yeoback_private.material_reads,yeoback_private.material_read_requests,yeoback_private.material_read_links
    from public,anon,authenticated,service_role;

create or replace function yeoback_private.assert_ai_quota(p_owner uuid)
returns void language plpgsql set search_path='' as $$
declare day_start timestamptz := date_trunc('day',clock_timestamp(),'UTC');
begin
    if (select count(*) from public.ai_job_attempts a join public.ai_jobs j on j.id=a.job_id
        where a.owner_id=p_owner and j.kind in ('narration','audio','organize','expected_qa','preview_answer','qa_rewrite')
          and a.reserved_at>=day_start and a.reserved_at<day_start+interval '24 hours')
       + (select count(*) from yeoback_private.material_reads r where r.owner_id=p_owner
          and r.reserved_at>=day_start and r.reserved_at<day_start+interval '24 hours')
       >= yeoback_private.policy_integer('author_jobs_per_day') then
        raise exception 'Daily author job limit reached' using errcode='P1004';
    end if;
end;
$$;

create function yeoback_private.readable_material(p_owner uuid,p_material_id uuid)
returns public.materials language plpgsql set search_path='' as $$
declare m public.materials%rowtype;
begin
    select * into m from public.materials where id=p_material_id and owner_id=p_owner
        and deleted_at is null and state='ready' and kind in ('pdf','image')
        and content_hash is not null and upload_fingerprint is not null;
    if not found then raise exception 'Material not found' using errcode='P0002'; end if;
    perform yeoback_private.subject_scope(p_owner,case when m.artist_id is not null then 'artist'
        when m.exhibition_id is not null then 'exhibition' else 'artwork' end,
        coalesce(m.artist_id,m.exhibition_id,m.artwork_id));
    if m.kind='image' and (m.artwork_id is not null
        or exists(select 1 from public.artist_profiles where owner_id=p_owner and avatar_material_id=m.id)
        or exists(select 1 from public.exhibitions where owner_id=p_owner and poster_material_id=m.id)) then
        raise exception 'Only reference materials can be read' using errcode='22023';
    end if;
    return m;
end;
$$;

create function yeoback_private.material_read_json(r yeoback_private.material_reads)
returns jsonb language sql stable set search_path='' as $$
    select jsonb_build_object('id',r.id,'status',case when r.status='running' and r.lease_until<=clock_timestamp() then 'failed' else r.status end,
        'mock',r.mock,'pageCount',r.page_count,'chunkCount',jsonb_array_length(r.chunks),'method',r.method,
        'resultCode',case when r.status='running' and r.lease_until<=clock_timestamp() then 'EXPIRED' else r.result_code end);
$$;

-- Only the authenticated server action can reserve a read. Polling never claims it.
create function public.reserve_material_read(p_owner uuid,p_request_id uuid,p_material_id uuid,p_expected_version integer,
    p_document_id uuid,p_expected_document_revision integer,p_mock boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.materials%rowtype; d public.knowledge_documents%rowtype;
    r yeoback_private.material_reads%rowtype; q yeoback_private.material_read_requests%rowtype;
    max_pages integer; claimed boolean:=false;
begin
    if p_owner is null or p_request_id is null or p_material_id is null or p_document_id is null
        or p_expected_version is null or p_expected_version<1 or p_expected_document_revision is null
        or p_expected_document_revision<1 or p_mock is null then
        raise exception 'Invalid material read request' using errcode='22023';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('yeobek:ai-jobs:'||p_owner::text,0));
    perform yeoback_private.lock_publication(p_owner);
    m:=yeoback_private.readable_material(p_owner,p_material_id);
    select * into d from public.knowledge_documents where id=p_document_id and owner_id=p_owner
        and (artist_id=m.artist_id or exhibition_id=m.exhibition_id or artwork_id=m.artwork_id);
    if not found then raise exception 'Knowledge document not found' using errcode='P0002'; end if;
    select * into q from yeoback_private.material_read_requests where owner_id=p_owner and request_id=p_request_id;
    if found then
        if q.material_id<>p_material_id or q.material_version<>p_expected_version or q.document_id<>p_document_id
            or q.document_revision<>p_expected_document_revision or q.mock<>p_mock then
            raise exception 'Request ID already used with different input' using errcode='P1005';
        end if;
        select * into strict r from yeoback_private.material_reads where id=q.read_id and owner_id=p_owner;
    else
        if m.version<>p_expected_version or d.revision<>p_expected_document_revision then
            raise exception 'Source revision conflict' using errcode='40001';
        end if;
        max_pages:=least(20,yeoback_private.policy_integer('material_extraction_max_pages'));
        if coalesce(m.pages,1)>max_pages then raise exception 'Material page limit exceeded' using errcode='22023'; end if;
        select * into r from yeoback_private.material_reads where owner_id=p_owner and content_hash=m.content_hash and mock=p_mock;
        if not found then
            perform yeoback_private.assert_ai_quota(p_owner);
            insert into yeoback_private.material_reads(owner_id,content_hash,mock,page_count)
                values(p_owner,m.content_hash,p_mock,coalesce(m.pages,1)) returning * into r;
            claimed:=true;
        end if;
        insert into yeoback_private.material_read_requests(owner_id,request_id,material_id,material_version,document_id,document_revision,read_id,mock)
            values(p_owner,p_request_id,m.id,m.version,d.id,d.revision,r.id,p_mock);
    end if;
    if m.version<>q.material_version and not claimed and q.request_id is not null then
        raise exception 'Source revision conflict' using errcode='40001';
    end if;
    if m.content_hash is distinct from r.content_hash then raise exception 'Source revision conflict' using errcode='40001'; end if;
    if r.status='succeeded' then
        insert into yeoback_private.material_read_links(owner_id,material_id,material_version,read_id,mock)
            values(p_owner,m.id,m.version,r.id,r.mock) on conflict(owner_id,material_id,mock) do update
            set material_version=excluded.material_version,read_id=excluded.read_id;
    end if;
    return jsonb_build_object('read',yeoback_private.material_read_json(r),'claimed',claimed,
        'storageKey',case when claimed then m.storage_key end,'contentHash',case when claimed then encode(m.content_hash,'hex') end,
        'contentType',m.content_type,'byteSize',m.byte_size,'maxPages',least(20,yeoback_private.policy_integer('material_extraction_max_pages')));
end;
$$;

create function public.complete_material_read(p_owner uuid,p_request_id uuid,p_read_id uuid,p_method text,p_chunks jsonb,p_result_code text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare q yeoback_private.material_read_requests%rowtype; r yeoback_private.material_reads%rowtype;
    m public.materials%rowtype; alias_request record; chunk jsonb; total_chars integer:=0; previous_page integer:=1;
    eligible uuid[]:='{}';
begin
    perform pg_advisory_xact_lock(hashtextextended('yeobek:ai-jobs:'||p_owner::text,0));
    perform yeoback_private.lock_publication(p_owner);
    select * into q from yeoback_private.material_read_requests where owner_id=p_owner and request_id=p_request_id and read_id=p_read_id;
    if not found then raise exception 'Material read not found' using errcode='P0002'; end if;
    select * into strict r from yeoback_private.material_reads where owner_id=p_owner and id=q.read_id for update;
    if r.status<>'running' then return yeoback_private.material_read_json(r); end if;
    if p_result_code is null or p_result_code not in ('OK','EMPTY','READ_FAILED') then
        raise exception 'Invalid read result' using errcode='22023';
    end if;
    if r.lease_until<=clock_timestamp() then p_result_code:='EXPIRED'; end if;
    -- The extracted bytes belong to the hash, not the initiating document revision.
    -- Document CAS remains in W2 reserve/apply; do not discard a valid alias if
    -- the initiating material was deleted during a single shared read.
    for alias_request in select distinct material_id,material_version from yeoback_private.material_read_requests
        where owner_id=p_owner and read_id=r.id and mock=r.mock order by material_id loop
        begin
            m:=yeoback_private.readable_material(p_owner,alias_request.material_id);
            if m.version=alias_request.material_version and m.content_hash=r.content_hash then
                eligible:=array_append(eligible,m.id);
            end if;
        exception when sqlstate 'P0002' or sqlstate '22023' then null; end;
    end loop;
    if cardinality(eligible)=0 then p_result_code:='SOURCE_CHANGED'; end if;
    if p_result_code in ('OK','EMPTY') then
        if p_method is null or p_method not in ('text_pdf','vision') or p_chunks is null or jsonb_typeof(p_chunks)<>'array'
            or jsonb_array_length(p_chunks)>60 or octet_length(p_chunks::text)>900000 then
            raise exception 'Invalid read chunks' using errcode='22023';
        end if;
        for chunk in select value from jsonb_array_elements(p_chunks) loop
            if jsonb_typeof(chunk) is distinct from 'object' or not (chunk ?& array['pageStart','pageEnd','text'])
                or chunk-array['pageStart','pageEnd','text']<>'{}'
                or jsonb_typeof(chunk->'pageStart') is distinct from 'number'
                or jsonb_typeof(chunk->'pageEnd') is distinct from 'number'
                or jsonb_typeof(chunk->'text') is distinct from 'string' or char_length(chunk->>'text') not between 1 and 5000
                or chunk->>'text' !~ '[^[:space:]]' or coalesce(chunk->>'pageStart','') !~ '^[0-9]{1,2}$'
                or coalesce(chunk->>'pageEnd','') !~ '^[0-9]{1,2}$' then
                raise exception 'Invalid read chunk' using errcode='22023';
            end if;
            if (chunk->>'pageStart')::integer<previous_page or (chunk->>'pageStart')::integer>r.page_count
                or (chunk->>'pageEnd')::integer<>(chunk->>'pageStart')::integer then
                raise exception 'Invalid read page' using errcode='22023';
            end if;
            previous_page:=(chunk->>'pageStart')::integer;
            total_chars:=total_chars+char_length(chunk->>'text');
        end loop;
        if total_chars>200000 or (p_result_code='EMPTY')<>(jsonb_array_length(p_chunks)=0) then
            raise exception 'Invalid read content size' using errcode='22023';
        end if;
        if r.lease_until<=clock_timestamp() then
            update yeoback_private.material_reads set status='failed',result_code='EXPIRED',completed_at=clock_timestamp()
                where id=r.id returning * into r;
            return yeoback_private.material_read_json(r);
        end if;
        update yeoback_private.material_reads set status='succeeded',method=p_method,chunks=p_chunks,
            result_code=p_result_code,completed_at=clock_timestamp() where id=r.id returning * into r;
        insert into yeoback_private.material_read_links(owner_id,material_id,material_version,read_id,mock)
            select p_owner,mat.id,mat.version,r.id,r.mock from public.materials mat where mat.owner_id=p_owner and mat.id=any(eligible)
            on conflict(owner_id,material_id,mock) do update
            set material_version=excluded.material_version,read_id=excluded.read_id;
    else
        update yeoback_private.material_reads set status='failed',result_code=p_result_code,completed_at=clock_timestamp()
            where id=r.id returning * into r;
    end if;
    return yeoback_private.material_read_json(r);
end;
$$;

create function public.get_material_read(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare owner uuid:=yeoback_private.require_owner(); q yeoback_private.material_read_requests%rowtype;
    r yeoback_private.material_reads%rowtype; m public.materials%rowtype;
begin
    select * into q from yeoback_private.material_read_requests where owner_id=owner and request_id=p_request_id;
    if not found then raise exception 'Material read not found' using errcode='P0002'; end if;
    m:=yeoback_private.readable_material(owner,q.material_id);
    select * into strict r from yeoback_private.material_reads where id=q.read_id and owner_id=owner;
    if m.version<>q.material_version or m.content_hash is distinct from r.content_hash then
        raise exception 'Source revision conflict' using errcode='40001';
    end if;
    return yeoback_private.material_read_json(r);
end;
$$;

revoke all on function yeoback_private.readable_material(uuid,uuid),yeoback_private.material_read_json(yeoback_private.material_reads)
    from public,anon,authenticated,service_role;
revoke all on function public.reserve_material_read(uuid,uuid,uuid,integer,uuid,integer,boolean),
    public.complete_material_read(uuid,uuid,uuid,text,jsonb,text),public.get_material_read(uuid) from public,anon,authenticated,service_role;
grant execute on function public.reserve_material_read(uuid,uuid,uuid,integer,uuid,integer,boolean),
    public.complete_material_read(uuid,uuid,uuid,text,jsonb,text) to service_role;
grant execute on function public.get_material_read(uuid) to authenticated;

commit;
