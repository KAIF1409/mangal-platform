-- MANGAL Studio, Phase 1 (KaTube) — comment moderation. Today
-- video_comments can only be deleted by the commenter themselves
-- ("video_comments_own_delete" — auth.uid() = commenter_id); a creator
-- has no way to remove a comment on their own video, which is required
-- for a working Comments moderation tab. Same precedent as the
-- watch-progress read policy (20260821120000_creator_can_view_own_video_
-- watch_progress.sql): scoped strictly to videos.creator_id = auth.uid(),
-- nothing broader. RLS OR's multiple policies for the same command, so
-- this adds a second valid path to delete without touching the existing
-- commenter-can-delete-own-comment policy.

create policy "Creators can delete comments on their own videos"
  on public.video_comments
  for delete
  using (
    exists (
      select 1 from public.videos
      where videos.id = video_comments.video_id
        and videos.creator_id = auth.uid()
    )
  );
