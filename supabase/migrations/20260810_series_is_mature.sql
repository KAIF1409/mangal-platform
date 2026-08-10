-- Step 30 — Mature content flag
-- Run this once in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- Adds a simple boolean creators can set at series-creation time (and edit
-- later), matching the Rating/Mature toggle pattern from the founder's
-- reference screenshots. Defaults to false — nothing existing changes rating
-- unless the creator explicitly opts in.

alter table series
  add column if not exists is_mature boolean not null default false;

-- No RLS changes needed — series' existing public-read / creator-write
-- policies already cover this column since it's just a new field on the
-- same row, not a new table.
