-- Kalpana Circle Instagram-style profile page needs a real avatar image,
-- not just the initials-based fallback. creator_profiles already has `bio`
-- (added earlier, comments in app/creator/[username]/page.tsx claiming it
-- doesn't exist were stale) but no avatar_url — adding it here.
--
-- No new RLS policy needed: "Creator profiles are viewable by everyone"
-- (SELECT, qual true) and "Users can update own creator profile" (UPDATE,
-- auth.uid() = user_id) already cover this column since RLS is row-level,
-- not column-level.
alter table creator_profiles add column if not exists avatar_url text;
