-- K Circle: saved posts (Instagram-style bookmark), private to the saving
-- user — separate table from kcircle_post_likes, which is public. This
-- documents a table+RLS that was already applied live in an earlier
-- session but never made it into a migration file until now (schema below
-- matches what's live: user_id/post_id PK, single "owner_all" policy).

create table if not exists kcircle_saved_posts (
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references kcircle_posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

alter table kcircle_saved_posts enable row level security;

create policy "kcircle_saved_posts_owner_all" on kcircle_saved_posts
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
