-- Critical fix: the original kcircle_social migration shipped
-- `with check (auth.uid() = user_id or true)` on the participants insert
-- policy — the `or true` makes the check always pass, so any authenticated
-- user could insert themselves into ANY conversation and read others' DMs
-- via kcircle_messages_participant_read. This migration replaces it with a
-- real check.

drop policy if exists "kcircle_participants_own_insert" on kcircle_conversation_participants;
create policy "kcircle_participants_own_insert" on kcircle_conversation_participants for insert to authenticated
  with check (auth.uid() = user_id);
