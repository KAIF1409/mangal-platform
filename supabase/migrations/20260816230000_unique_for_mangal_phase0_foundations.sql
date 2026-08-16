-- §0 "Unique for Mangal" — Phase 0: shared foundations for Mangal Ideas,
-- Mangal of the Week, and WebMangal Writer of the Month (see CONTEXT.md §0).
-- Applied live via Supabase MCP; this file mirrors that migration for repo history.

-- 1. mangal_ideas — KaTube-home idea feed. Two kinds of rows:
--   'company'      -> admin-authored idea/prompt cards (created_by = the admin)
--   'story_demand' -> auto-surfaced trending-story-needs-a-video-creator cards
--                     (created_by null, series_id set)
create table if not exists mangal_ideas (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('company', 'story_demand')),
  series_id uuid references series(id) on delete cascade,
  title text not null,
  description text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint mangal_ideas_story_demand_has_series
    check (type <> 'story_demand' or series_id is not null)
);

create index if not exists mangal_ideas_type_idx on mangal_ideas(type);
create index if not exists mangal_ideas_series_id_idx on mangal_ideas(series_id);
create index if not exists mangal_ideas_created_at_idx on mangal_ideas(created_at desc);

alter table mangal_ideas enable row level security;

create policy "mangal_ideas_public_read" on mangal_ideas
  for select using (true);

-- Admin/developer-only write, same "EXISTS profiles me ... role = 'developer'"
-- pattern already used for "Admin can update profiles". Story-demand cards
-- will be inserted by a scheduled/service-role job later (Phase 1), which
-- bypasses RLS anyway — this policy governs manual/company-card inserts.
create policy "mangal_ideas_admin_write" on mangal_ideas
  for all to authenticated
  using (exists (select 1 from profiles me where me.id = auth.uid() and me.role = 'developer'))
  with check (exists (select 1 from profiles me where me.id = auth.uid() and me.role = 'developer'));

-- 2. weekly_rankings — snapshot of a week's top-20 KaTube videos plus their
-- computed Mangal-of-the-Week score. tier: 1 = writer+creator collab video,
-- 2 = solo creator video (see videos.is_collab below).
create table if not exists weekly_rankings (
  id uuid primary key default gen_random_uuid(),
  week_start_date date not null,
  video_id uuid not null references videos(id) on delete cascade,
  tier smallint not null default 2 check (tier in (1, 2)),
  votes_count int not null default 0,
  views_snapshot int not null default 0,
  final_score numeric not null default 0,
  rank int,
  created_at timestamptz not null default now(),
  unique (week_start_date, video_id)
);

create index if not exists weekly_rankings_week_idx on weekly_rankings(week_start_date);
create index if not exists weekly_rankings_rank_idx on weekly_rankings(week_start_date, rank);

alter table weekly_rankings enable row level security;

create policy "weekly_rankings_public_read" on weekly_rankings
  for select using (true);

create policy "weekly_rankings_admin_write" on weekly_rankings
  for all to authenticated
  using (exists (select 1 from profiles me where me.id = auth.uid() and me.role = 'developer'))
  with check (exists (select 1 from profiles me where me.id = auth.uid() and me.role = 'developer'));

-- 3. video_votes — one audience vote per user per week (anti-abuse: unique
-- constraint below, not just a UI check). reason_tags is the scroll-down
-- picker selection (e.g. {"Editing","Sound","Story"}); comment is optional
-- free text ("story mast hai").
create table if not exists video_votes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  video_id uuid not null references videos(id) on delete cascade,
  week_start_date date not null,
  reason_tags text[] not null default '{}',
  comment text,
  created_at timestamptz not null default now(),
  unique (user_id, week_start_date)
);

create index if not exists video_votes_video_idx on video_votes(video_id);
create index if not exists video_votes_week_idx on video_votes(week_start_date);

alter table video_votes enable row level security;

-- Votes are personal — public aggregate counts are read via weekly_rankings
-- (votes_count) instead of exposing who-voted-for-what directly.
create policy "video_votes_own_read" on video_votes
  for select to authenticated using (auth.uid() = user_id);

create policy "video_votes_own_insert" on video_votes
  for insert to authenticated with check (auth.uid() = user_id);

-- No update/delete policy on purpose — a cast vote is locked in for that
-- week, same anti-gaming reasoning as the unique (user_id, week_start_date)
-- constraint above.

-- 4. monthly_writer_awards — WebMangal Writer of the Month snapshot.
create table if not exists monthly_writer_awards (
  id uuid primary key default gen_random_uuid(),
  month date not null,
  series_id uuid not null references series(id) on delete cascade,
  writer_id uuid not null references auth.users(id) on delete cascade,
  score numeric not null default 0,
  rank int,
  created_at timestamptz not null default now(),
  unique (month, series_id)
);

create index if not exists monthly_writer_awards_month_idx on monthly_writer_awards(month);

alter table monthly_writer_awards enable row level security;

create policy "monthly_writer_awards_public_read" on monthly_writer_awards
  for select using (true);

create policy "monthly_writer_awards_admin_write" on monthly_writer_awards
  for all to authenticated
  using (exists (select 1 from profiles me where me.id = auth.uid() and me.role = 'developer'))
  with check (exists (select 1 from profiles me where me.id = auth.uid() and me.role = 'developer'));

-- 5. videos — Tier 1 (writer+creator collab) vs Tier 2 (solo) distinction.
-- collab_writer_id is the WebMangal writer credited on the collab (may
-- differ from series.creator_id in principle, e.g. a co-written series, so
-- it's stored explicitly rather than inferred from series.creator_id).
alter table videos add column if not exists is_collab boolean not null default false;
alter table videos add column if not exists collab_writer_id uuid references auth.users(id) on delete set null;

create index if not exists videos_is_collab_idx on videos(is_collab) where is_collab;
