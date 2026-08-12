-- K Circle: optional link fields on posts (e.g. linking a post to an
-- external URL — trailer, petition, fan-site, etc). Applied live in an
-- earlier session, reconstructed here (version matches the live-applied
-- migration exactly) to bring the repo's migration history in sync. No
-- composer UI writes these columns yet — dormant backlog item.

alter table kcircle_posts add column if not exists link_url text;
alter table kcircle_posts add column if not exists link_label text;
