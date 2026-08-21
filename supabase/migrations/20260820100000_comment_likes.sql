-- Comment likes — KaTube, K Circle, WebMangal
--
-- Founder ask: give each product's comment section the sorting algorithm
-- of its reference platform (KaTube -> YouTube "Top comments", K Circle ->
-- Instagram, WebMangal -> Webnovel "Popular"), plus a page-size limit.
-- None of the three comment tables (video_comments, kcircle_post_comments,
-- comments) had any concept of a comment "like" at all, so every one of
-- those algorithms needs a like count to rank on — this migration adds
-- that missing piece, one join table per product, same structural-
-- guarantee pattern already used for video_likes/kcircle_post_likes
-- (composite PK on (comment_id, liker_id) so a user can't double-like a
-- comment at the DB level, RLS locked to auth.uid()).
--
-- No denormalized counter column + trigger on the parent comment tables
-- (unlike videos.likes/kcircle_posts liked pattern) — comment counts here
-- are read via a single batched `in()` count query per comments load,
-- same approach already used for kcircle_post_comments' commentCount.
-- Comment volume per video/post/chapter is small enough that this avoids
-- three trigger functions for very little benefit.

create table if not exists video_comment_likes (
  comment_id uuid not null references video_comments(id) on delete cascade,
  liker_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, liker_id)
);
create index if not exists video_comment_likes_comment_id_idx on video_comment_likes(comment_id);

alter table video_comment_likes enable row level security;
create policy "video_comment_likes_public_read" on video_comment_likes for select using (true);
create policy "video_comment_likes_own_insert" on video_comment_likes for insert to authenticated with check (auth.uid() = liker_id);
create policy "video_comment_likes_own_delete" on video_comment_likes for delete to authenticated using (auth.uid() = liker_id);

create table if not exists kcircle_post_comment_likes (
  comment_id uuid not null references kcircle_post_comments(id) on delete cascade,
  liker_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, liker_id)
);
create index if not exists kcircle_post_comment_likes_comment_id_idx on kcircle_post_comment_likes(comment_id);

alter table kcircle_post_comment_likes enable row level security;
create policy "kcircle_post_comment_likes_public_read" on kcircle_post_comment_likes for select using (true);
create policy "kcircle_post_comment_likes_own_insert" on kcircle_post_comment_likes for insert to authenticated with check (auth.uid() = liker_id);
create policy "kcircle_post_comment_likes_own_delete" on kcircle_post_comment_likes for delete to authenticated using (auth.uid() = liker_id);

create table if not exists chapter_comment_likes (
  comment_id uuid not null references comments(id) on delete cascade,
  liker_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, liker_id)
);
create index if not exists chapter_comment_likes_comment_id_idx on chapter_comment_likes(comment_id);

alter table chapter_comment_likes enable row level security;
create policy "chapter_comment_likes_public_read" on chapter_comment_likes for select using (true);
create policy "chapter_comment_likes_own_insert" on chapter_comment_likes for insert to authenticated with check (auth.uid() = liker_id);
create policy "chapter_comment_likes_own_delete" on chapter_comment_likes for delete to authenticated using (auth.uid() = liker_id);
