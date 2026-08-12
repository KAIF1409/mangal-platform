-- K Circle groups get Discord-style channels + roles + per-channel permission
-- overwrites. Scoped to groups (kcircle_conversations.is_group = true).
-- Permission model: bitmask on kcircle_group_roles.permissions (server-wide
-- default for that role) + optional per-channel allow/deny overwrite
-- bitmask in kcircle_channel_overwrites, resolved the same way Discord
-- documents it (base role perms OR'd across all roles -> channel-level
-- role denies -> channel-level role allows). See
-- app/lib/kcirclePermissions.ts for the client-side resolver + the bit
-- constants (VIEW_CHANNEL=1, SEND_MESSAGES=2, MANAGE_MESSAGES=4,
-- MANAGE_CHANNELS=8, MANAGE_ROLES=16, KICK_MEMBERS=32, BAN_MEMBERS=64,
-- ADMINISTRATOR=128).

create table if not exists kcircle_group_roles (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references kcircle_conversations(id) on delete cascade,
  name text not null,
  color text,
  position int not null default 0,
  permissions bigint not null default 0,
  is_default boolean not null default false, -- @everyone-equivalent, auto-assigned, can't be deleted
  created_at timestamptz not null default now()
);
create index if not exists kcircle_group_roles_conversation_id_idx on kcircle_group_roles(conversation_id);
create unique index if not exists kcircle_group_roles_one_default_idx on kcircle_group_roles(conversation_id) where is_default;

create table if not exists kcircle_group_role_members (
  role_id uuid not null references kcircle_group_roles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, user_id)
);

