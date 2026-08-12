-- K Circle: close friends list — applied live in an earlier session,
-- reconstructed here (version matches the live-applied migration exactly,
-- from `list_migrations`) purely to bring the repo's migration history in
-- sync with what's actually on the project; no UI reads/writes this table
-- yet anywhere in the repo — flagged as a dormant backlog item.

create table if not exists kcircle_close_friends (
  user_id uuid not null references auth.users(id) on delete cascade,
  friend_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  constraint kcircle_close_friends_no_self check (user_id <> friend_id)
);

alter table kcircle_close_friends enable row level security;

create policy "kcircle_close_friends_owner_all" on kcircle_close_friends
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
