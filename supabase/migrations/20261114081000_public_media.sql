begin;

create function public.get_public_media(p_publication_id uuid,p_kind text,p_mock boolean)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
    exhibition uuid;
    pub public.publications%rowtype;
    material public.materials%rowtype;
    audio public.audio_assets%rowtype;
    media jsonb;
begin
    if p_kind is null or p_kind not in ('image','audio') or p_mock is null then
        raise exception 'Invalid public media kind' using errcode = '22023';
    end if;
    select exhibition_id into exhibition from public.publications where id = p_publication_id;
    if not found then return null; end if;
    select * into pub from yeoback_private.public_artworks(exhibition) p where p.id = p_publication_id;
    if not found then return null; end if;
    if p_kind = 'image' then
        select * into material from public.materials m
        where m.owner_id = pub.owner_id and m.artwork_id = pub.artwork_id and m.storage_key = pub.image_key
            and m.kind = 'image' and m.state = 'ready' and m.deleted_at is null
            and m.content_type in ('image/jpeg','image/png','image/webp') and m.byte_size between 1 and 52428800
            and octet_length(m.content_hash) = 32;
        if not found then return null; end if;
        media := jsonb_build_object('bucket','artist-materials','storageKey',material.storage_key,
            'contentType',material.content_type,'byteSize',material.byte_size,
            'contentHash',encode(material.content_hash,'hex'),'mock',false);
    else
        select * into audio from public.audio_assets a
        where a.owner_id = pub.owner_id and a.exhibition_id = pub.exhibition_id and a.artwork_id = pub.artwork_id
            and a.storage_key = pub.audio_key and a.state = 'ready'
            and a.text_hash = pub.narration_hash and a.text_hash = pub.audio_text_hash
            and (not a.mock or p_mock) and a.byte_size between 1 and 8388608 and octet_length(a.content_hash) = 32;
        if not found then return null; end if;
        media := jsonb_build_object('bucket','artist-audio','storageKey',audio.storage_key,
            'contentType','audio/mpeg','byteSize',audio.byte_size,'contentHash',encode(audio.content_hash,'hex'),'mock',audio.mock);
    end if;
    return media || jsonb_build_object('publicationId',pub.id,'exhibitionId',pub.exhibition_id,
        'artworkId',pub.artwork_id,'version',pub.version,'kind',p_kind);
end;
$$;

create function public.get_public_media_refs(p_publication_ids uuid[],p_mock boolean)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
    if p_publication_ids is null or cardinality(p_publication_ids) > 1000 or p_mock is null then
        raise exception 'Invalid public media references' using errcode = '22023';
    end if;
    return coalesce((select jsonb_agg(jsonb_build_object(
        'publicationId', ids.id,
        'image',case when public.get_public_media(ids.id,'image',p_mock) is not null
            then jsonb_build_object('id',ids.id,'kind','image') end,
        'audio',case when public.get_public_media(ids.id,'audio',p_mock) is not null
            then jsonb_build_object('id',ids.id,'kind','audio') end
    ) order by ids.position)
    from (select id,min(position) as position from unnest(p_publication_ids) with ordinality u(id,position)
        where id is not null group by id) ids
    join public.publications snapshot on snapshot.id = ids.id
    where exists (select 1 from yeoback_private.public_artworks(snapshot.exhibition_id) p where p.id = ids.id)), '[]');
end;
$$;

revoke all on function public.get_public_media(uuid,text,boolean),public.get_public_media_refs(uuid[],boolean)
    from public,anon,authenticated,service_role;
grant execute on function public.get_public_media(uuid,text,boolean),public.get_public_media_refs(uuid[],boolean) to service_role;

commit;
