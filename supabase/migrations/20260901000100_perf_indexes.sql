-- ═══════════════════════════════════════════════════════════════════════════════
-- §139-E — performance indexes for the hot filter/sort/join columns that the
-- §139 audit found uncovered (fix category 5), applied live via
--   supabase db query --linked -f <this file>
-- per the §136/§138 precedent.
--
-- SAFETY
--   Every statement is idempotent (`create index if not exists`), so re-runs
--   and already-converged databases are no-ops — same contract as the books
--   schema-cache hotfix (20260825000000_books_schema_cache_hotfix.sql).
--
-- RECONCILIATION (live-DB introspection over pg_indexes, 2026-09-01)
--   The §139-E static pass listed 24 candidate gaps; 14 of them are in fact
--   already covered by existing indexes and are deliberately NOT recreated:
--     chapters(series_id)          ← chapters_series_id_chapter_number_key (leading)
--     pages(chapter_id)            ← pages_chapter_id_page_number_key (leading)
--     follows(reader_id)           ← follows_reader_id_series_id_key (leading)
--     reading_progress(reader_id)  ← reading_progress_reader_id_series_id_key (leading)
--     ratings(series_id)           ← ratings_series_id_reader_id_key (leading)
--     kcircle_post_comments(post_id)   ← kcircle_comments_post_id_idx
--     kcircle_poll_options(post_id)    ← kcircle_poll_options_post_id_idx
--     kcircle_messages(conversation_id, created_at desc) ← kcircle_messages_conversation_id_idx
--       (a btree (a,b) serves a DESC scan by reading backwards — a DESC twin is redundant)
--     visual_quest_submissions(quest_id) ← visual_quest_submissions_quest_id_idx
--     visual_quest_votes(quest_id)       ← PK (quest_id, voter_id) leading
--     video_comments(video_id, created_at desc) ← video_comments_video_id_idx (exact composite)
--     video_accuracy_reviews(video_id) ← video_accuracy_reviews_video_id_idx
--     creator_follows(follower_id)     ← PK (follower_id, creator_id) leading
--   The 10 statements below are the genuinely missing ones.
--
--   Nothing here touches books/book_purchases/book_reading_progress or payments
--   tables — index-only change, no RLS or response-shape impact.

-- series(creator_id) — creator dashboard + studio content lists, §138 Codex tab
create index if not exists series_creator_id_idx
  on public.series (creator_id);

-- series(status, created_at) — home/browse rails filter published + order newest
create index if not exists series_status_created_at_idx
  on public.series (status, created_at desc);

-- follows(series_id) — follower counts (head-count on the series page) + whole-series cleanup
create index if not exists follows_series_id_idx
  on public.follows (series_id);

-- reading_progress(series_id) — per-series reader aggregates
create index if not exists reading_progress_series_id_idx
  on public.reading_progress (series_id);

-- reading_progress(chapter_id) — resume lookups and chapter deletes
create index if not exists reading_progress_chapter_id_idx
  on public.reading_progress (chapter_id);

-- kcircle_saved_posts(post_id) — saved-by-me checks per post + post deletion cleanup
create index if not exists kcircle_saved_posts_post_id_idx
  on public.kcircle_saved_posts (post_id);

-- kcircle_story_views(viewer_id) — "seen" rings on the K Circle feed (§139-A4 path)
create index if not exists kcircle_story_views_viewer_id_idx
  on public.kcircle_story_views (viewer_id);

-- kcircle_conversation_participants(user_id) — THE chat list query (§139-A1): every
-- chat open resolves the user's conversations through this column first.
create index if not exists kcircle_conversation_participants_user_id_idx
  on public.kcircle_conversation_participants (user_id);

-- katube_playlist_videos(video_id) — "is this video in a playlist" lookups (watch page)
create index if not exists katube_playlist_videos_video_id_idx
  on public.katube_playlist_videos (video_id);

-- reports(created_at) — admin reports list orders newest-first (§139-A11 pagination)
create index if not exists reports_created_at_idx
  on public.reports (created_at desc);

-- Refresh planner statistics so the new indexes are picked up immediately.
analyze;
