-- §0/Phase 1 "Unique for Mangal" — Mangal Ideas feed: candidate refresh +
-- selection functions.
--
-- NOTE: this was applied live via Supabase MCP in an earlier session but
-- never committed as a migration file — adding it now so the repo matches
-- the live DB (checked against the live schema before writing this file).

-- refresh_mangal_ideas(): developer-only (checked inside, same pattern as
-- kcircle_join_creator_lounge). Clears previous auto-generated candidates
-- (story_demand/audience) and re-computes fresh ones. Company cards are
-- untouched — those are manually admin-authored via mangal_ideas_admin_write.
create or replace function refresh_mangal_ideas()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role is null or v_role <> 'developer' then
    raise exception 'refresh_mangal_ideas is developer-only';
  end if;

  delete from mangal_ideas where type in ('story_demand', 'audience');

  -- story_demand: top 3 published series by views that have fewer than 2
  -- KaTube adaptations yet (candidate for a video creator to collaborate on)
  insert into mangal_ideas (type, series_id, title, description)
  select
    'story_demand',
    s.id,
    s.title || ' is in demand — bring it to life on KaTube',
    'This WebMangal story is trending with no KaTube adaptation yet. Collaborate with the writer to create one.'
  from series s
  left join (
    select series_id, count(*) as video_count
    from videos
    where series_id is not null
    group by series_id
  ) vc on vc.series_id = s.id
  where s.status = 'published'
    and coalesce(vc.video_count, 0) < 2
  order by s.views desc
  limit 3;

  -- audience: top 3 Kalpana Circle posts tagged 'idea', ranked by
  -- likes + comments engagement
  insert into mangal_ideas (type, source_post_id, title, description)
  select
    'audience',
    p.id,
    'Audience idea: ' || coalesce(left(p.caption, 60), 'Untitled idea'),
    p.caption
  from kcircle_posts p
  left join (
    select post_id, count(*) as like_count from kcircle_post_likes group by post_id
  ) pl on pl.post_id = p.id
  left join (
    select post_id, count(*) as comment_count from kcircle_post_comments group by post_id
  ) pc on pc.post_id = p.id
  where p.tag = 'idea'
  order by (coalesce(pl.like_count, 0) + coalesce(pc.comment_count, 0)) desc
  limit 3;
end;
$$;

grant execute on function refresh_mangal_ideas() to authenticated;

-- get_mangal_ideas_feed(): public read selection — min 1, max 4 cards.
-- Picks one card per source type first (up to 3: company/story_demand/audience),
-- then fills any remaining slots (up to max_cards, capped at 4) from the next
-- most-recent remaining candidates across all types.
create or replace function get_mangal_ideas_feed(max_cards int default 4)
returns setof mangal_ideas
language sql
stable
security definer
set search_path = public
as $$
  with one_per_type as (
    select distinct on (type) *
    from mangal_ideas
    order by type, created_at desc
  ),
  remaining as (
    select *
    from mangal_ideas
    where id not in (select id from one_per_type)
    order by created_at desc
  )
  select * from (
    select * from one_per_type
    union all
    select * from remaining
  ) combined
  limit greatest(least(max_cards, 4), 1);
$$;

grant execute on function get_mangal_ideas_feed(int) to anon, authenticated;
