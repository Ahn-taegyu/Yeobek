begin;

-- Internal publication port. Call inside the publication transaction so this
-- owner lock protects both QA/evidence validation and the snapshot write.
create function public.get_approved_qa_for_publication(p_owner uuid,p_exhibition_id uuid,
    p_artwork_id uuid,p_allow_mock boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    item yeoback_private.qa_item_versions%rowtype;
    evidence public.evidence_items%rowtype;
    pin jsonb;
    eligible boolean;
    result jsonb := '[]';
begin
    if p_owner is null or p_exhibition_id is null or p_allow_mock is null then
        raise exception 'Invalid approved Q&A scope' using errcode = '22023';
    end if;
    perform yeoback_private.lock_publication(p_owner);
    perform yeoback_private.qa_scope(p_owner,p_exhibition_id,p_artwork_id);
    for item in select q.* from yeoback_private.qa_item_versions q
        where q.owner_id = p_owner and q.exhibition_id = p_exhibition_id
            and q.artwork_id is not distinct from p_artwork_id
            and q.state = 'approved' and (p_allow_mock or not q.mock)
            and not exists (select 1 from yeoback_private.qa_item_versions newer
                where newer.id = q.id and newer.version > q.version)
        order by q.id for share
    loop
        eligible := jsonb_array_length(item.evidence_pins) > 0;
        for pin in select value from jsonb_array_elements(item.evidence_pins) loop
            select * into evidence from public.evidence_items e
                where e.owner_id = p_owner and e.exhibition_id = p_exhibition_id
                    and (e.artwork_id is null or e.artwork_id = p_artwork_id)
                    and e.id = (pin->>'id')::uuid and e.version = (pin->>'version')::integer for share;
            if not found or not yeoback_private.evidence_is_current(evidence) then
                eligible := false;
                exit;
            end if;
            begin
                perform yeoback_private.validate_evidence_source(evidence,
                    yeoback_private.evidence_scope(p_owner,p_exhibition_id,evidence.artwork_id,evidence.scope));
            exception when sqlstate 'P0002' or sqlstate 'P1001' or sqlstate 'P1002' then
                eligible := false;
                exit;
            end;
        end loop;
        if eligible then
            result := result || jsonb_build_array(jsonb_build_object(
                'id',item.id,'version',item.version,'exhibitionId',item.exhibition_id,
                'artworkId',item.artwork_id,'scope',case when item.artwork_id is null then 'exhibition' else 'artwork' end,
                'question',item.question,'answer',item.answer,'contentHash',encode(item.content_hash,'hex'),
                'evidencePins',item.evidence_pins,'mock',item.mock,'approvedAt',item.approved_at));
        end if;
    end loop;
    return result;
end;
$$;

revoke all on function public.get_approved_qa_for_publication(uuid,uuid,uuid,boolean)
    from public,anon,authenticated,service_role;
grant execute on function public.get_approved_qa_for_publication(uuid,uuid,uuid,boolean) to service_role;

commit;
