-- Step 25 — Tags System
-- Run this whole file once in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- Adds multi-tag support alongside the existing single `genre` column — genre
-- is untouched, tags are an additive browse axis (e.g. "Reincarnation",
-- "System", "Weak to Strong") like Webnovel's tag cloud.

-- 1. Master tag list. `slug` is the URL-safe lookup key (e.g. /tags/system).
create table if not exists tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  created_at timestamptz not null default now()
);

-- 2. Junction table — many-to-many between series and tags.
create table if not exists series_tags (
  series_id uuid not null references series(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (series_id, tag_id)
);

create index if not exists series_tags_series_id_idx on series_tags(series_id);
create index if not exists series_tags_tag_id_idx on series_tags(tag_id);

-- 3. RLS: tags themselves are public read, no public write (only creators
-- attaching tags via series_tags, never inventing arbitrary new tag rows
-- from the client — that keeps the tag list from getting spammed/duplicated).
alter table tags enable row level security;

drop policy if exists "tags_public_read" on tags;
create policy "tags_public_read" on tags
  for select using (true);

-- Only authenticated users can insert new tags (creators adding a tag that
-- doesn't exist yet). No update/delete from the client — cleanup stays admin-only.
drop policy if exists "tags_authenticated_insert" on tags;
create policy "tags_authenticated_insert" on tags
  for insert to authenticated with check (true);

-- 4. RLS: series_tags — public read (so tag chips show for everyone), but
-- only the series' own creator can attach/detach tags on their series.
alter table series_tags enable row level security;

drop policy if exists "series_tags_public_read" on series_tags;
create policy "series_tags_public_read" on series_tags
  for select using (true);

drop policy if exists "series_tags_creator_write" on series_tags;
create policy "series_tags_creator_write" on series_tags
  for insert to authenticated with check (
    exists (
      select 1 from series
      where series.id = series_tags.series_id
      and series.creator_id = auth.uid()
    )
  );

drop policy if exists "series_tags_creator_delete" on series_tags;
create policy "series_tags_creator_delete" on series_tags
  for delete to authenticated using (
    exists (
      select 1 from series
      where series.id = series_tags.series_id
      and series.creator_id = auth.uid()
    )
  );

-- 5. Seed a starter set of common Indian-web-fiction tags so the tag cloud
-- isn't empty on day one. Creators can add more freely from the dashboard.
insert into tags (name, slug) values
  ('Reincarnation', 'reincarnation'),
  ('System', 'system'),
  ('Weak to Strong', 'weak-to-strong'),
  ('Mythology', 'mythology'),
  ('Revenge', 'revenge'),
  ('Slow Burn', 'slow-burn'),
  ('College Life', 'college-life'),
  ('Arranged Marriage', 'arranged-marriage'),
  ('Time Travel', 'time-travel'),
  ('Supernatural', 'supernatural'),
  ('Martial Arts', 'martial-arts'),
  ('Royalty', 'royalty'),
  ('Small Town', 'small-town'),
  ('Found Family', 'found-family'),
  ('Enemies to Lovers', 'enemies-to-lovers')
on conflict (name) do nothing;
