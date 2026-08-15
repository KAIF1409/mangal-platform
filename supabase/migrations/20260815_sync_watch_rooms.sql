-- Sync-Play Watch Rooms (§25/§27 backlog item — the third pitched
-- retention-strategy idea, previously flagged as "needs live playback-state
-- sync", not built until now).
--
-- Playback state itself (play/pause/seek/currentTime) is NOT persisted here
-- — it's synced via an ephemeral Supabase Realtime Broadcast channel
-- (`watch-room-<id>`), matching Supabase's own recommended pattern for
-- high-frequency "authoritative clock" style state (see Realtime docs).
-- Writing every play/pause/seek to Postgres would add write load and
-- latency for no benefit, since nothing needs that history after the fact.
--
-- What IS persisted: room metadata (so a room survives everyone leaving and
-- can be rejoined/relinked), membership (so "your rooms" lists work), and
-- chat (so it behaves like every other chat surface in the app — matches
-- kcircle_messages, uses the same postgres_changes Realtime pattern from
-- 20260812130000_kcircle_realtime_chat.sql rather than inventing a second
-- realtime mechanism for chat specifically).

create table if not exists watch_rooms (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references videos(id) on delete cascade,
  host_id uuid not null references auth.users(id) on delete cascade,
  -- 'private' = friend-group room, host + invited/joined members only.
  -- 'public' = anyone can discover + join (Kalpana Circle "Watch Together"
  -- tab browse list). KaTube's own "Watch with Friends" button always
  -- creates 'private' — per the founder's spec, KaTube itself is already
  -- the "public" watching surface, a public room there would be redundant.
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  title text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists watch_rooms_video_id_idx on watch_rooms(video_id);
create index if not exists watch_rooms_host_id_idx on watch_rooms(host_id);
create index if not exists watch_rooms_public_active_idx on watch_rooms(visibility, is_active) where visibility = 'public' and is_active = true;

alter table watch_rooms enable row level security;
-- Public rooms readable by everyone (browse list); private rooms readable
-- by the host or an existing member only — so a private room doesn't leak
-- into anyone's browse list or become guessable-by-id readable.
create policy "watch_rooms_read" on watch_rooms for select using (
  visibility = 'public'
  or host_id = auth.uid()
  or exists (select 1 from watch_room_members m where m.room_id = watch_rooms.id and m.user_id = auth.uid())
);
create policy "watch_rooms_host_insert" on watch_rooms for insert to authenticated with check (auth.uid() = host_id);
create policy "watch_rooms_host_update" on watch_rooms for update to authenticated using (auth.uid() = host_id);
create policy "watch_rooms_host_delete" on watch_rooms for delete to authenticated using (auth.uid() = host_id);

create table if not exists watch_room_members (
  room_id uuid not null references watch_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

alter table watch_room_members enable row level security;
-- Read: same visibility rule as the room itself (public room member list is
-- public; private room member list only visible to other members/host).
create policy "watch_room_members_read" on watch_room_members for select using (
  exists (
    select 1 from watch_rooms r where r.id = watch_room_members.room_id
    and (r.visibility = 'public' or r.host_id = auth.uid()
         or exists (select 1 from watch_room_members m2 where m2.room_id = r.id and m2.user_id = auth.uid()))
  )
);
-- Join: anyone can add themselves to a public room; a private room can only
-- be joined by someone who already has the link (id) — this table has no
-- separate "invite" row, the shareable room URL *is* the invite, matching
-- how link-sharing works everywhere else in the app (e.g. broadcast
-- channels). Still requires the room to actually be public OR the joiner
-- to already know the private room's id (can't be discovered via the read
-- policy above unless already a member/host).
create policy "watch_room_members_self_insert" on watch_room_members for insert to authenticated with check (auth.uid() = user_id);
create policy "watch_room_members_self_delete" on watch_room_members for delete to authenticated using (auth.uid() = user_id);

create table if not exists watch_room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references watch_rooms(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  message_text text not null,
  created_at timestamptz not null default now()
);

create index if not exists watch_room_messages_room_id_idx on watch_room_messages(room_id, created_at);

alter table watch_room_messages enable row level security;
create policy "watch_room_messages_member_read" on watch_room_messages for select using (
  exists (
    select 1 from watch_rooms r where r.id = watch_room_messages.room_id
    and (r.host_id = auth.uid() or exists (select 1 from watch_room_members m where m.room_id = r.id and m.user_id = auth.uid()))
  )
);
create policy "watch_room_messages_member_insert" on watch_room_messages for insert to authenticated with check (
  auth.uid() = sender_id
  and exists (
    select 1 from watch_rooms r where r.id = watch_room_messages.room_id
    and (r.host_id = auth.uid() or exists (select 1 from watch_room_members m where m.room_id = r.id and m.user_id = auth.uid()))
  )
);

-- Realtime for room membership (member list updates live) and chat —
-- mirrors 20260812130000_kcircle_realtime_chat.sql. Playback sync itself
-- deliberately does NOT go through postgres_changes (see header comment).
alter table watch_room_members replica identity full;
alter publication supabase_realtime add table watch_room_members;
alter publication supabase_realtime add table watch_room_messages;
