-- KaTube Step 1 — videos table (already applied via Supabase MCP)
create table if not exists videos (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id) on delete cascade,
  series_id uuid references series(id) on delete set null,
  title text not null,
  youtube_id text not null,
  is_short boolean not null default false,
  views int not null default 0,
  likes int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists videos_creator_id_idx on videos(creator_id);
create index if not exists videos_series_id_idx on videos(series_id);
create index if not exists videos_created_at_idx on videos(created_at desc);

alter table videos enable row level security;
create policy "videos_public_read" on videos for select using (true);
create policy "videos_own_insert" on videos for insert to authenticated with check (auth.uid() = creator_id);
create policy "videos_own_update" on videos for update to authenticated using (auth.uid() = creator_id);
create policy "videos_own_delete" on videos for delete to authenticated using (auth.uid() = creator_id);

create table if not exists video_likes (
  video_id uuid not null references videos(id) on delete cascade,
  liker_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (video_id, liker_id)
);
alter table video_likes enable row level security;
create policy "video_likes_public_read" on video_likes for select using (true);
create policy "video_likes_own_insert" on video_likes for insert to authenticated with check (auth.uid() = liker_id);
create policy "video_likes_own_delete" on video_likes for delete to authenticated using (auth.uid() = liker_id);
