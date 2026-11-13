begin;

create or replace function yeoback_private.visitor_voice_source(p_sid bytea,p_exhibition uuid,p_answer_id uuid)
returns public.api_requests language sql stable set search_path = '' as $$
    select r.* from public.api_requests r where r.session_hash = p_sid and r.id = p_answer_id and r.kind = 'question'
        and r.exhibition_id = p_exhibition and r.state = 'ready' and r.expires_at > statement_timestamp()
        and exists (
            select 1 from yeoback_private.public_artworks(p_exhibition) p
            where p.id = r.publication_id or (
                r.publication_id is null and r.artwork_id is null
                and r.result->>'source' = 'fixed' and r.result->>'outcome' = 'clarify'
                and r.result->'publication' = 'null'::jsonb
            )
        );
$$;

create function public.get_visitor_answer_exhibition(p_session_hash text,p_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
    select r.exhibition_id from public.api_requests r where r.session_hash = yeoback_private.visitor_hash(p_session_hash)
        and r.id = p_id and (yeoback_private.visitor_voice_source(r.session_hash,r.exhibition_id,r.id)).id is not null;
$$;
revoke all on function public.get_visitor_answer_exhibition(text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_visitor_answer_exhibition(text,uuid) to service_role;

commit;
