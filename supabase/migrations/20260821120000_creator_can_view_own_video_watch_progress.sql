-- §115 (Studio Phase 1, Tier 1.5): katube_watch_progress currently only
-- lets a viewer read their own row (`katube_watch_progress_own_read`,
-- auth.uid() = viewer_id) — a creator has no way to read ANY other
-- viewer's progress, which blocks a completion-rate stat for KaTube
-- videos entirely. Mirrors the already-shipped WebMangal precedent
-- (20260809101500_creator_can_view_own_series_analytics.sql): a creator
-- may select rows only for videos they themselves own, never another
-- creator's data, and no reader identity is exposed in the Studio UI
-- (aggregated to a completion % only).

create policy "Creators can view watch progress on their own videos"
  on public.katube_watch_progress
  for select
  using (
    exists (
      select 1 from public.videos
      where videos.id = katube_watch_progress.video_id
        and videos.creator_id = auth.uid()
    )
  );
