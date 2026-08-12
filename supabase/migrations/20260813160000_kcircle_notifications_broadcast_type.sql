-- K Circle — allow 'broadcast' as a kcircle_notifications.type value, so a
-- creator's broadcast-channel post (§12g) can notify their series
-- followers, same as likes/comments/messages/group-adds already do.
alter table kcircle_notifications drop constraint if exists kcircle_notifications_type_check;
alter table kcircle_notifications add constraint kcircle_notifications_type_check
  check (type in ('like', 'comment', 'message', 'group_add', 'broadcast'));
