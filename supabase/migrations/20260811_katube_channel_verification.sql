-- KaTube §6 — channel-ownership verification (see CONTEXT.md §6 for the
-- full design). Adds the columns needed for the one-time channel-connect +
-- verification-code flow, plus the per-upload enforcement check.

alter table creator_profiles
  add column if not exists youtube_channel_handle text,        -- raw input the creator typed (URL or @handle), for display
  add column if not exists pending_youtube_channel_id text,     -- resolved channelId awaiting verification
  add column if not exists youtube_verification_code text,      -- e.g. MANGAL-VERIFY-x7k2p9, cleared once verified
  add column if not exists verified_youtube_channel_id text,    -- set only after the code is confirmed in the channel description
  add column if not exists channel_verified_at timestamptz;

-- No new RLS policies needed — creator_profiles already has "Users can
-- update own creator profile" (auth.uid() = user_id) and "Users can view
-- own creator profile", which is all the connect/verify API routes need
-- since they act as the authenticated user, not a service role.
