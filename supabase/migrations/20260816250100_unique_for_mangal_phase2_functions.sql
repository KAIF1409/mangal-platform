-- §0/Phase 2 "Mangal of the Week" — weekly snapshot, scoring, and the
-- public read helper for the Top 5 announcement. Weights (W1/W2/W3) and the
-- Tier 1 bonus are placeholder defaults per CONTEXT.md §0e ("tune once real
-- vote/view data exists") — kept as named constants inside the function
-- body so they're easy to find and adjust later.

-- snapshot_weekly_top20(): developer-only. Pulls the top 20 KaTube videos
-- by views into weekly_rankings for the given week (defaults to the
-- current week). Upserts so re-running mid-week (before finalize) refreshes
-- views_snapshot/tier without creating duplicate rows or disturbing
-- votes_count/final_score/rank, which finalize owns.
create or replace function snapshot_weekly_top20(p_week_start date default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_week date := coalesce(p_week_start, date_trunc('week', now())::date);
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role is null or v_role <> 'developer' then
    raise exception 'snapshot_weekly_top20 is developer-only';
  end if;

  insert into weekly_rankings (week_start_date, video_id, tier, votes_count, views_snapshot, final_score)
  select v_week, v.id, case when v.is_collab then 1 else 2 end, 0, v.views, 0
  from videos v
  where v.moderation_status = 'approved'
  order by v.views desc
  limit 20
  on conflict (week_start_date, video_id) do update
    set views_snapshot = excluded.views_snapshot,
        tier = excluded.tier;
end;
$$;

grant execute on function snapshot_weekly_top20(date) to authenticated;

-- finalize_weekly_rankings(): developer-only, "runs at week end"
-- (CONTEXT.md §0c Phase 2 step 3). Recomputes votes_count from video_votes
-- (the only place real vote counts live — video_votes is own-read-only via
-- RLS, so this security-definer function is what makes the tally public
-- through weekly_rankings.votes_count), computes final_score, then ranks.
--
-- score = votes_count × W1 + ln(views+1) × W2 + ln(likes+1) × W3, with a
-- Tier 1 (collab) bonus multiplier — views/likes are log-scaled per the
-- §0d anti-abuse note ("capped or log-scaled, not raw") so view-farming
-- can't dominate a real audience-vote signal.
create or replace function finalize_weekly_rankings(p_week_start date default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_week date := coalesce(p_week_start, (date_trunc('week', now() - interval '7 days'))::date);
  w1 constant numeric := 50;   -- per vote
  w2 constant numeric := 10;   -- × ln(views+1)
  w3 constant numeric := 2;    -- × ln(likes+1)
  tier1_bonus constant numeric := 1.15; -- +15% for writer+creator collabs
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role is null or v_role <> 'developer' then
    raise exception 'finalize_weekly_rankings is developer-only';
  end if;

  update weekly_rankings wr
  set votes_count = coalesce((
    select count(*) from video_votes vv
    where vv.video_id = wr.video_id and vv.week_start_date = v_week
  ), 0)
  where wr.week_start_date = v_week;

  update weekly_rankings wr
  set final_score = (
    wr.votes_count * w1
    + ln(wr.views_snapshot + 1) * w2
    + ln(coalesce(v.likes, 0) + 1) * w3
  ) * (case when wr.tier = 1 then tier1_bonus else 1 end)
  from videos v
  where v.id = wr.video_id and wr.week_start_date = v_week;

  update weekly_rankings wr
  set rank = sub.rnk
  from (
    select video_id, row_number() over (order by final_score desc) as rnk
    from weekly_rankings
    where week_start_date = v_week
  ) sub
  where wr.video_id = sub.video_id and wr.week_start_date = v_week;
end;
$$;

grant execute on function finalize_weekly_rankings(date) to authenticated;

-- get_mangal_of_the_week(): public read. Returns the Top 5 for the most
-- recently finalized week (rank is null until finalize_weekly_rankings has
-- run), joined with video/creator/collab-writer display info — used by
-- both the KaTube spotlight banner and the Kalpana Circle announcement.
create or replace function get_mangal_of_the_week()
returns table (
  week_start_date date,
  rank int,
  video_id uuid,
  video_title text,
  youtube_id text,
  views int,
  final_score numeric,
  votes_count int,
  tier smallint,
  prize_note text,
  creator_username text,
  collab_writer_username text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    wr.week_start_date, wr.rank, wr.video_id, v.title, v.youtube_id, v.views,
    wr.final_score, wr.votes_count, wr.tier, wr.prize_note,
    cp.username, wcp.username
  from weekly_rankings wr
  join videos v on v.id = wr.video_id
  left join creator_profiles cp on cp.user_id = v.creator_id
  left join creator_profiles wcp on wcp.user_id = v.collab_writer_id
  where wr.rank is not null and wr.rank <= 5
    and wr.week_start_date = (select max(week_start_date) from weekly_rankings where rank is not null)
  order by wr.rank;
$$;

grant execute on function get_mangal_of_the_week() to anon, authenticated;
