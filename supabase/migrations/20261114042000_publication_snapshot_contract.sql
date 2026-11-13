begin;

-- The publisher constructs this envelope, but the storage boundary must also
-- reject malformed snapshots instead of deferring failure to visitor Q&A.
create or replace function yeoback_private.require_publication_v1()
returns trigger language plpgsql set search_path = '' as $$
declare
    item jsonb;
    pin jsonb;
    item_id uuid;
    item_version integer;
    seen uuid[] := '{}';
    cited uuid[] := '{}';
begin
    if jsonb_typeof(new.evidence) is distinct from 'object'
        or new.evidence - array['schemaVersion','items'] <> '{}'
        or new.evidence->'schemaVersion' is distinct from '1'::jsonb
        or jsonb_typeof(new.evidence->'items') is distinct from 'array'
        or jsonb_typeof(new.narration_citations) is distinct from 'array' then
        raise exception 'Invalid publication snapshot' using errcode = '22023';
    end if;
    if jsonb_array_length(new.evidence->'items') not between 1 and 100
        or jsonb_array_length(new.narration_citations) not between 1 and 12 then
        raise exception 'Invalid publication snapshot' using errcode = '22023';
    end if;
    for item in select value from jsonb_array_elements(new.evidence->'items') loop
        if jsonb_typeof(item) is distinct from 'object'
            or not item ?& array['id','version','ownerId','exhibitionId','publicationId','artworkId','scope','sourceLabel','body','contentHash']
            or item - array['id','version','ownerId','exhibitionId','publicationId','artworkId','scope','sourceLabel','body','contentHash'] <> '{}'
            or jsonb_typeof(item->'id') is distinct from 'string'
            or jsonb_typeof(item->'version') is distinct from 'number'
            or jsonb_typeof(item->'ownerId') is distinct from 'string'
            or jsonb_typeof(item->'exhibitionId') is distinct from 'string'
            or jsonb_typeof(item->'publicationId') is distinct from 'string'
            or jsonb_typeof(item->'scope') is distinct from 'string'
            or jsonb_typeof(item->'sourceLabel') is distinct from 'string'
            or jsonb_typeof(item->'body') is distinct from 'string'
            or jsonb_typeof(item->'contentHash') is distinct from 'string' then
            raise exception 'Invalid publication snapshot' using errcode = '22023';
        end if;
        item_id := (item->>'id')::uuid;
        item_version := (item->>'version')::integer;
        if item_version < 1 or item_id = any(seen)
            or (item->>'ownerId')::uuid <> new.owner_id
            or (item->>'exhibitionId')::uuid <> new.exhibition_id
            or (item->>'publicationId')::uuid <> new.id
            or item->>'scope' not in ('artist','exhibition','artwork')
            or char_length(item->>'sourceLabel') not between 1 and 200
            or (item->>'sourceLabel') !~ '[^[:space:]]'
            or char_length(item->>'body') not between 1 and 8000
            or (item->>'body') !~ '[^[:space:]]'
            or item->>'contentHash' <> encode(sha256(convert_to(item->>'body','UTF8')),'hex') then
            raise exception 'Invalid publication snapshot' using errcode = '22023';
        end if;
        if item->>'scope' = 'artwork' then
            if jsonb_typeof(item->'artworkId') is distinct from 'string'
                or (item->>'artworkId')::uuid <> new.artwork_id then
                raise exception 'Invalid publication snapshot' using errcode = '22023';
            end if;
        elsif item->'artworkId' is distinct from 'null'::jsonb then
            raise exception 'Invalid publication snapshot' using errcode = '22023';
        end if;
        seen := array_append(seen,item_id);
    end loop;
    for pin in select value from jsonb_array_elements(new.narration_citations) loop
        if jsonb_typeof(pin) is distinct from 'object' or not pin ?& array['id','version']
            or pin - array['id','version'] <> '{}'
            or jsonb_typeof(pin->'id') is distinct from 'string'
            or jsonb_typeof(pin->'version') is distinct from 'number' then
            raise exception 'Invalid publication snapshot' using errcode = '22023';
        end if;
        item_id := (pin->>'id')::uuid;
        item_version := (pin->>'version')::integer;
        if item_id = any(cited) or not exists (
            select 1 from jsonb_array_elements(new.evidence->'items') e
            where (e->>'id')::uuid = item_id and (e->>'version')::integer = item_version
        ) then raise exception 'Invalid publication snapshot' using errcode = '22023'; end if;
        cited := array_append(cited,item_id);
    end loop;
    return new;
exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Invalid publication snapshot' using errcode = '22023';
end;
$$;

commit;
