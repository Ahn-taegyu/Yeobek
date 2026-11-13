begin;

-- A signed token may finish issuing just after the reservation expires.
create or replace function yeoback_private.material_cleanup_deadline(p_upload_expires_at timestamptz)
returns timestamptz language sql volatile set search_path = '' as $$
    select greatest(clock_timestamp() + interval '3 minutes',
        p_upload_expires_at + interval '2 hours 3 minutes');
$$;

create or replace function public.delete_artwork(p_id uuid,p_expected_revision integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    owner uuid := yeoback_private.require_owner();
    a public.artworks%rowtype;
begin
    perform yeoback_private.lock_publication(owner);
    select * into a from public.artworks where id = p_id and owner_id = owner for update;
    if not found then raise exception 'Subject not found' using errcode = 'P0002'; end if;
    if a.deleted_at is not null then
        if a.revision is distinct from p_expected_revision and a.revision - 1 is distinct from p_expected_revision then
            raise exception 'Artwork revision conflict' using errcode = '40001';
        end if;
    else
        perform yeoback_private.subject_scope(owner,'artwork',p_id);
        if a.revision is distinct from p_expected_revision then
            raise exception 'Artwork revision conflict' using errcode = '40001';
        end if;
        if a.state = 'published' or exists (
            select 1 from public.publications p where p.id = a.active_publication_id and p.revoked_at is null
        ) then raise exception 'Artwork still has an active publication' using errcode = 'P1022'; end if;
        update public.artworks set deleted_at = statement_timestamp(),state = 'draft',active_publication_id = null,
            image_material_id = null,revision = revision + 1,updated_at = statement_timestamp()
            where id = a.id returning * into a;
    end if;
    return jsonb_build_object('id',a.id,'revision',a.revision,'deletedAt',a.deleted_at);
end;
$$;

commit;
