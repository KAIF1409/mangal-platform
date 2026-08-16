-- Unique for Mangal — Phase 2 functions: Mangal of the Week
--
-- Reconciliation only, see the companion phase2_schema migration's header
-- for context. All five of these were applied live via Supabase MCP and
-- verified via pg_get_functiondef()/pg_get_triggerdef() against the live
-- DB before being written here — no-op on re-apply.

-- Anti-abuse (CONTEXT.md §0d): a fresh/bot account can't vote. Fires on
-- every insert into video_votes, not just from the app's own RPC path, so
-- it can't be bypassed by calling supabase.from('video_votes').insert()
-- directly from the client.
create or replace function public.video_votes_enforce_min_account_age()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_created_at timestamptz;
begin
  select created_at into v_created_at from profiles where id = new.user_id;
  if v_created_at is null or v_created_at > now() - interval '24 hours' then
    raise exception 'Account must be at least 24 hours old to vote for Mangal of the Week';
  end if;
  return new;
end;
$$;

drop trigger if exists video_votes_min_account_age_trigger on video_votes;
create trigger video_votes_min_account_age_trigger
  before insert on video_votes
  for each row execute function video_votes_enforce_min_account_age();

-- Phase 2 build step 1: weekly scheduled job (run manually via the admin
-- page for now, no cron yet — same "no scheduled job yet, refresh
-- manually" pattern Phase 1's Mangal Ideas admin page already uses).
-- Pulls the top 20 approved videos by raw view count and snapshots them
-- into weekly_rankings for the given week (defaults to the current week).
-- Re-running for the same week is safe (upsert on the unique
-- (week_start_date, video_id) key) — refreshes views_snapshot/tier without
-- creating duplicate rows or touching votes already cast.
create or replace function public.snapshot_weekly_top20(p_week_start date default null)
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

-- Phase 2 build step 3: scoring job, run at week end (admin-triggered, see
-- above). score = votes×W1 + ln(views+1)×W2 + ln(likes+1)×W3 — views/likes
-- are log-scaled per the anti-abuse note in CONTEXT.md §0d ("views used in
-- scoring should be capped or log-scaled, not raw, so view-farming can't
-- dominate the score and drown out genuine quality votes"). Tier 1
-- (writer+creator collab) gets a flat +15% multiplier per §0e's "priority
-- boost" decision.
create or replace function public.finalize_weekly_rankings(p_week_start date default null)
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

-- Phase 2 build step 4: read helper for the top-5 announcement UI (KaTube
-- banner + Kalpana Circle page). Aggregate-output-only pattern, same as
-- related_videos/related_series/get_mangal_ideas_feed — only ever returns
-- the finalized top-5 rows for the most recent finalized week, never any
-- individual vote/voter data.
create or replace function public.get_mangal_of_the_week()
returns table(
  week_start_date date, rank int, video_id uuid, video_title text, youtube_id text,
  views int, final_score numeric, votes_count int, tier smallint, prize_note text,
  creator_username text, collab_writer_username text
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
