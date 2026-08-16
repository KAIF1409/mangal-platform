-- KaTube §28a — viewer feature schema: playlists, continue-watching
-- progress, and new-upload notifications. Follows the same conventions as
-- the rest of KaTube (videos table, video_likes) and K Circle's
-- notifications table (20260813120000_kcircle_notifications.sql):
-- composite PKs where they structurally prevent duplicates, RLS locked to
-- auth.uid(), actor-scoped inserts for notifications (no trigger fan-out).

-- Viewer-built playlists (YouTube-style "Watch later" / custom playlists).
-- References videos by id only, per the zero-hosting rule (§2) — a
-- playlist is just an ordered set of video_id references, never a copy of
-- video data.
create table if not exists katube_playlists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now()
);
create index if not exists katube_playlists_owner_idx on katube_playlists(owner_id, created_at desc);

alter table katube_playlists enable row level security;
create policy "katube_playlists_public_read" on katube_playlists for select using (true);
create policy "katube_playlists_own_insert" on katube_playlists for insert to authenticated with check (auth.uid() = owner_id);
create policy "katube_playlists_own_update" on katube_playlists for update to authenticated using (auth.uid() = owner_id);
create policy "katube_playlists_own_delete" on katube_playlists for delete to authenticated using (auth.uid() = owner_id);

create table if not exists katube_playlist_videos (
  playlist_id uuid not null references katube_playlists(id) on delete cascade,
  video_id uuid not null references videos(id) on delete cascade,
  position int not null default 0,
  added_at timestamptz not null default now(),
  primary key (playlist_id, video_id)
);
create index if not exists katube_playlist_videos_playlist_idx on katube_playlist_videos(playlist_id, position);

alter table katube_playlist_videos enable row level security;
create policy "katube_playlist_videos_public_read" on katube_playlist_videos for select using (true);
-- Ownership is checked against the parent playlist, not a denormalized
-- owner_id column here — mirrors how video_comments checks video ownership
-- implicitly via the FK relationship pattern used elsewhere in KaTube.
create policy "katube_playlist_videos_owner_insert" on katube_playlist_videos for insert to authenticated
  with check (exists (select 1 from katube_playlists p where p.id = playlist_id and p.owner_id = auth.uid()));
create policy "katube_playlist_videos_owner_delete" on katube_playlist_videos for delete to authenticated
  using (exists (select 1 from katube_playlists p where p.id = playlist_id and p.owner_id = auth.uid()));

-- Continue Watching — last known playback position per (viewer, video),
-- upserted from the IFrame Player API's getCurrentTime() on an interval.
-- Kept private (viewer-only read) since "how far you got" is personal,
-- unlike likes/comments which are public elsewhere in KaTube.
create table if not exists katube_watch_progress (
  viewer_id uuid not null references auth.users(id) on delete cascade,
  video_id uuid not null references videos(id) on delete cascade,
  position_seconds int not null default 0,
  duration_seconds int,
  updated_at timestamptz not null default now(),
  primary key (viewer_id, video_id)
);
create index if not exists katube_watch_progress_viewer_idx on katube_watch_progress(viewer_id, updated_at desc);

alter table katube_watch_progress enable row level security;
create policy "katube_watch_progress_own_read" on katube_watch_progress for select to authenticated using (auth.uid() = viewer_id);
create policy "katube_watch_progress_own_insert" on katube_watch_progress for insert to authenticated with check (auth.uid() = viewer_id);
create policy "katube_watch_progress_own_update" on katube_watch_progress for update to authenticated using (auth.uid() = viewer_id);
create policy "katube_watch_progress_own_delete" on katube_watch_progress for delete to authenticated using (auth.uid() = viewer_id);

-- New-upload notifications for followers, same actor-inserts-for-recipient
-- trust model as kcircle_notifications: the uploader's own insert (right
-- after the video row insert succeeds) fans the notification out to their
-- followers, no DB trigger needed.
create table if not exists katube_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  video_id uuid references videos(id) on delete cascade,
  type text not null default 'new_upload' check (type in ('new_upload')),
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists katube_notifications_recipient_idx on katube_notifications(recipient_id, created_at desc);

alter table katube_notifications enable row level security;
create policy "katube_notifications_recipient_read" on katube_notifications for select to authenticated using (auth.uid() = recipient_id);
create policy "katube_notifications_recipient_update" on katube_notifications for update to authenticated using (auth.uid() = recipient_id) with check (auth.uid() = recipient_id);
create policy "katube_notifications_actor_insert" on katube_notifications for insert to authenticated with check (auth.uid() = actor_id and actor_id <> recipient_id);

alter table katube_notifications replica identity full;
alter publication supabase_realtime add table katube_notifications;
