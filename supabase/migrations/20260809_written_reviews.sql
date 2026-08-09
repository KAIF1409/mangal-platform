-- Step 26 — Written Reviews
-- Extends the existing `ratings` table (stars only, one row per reader per
-- series) with optional review title/text, instead of a separate table —
-- a review IS a rating with words attached, same 1-per-reader-per-series
-- constraint applies, so no need to duplicate that uniqueness elsewhere.

alter table ratings add column if not exists review_title text;
alter table ratings add column if not exists review_text text;
alter table ratings add column if not exists updated_at timestamptz not null default now();

-- Helpful votes: one vote per reader per review, toggleable.
create table if not exists review_helpful_votes (
  rating_id uuid not null references ratings(id) on delete cascade,
  voter_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (rating_id, voter_id)
);

create index if not exists review_helpful_votes_rating_id_idx on review_helpful_votes(rating_id);

alter table review_helpful_votes enable row level security;

drop policy if exists "review_helpful_votes_public_read" on review_helpful_votes;
create policy "review_helpful_votes_public_read" on review_helpful_votes
  for select using (true);

drop policy if exists "review_helpful_votes_own_insert" on review_helpful_votes;
create policy "review_helpful_votes_own_insert" on review_helpful_votes
  for insert to authenticated with check (auth.uid() = voter_id);

drop policy if exists "review_helpful_votes_own_delete" on review_helpful_votes;
create policy "review_helpful_votes_own_delete" on review_helpful_votes
  for delete to authenticated using (auth.uid() = voter_id);
