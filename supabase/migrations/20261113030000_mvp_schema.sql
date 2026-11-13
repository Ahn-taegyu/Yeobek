begin;

create schema yeoback_private;
revoke all on schema yeoback_private from public, anon, authenticated;

create table public.artist_profiles (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null unique references auth.users(id),
    display_name text check (display_name is null or char_length(btrim(display_name)) between 1 and 100),
    revision integer not null default 1 check (revision > 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (owner_id, id)
);

create table public.exhibitions (
    id uuid primary key,
    owner_id uuid not null,
    artist_id uuid not null,
    title text not null check (char_length(btrim(title)) between 1 and 100),
    start_date date,
    end_date date,
    place text check (char_length(btrim(place)) <= 200),
    state text not null default 'draft' check (state in ('draft', 'published', 'paused')),
    public_title text check (char_length(btrim(public_title)) between 1 and 100),
    public_artist_display_name text check (char_length(btrim(public_artist_display_name)) between 1 and 100),
    public_artist_bio text check (char_length(public_artist_bio) <= 5000),
    public_introduction text check (char_length(public_introduction) <= 5000),
    public_theme text check (char_length(public_theme) <= 5000),
    public_start_date date,
    public_end_date date,
    public_place text check (char_length(public_place) <= 200),
    deleted_at timestamptz,
    create_fingerprint bytea not null check (octet_length(create_fingerprint) = 32),
    revision integer not null default 1 check (revision > 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (owner_id, id),
    foreign key (owner_id, artist_id) references public.artist_profiles(owner_id, id),
    check (num_nonnulls(start_date, end_date) = 0 or
        (start_date is not null and end_date is not null and isfinite(start_date) and isfinite(end_date) and start_date <= end_date)),
    check (num_nonnulls(public_start_date, public_end_date) = 0 or
        (public_start_date is not null and public_end_date is not null and
            isfinite(public_start_date) and isfinite(public_end_date) and public_start_date <= public_end_date)),
    check (state <> 'published' or (public_title is not null and public_artist_display_name is not null))
);

create table public.artworks (
    id uuid primary key,
    owner_id uuid not null,
    exhibition_id uuid not null,
    number integer not null check (number between 1 and 9999),
    title text not null check (char_length(btrim(title)) between 1 and 100),
    creation_year text check (char_length(btrim(creation_year)) <= 50),
    medium text check (char_length(btrim(medium)) <= 200),
    dimensions text check (char_length(btrim(dimensions)) <= 100),
    image_material_id uuid,
    narration_draft text check (char_length(narration_draft) <= 2000),
    active_publication_id uuid,
    state text not null default 'draft' check (state in ('draft', 'published', 'paused')),
    deleted_at timestamptz,
    create_fingerprint bytea not null check (octet_length(create_fingerprint) = 32),
    revision integer not null default 1 check (revision > 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (owner_id, id),
    unique (owner_id, exhibition_id, id),
    unique (exhibition_id, number),
    foreign key (owner_id, exhibition_id) references public.exhibitions(owner_id, id),
    check (state <> 'published' or active_publication_id is not null)
);

create table public.knowledge_documents (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null,
    artist_id uuid unique,
    exhibition_id uuid unique,
    artwork_id uuid unique,
    subject_type text generated always as (
        case when artist_id is not null then 'artist' when exhibition_id is not null then 'exhibition' else 'artwork' end
    ) stored,
    subject_id uuid generated always as (coalesce(artist_id, exhibition_id, artwork_id)) stored,
    sections jsonb not null default '[]' check (jsonb_typeof(sections) = 'array'),
    source_refs jsonb not null default '[]' check (jsonb_typeof(source_refs) = 'array'),
    revision integer not null default 1 check (revision > 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (owner_id, subject_type, subject_id),
    foreign key (owner_id, artist_id) references public.artist_profiles(owner_id, id),
    foreign key (owner_id, exhibition_id) references public.exhibitions(owner_id, id),
    foreign key (owner_id, artwork_id) references public.artworks(owner_id, id),
    check (num_nonnulls(artist_id, exhibition_id, artwork_id) = 1)
);

create table public.materials (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null,
    artist_id uuid,
    exhibition_id uuid,
    artwork_id uuid,
    kind text not null check (kind in ('image', 'pdf', 'text')),
    state text not null default 'pending' check (state in ('pending', 'ready', 'revoked')),
    storage_key text unique check (storage_key is null or (
        char_length(storage_key) <= 512 and split_part(storage_key, '/', 1) = owner_id::text and
        split_part(storage_key, '/', 2) <> '' and storage_key !~ '(^|/)\.{1,2}(/|$)'
    )),
    text_body text check (char_length(text_body) between 1 and 5000),
    byte_size integer,
    version integer not null default 1 check (version > 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (owner_id, artwork_id, id),
    foreign key (owner_id, artist_id) references public.artist_profiles(owner_id, id),
    foreign key (owner_id, exhibition_id) references public.exhibitions(owner_id, id),
    foreign key (owner_id, artwork_id) references public.artworks(owner_id, id),
    check (num_nonnulls(artist_id, exhibition_id, artwork_id) = 1),
    check ((kind = 'text' and storage_key is null and byte_size is null and text_body is not null) or
        (kind in ('image', 'pdf') and storage_key is not null and text_body is null and byte_size is not null and
            byte_size between 1 and case kind when 'image' then 3145728 else 6291456 end))
);

alter table public.artworks add constraint artworks_image_material_fk
    foreign key (owner_id, id, image_material_id) references public.materials(owner_id, artwork_id, id);

create table public.publications (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null,
    exhibition_id uuid not null,
    artwork_id uuid not null,
    version integer not null check (version > 0),
    number integer not null check (number between 1 and 9999),
    title text not null check (char_length(btrim(title)) between 1 and 100),
    creation_year text check (char_length(creation_year) <= 50),
    medium text check (char_length(medium) <= 200),
    dimensions text check (char_length(dimensions) <= 100),
    image_key text not null check (char_length(image_key) between 1 and 512),
    evidence jsonb not null check (jsonb_typeof(evidence) = 'array' and evidence <> '[]'),
    narration_text text not null check (char_length(btrim(narration_text)) between 1 and 2000),
    narration_hash bytea not null check (narration_hash = sha256(convert_to(narration_text, 'UTF8'))),
    audio_key text not null check (char_length(audio_key) between 1 and 512),
    audio_text_hash bytea not null check (octet_length(audio_text_hash) = 32),
    approved_by uuid not null references auth.users(id),
    approved_at timestamptz not null default now(),
    revoked_at timestamptz check (revoked_at >= approved_at),
    unique (owner_id, artwork_id, id),
    unique (exhibition_id, artwork_id, version),
    unique (exhibition_id, artwork_id, id),
    foreign key (owner_id, exhibition_id, artwork_id) references public.artworks(owner_id, exhibition_id, id),
    check (approved_by = owner_id),
    check (audio_text_hash = narration_hash)
);

alter table public.artworks add constraint artworks_active_publication_fk
    foreign key (owner_id, id, active_publication_id) references public.publications(owner_id, artwork_id, id);

-- Server-only and short-lived. No raw microphone input or visitor question history.
create table public.api_requests (
    session_hash bytea not null check (octet_length(session_hash) = 32),
    request_id uuid not null,
    exhibition_id uuid not null references public.exhibitions(id),
    artwork_id uuid,
    publication_id uuid,
    kind text not null check (kind in ('question', 'transcription', 'reply_audio')),
    state text not null default 'pending' check (state in ('pending', 'running', 'ready', 'failed')),
    answer_text text check (char_length(answer_text) <= 2000),
    reply_audio_key text check (char_length(reply_audio_key) between 1 and 512),
    usage jsonb not null default '{}' check (jsonb_typeof(usage) = 'object'),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    expires_at timestamptz not null default (now() + interval '1 hour'),
    primary key (session_hash, request_id),
    foreign key (exhibition_id, artwork_id, publication_id) references public.publications(exhibition_id, artwork_id, id),
    check ((artwork_id is null) = (publication_id is null)),
    check (expires_at > created_at and expires_at <= created_at + interval '1 hour')
);

create index exhibitions_owner_created_idx on public.exhibitions(owner_id, created_at desc) where deleted_at is null;
create index materials_owner_idx on public.materials(owner_id);
create index publications_exhibition_idx on public.publications(exhibition_id, artwork_id);
create index api_requests_expires_idx on public.api_requests(expires_at);

create function yeoback_private.prevent_publication_rewrite() returns trigger
language plpgsql set search_path = '' as $$
begin
    if tg_op = 'UPDATE' and old.revoked_at is null and new.revoked_at is not null
        and (to_jsonb(old) - 'revoked_at') = (to_jsonb(new) - 'revoked_at') then
        return new;
    end if;
    raise exception 'Approved publication snapshots are immutable' using errcode = '55000';
end;
$$;

create trigger publications_immutable before update or delete on public.publications
    for each row execute function yeoback_private.prevent_publication_rewrite();

alter table public.artist_profiles enable row level security;
alter table public.exhibitions enable row level security;
alter table public.artworks enable row level security;
alter table public.knowledge_documents enable row level security;
alter table public.materials enable row level security;
alter table public.publications enable row level security;
alter table public.api_requests enable row level security;

revoke all on table public.artist_profiles, public.exhibitions, public.artworks, public.knowledge_documents,
    public.materials, public.publications, public.api_requests from public, anon, authenticated;
grant select on table public.artist_profiles, public.exhibitions, public.artworks, public.knowledge_documents,
    public.materials, public.publications to authenticated;
grant select, insert, update, delete on table public.artist_profiles, public.exhibitions, public.artworks,
    public.knowledge_documents, public.materials, public.publications, public.api_requests to service_role;

create policy artist_profiles_read_own on public.artist_profiles for select to authenticated
    using (owner_id = (select auth.uid()) and (select auth.jwt()->>'is_anonymous') is distinct from 'true');
create policy exhibitions_read_own on public.exhibitions for select to authenticated
    using (owner_id = (select auth.uid()) and (select auth.jwt()->>'is_anonymous') is distinct from 'true');
create policy artworks_read_own on public.artworks for select to authenticated
    using (owner_id = (select auth.uid()) and (select auth.jwt()->>'is_anonymous') is distinct from 'true');
create policy knowledge_documents_read_own on public.knowledge_documents for select to authenticated
    using (owner_id = (select auth.uid()) and (select auth.jwt()->>'is_anonymous') is distinct from 'true');
create policy materials_read_own on public.materials for select to authenticated
    using (owner_id = (select auth.uid()) and (select auth.jwt()->>'is_anonymous') is distinct from 'true');
create policy publications_read_own on public.publications for select to authenticated
    using (owner_id = (select auth.uid()) and (select auth.jwt()->>'is_anonymous') is distinct from 'true');

commit;
