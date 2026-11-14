begin;

-- Old snapshots have unknown times until the owner explicitly republishes.
alter table public.exhibitions
    add column public_start_time time without time zone,
    add column public_end_time time without time zone;

create function yeoback_private.snapshot_publication_times()
returns trigger language plpgsql set search_path = '' as $$
begin
    new.public_start_time := new.start_time;
    new.public_end_time := new.end_time;
    return new;
end;
$$;
revoke all on function yeoback_private.snapshot_publication_times() from public,anon,authenticated;
create trigger snapshot_publication_times before update of public_title on public.exhibitions
    for each row execute function yeoback_private.snapshot_publication_times();

create or replace function public.get_public_exhibition(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
    select jsonb_build_object('id', e.id, 'title', e.public_title, 'artist_display_name', e.public_artist_display_name,
        'artist_bio', e.public_artist_bio, 'introduction', e.public_introduction, 'theme', e.public_theme,
        'start_time', left(e.public_start_time::text,5), 'end_time', left(e.public_end_time::text,5),
        'start_date', e.public_start_date, 'end_date', e.public_end_date, 'place', e.public_place, 'artworks', snapshots.artworks)
    from public.exhibitions e
    cross join lateral (
        select jsonb_agg(yeoback_private.public_artwork_json(p) order by p.number, p.artwork_id) as artworks
        from yeoback_private.public_artworks(e.id) p
    ) snapshots
    where e.id = p_id and snapshots.artworks is not null;
$$;

commit;
