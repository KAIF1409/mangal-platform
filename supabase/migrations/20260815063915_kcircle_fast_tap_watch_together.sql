-- Fast tap (Shorts) Watch Together: link a shorts-mode watch room to a real
-- K Circle group conversation, so a member's "Chat" reply (as opposed to
-- "Comment", which is public via video_comments) lands in their actual
-- group thread — same behavior as any other K Circle group message,
-- searchable/scrollable there later — rather than living only inside the
-- ephemeral room. short_ref_id tags which short the chat message was about,
-- so the thread can show a small "re: this Short" pointer back to it.
--
-- No new RLS policies needed for either column: watch_rooms already has
-- host-only insert/update policies (20260815060352_sync_watch_rooms.sql),
-- and kcircle_messages' existing participant-only insert/select policies
-- (20260812102725_kcircle_group_chat_schema_and_rls_fix.sql) apply
-- identically regardless of which columns are set on the row.

alter table watch_rooms
  add column if not exists linked_conversation_id uuid references kcircle_conversations(id) on delete set null;

alter table kcircle_messages
  add column if not exists short_ref_id uuid references videos(id) on delete set null;

create index if not exists kcircle_messages_short_ref_id_idx on kcircle_messages(short_ref_id) where short_ref_id is not null;
