-- §85 continued — song_follows: lets readers follow/bookmark a song, same
-- shape/semantics as the existing `follows` table for series (reader_id +
-- target id + created_at, one row per reader/target pair). Needed because
-- /library and /bookmarks are both just views over `follows` today, and
-- `follows.series_id` isn't polymorphic — songs need their own follow
-- table rather than trying to overload that FK. Read pages (library/
-- bookmarks) query this table alongside `follows` and merge the two lists.

create table if not exists song_follows (
  id uuid primary key default gen_random_uuid(),
  reader_id uuid not null references auth.users(id) on delete cascade,
  song_id uuid not null references songs(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (reader_id, song_id)
);

create index if not exists song_follows_reader_id_idx on song_follows(reader_id);
create index if not exists song_follows_song_id_idx on song_follows(song_id);

alter table song_follows enable row level security;

drop policy if exists "song_follows_owner_read" on song_follows;
create policy "song_follows_owner_read" on song_follows for select
  using (auth.uid() = reader_id);

drop policy if exists "song_follows_owner_insert" on song_follows;
create policy "song_follows_owner_insert" on song_follows for insert to authenticated
  with check (auth.uid() = reader_id);

drop policy if exists "song_follows_owner_delete" on song_follows;
create policy "song_follows_owner_delete" on song_follows for delete to authenticated
  using (auth.uid() = reader_id);
