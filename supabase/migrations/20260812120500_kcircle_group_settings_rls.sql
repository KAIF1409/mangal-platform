-- Enable group settings: rename, leave, remove member.
-- Any current participant can rename the conversation (matches the
-- "any participant can manage membership" model already used for invites,
-- see 20260812110000_kcircle_group_chat_schema_and_rls_fix.sql).
create policy "kcircle_conversations_participant_update" on kcircle_conversations for update to authenticated
  using (exists (
    select 1 from kcircle_conversation_participants p
    where p.conversation_id = kcircle_conversations.id and p.user_id = auth.uid()
  ));

-- Leave group (delete own row) or remove another member (any existing
-- participant can remove another, same trust model as adding members).
create policy "kcircle_participants_own_or_participant_delete" on kcircle_conversation_participants for delete to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1 from kcircle_conversation_participants p
      where p.conversation_id = kcircle_conversation_participants.conversation_id
        and p.user_id = auth.uid()
    )
  );
