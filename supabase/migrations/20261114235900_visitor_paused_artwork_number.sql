begin;

-- 관람객이 공개 목록에 없는 번호를 물었을 때, 같은 공개 전시에서 그 번호로 게시된 적이 있고
-- 아직 삭제되지 않은 작품인지 확인한다. 공개를 중지한 작품은 "온라인 안내 중지",
-- 한 번도 게시되지 않은 번호는 "찾을 수 없음"으로 안내하기 위한 판정이며 작품명·내용은 반환하지 않는다.
create or replace function public.was_artwork_number_published(p_exhibition_id uuid,p_number integer)
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (
        select 1 from public.publications p
        join public.artworks a on a.id = p.artwork_id and a.exhibition_id = p.exhibition_id
        join public.exhibitions e on e.id = p.exhibition_id
        where p.exhibition_id = p_exhibition_id and p.number = p_number
            and e.state = 'published' and e.deleted_at is null and a.deleted_at is null
    );
$$;

revoke all on function public.was_artwork_number_published(uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.was_artwork_number_published(uuid,integer) to service_role;

commit;
