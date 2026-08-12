-- K Circle Step 1 — Instagram-style social backend
-- posts (image/text), likes, comments, stories (24h), chats (DMs)

-- ── POSTS ──
create table if not exists kcircle_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  caption text,
  image_url text,
  tag text,
  created_at timestamptz not null default now()
);
create index if not exists kcircle_posts_author_id_idx on kcircle_posts(author_id);
create index if not exists kcircle_posts_created_at_idx on kcircle_posts(created_at desc);

alter table kcircle_posts enable row level security;
create policy "kcircle_posts_public_read" on kcircle_posts for select using (true);
create policy "kcircle_posts_own_insert" on kcircle_posts for insert to authenticated with check (auth.uid() = author_id);
create policy "kcircle_posts_own_update" on kcircle_posts for update to authenticated using (auth.uid() = author_id);
create policy "kcircle_posts_own_delete" on kcircle_posts for delete to authenticated using (auth.uid() = author_id);

-- ── POST LIKES ──
create table if not exists kcircle_post_likes (
  post_id uuid not null references kcircle_posts(id) on delete cascade,
  liker_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, liker_id)
);
alter table kcircle_post_likes enable row level security;
create policy "kcircle_post_likes_public_read" on kcircle_post_likes for select using (true);
create policy "kcircle_post_likes_own_insert" on kcircle_post_likes for insert to authenticated with check (auth.uid() = liker_id);
create policy "kcircle_post_likes_own_delete" on kcircle_post_likes for delete to authenticated using (auth.uid() = liker_id);

-- ── POST COMMENTS ──
create table if not exists kcircle_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references kcircle_posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);
create index if not exists kcircle_comments_post_id_idx on kcircle_post_comments(post_id);

alter table kcircle_post_comments enable row level security;
create policy "kcircle_comments_public_read" on kcircle_post_comments for select using (true);
create policy "kcircle_comments_own_insert" on kcircle_post_comments for insert to authenticated with check (auth.uid() = author_id);
create policy "kcircle_comments_own_delete" on kcircle_post_comments for delete to authenticated using (auth.uid() = author_id);

-- ── STORIES (24h expiry, checked client-side + via expires_at) ──
create table if not exists kcircle_stories (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  image_url text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);
create index if not exists kcircle_stories_author_id_idx on kcircle_stories(author_id);
create index if not exists kcircle_stories_expires_at_idx on kcircle_stories(expires_at);

alter table kcircle_stories enable row level security;
create policy "kcircle_stories_public_read" on kcircle_stories for select using (expires_at > now());
create policy "kcircle_stories_own_insert" on kcircle_stories for insert to authenticated with check (auth.uid() = author_id);
create policy "kcircle_stories_own_delete" on kcircle_stories for delete to authenticated using (auth.uid() = author_id);

create table if not exists kcircle_story_views (
  story_id uuid not null references kcircle_stories(id) on delete cascade,
  viewer_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (story_id, viewer_id)
);
alter table kcircle_story_views enable row level security;
create policy "kcircle_story_views_public_read" on kcircle_story_views for select using (true);
create policy "kcircle_story_views_own_insert" on kcircle_story_views for insert to authenticated with check (auth.uid() = viewer_id);

-- ── CHATS (DMs) ──
create table if not exists kcircle_conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);
alter table kcircle_conversations enable row level security;

create table if not exists kcircle_conversation_participants (
  conversation_id uuid not null references kcircle_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (conversation_id, user_id)
);
alter table kcircle_conversation_participants enable row level security;

-- participants can see a conversation only if they're in it
create policy "kcircle_conversations_participant_read" on kcircle_conversations for select
  using (exists (
    select 1 from kcircle_conversation_participants p
    where p.conversation_id = id and p.user_id = auth.uid()
  ));
create policy "kcircle_conversations_authenticated_insert" on kcircle_conversations for insert to authenticated with check (true);

create policy "kcircle_participants_self_read" on kcircle_conversation_participants for select
  using (exists (
    select 1 from kcircle_conversation_participants p2
    where p2.conversation_id = conversation_id and p2.user_id = auth.uid()
  ));
create policy "kcircle_participants_own_insert" on kcircle_conversation_participants for insert to authenticated with check (auth.uid() = user_id or true);

create table if not exists kcircle_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references kcircle_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);
create index if not exists kcircle_messages_conversation_id_idx on kcircle_messages(conversation_id, created_at);
alter table kcircle_messages enable row level security;

create policy "kcircle_messages_participant_read" on kcircle_messages for select
  using (exists (
    select 1 from kcircle_conversation_participants p
    where p.conversation_id = kcircle_messages.conversation_id and p.user_id = auth.uid()
  ));
create policy "kcircle_messages_participant_insert" on kcircle_messages for insert to authenticated
  with check (
    auth.uid() = sender_id and exists (
      select 1 from kcircle_conversation_participants p
      where p.conversation_id = kcircle_messages.conversation_id and p.user_id = auth.uid()
    )
  );
