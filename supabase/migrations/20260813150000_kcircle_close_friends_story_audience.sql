-- K Circle — wire up the close-friends list (kcircle_close_friends,
-- 20260812125210, live but never used by any UI) as a story audience
-- restriction, Instagram-style: a story can be marked "close friends
-- only" and is then only visible to the author and whoever is on the
-- author's close-friends list.

alter table kcircle_stories add column if not exists close_friends_only boolean not null default false;

-- Replace the public-read policy: unrestricted stories behave exactly as
-- before (any signed-in-or-not viewer, filtered only by expiry); a
-- close-friends-only story additionally requires the viewer to be the
-- author or to appear as a friend_id under the author's own
-- kcircle_close_friends rows.
drop policy if exists "kcircle_stories_public_read" on kcircle_stories;
create policy "kcircle_stories_public_read" on kcircle_stories for select
  using (
    expires_at > now()
    and (
      not close_friends_only
      or auth.uid() = author_id
      or exists (
        select 1 from kcircle_close_friends cf
        where cf.user_id = kcircle_stories.author_id and cf.friend_id = auth.uid()
      )
    )
  );
