begin;

alter function yeoback_private.organize_inputs(uuid,uuid,boolean) rename to organize_inputs_before_materials;
-- Keep the existing parent/document locks and add only eligible, explicitly read
-- file chunks. No file extraction result becomes an approved source here.
create function yeoback_private.organize_inputs(p_owner uuid,p_document_id uuid,p_apply boolean default false)
returns jsonb language plpgsql set search_path='' as $$
declare context jsonb; source_row record; candidate jsonb; sources jsonb:='[]';
    used_chars integer:=0; used_mock boolean:=false;
begin
    context:=yeoback_private.organize_inputs_before_materials(p_owner,p_document_id,p_apply);
    for source_row in
        select m.id,m.version,m.kind,m.artist_id,m.exhibition_id,m.artwork_id,r.id as read_id,r.mock,
            c.value as chunk,c.ordinality as chunk_number
        from public.materials m join yeoback_private.material_read_links l on l.material_id=m.id and l.owner_id=m.owner_id
        join yeoback_private.material_reads r on r.id=l.read_id and r.owner_id=l.owner_id and r.mock=l.mock
        cross join lateral jsonb_array_elements(r.chunks) with ordinality c
        where m.owner_id=p_owner and m.state='ready' and m.deleted_at is null and m.version=l.material_version
            and m.content_hash=r.content_hash and r.status='succeeded'
            and (m.artist_id=(context->>'artistId')::uuid
                or m.exhibition_id=(context->>'exhibitionId')::uuid
                or (context->>'subjectType'='artwork' and m.artwork_id=(context->>'subjectId')::uuid))
            and (m.kind='pdf' or (m.kind='image' and m.artwork_id is null
                and not exists(select 1 from public.artist_profiles a where a.owner_id=p_owner and a.avatar_material_id=m.id)
                and not exists(select 1 from public.exhibitions e where e.owner_id=p_owner and e.poster_material_id=m.id)))
            -- Prefer a real result if both versions exist; mock reads never hide it.
            and not (r.mock and exists(select 1 from yeoback_private.material_read_links ll
                join yeoback_private.material_reads rr on rr.id=ll.read_id and rr.owner_id=ll.owner_id
                where ll.owner_id=p_owner and ll.material_id=m.id and not ll.mock and not rr.mock
                    and ll.material_version=m.version and rr.content_hash=m.content_hash and rr.status='succeeded'))
        order by case when m.artwork_id is not null then 0 when m.exhibition_id is not null then 1 else 2 end,m.id,c.ordinality
        for share of m,l,r
    loop
        if jsonb_array_length(sources)>=12 or used_chars+char_length(source_row.chunk->>'text')>8000 then continue; end if;
        used_chars:=used_chars+char_length(source_row.chunk->>'text');
        used_mock:=used_mock or source_row.mock;
        sources:=sources||jsonb_build_array(jsonb_build_object(
            'id',yeoback_private.narration_source_id(source_row.id,source_row.read_id::text||':'||source_row.chunk_number,source_row.version),
            'ownerId',p_owner,'artistId',context->'artistId','revision',source_row.version,
            'subjectType',case when source_row.artist_id is not null then 'artist' when source_row.exhibition_id is not null then 'exhibition' else 'artwork' end,
            'subjectId',coalesce(source_row.artist_id,source_row.exhibition_id,source_row.artwork_id),
            'exhibitionId',case when source_row.artist_id is null then context->'exhibitionId' else 'null'::jsonb end,
            'text',source_row.chunk->'text','ref',jsonb_build_object('kind','material','materialId',source_row.id,
                'sectionId',case context->>'subjectType' when 'artist' then 'bio' when 'exhibition' then 'introduction' else 'description' end)
                ||case when source_row.kind='pdf' then jsonb_build_object('pageStart',source_row.chunk->'pageStart','pageEnd',source_row.chunk->'pageEnd') else '{}'::jsonb end));
    end loop;
    -- Existing direct/ancestor inputs keep their order within the remaining budget.
    for candidate in select value from jsonb_array_elements(context->'sources') loop
        if jsonb_array_length(sources)>=12 or used_chars+char_length(candidate->>'text')>8000 then continue; end if;
        used_chars:=used_chars+char_length(candidate->>'text'); sources:=sources||jsonb_build_array(candidate);
    end loop;
    context:=jsonb_set(context,'{sources}',sources);
    if used_mock then context:=context||jsonb_build_object('materialMock',true); end if;
    return context;
