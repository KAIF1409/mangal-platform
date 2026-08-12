-- Second real bug found in the same table: the self_read policy compared
-- conversation_id to itself (p2.conversation_id = p2.conversation_id),
-- always true, so any user who participates in ANY conversation could read
-- participant rows for EVERY conversation on the platform (a group
-- membership / DM-pairing leak, separate from the message-content leak
-- fixed in the previous migration).
drop policy if exists "kcircle_participants_self_read" on kcircle_conversation_participants;
create policy "kcircle_participants_self_read" on kcircle_conversation_participants for select
  using (exists (
    select 1 from kcircle_conversation_participants p2
    where p2.conversation_id = kcircle_conversation_participants.conversation_id
      and p2.user_id = auth.uid()
  ));

-- Allow group creation: an existing participant can add other participants
-- to a conversation they're already in (needed to build a group), in
-- addition to a user inserting themselves. Still fully scoped by
-- auth.uid() -- no "OR true" style bypass reintroduced.
drop policy if exists "kcircle_participants_own_insert" on kcircle_conversation_participants;
create policy "kcircle_participants_own_insert" on kcircle_conversation_participants for insert to authenticated
  with check (
    auth.uid() = user_id
    or exists (
      select 1 from kcircle_conversation_participants p
      where p.conversation_id = kcircle_conversation_participants.conversation_id
        and p.user_id = auth.uid()
    )
  );

-- Group chat metadata
alter table kcircle_conversations add column if not exists is_group boolean not null default false;
alter table kcircle_conversations add column if not exists title text;
alter table kcircle_conversations add column if not exists created_by uuid references auth.users(id);
