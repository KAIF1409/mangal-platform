-- K Circle — creator broadcast channels (Discord-style announcement
-- channel: the creator posts, fans can only like/comment, no noise from
-- a normal open group). One channel per creator, created lazily the first
-- time the creator (or a fan visiting their profile) needs it.
--
-- Reuses kcircle_conversations/kcircle_messages rather than a parallel
-- table set — a broadcast channel is just a conversation with
-- is_broadcast = true and no participant rows (fans read it without being
-- "added", unlike DMs/groups which require participant membership).

alter table kcircle_conversations add column if not exists is_broadcast boolean not null default false;

-- One broadcast channel per creator.
create unique index if not exists kcircle_conversations_one_broadcast_per_creator
  on kcircle_conversations(created_by) where is_broadcast;

-- Tighten the existing wide-open insert policy (`with check (true)`, from
-- the group-chat trust model) so a broadcast row can only be created with
-- created_by = the inserting user — otherwise anyone could create a
-- channel impersonating another creator. Non-broadcast inserts (DMs,
-- groups) are untouched, same as before.
drop policy if exists "kcircle_conversations_authenticated_insert" on kcircle_conversations;
create policy "kcircle_conversations_authenticated_insert" on kcircle_conversations for insert
  to authenticated with check (not is_broadcast or created_by = auth.uid());

-- Broadcast conversations/messages are readable by any authenticated user
-- (that's the point — fans shouldn't need to be pre-added as participants).
create policy "kcircle_conversations_broadcast_public_read" on kcircle_conversations for select
  to authenticated using (is_broadcast);

create policy "kcircle_messages_broadcast_public_read" on kcircle_messages for select
  to authenticated using (
    exists (select 1 from kcircle_conversations c where c.id = kcircle_messages.conversation_id and c.is_broadcast)
  );

-- Only the channel owner (the creator) can post into their broadcast
-- channel — fans have no matching insert policy for it, so they're
-- read-only there (they can still like/comment, see below).
create policy "kcircle_messages_broadcast_owner_insert" on kcircle_messages for insert
  to authenticated with check (
    auth.uid() = sender_id and exists (
      select 1 from kcircle_conversations c
      where c.id = kcircle_messages.conversation_id and c.is_broadcast and c.created_by = auth.uid()
    )
  );

-- ── Fan reactions on broadcast messages ──
create table if not exists kcircle_broadcast_likes (
  message_id uuid not null references kcircle_messages(id) on delete cascade,
  liker_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, liker_id)
);
alter table kcircle_broadcast_likes enable row level security;
create policy "kcircle_broadcast_likes_public_read" on kcircle_broadcast_likes for select to authenticated using (true);
create policy "kcircle_broadcast_likes_own_insert" on kcircle_broadcast_likes for insert to authenticated
  with check (
    auth.uid() = liker_id and exists (
      select 1 from kcircle_messages m join kcircle_conversations c on c.id = m.conversation_id
      where m.id = message_id and c.is_broadcast
    )
  );
create policy "kcircle_broadcast_likes_own_delete" on kcircle_broadcast_likes for delete to authenticated using (auth.uid() = liker_id);

create table if not exists kcircle_broadcast_comments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references kcircle_messages(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);
create index if not exists kcircle_broadcast_comments_message_id_idx on kcircle_broadcast_comments(message_id);
alter table kcircle_broadcast_comments enable row level security;
create policy "kcircle_broadcast_comments_public_read" on kcircle_broadcast_comments for select to authenticated using (true);
create policy "kcircle_broadcast_comments_own_insert" on kcircle_broadcast_comments for insert to authenticated
  with check (
    auth.uid() = author_id and exists (
      select 1 from kcircle_messages m join kcircle_conversations c on c.id = m.conversation_id
      where m.id = message_id and c.is_broadcast
    )
  );
create policy "kcircle_broadcast_comments_own_delete" on kcircle_broadcast_comments for delete to authenticated using (auth.uid() = author_id);
