-- KaTube — comments + creator subscriptions
-- NOTE: this migration was already applied directly to the live project
-- (rfxlavwzhpnbhwoumaha) via the Supabase MCP connector on 2026-08-11 but
-- the .sql file was never committed to the repo — reconstructed here from
-- the live schema so migration history in git matches the database.
-- Same patterns as video_likes (20260810_katube_videos.sql): composite PK
-- where it structurally prevents duplicates, RLS locked to auth.uid().

create table if not exists video_comments (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references videos(id) on delete cascade,
  commenter_id uuid not null references auth.users(id) on delete cascade,
  comment_text text not null,
  created_at timestamptz not null default now()
);
create index if not exists video_comments_video_id_idx on video_comments(video_id, created_at desc);

alter table video_comments enable row level security;
create policy "video_comments_public_read" on video_comments for select using (true);
create policy "video_comments_own_insert" on video_comments for insert to authenticated with check (auth.uid() = commenter_id);
create policy "video_comments_own_delete" on video_comments for delete to authenticated using (auth.uid() = commenter_id);

-- One subscription per (subscriber, creator) — same structural-guarantee
-- pattern as video_likes' (video_id, liker_id) composite PK, so a user
-- can't subscribe to the same creator twice at the DB level.
create table if not exists creator_subscriptions (
  subscriber_id uuid not null references auth.users(id) on delete cascade,
  creator_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (subscriber_id, creator_id)
);
create index if not exists creator_subscriptions_creator_id_idx on creator_subscriptions(creator_id);

alter table creator_subscriptions enable row level security;
create policy "creator_subscriptions_public_read" on creator_subscriptions for select using (true);
create policy "creator_subscriptions_own_insert" on creator_subscriptions for insert to authenticated with check (auth.uid() = subscriber_id);
create policy "creator_subscriptions_own_delete" on creator_subscriptions for delete to authenticated using (auth.uid() = subscriber_id);
