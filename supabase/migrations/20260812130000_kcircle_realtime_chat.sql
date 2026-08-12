-- Enable Supabase Realtime (postgres_changes) for K Circle chat, replacing
-- the 3s client-side poll on the open thread (app/kalpana-circle/chat/page.tsx
-- previously did `setInterval(() => loadMessages(active.id), 3000)`).
--
-- Adding a table to the supabase_realtime publication is what makes it
-- eligible for postgres_changes subscriptions at all — without this the
-- client-side .channel()/.on('postgres_changes', ...) calls just sit there
-- and never fire, silently. RLS (already enabled on all three tables from
-- 20260812_kcircle_social.sql + later migrations) still applies per
-- subscriber: a client only receives change events for rows its own
-- SELECT policy would let it read, so this doesn't loosen any access —
-- kcircle_messages_participant_read etc. still gate exactly who gets
-- pushed which row.
--
-- REPLICA IDENTITY FULL on kcircle_conversations and
-- kcircle_conversation_participants (not just kcircle_messages, which only
-- needs INSERT so the default identity is enough) so UPDATE/DELETE events
-- — group rename, leave/remove-member — carry the full old row. Without
-- this, Postgres only includes primary-key columns in the "old record" for
-- UPDATE/DELETE, which isn't enough for the client to know e.g. which
-- user_id just left a conversation_id it doesn't have loaded.

alter table kcircle_conversations replica identity full;
alter table kcircle_conversation_participants replica identity full;

alter publication supabase_realtime add table kcircle_messages;
alter publication supabase_realtime add table kcircle_conversations;
alter publication supabase_realtime add table kcircle_conversation_participants;
