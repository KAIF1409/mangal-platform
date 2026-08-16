-- Unique for Mangal — Phase 2 schema additions: Mangal of the Week
--
-- weekly_rankings and video_votes tables themselves were created in
-- Phase 0 (20260816230000_unique_for_mangal_phase0_foundations.sql).
-- This migration adds the two Phase 2 additions on top of them, applied
-- live via Supabase MCP in an earlier session but never committed as a
-- migration file until now (same repo/live-DB drift pattern documented
-- elsewhere in CONTEXT.md, e.g. §13b). Content verified against the live
-- DB (information_schema + pg_constraint) before writing, so this is a
-- no-op on re-apply, not a new change.
--
--   1. weekly_rankings.prize_note — the admin-entered, display-only
--      prize-money text for a winning video (no payout logic, per
--      CONTEXT.md §0c Phase 2 build step 5).
--   2. video_votes.reason_tags vocabulary check — locks the reason-tag
--      picker to the five agreed categories (Editing / Sound / Story /
--      Voice / Animation) at the DB level, not just in the UI.

alter table weekly_rankings
  add column if not exists prize_note text;

alter table video_votes
  add constraint video_votes_reason_tags_vocab
  check (reason_tags <@ array['Editing', 'Sound', 'Story', 'Voice', 'Animation']);
