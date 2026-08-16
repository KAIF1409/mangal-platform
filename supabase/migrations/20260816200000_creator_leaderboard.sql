-- §27 item 9 — Creator leaderboard. Aggregate-only SECURITY DEFINER
-- function, same pattern as related_videos (20260813_katube_recs.sql) and
-- related_series — only ever returns aggregated counts, never exposes
-- anything per-user/private. Ranks creators by combined ecosystem views
-- (WebMangal series views + KaTube video views), the same cross-product
-- framing already used for Earnings' Performance section (§45) rather than
-- inventing a separate per-product ranking. Follower count (creator_follows,
-- KaTube-specific today) surfaced alongside as a secondary stat, not used
-- for ordering, since it isn't a cross-product number yet.
--
-- Zero new tables — reuses series.views, videos.views, creator_follows,
-- creator_profiles exactly as they already exist (same "already being
-- collected" data §27 item 4 pointed at for the analytics dashboard).

create or replace function creator_leaderboard(result_limit int default 50)
returns table (
  creator_id uuid,
  username text,
  avatar_url text,
  verified_youtube_channel_id text,
  series_views bigint,
  video_views bigint,
  total_views bigint,
  follower_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with series_agg as (
    select creator_id, sum(views) as sv
    from series
    where status = 'published'
    group by creator_id
  ),
  video_agg as (
    select creator_id, sum(views) as vv
    from videos
    group by creator_id
  ),
  follow_agg as (
    select creator_id, count(*) as fc
    from creator_follows
    group by creator_id
  )
  select
    cp.user_id as creator_id,
    cp.username,
    cp.avatar_url,
    cp.verified_youtube_channel_id,
    coalesce(sa.sv, 0) as series_views,
    coalesce(va.vv, 0) as video_views,
    coalesce(sa.sv, 0) + coalesce(va.vv, 0) as total_views,
    coalesce(fa.fc, 0) as follower_count
  from creator_profiles cp
  left join series_agg sa on sa.creator_id = cp.user_id
  left join video_agg va on va.creator_id = cp.user_id
  left join follow_agg fa on fa.creator_id = cp.user_id
  where coalesce(sa.sv, 0) + coalesce(va.vv, 0) > 0
  order by total_views desc
  limit result_limit;
$$;

grant execute on function creator_leaderboard(int) to anon, authenticated;