create table if not exists kcircle_group_channels (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references kcircle_conversations(id) on delete cascade,
  name text not null,
  topic text,
  position int not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists kcircle_group_channels_conversation_id_idx on kcircle_group_channels(conversation_id);

create table if not exists kcircle_channel_overwrites (
  channel_id uuid not null references kcircle_group_channels(id) on delete cascade,
  role_id uuid not null references kcircle_group_roles(id) on delete cascade,
  allow bigint not null default 0,
  deny bigint not null default 0,
  primary key (channel_id, role_id)
);

-- NOTE: an untracked `kcircle_channel_messages` table already existed live
-- on this project (sender_id/no image_url, no migration file, no app code
-- referencing it — same kind of repo/DB drift flagged in CONTEXT.md
-- §13b). It was empty, so it was dropped and recreated with this schema
-- directly against the live DB before this migration file was written.
-- `create table if not exists` below is a no-op on that DB (table already
-- matches) and creates it fresh on any other environment.
create table if not exists kcircle_channel_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references kcircle_group_channels(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  text text,
  image_url text,
  created_at timestamptz not null default now()
);
create index if not exists kcircle_channel_messages_channel_id_idx on kcircle_channel_messages(channel_id, created_at desc);

alter table kcircle_group_roles enable row level security;
alter table kcircle_group_role_members enable row level security;
alter table kcircle_group_channels enable row level security;
alter table kcircle_channel_overwrites enable row level security;
alter table kcircle_channel_messages enable row level security;

create or replace function kcircle_is_group_participant(p_conversation_id uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from kcircle_conversation_participants p
    where p.conversation_id = p_conversation_id and p.user_id = auth.uid()
  );
$$;

drop policy if exists "kcircle_group_roles_participant_read" on kcircle_group_roles;
create policy "kcircle_group_roles_participant_read" on kcircle_group_roles for select
  using (kcircle_is_group_participant(conversation_id));
drop policy if exists "kcircle_group_roles_participant_write" on kcircle_group_roles;
create policy "kcircle_group_roles_participant_write" on kcircle_group_roles for insert to authenticated
  with check (kcircle_is_group_participant(conversation_id));
drop policy if exists "kcircle_group_roles_participant_update" on kcircle_group_roles;
create policy "kcircle_group_roles_participant_update" on kcircle_group_roles for update to authenticated
  using (kcircle_is_group_participant(conversation_id));
drop policy if exists "kcircle_group_roles_participant_delete" on kcircle_group_roles;
create policy "kcircle_group_roles_participant_delete" on kcircle_group_roles for delete to authenticated
  using (kcircle_is_group_participant(conversation_id) and not is_default);

drop policy if exists "kcircle_group_role_members_participant_read" on kcircle_group_role_members;
create policy "kcircle_group_role_members_participant_read" on kcircle_group_role_members for select
  using (exists (select 1 from kcircle_group_roles r where r.id = role_id and kcircle_is_group_participant(r.conversation_id)));
drop policy if exists "kcircle_group_role_members_participant_write" on kcircle_group_role_members;
create policy "kcircle_group_role_members_participant_write" on kcircle_group_role_members for insert to authenticated
  with check (exists (select 1 from kcircle_group_roles r where r.id = role_id and kcircle_is_group_participant(r.conversation_id)));
drop policy if exists "kcircle_group_role_members_participant_delete" on kcircle_group_role_members;
create policy "kcircle_group_role_members_participant_delete" on kcircle_group_role_members for delete to authenticated
  using (exists (select 1 from kcircle_group_roles r where r.id = role_id and kcircle_is_group_participant(r.conversation_id)));

drop policy if exists "kcircle_group_channels_participant_read" on kcircle_group_channels;
create policy "kcircle_group_channels_participant_read" on kcircle_group_channels for select
  using (kcircle_is_group_participant(conversation_id));
drop policy if exists "kcircle_group_channels_participant_write" on kcircle_group_channels;
create policy "kcircle_group_channels_participant_write" on kcircle_group_channels for insert to authenticated
  with check (kcircle_is_group_participant(conversation_id));
drop policy if exists "kcircle_group_channels_participant_update" on kcircle_group_channels;
create policy "kcircle_group_channels_participant_update" on kcircle_group_channels for update to authenticated
  using (kcircle_is_group_participant(conversation_id));
drop policy if exists "kcircle_group_channels_participant_delete" on kcircle_group_channels;
create policy "kcircle_group_channels_participant_delete" on kcircle_group_channels for delete to authenticated
  using (kcircle_is_group_participant(conversation_id));

drop policy if exists "kcircle_channel_overwrites_participant_read" on kcircle_channel_overwrites;
create policy "kcircle_channel_overwrites_participant_read" on kcircle_channel_overwrites for select
  using (exists (select 1 from kcircle_group_channels c where c.id = channel_id and kcircle_is_group_participant(c.conversation_id)));
drop policy if exists "kcircle_channel_overwrites_participant_write" on kcircle_channel_overwrites;
create policy "kcircle_channel_overwrites_participant_write" on kcircle_channel_overwrites for insert to authenticated
  with check (exists (select 1 from kcircle_group_channels c where c.id = channel_id and kcircle_is_group_participant(c.conversation_id)));
drop policy if exists "kcircle_channel_overwrites_participant_update" on kcircle_channel_overwrites;
create policy "kcircle_channel_overwrites_participant_update" on kcircle_channel_overwrites for update to authenticated
  using (exists (select 1 from kcircle_group_channels c where c.id = channel_id and kcircle_is_group_participant(c.conversation_id)));
drop policy if exists "kcircle_channel_overwrites_participant_delete" on kcircle_channel_overwrites;
create policy "kcircle_channel_overwrites_participant_delete" on kcircle_channel_overwrites for delete to authenticated
  using (exists (select 1 from kcircle_group_channels c where c.id = channel_id and kcircle_is_group_participant(c.conversation_id)));

drop policy if exists "kcircle_channel_messages_participant_read" on kcircle_channel_messages;
create policy "kcircle_channel_messages_participant_read" on kcircle_channel_messages for select
  using (exists (select 1 from kcircle_group_channels c where c.id = channel_id and kcircle_is_group_participant(c.conversation_id)));
drop policy if exists "kcircle_channel_messages_own_insert" on kcircle_channel_messages;
create policy "kcircle_channel_messages_own_insert" on kcircle_channel_messages for insert to authenticated
  with check (auth.uid() = author_id and exists (select 1 from kcircle_group_channels c where c.id = channel_id and kcircle_is_group_participant(c.conversation_id)));
drop policy if exists "kcircle_channel_messages_own_delete" on kcircle_channel_messages;
create policy "kcircle_channel_messages_own_delete" on kcircle_channel_messages for delete to authenticated
  using (auth.uid() = author_id);

-- Auto-create a default "@everyone" role (view+send), an "Owner" role
-- (all permissions, assigned to the creator), and a #general channel
-- whenever a group conversation is created, so every group has a working
-- channels/roles baseline without a manual setup step.
create or replace function kcircle_group_bootstrap_channels_roles()
returns trigger language plpgsql security definer as $$
declare
  v_owner_role_id uuid;
begin
  if new.is_group then
    insert into kcircle_group_roles (conversation_id, name, color, position, permissions, is_default)
      values (new.id, '@everyone', '#99a1b3', 0, 3, true);
    insert into kcircle_group_roles (conversation_id, name, color, position, permissions, is_default)
      values (new.id, 'Owner', '#a855f7', 100, 255, false)
      returning id into v_owner_role_id;
    if new.created_by is not null then
      insert into kcircle_group_role_members (role_id, user_id) values (v_owner_role_id, new.created_by);
    end if;
    insert into kcircle_group_channels (conversation_id, name, position, created_by)
      values (new.id, 'general', 0, new.created_by);
  end if;
  return new;
end;
$$;

drop trigger if exists kcircle_group_bootstrap_channels_roles_trg on kcircle_conversations;
create trigger kcircle_group_bootstrap_channels_roles_trg
  after insert on kcircle_conversations
  for each row execute function kcircle_group_bootstrap_channels_roles();
