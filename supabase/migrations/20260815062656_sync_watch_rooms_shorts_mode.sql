-- Sync-Play Watch Rooms: Fast tap (Shorts) mode.
-- Extends watch_rooms (see 20260815060352_sync_watch_rooms.sql) to support
-- a second room mode alongside the original single-long-video room: a
-- shared, host-driven scroll through KaTube Shorts (is_short=true videos).
--
-- video_id is relaxed to nullable because a shorts-mode room isn't "about"
-- one fixed video the way a video-mode room is — current_short_id is the
-- moving pointer to whichever short the host currently has everyone on.
-- video_id is still set for shorts rooms too (to the first short), purely
-- so existing "open this room's video" call sites that assume it's always
-- present keep working without a mode branch.

alter table watch_rooms
  add column if not exists mode text not null default 'video' check (mode in ('video', 'shorts')),
  add column if not exists current_short_id uuid references videos(id) on delete set null;

alter table watch_rooms alter column video_id drop not null;

-- Optional per-message "which short was this said about" tag for the
-- room's own in-room chat (watch_room_messages) — separate from
-- kcircle_messages.short_ref_id added in
-- 20260815063915_kcircle_fast_tap_watch_together.sql, which tags messages
-- in a member's actual K Circle group thread instead.
alter table watch_room_messages
  add column if not exists short_id uuid references videos(id) on delete set null;

create index if not exists watch_rooms_current_short_id_idx on watch_rooms(current_short_id);
create index if not exists watch_room_messages_short_id_idx on watch_room_messages(room_id, short_id);
