-- §0 "Unique for Mangal" — Phase 3: WebMangal Writer of the Month
-- (see CONTEXT.md §0c Phase 3). monthly_writer_awards table itself was
-- created in Phase 0 (20260816230000_unique_for_mangal_phase0_foundations.sql).
-- This migration adds the Phase 3 additions on top of it: a prize_note
-- column (same manual-announce pattern as weekly_rankings.prize_note in
-- Phase 2) plus the finalize + read functions.

alter table monthly_writer_awards
  add column if not exists prize_note text;

-- Phase 3 build step 1: monthly scheduled job (run manually via the admin
-- page, no cron yet — same pattern as Phase 1/2's manual-refresh admin
-- buttons). Aggregates Tier 1 (writer+creator collab) videos per writer for
-- the given month, reusing Phase 2's finalized weekly_rankings scores
-- rather than recomputing votes/views/likes from scratch — a video's
-- final_score already has the vote/view/like weighting and the Tier 1
-- bonus baked in (CONTEXT.md §0c: "Phase 3 reuses Phase 2's scoring
-- logic"). Only weeks whose start date falls in the target month, and only
-- rows that were actually finalized (rank is not null), are counted, so an
-- in-progress/unfinalized week can't be double counted or gamed.
--
-- A writer can have collab videos across more than one series in a month;
-- monthly_writer_awards still needs a single series_id per writer (FK,
-- not null, and unique together with month), so the writer's
-- highest-scoring series that month is stored as the representative
-- credit — the ranking itself is by the writer's summed score, not any
-- one series' score.
create or replace function public.finalize_monthly_writer_awards(p_month date default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  -- Defaults to the previous calendar month, same "finalize the period
  -- that just ended" default as finalize_weekly_rankings().
  v_month date := coalesce(date_trunc('month', p_month), date_trunc('month', now() - interval '1 month'))::date;
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role is null or v_role <> 'developer' then
    raise exception 'finalize_monthly_writer_awards is developer-only';
  end if;

  with tier1_weeks as (
    select wr.video_id, wr.final_score, v.collab_writer_id, v.series_id
    from weekly_rankings wr
    join videos v on v.id = wr.video_id
    where wr.tier = 1
      and wr.rank is not null
      and wr.week_start_date >= v_month
      and wr.week_start_date < (v_month + interval '1 month')::date
      and v.collab_writer_id is not null
  ),
  agg as (
    select collab_writer_id as writer_id, sum(final_score) as total_score
    from tier1_weeks
    group by collab_writer_id
  ),
  best_series as (
    -- Representative series per writer: whichever of their series scored
    -- highest that month. distinct on + order by picks one row per writer.
    select distinct on (collab_writer_id) collab_writer_id as writer_id, series_id
    from tier1_weeks
    order by collab_writer_id, final_score desc
  )
  insert into monthly_writer_awards (month, series_id, writer_id, score)
  select v_month, bs.series_id, a.writer_id, a.total_score
  from agg a
  join best_series bs on bs.writer_id = a.writer_id
  on conflict (month, series_id) do update
    set writer_id = excluded.writer_id,
        score = excluded.score;

  update monthly_writer_awards mwa
  set rank = sub.rnk
  from (
    select id, row_number() over (order by score desc) as rnk
    from monthly_writer_awards
    where month = v_month
  ) sub
  where mwa.id = sub.id and mwa.month = v_month;
end;
$$;

-- Phase 3 build step 2: read helper for the announcement UI (Kalpana
-- Circle + KaTube banner) and the writer-profile badge. Same
-- aggregate-output-only pattern as get_mangal_of_the_week() — only ever
-- returns the finalized #1 writer for the most recent finalized month.
create or replace function public.get_writer_of_the_month()
returns table(
  month date, writer_id uuid, writer_username text,
  series_id uuid, series_title text, score numeric, prize_note text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    mwa.month, mwa.writer_id, cp.username,
    mwa.series_id, s.title, mwa.score, mwa.prize_note
  from monthly_writer_awards mwa
  join series s on s.id = mwa.series_id
  left join creator_profiles cp on cp.user_id = mwa.writer_id
  where mwa.rank = 1
    and mwa.month = (select max(month) from monthly_writer_awards where rank is not null)
  limit 1;
$$;
