-- Creator-written copy for KaTube's own video details UI. This deliberately
-- remains separate from YouTube metadata, which KaTube does not scrape or copy.
alter table videos add column if not exists description text;
