-- K Circle: notifications system (chosen over Broadcast Channels for this
-- pass — broadcast needs a chat-model rework (new channel/subscriber
-- concept, sender-vs-many-readers permissions, its own UI surface),
-- notifications is one new table bolted onto flows that already exist
-- (like/comment/message/group-add all already insert rows we can hang a
-- notification off of), so it's the lighter/faster build of the two.
--
-- Actor-scoped inserts, same open trust model as the rest of K Circle:
-- the person performing the action inserts the notification row for the
-- recipient (auth.uid() = actor_id), recipient can only read/update their
-- own rows. No trigger-based fan-out — kept simple, app code inserts a row
-- right after the like/comment/message/add-member call already succeeds.

create table if not exists kcircle_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  type text not null check (type in ('like', 'comment', 'message', 'group_add')),
  post_id uuid references kcircle_posts(id) on delete cascade,
  conversation_id uuid references kcircle_conversations(id) on delete cascade,
  preview text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index kcircle_notifications_recipient_idx
  on kcircle_notifications (recipient_id, created_at desc);

alter table kcircle_notifications enable row level security;

create policy "kcircle_notifications_recipient_read" on kcircle_notifications
  for select to authenticated
  using (auth.uid() = recipient_id);

create policy "kcircle_notifications_recipient_update" on kcircle_notifications
  for update to authenticated
  using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);

-- Actor inserts on the recipient's behalf (mirrors e.g.
-- kcircle_participants "existing participant can add others" trust model
-- already in place elsewhere in K Circle) — never actor_id = recipient_id
-- (no self-notifications) so the app layer can insert unconditionally
-- without an extra "did I just do this to myself" check, though the app
-- code below skips that case anyway to avoid noise.
create policy "kcircle_notifications_actor_insert" on kcircle_notifications
  for insert to authenticated
  with check (auth.uid() = actor_id and actor_id <> recipient_id);

alter table kcircle_notifications replica identity full;
alter publication supabase_realtime add table kcircle_notifications;
