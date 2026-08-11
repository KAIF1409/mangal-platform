-- KaTube §8 — tag-based recommendations for the long-video watch page.
-- Same "aggregate output only" SECURITY DEFINER pattern as related_series
-- (20260809_recommendations.sql): only ever returns video rows, never
-- exposes anything per-user/private.
--
-- Every KaTube video links to a MANGAL series_id, and every series already
-- has tags via series_tags. Primary signal: shared-tag count between the
-- target video's series and candidate videos' series. Falls back to
-- same-category, then most-viewed/most-recent overall, so the sidebar is
-- never empty even with low data volume early on.

create or replace function related_videos(target_video_id uuid, result_limit int default 8)
returns setof videos
language sql
stable
security definer
set search_path = public
as $$
  with target as (
    select id, series_id, category from videos where id = target_video_id
  ),
  target_tags as (
    select tag_id from series_tags where series_id = (select series_id from target)
  ),
  candidate_scores as (
    select v.id as video_id, count(*) as shared_tag_count
    from videos v
    join series_tags st on st.series_id = v.series_id
    where st.tag_id in (select tag_id from target_tags)
      and v.id != target_video_id
      and v.is_short = false
    group by v.id
  )
  select v.*
  from videos v
  left join candidate_scores cs on cs.video_id = v.id
  where v.id != target_video_id
    and v.is_short = false
  order by
    coalesce(cs.shared_tag_count, 0) desc,
    (v.category = (select category from target)) desc,
    v.views desc,
    v.created_at desc
  limit result_limit;
$$;

grant execute on function related_videos(uuid, int) to anon, authenticated;
