-- K Circle: polls attached to posts. Applied live in an earlier session,
-- reconstructed here (version matches the live-applied migration exactly)
-- to bring the repo's migration history in sync. A post is a poll simply
-- by having rows in kcircle_poll_options — no boolean flag on
-- kcircle_posts itself.
--
-- This session wires up the actual UI for this (composer poll builder +
-- feed voting widget) — see 20260813130000_kcircle_poll_vote_change.sql
-- for the one small addition made on top of this (letting a voter change
-- their pick).

create table if not exists kcircle_poll_options (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references kcircle_posts(id) on delete cascade,
  option_text text not null,
  position integer not null default 0
);

create table if not exists kcircle_poll_votes (
  post_id uuid not null references kcircle_posts(id) on delete cascade,
  option_id uuid not null references kcircle_poll_options(id) on delete cascade,
  voter_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, voter_id)
);

alter table kcircle_poll_options enable row level security;
alter table kcircle_poll_votes enable row level security;

create policy "kcircle_poll_options_public_read" on kcircle_poll_options
  for select using (true);

create policy "kcircle_poll_options_author_insert" on kcircle_poll_options
  for insert to authenticated
  with check (exists (select 1 from kcircle_posts p where p.id = kcircle_poll_options.post_id and p.author_id = auth.uid()));

create policy "kcircle_poll_votes_public_read" on kcircle_poll_votes
  for select using (true);

create policy "kcircle_poll_votes_own_insert" on kcircle_poll_votes
  for insert to authenticated
  with check (auth.uid() = voter_id);
