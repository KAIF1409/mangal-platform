-- §6b content moderation: distinguish system auto-flags (NSFW thumbnail,
-- missing AI-disclosure) from real user reports in the existing `reports`
-- table, so the admin queue can show/filter them separately without a new
-- table or a new moderation system.

alter table reports
  add column if not exists is_auto_flagged boolean not null default false;

comment on column reports.is_auto_flagged is
  'true = created automatically by KaTube upload-time moderation checks (NSFW thumbnail classifier, missing AI-disclosure), not a real user report. reporter_id is still the uploading creator (satisfies the existing RLS insert policy) — this column is what tells the two apart in the admin queue.';
