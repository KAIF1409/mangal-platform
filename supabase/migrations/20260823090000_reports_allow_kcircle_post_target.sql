-- K Circle post cards had no Report action at all (founder-reported gap:
-- no share, no edit/delete, no report on a posted card). reports.target_type's
-- check constraint only allowed series/chapter/comment/video — add
-- kcircle_post so the existing generic ReportButton component can be reused
-- as-is for K Circle posts, no new table/infra needed. Same narrow,
-- additive-only pattern as prior small permission/constraint fixes in this
-- codebase (e.g. 20260821120000_creator_can_view_own_video_watch_progress.sql).

alter table public.reports drop constraint reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type = any (array['series'::text, 'chapter'::text, 'comment'::text, 'video'::text, 'kcircle_post'::text]));
