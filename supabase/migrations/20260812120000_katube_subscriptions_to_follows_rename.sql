-- Rename "subscribe" concept to "follow" to match the rest of the app's
-- terminology (WebMangal already has a `follows` table for series) and
-- because KaTube isn't sub-for-sub / YouTube-style subscription — it's a
-- follow, same as everywhere else on the platform.
alter table creator_subscriptions rename to creator_follows;
alter table creator_follows rename column subscriber_id to follower_id;

alter index creator_subscriptions_pkey rename to creator_follows_pkey;
alter index creator_subscriptions_creator_id_idx rename to creator_follows_creator_id_idx;

alter table creator_follows rename constraint creator_subscriptions_creator_id_fkey to creator_follows_creator_id_fkey;
alter table creator_follows rename constraint creator_subscriptions_subscriber_id_fkey to creator_follows_follower_id_fkey;

alter policy "creator_subscriptions_public_read" on creator_follows rename to "creator_follows_public_read";
alter policy "creator_subscriptions_own_insert" on creator_follows rename to "creator_follows_own_insert";
alter policy "creator_subscriptions_own_delete" on creator_follows rename to "creator_follows_own_delete";
