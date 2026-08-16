-- Repo/DB drift reconciliation (found during the §0 "Unique for Mangal"
-- 4-phase audit this session — same pattern as §13b's earlier drift
-- flags). Phase 2's snapshot_weekly_top20() (20260816154710_...) filters
-- on `v.moderation_status = 'approved'`, but no migration file in this
-- repo ever added that column — it was applied directly to the live DB at
-- some point outside this repo's migration history. Content verified
-- against the live DB (information_schema + pg_constraint) before writing
-- this file, so it's a no-op on re-apply here, not a new change.
alter table videos add column if not exists moderation_status text not null default 'approved';

alter table videos drop constraint if exists videos_moderation_status_check;
alter table videos add constraint videos_moderation_status_check
  check (moderation_status = any (array['approved', 'pending_review']));
