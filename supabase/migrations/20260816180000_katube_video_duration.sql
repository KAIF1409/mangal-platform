-- §28a — "Better search + filters": real video length, sourced from
-- YouTube's contentDetails.duration at upload time (see youtubeVerify.ts /
-- fetchVideoModerationInfo), backing the duration filter chips on
-- /katube. Nullable since older rows uploaded before this column existed
-- have no duration on file — the filter UI treats null as "unknown",
-- never as zero.
alter table videos add column if not exists duration_seconds int;
