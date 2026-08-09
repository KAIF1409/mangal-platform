-- Step 27 — Recommendation System
-- Two RPCs, both SECURITY DEFINER since they need to aggregate across all
-- readers' `follows` rows (which are RLS-locked to each reader's own rows
-- for privacy) — but they only ever return series rows, never expose whose
-- follow it was. Same "aggregate output only" pattern as trending_series.

-- 1. "Readers Also Liked" — for the series detail page.
-- Primary signal: co-follow collaborative filtering (people who follow the
-- target series also follow X). Falls back to same-genre + views for series
-- with too little follow data yet, so new/small series still get sane
-- recommendations instead of an empty section.
create or replace function related_series(target_series_id uuid, result_limit int default 6)
returns setof series
language sql
stable
security definer
set search_path = public
as $$
  with co_followers as (
    select reader_id from follows where series_id = target_series_id
  ),
  candidate_scores as (
    select f.series_id, count(*) as score
    from follows f
    join co_followers cf on f.reader_id = cf.reader_id
    where f.series_id != target_series_id
    group by f.series_id
  ),
  target as (
    select genre from series where id = target_series_id
  )
  select s.*
  from series s
  left join candidate_scores cs on cs.series_id = s.id
  where s.id != target_series_id
    and s.status = 'published'
  order by
    coalesce(cs.score, 0) desc,
    (s.genre = (select genre from target)) desc,
    s.views desc
  limit result_limit;
$$;

grant execute on function related_series(uuid, int) to anon, authenticated;

-- 2. "For You" — personalized homepage feed for logged-in readers, based on
-- the genres of series they already follow. Falls back to nothing special
-- (caller should just skip the section) when the reader follows nothing yet.
create or replace function for_you_series(target_reader_id uuid, result_limit int default 6)
returns setof series
language sql
stable
security definer
set search_path = public
as $$
  with my_genres as (
    select distinct s.genre
    from follows f
    join series s on s.id = f.series_id
    where f.reader_id = target_reader_id and s.genre is not null
  ),
  my_followed as (
    select series_id from follows where reader_id = target_reader_id
  )
  select s.*
  from series s
  where s.status = 'published'
    and s.id not in (select series_id from my_followed)
    and s.genre in (select genre from my_genres)
  order by s.views desc
  limit result_limit;
$$;

grant execute on function for_you_series(uuid, int) to authenticated;