end;
$$;
revoke all on function yeoback_private.organize_inputs(uuid,uuid,boolean),yeoback_private.organize_inputs_before_materials(uuid,uuid,boolean)
    from public,anon,authenticated,service_role;

-- Keep mock extraction out of live organization jobs, including direct RPC calls.
alter function public.reserve_organize_job(uuid,uuid,uuid,integer,boolean) rename to reserve_organize_job_before_materials;
alter function public.reserve_organize_job_before_materials(uuid,uuid,uuid,integer,boolean) set schema yeoback_private;
revoke all on function yeoback_private.reserve_organize_job_before_materials(uuid,uuid,uuid,integer,boolean) from public,anon,authenticated,service_role;
create function public.reserve_organize_job(p_owner uuid,p_request_id uuid,p_document_id uuid,p_expected_document_revision integer,p_mock boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
    result:=yeoback_private.reserve_organize_job_before_materials(p_owner,p_request_id,p_document_id,p_expected_document_revision,p_mock);
    if p_mock is false and yeoback_private.organize_inputs(p_owner,p_document_id)->'materialMock'='true'::jsonb then
        raise exception 'Mock materials cannot be used in live organization' using errcode='22023';
    end if;
    return result;
end;
$$;
alter function public.retry_organize_job(uuid,uuid,uuid,integer,boolean) rename to retry_organize_job_before_materials;
alter function public.retry_organize_job_before_materials(uuid,uuid,uuid,integer,boolean) set schema yeoback_private;
revoke all on function yeoback_private.retry_organize_job_before_materials(uuid,uuid,uuid,integer,boolean) from public,anon,authenticated,service_role;
create function public.retry_organize_job(p_owner uuid,p_job_id uuid,p_request_id uuid,p_expected_attempt integer,p_mock boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; document_id uuid;
begin
    result:=yeoback_private.retry_organize_job_before_materials(p_owner,p_job_id,p_request_id,p_expected_attempt,p_mock);
    select j.document_id into strict document_id from public.ai_jobs j where j.id=p_job_id and j.owner_id=p_owner;
    if p_mock is false and yeoback_private.organize_inputs(p_owner,document_id)->'materialMock'='true'::jsonb then
        raise exception 'Mock materials cannot be used in live organization' using errcode='22023';
    end if;
    return result;
end;
$$;
revoke all on function public.reserve_organize_job(uuid,uuid,uuid,integer,boolean),public.retry_organize_job(uuid,uuid,uuid,integer,boolean)
    from public,anon,authenticated,service_role;
grant execute on function public.reserve_organize_job(uuid,uuid,uuid,integer,boolean),public.retry_organize_job(uuid,uuid,uuid,integer,boolean) to service_role;

-- Remove private extracted bodies once no live source with the same owner/hash
-- survives. Keep the hash tombstone: deletion does not grant another model call.
alter function public.purge_expired() rename to purge_expired_before_material_reads;
alter function public.purge_expired_before_material_reads() set schema yeoback_private;
revoke all on function yeoback_private.purge_expired_before_material_reads() from public,anon,authenticated,service_role;
create function public.purge_expired()
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
    result:=yeoback_private.purge_expired_before_material_reads();
    update yeoback_private.material_reads r set chunks='[]',status='purged'
    where r.id in (select rr.id from yeoback_private.material_reads rr where rr.status='succeeded'
        and not exists(select 1 from public.materials m where m.owner_id=rr.owner_id and m.content_hash=rr.content_hash
            and m.state='ready' and m.deleted_at is null) order by rr.id limit 1000 for update skip locked);
    return result;
end;
$$;
revoke all on function public.purge_expired() from public,anon,authenticated,service_role;
grant execute on function public.purge_expired() to service_role;

commit;
