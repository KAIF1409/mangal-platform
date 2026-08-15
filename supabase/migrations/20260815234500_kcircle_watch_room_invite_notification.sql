-- KCircle Watch Together — "Add friend" invite notification (extends §37).
--
-- §37 handled what happens once a new person shows up in an already-
-- chatting room, but there was no way for an existing member to actually
-- *pull someone in* short of manually sharing the raw room link outside
-- the app. This adds a real in-app "Add friend" action: existing members
-- search a username (same pattern as starting a new K Circle chat, see
-- app/kalpana-circle/chat/page.tsx) and the picked friend gets a
-- notification that deep-links straight into the room.
--
-- Reuses kcircle_notifications (no parallel invite table) — same
-- actor-inserts-for-recipient trust model already in place for
-- like/comment/message/group_add/broadcast. Two additive changes:
--   - 'watch_invite' added to the type check constraint
--   - room_id column (nullable, only ever set on watch_invite rows) so
--     the notification bell can route straight to the room; conversation_id
--     doesn't fit here since a Fast tap room is a watch_rooms row, not a
--     kcircle_conversations row.
--
-- Membership itself needs no RLS change: watch_room_members' existing
-- "self_insert" policy (an existing member can't insert a row for someone
-- else) is intentionally left alone — the invited friend still joins
-- themselves the same way anyone with the link already does, just now
-- they're told to via a notification instead of having to be sent a URL
-- outside the app.

alter table kcircle_notifications add column if not exists room_id uuid references watch_rooms(id) on delete cascade;

alter table kcircle_notifications drop constraint if exists kcircle_notifications_type_check;
alter table kcircle_notifications add constraint kcircle_notifications_type_check
  check (type in ('like', 'comment', 'message', 'group_add', 'broadcast', 'watch_invite'));
