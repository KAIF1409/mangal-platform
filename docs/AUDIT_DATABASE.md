# Live schema and RLS inventory — 2026-09-07

Read-only catalog introspection, not a restorable schema dump. No rows, keys or credentials included.
Lists every retrieved public/storage table and policy. Public columns, constraints and indexes are included.
RLS enabled does not prove policies correct; see AUDIT.md for blockers and untested role matrices.

Tables: 87; policies: 252; public indexes: 189.

## public.account_deletions

RLS enabled: true; forced: false.

Columns: `id` (uuid), `user_id` (uuid), `requested_at` (timestamp with time zone), `completed_at` (timestamp with time zone), `status` (text), `failure_reason` (text)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| no public access to deletion audit log | ALL | public | false |  |

Constraints:
- CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text, 'failed'::text])))
- PRIMARY KEY (id)

Indexes:
- CREATE UNIQUE INDEX account_deletions_pkey ON public.account_deletions USING btree (id)

## public.ai_tools

RLS enabled: true; forced: false.

Columns: `id` (uuid), `is_affiliate` (boolean), `sort_order` (integer), `active` (boolean), `created_at` (timestamp with time zone), `name` (text), `product` (text), `category` (text), `description` (text), `affiliate_url` (text), `icon` (text)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| ai_tools_public_read | SELECT | public | active |  |

Constraints:
- CHECK ((product = ANY (ARRAY['webmangal'::text, 'katube'::text, 'kcircle'::text])))
- PRIMARY KEY (id)

Indexes:
- CREATE UNIQUE INDEX ai_tools_pkey ON public.ai_tools USING btree (id)
- CREATE INDEX ai_tools_product_idx ON public.ai_tools USING btree (product) WHERE active

## public.book_purchases

RLS enabled: true; forced: false.

Columns: `id` (uuid), `book_id` (uuid), `user_id` (uuid), `amount_paid_paise` (integer), `created_at` (timestamp with time zone), `payment_id` (uuid)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| book_purchases_own_read | SELECT | public | ((auth.uid() = user_id) OR (EXISTS ( SELECT 1<br>   FROM books b<br>  WHERE ((b.id = book_purchases.book_id) AND (b.author_id = auth.uid()))))) |  |

Constraints:
- PRIMARY KEY (id)
- UNIQUE (book_id, user_id)
- FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
- FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
- FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL

Indexes:
- CREATE UNIQUE INDEX book_purchases_pkey ON public.book_purchases USING btree (id)
- CREATE UNIQUE INDEX book_purchases_book_id_user_id_key ON public.book_purchases USING btree (book_id, user_id)
- CREATE INDEX book_purchases_user_id_idx ON public.book_purchases USING btree (user_id)
- CREATE INDEX book_purchases_book_id_idx ON public.book_purchases USING btree (book_id)

## public.book_reading_progress

RLS enabled: true; forced: false.

Columns: `id` (uuid), `book_id` (uuid), `user_id` (uuid), `last_page` (integer), `total_pages` (integer), `percent` (numeric), `created_at` (timestamp with time zone), `updated_at` (timestamp with time zone), `last_location` (text)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| book_progress_own_insert | INSERT | authenticated |  | (auth.uid() = user_id) |
| book_progress_own_select | SELECT | authenticated | (auth.uid() = user_id) |  |
| book_progress_own_update | UPDATE | authenticated | (auth.uid() = user_id) |  |

Constraints:
- PRIMARY KEY (id)
- UNIQUE (book_id, user_id)
- FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
- FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE

Indexes:
- CREATE UNIQUE INDEX book_reading_progress_pkey ON public.book_reading_progress USING btree (id)
- CREATE UNIQUE INDEX book_reading_progress_book_id_user_id_key ON public.book_reading_progress USING btree (book_id, user_id)
- CREATE INDEX book_reading_progress_user_id_idx ON public.book_reading_progress USING btree (user_id)

## public.books

RLS enabled: true; forced: false.

Columns: `id` (uuid), `author_id` (uuid), `file_size_bytes` (bigint), `price_paise` (integer), `views` (integer), `created_at` (timestamp with time zone), `updated_at` (timestamp with time zone), `is_mature` (boolean), `publish_at` (timestamp with time zone), `cover_image_url` (text), `file_url` (text), `file_type` (text), `pricing_type` (text), `category` (text), `status` (text), `genre_tags` (ARRAY), `title` (text), `description` (text)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| books_owner_delete | DELETE | authenticated | (auth.uid() = author_id) |  |
| books_owner_insert | INSERT | authenticated |  | (auth.uid() = author_id) |
| books_owner_update | UPDATE | authenticated | (auth.uid() = author_id) |  |
| books_public_read_published | SELECT | public | ((status = 'published'::text) OR (auth.uid() = author_id)) |  |

Constraints:
- CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text])))
- CHECK ((file_type = ANY (ARRAY['pdf'::text, 'epub'::text])))
- CHECK ((pricing_type = ANY (ARRAY['FREE'::text, 'PAID'::text])))
- CHECK ((((pricing_type = 'FREE'::text) AND (price_paise IS NULL)) OR ((pricing_type = 'PAID'::text) AND (price_paise IS NOT NULL) AND (price_paise > 0))))
- PRIMARY KEY (id)
- FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE CASCADE

Indexes:
- CREATE UNIQUE INDEX books_pkey ON public.books USING btree (id)
- CREATE INDEX books_author_id_idx ON public.books USING btree (author_id)
- CREATE INDEX books_status_idx ON public.books USING btree (status)
- CREATE INDEX books_category_idx ON public.books USING btree (category)
- CREATE INDEX books_created_at_idx ON public.books USING btree (created_at DESC)
- CREATE INDEX books_publish_at_idx ON public.books USING btree (publish_at)

## public.chapter_comment_likes

RLS enabled: true; forced: false.

Columns: `comment_id` (uuid), `liker_id` (uuid), `created_at` (timestamp with time zone)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| chapter_comment_likes_own_delete | DELETE | authenticated | (auth.uid() = liker_id) |  |
| chapter_comment_likes_own_insert | INSERT | authenticated |  | (auth.uid() = liker_id) |
| chapter_comment_likes_public_read | SELECT | public | true |  |

Constraints:
- PRIMARY KEY (comment_id, liker_id)
- FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE
- FOREIGN KEY (liker_id) REFERENCES auth.users(id) ON DELETE CASCADE

Indexes:
- CREATE UNIQUE INDEX chapter_comment_likes_pkey ON public.chapter_comment_likes USING btree (comment_id, liker_id)
- CREATE INDEX chapter_comment_likes_comment_id_idx ON public.chapter_comment_likes USING btree (comment_id)

## public.chapters

RLS enabled: true; forced: false.

Columns: `id` (uuid), `series_id` (uuid), `chapter_number` (integer), `created_at` (timestamp with time zone), `word_count` (integer), `notified_at` (timestamp with time zone), `is_draft` (boolean), `scheduled_at` (timestamp with time zone), `title` (text), `content` (text), `author_note_before` (text), `author_note_after` (text), `tags` (ARRAY)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| Admin can delete chapters | DELETE | authenticated | (EXISTS ( SELECT 1<br>   FROM profiles<br>  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'developer'::text)))) |  |
| Chapters of published series are viewable by everyone | SELECT | public | (EXISTS ( SELECT 1<br>   FROM series<br>  WHERE ((series.id = chapters.series_id) AND ((series.status = 'published'::text) OR (series.creator_id = auth.uid()))))) |  |
| Creators can manage chapters of their own series | ALL | public | (EXISTS ( SELECT 1<br>   FROM series<br>  WHERE ((series.id = chapters.series_id) AND (series.creator_id = auth.uid())))) |  |

Constraints:
- PRIMARY KEY (id)
- UNIQUE (series_id, chapter_number)
- FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE

Indexes:
- CREATE UNIQUE INDEX chapters_pkey ON public.chapters USING btree (id)
- CREATE UNIQUE INDEX chapters_series_id_chapter_number_key ON public.chapters USING btree (series_id, chapter_number)

## public.character_profiles

RLS enabled: true; forced: false.

Columns: `id` (uuid), `user_id` (uuid), `series_id` (uuid), `created_at` (timestamp with time zone), `updated_at` (timestamp with time zone), `image_url` (text), `backstory` (text), `name` (text), `role` (text), `tags` (ARRAY)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| character_profiles_owner_delete | DELETE | authenticated | (auth.uid() = user_id) |  |
| character_profiles_owner_insert | INSERT | authenticated |  | (auth.uid() = user_id) |
| character_profiles_owner_select | SELECT | authenticated | (auth.uid() = user_id) |  |
| character_profiles_owner_update | UPDATE | authenticated | (auth.uid() = user_id) |  |

Constraints:
- PRIMARY KEY (id)
- FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
- FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE SET NULL

Indexes:
- CREATE UNIQUE INDEX character_profiles_pkey ON public.character_profiles USING btree (id)
- CREATE INDEX character_profiles_user_id_idx ON public.character_profiles USING btree (user_id)
- CREATE INDEX character_profiles_series_id_idx ON public.character_profiles USING btree (series_id)

## public.comments

RLS enabled: true; forced: false.

Columns: `id` (uuid), `chapter_id` (uuid), `reader_id` (uuid), `parent_id` (uuid), `created_at` (timestamp with time zone), `body` (text)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| Admin can delete comments | DELETE | authenticated | (EXISTS ( SELECT 1<br>   FROM profiles<br>  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'developer'::text)))) |  |
| Delete own comment | DELETE | public | (auth.uid() = reader_id) |  |
| Insert own comment | INSERT | public |  | (auth.uid() = reader_id) |
| Public read comments | SELECT | public | true |  |
| Update own comment | UPDATE | public | (auth.uid() = reader_id) | (auth.uid() = reader_id) |

Constraints:
- CHECK ((char_length(body) <= 500))
- PRIMARY KEY (id)
- FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
- FOREIGN KEY (reader_id) REFERENCES profiles(id) ON DELETE CASCADE
- FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE

Indexes:
- CREATE UNIQUE INDEX comments_pkey ON public.comments USING btree (id)

## public.consent_log

RLS enabled: true; forced: false.

Columns: `id` (uuid), `user_id` (uuid), `created_at` (timestamp with time zone), `consent_version` (text), `action` (text)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| users can insert own consent events | INSERT | public |  | (auth.uid() = user_id) |
| users can view own consent history | SELECT | public | (auth.uid() = user_id) |  |

Constraints:
- CHECK ((action = ANY (ARRAY['given'::text, 'withdrawn'::text])))
- PRIMARY KEY (id)
- FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE

Indexes:
- CREATE UNIQUE INDEX consent_log_pkey ON public.consent_log USING btree (id)

## public.creator_follows

RLS enabled: true; forced: false.

Columns: `follower_id` (uuid), `creator_id` (uuid), `created_at` (timestamp with time zone)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| creator_follows_own_delete | DELETE | authenticated | (auth.uid() = follower_id) |  |
| creator_follows_own_insert | INSERT | authenticated |  | (auth.uid() = follower_id) |
| creator_follows_public_read | SELECT | public | true |  |

Constraints:
- CHECK ((follower_id <> creator_id))
- PRIMARY KEY (follower_id, creator_id)
- FOREIGN KEY (creator_id) REFERENCES auth.users(id) ON DELETE CASCADE
- FOREIGN KEY (follower_id) REFERENCES auth.users(id) ON DELETE CASCADE

Indexes:
- CREATE UNIQUE INDEX creator_follows_pkey ON public.creator_follows USING btree (follower_id, creator_id)
- CREATE INDEX creator_follows_creator_id_idx ON public.creator_follows USING btree (creator_id)

## public.creator_profiles

RLS enabled: true; forced: false.

Columns: `user_id` (uuid), `payout_details` (jsonb), `payout_verified` (boolean), `joined_at` (timestamp with time zone), `channel_verified_at` (timestamp with time zone), `youtube_verification_code` (text), `verified_youtube_channel_id` (text), `avatar_url` (text), `username` (text), `bio` (text), `phone` (text), `payout_method` (text), `youtube_channel_handle` (text), `pending_youtube_channel_id` (text)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| Creator profiles are viewable by everyone | SELECT | public | true |  |
| Users can insert own creator profile | INSERT | public |  | (auth.uid() = user_id) |
| Users can update own creator profile | UPDATE | public | (auth.uid() = user_id) |  |
| Users can view own creator profile | SELECT | public | (auth.uid() = user_id) |  |

Constraints:
- CHECK ((payout_method = ANY (ARRAY['upi'::text, 'bank'::text])))
- PRIMARY KEY (user_id)
- UNIQUE (username)
- FOREIGN KEY (user_id) REFERENCES auth.users(id)

Indexes:
- CREATE UNIQUE INDEX creator_profiles_pkey ON public.creator_profiles USING btree (user_id)
- CREATE UNIQUE INDEX creator_profiles_username_key ON public.creator_profiles USING btree (username)
- CREATE UNIQUE INDEX creator_profiles_verified_channel_unique ON public.creator_profiles USING btree (verified_youtube_channel_id) WHERE (verified_youtube_channel_id IS NOT NULL)

## public.deletion_cold_storage

RLS enabled: true; forced: false.

Columns: `id` (uuid), `account_created_at` (timestamp with time zone), `deleted_at` (timestamp with time zone), `purge_after` (timestamp with time zone), `encrypted_user_id` (text), `registration_ip` (text)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| no public access to cold storage | ALL | public | false |  |

Constraints:
- PRIMARY KEY (id)

Indexes:
- CREATE UNIQUE INDEX deletion_cold_storage_pkey ON public.deletion_cold_storage USING btree (id)

## public.follows

RLS enabled: true; forced: false.

Columns: `id` (uuid), `reader_id` (uuid), `series_id` (uuid), `created_at` (timestamp with time zone), `email_notifications` (boolean)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| Creators can view follows on their own series | SELECT | public | (EXISTS ( SELECT 1<br>   FROM series<br>  WHERE ((series.id = follows.series_id) AND (series.creator_id = auth.uid())))) |  |
| Reader can follow | INSERT | public |  | (auth.uid() = reader_id) |
| Reader can unfollow | DELETE | public | (auth.uid() = reader_id) |  |
| Reader can view own follows | SELECT | public | (auth.uid() = reader_id) |  |

Constraints:
- PRIMARY KEY (id)
- UNIQUE (reader_id, series_id)
- FOREIGN KEY (reader_id) REFERENCES auth.users(id) ON DELETE CASCADE
- FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE

Indexes:
- CREATE UNIQUE INDEX follows_pkey ON public.follows USING btree (id)
- CREATE UNIQUE INDEX follows_reader_id_series_id_key ON public.follows USING btree (reader_id, series_id)
- CREATE INDEX follows_series_id_idx ON public.follows USING btree (series_id)

## public.katube_notifications

RLS enabled: true; forced: false.

Columns: `id` (uuid), `recipient_id` (uuid), `actor_id` (uuid), `video_id` (uuid), `read` (boolean), `created_at` (timestamp with time zone), `type` (text)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| katube_notifications_actor_insert | INSERT | authenticated |  | ((auth.uid() = actor_id) AND (actor_id <> recipient_id)) |
| katube_notifications_recipient_read | SELECT | authenticated | (auth.uid() = recipient_id) |  |
| katube_notifications_recipient_update | UPDATE | authenticated | (auth.uid() = recipient_id) | (auth.uid() = recipient_id) |

Constraints:
- CHECK ((type = 'new_upload'::text))
- PRIMARY KEY (id)
- FOREIGN KEY (recipient_id) REFERENCES auth.users(id) ON DELETE CASCADE
- FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL
- FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE

Indexes:
- CREATE UNIQUE INDEX katube_notifications_pkey ON public.katube_notifications USING btree (id)
- CREATE INDEX katube_notifications_recipient_idx ON public.katube_notifications USING btree (recipient_id, created_at DESC)

## public.katube_playlist_videos

RLS enabled: true; forced: false.

Columns: `playlist_id` (uuid), `video_id` (uuid), `position` (integer), `added_at` (timestamp with time zone)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| katube_playlist_videos_owner_delete | DELETE | authenticated | (EXISTS ( SELECT 1<br>   FROM katube_playlists p<br>  WHERE ((p.id = katube_playlist_videos.playlist_id) AND (p.owner_id = auth.uid())))) |  |
| katube_playlist_videos_owner_insert | INSERT | authenticated |  | (EXISTS ( SELECT 1<br>   FROM katube_playlists p<br>  WHERE ((p.id = katube_playlist_videos.playlist_id) AND (p.owner_id = auth.uid())))) |
| katube_playlist_videos_public_read | SELECT | public | true |  |

Constraints:
- FOREIGN KEY (playlist_id) REFERENCES katube_playlists(id) ON DELETE CASCADE
- FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
- PRIMARY KEY (playlist_id, video_id)

Indexes:
- CREATE UNIQUE INDEX katube_playlist_videos_pkey ON public.katube_playlist_videos USING btree (playlist_id, video_id)
- CREATE INDEX katube_playlist_videos_playlist_idx ON public.katube_playlist_videos USING btree (playlist_id, "position")
- CREATE INDEX katube_playlist_videos_video_id_idx ON public.katube_playlist_videos USING btree (video_id)

## public.katube_playlists

RLS enabled: true; forced: false.

Columns: `id` (uuid), `owner_id` (uuid), `created_at` (timestamp with time zone), `title` (text)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| katube_playlists_own_delete | DELETE | authenticated | (auth.uid() = owner_id) |  |
| katube_playlists_own_insert | INSERT | authenticated |  | (auth.uid() = owner_id) |
| katube_playlists_own_update | UPDATE | authenticated | (auth.uid() = owner_id) |  |
| katube_playlists_public_read | SELECT | public | true |  |

Constraints:
- PRIMARY KEY (id)
- FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE

Indexes:
- CREATE UNIQUE INDEX katube_playlists_pkey ON public.katube_playlists USING btree (id)
- CREATE INDEX katube_playlists_owner_idx ON public.katube_playlists USING btree (owner_id, created_at DESC)

## public.katube_watch_progress

RLS enabled: true; forced: false.

Columns: `viewer_id` (uuid), `video_id` (uuid), `position_seconds` (integer), `duration_seconds` (integer), `updated_at` (timestamp with time zone)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| Creators can view watch progress on their own videos | SELECT | public | (EXISTS ( SELECT 1<br>   FROM videos<br>  WHERE ((videos.id = katube_watch_progress.video_id) AND (videos.creator_id = auth.uid())))) |  |
| katube_watch_progress_own_delete | DELETE | authenticated | (auth.uid() = viewer_id) |  |
| katube_watch_progress_own_insert | INSERT | authenticated |  | (auth.uid() = viewer_id) |
| katube_watch_progress_own_read | SELECT | authenticated | (auth.uid() = viewer_id) |  |
| katube_watch_progress_own_update | UPDATE | authenticated | (auth.uid() = viewer_id) |  |

Constraints:
- PRIMARY KEY (viewer_id, video_id)
- FOREIGN KEY (viewer_id) REFERENCES auth.users(id) ON DELETE CASCADE
- FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE

Indexes:
- CREATE UNIQUE INDEX katube_watch_progress_pkey ON public.katube_watch_progress USING btree (viewer_id, video_id)
- CREATE INDEX katube_watch_progress_viewer_idx ON public.katube_watch_progress USING btree (viewer_id, updated_at DESC)

## public.kcircle_broadcast_comments

RLS enabled: true; forced: false.

Columns: `id` (uuid), `message_id` (uuid), `author_id` (uuid), `created_at` (timestamp with time zone), `text` (text)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| kcircle_broadcast_comments_own_delete | DELETE | authenticated | (auth.uid() = author_id) |  |
| kcircle_broadcast_comments_own_insert | INSERT | authenticated |  | ((auth.uid() = author_id) AND (EXISTS ( SELECT 1<br>   FROM (kcircle_messages m<br>     JOIN kcircle_conversations c ON ((c.id = m.conversation_id)))<br>  WHERE ((m.id = kcircle_broadcast_comments.message_id) AND c.is_broadcast)))) |
| kcircle_broadcast_comments_public_read | SELECT | authenticated | true |  |

Constraints:
- PRIMARY KEY (id)
- FOREIGN KEY (message_id) REFERENCES kcircle_messages(id) ON DELETE CASCADE
- FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE CASCADE

Indexes:
- CREATE UNIQUE INDEX kcircle_broadcast_comments_pkey ON public.kcircle_broadcast_comments USING btree (id)
- CREATE INDEX kcircle_broadcast_comments_message_id_idx ON public.kcircle_broadcast_comments USING btree (message_id)

## public.kcircle_broadcast_likes

RLS enabled: true; forced: false.

Columns: `message_id` (uuid), `liker_id` (uuid), `created_at` (timestamp with time zone)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| kcircle_broadcast_likes_own_delete | DELETE | authenticated | (auth.uid() = liker_id) |  |
| kcircle_broadcast_likes_own_insert | INSERT | authenticated |  | ((auth.uid() = liker_id) AND (EXISTS ( SELECT 1<br>   FROM (kcircle_messages m<br>     JOIN kcircle_conversations c ON ((c.id = m.conversation_id)))<br>  WHERE ((m.id = kcircle_broadcast_likes.message_id) AND c.is_broadcast)))) |
| kcircle_broadcast_likes_public_read | SELECT | authenticated | true |  |

Constraints:
- PRIMARY KEY (message_id, liker_id)
- FOREIGN KEY (message_id) REFERENCES kcircle_messages(id) ON DELETE CASCADE
- FOREIGN KEY (liker_id) REFERENCES auth.users(id) ON DELETE CASCADE

Indexes:
- CREATE UNIQUE INDEX kcircle_broadcast_likes_pkey ON public.kcircle_broadcast_likes USING btree (message_id, liker_id)

## public.kcircle_channel_messages

RLS enabled: true; forced: false.

Columns: `id` (uuid), `channel_id` (uuid), `author_id` (uuid), `created_at` (timestamp with time zone), `text` (text), `image_url` (text)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| kcircle_channel_messages_own_delete | DELETE | authenticated | (auth.uid() = author_id) |  |
| kcircle_channel_messages_own_insert | INSERT | authenticated |  | ((auth.uid() = author_id) AND (EXISTS ( SELECT 1<br>   FROM kcircle_group_channels c<br>  WHERE ((c.id = kcircle_channel_messages.channel_id) AND kcircle_is_group_participant(c.conversation_id))))) |
| kcircle_channel_messages_participant_read | SELECT | public | (EXISTS ( SELECT 1<br>   FROM kcircle_group_channels c<br>  WHERE ((c.id = kcircle_channel_messages.channel_id) AND kcircle_is_group_participant(c.conversation_id)))) |  |

Constraints:
- PRIMARY KEY (id)
- FOREIGN KEY (channel_id) REFERENCES kcircle_group_channels(id) ON DELETE CASCADE
- FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE CASCADE

Indexes:
- CREATE UNIQUE INDEX kcircle_channel_messages_pkey ON public.kcircle_channel_messages USING btree (id)
- CREATE INDEX kcircle_channel_messages_channel_id_idx ON public.kcircle_channel_messages USING btree (channel_id, created_at DESC)

## public.kcircle_channel_overwrites

RLS enabled: true; forced: false.

Columns: `channel_id` (uuid), `role_id` (uuid), `allow` (bigint), `deny` (bigint)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| kcircle_channel_overwrites_manage_delete | DELETE | authenticated | (EXISTS ( SELECT 1<br>   FROM (kcircle_group_channels c<br>     JOIN kcircle_group_roles r ON ((r.id = kcircle_channel_overwrites.role_id)))<br>  WHERE ((c.id = kcircle_channel_overwrites.channel_id) AND (r.conversation_id = c.conversation_id) AND kcircle_is_group_participant(c.conversation_id) AND kcircle_has_permission(c.conversation_id, 16) AND (kcircle_has_permission(c.conversation_id, 128) OR (r."position" < kcircle_my_highest_role_position(c.conversation_id)))))) |  |
| kcircle_channel_overwrites_manage_update | UPDATE | authenticated | (EXISTS ( SELECT 1<br>   FROM (kcircle_group_channels c<br>     JOIN kcircle_group_roles r ON ((r.id = kcircle_channel_overwrites.role_id)))<br>  WHERE ((c.id = kcircle_channel_overwrites.channel_id) AND (r.conversation_id = c.conversation_id) AND kcircle_is_group_participant(c.conversation_id) AND kcircle_has_permission(c.conversation_id, 16) AND (kcircle_has_permission(c.conversation_id, 128) OR (r."position" < kcircle_my_highest_role_position(c.conversation_id)))))) | (EXISTS ( SELECT 1<br>   FROM (kcircle_group_channels c<br>     JOIN kcircle_group_roles r ON ((r.id = kcircle_channel_overwrites.role_id)))<br>  WHERE ((c.id = kcircle_channel_overwrites.channel_id) AND (r.conversation_id = c.conversation_id) AND kcircle_is_group_participant(c.conversation_id) AND kcircle_has_permission(c.conversation_id, 16) AND (kcircle_has_permission(c.conversation_id, 128) OR (r."position" < kcircle_my_highest_role_position(c.conversation_id)))))) |
| kcircle_channel_overwrites_manage_write | INSERT | authenticated |  | (EXISTS ( SELECT 1<br>   FROM (kcircle_group_channels c<br>     JOIN kcircle_group_roles r ON ((r.id = kcircle_channel_overwrites.role_id)))<br>  WHERE ((c.id = kcircle_channel_overwrites.channel_id) AND (r.conversation_id = c.conversation_id) AND kcircle_is_group_participant(c.conversation_id) AND kcircle_has_permission(c.conversation_id, 16) AND (kcircle_has_permission(c.conversation_id, 128) OR (r."position" < kcircle_my_highest_role_position(c.conversation_id)))))) |
| kcircle_channel_overwrites_participant_read | SELECT | public | (EXISTS ( SELECT 1<br>   FROM kcircle_group_channels c<br>  WHERE ((c.id = kcircle_channel_overwrites.channel_id) AND kcircle_is_group_participant(c.conversation_id)))) |  |

Constraints:
- PRIMARY KEY (channel_id, role_id)
- FOREIGN KEY (channel_id) REFERENCES kcircle_group_channels(id) ON DELETE CASCADE
- FOREIGN KEY (role_id) REFERENCES kcircle_group_roles(id) ON DELETE CASCADE

Indexes:
- CREATE UNIQUE INDEX kcircle_channel_overwrites_pkey ON public.kcircle_channel_overwrites USING btree (channel_id, role_id)

## public.kcircle_channel_role_overrides

RLS enabled: true; forced: false.

Columns: `channel_id` (uuid), `role_id` (uuid), `allow_view` (boolean), `allow_send` (boolean)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| kcircle_channel_role_overrides_manage_delete | DELETE | authenticated | (EXISTS ( SELECT 1<br>   FROM kcircle_server_channels c<br>  WHERE ((c.id = kcircle_channel_role_overrides.channel_id) AND (kcircle_user_has_server_permission(c.server_id, auth.uid(), 'manage_channels'::text) OR kcircle_user_has_server_permission(c.server_id, auth.uid(), 'manage_roles'::text))))) |  |
| kcircle_channel_role_overrides_manage_insert | INSERT | authenticated |  | (EXISTS ( SELECT 1<br>   FROM kcircle_server_channels c<br>  WHERE ((c.id = kcircle_channel_role_overrides.channel_id) AND (kcircle_user_has_server_permission(c.server_id, auth.uid(), 'manage_channels'::text) OR kcircle_user_has_server_permission(c.server_id, auth.uid(), 'manage_roles'::text))))) |
| kcircle_channel_role_overrides_manage_update | UPDATE | authenticated | (EXISTS ( SELECT 1<br>   FROM kcircle_server_channels c<br>  WHERE ((c.id = kcircle_channel_role_overrides.channel_id) AND (kcircle_user_has_server_permission(c.server_id, auth.uid(), 'manage_channels'::text) OR kcircle_user_has_server_permission(c.server_id, auth.uid(), 'manage_roles'::text))))) |  |
| kcircle_channel_role_overrides_read | SELECT | authenticated | kcircle_user_can_view_channel(channel_id, auth.uid()) |  |

Constraints:
- PRIMARY KEY (channel_id, role_id)
- FOREIGN KEY (channel_id) REFERENCES kcircle_server_channels(id) ON DELETE CASCADE
- FOREIGN KEY (role_id) REFERENCES kcircle_server_roles(id) ON DELETE CASCADE

Indexes:
- CREATE UNIQUE INDEX kcircle_channel_role_overrides_pkey ON public.kcircle_channel_role_overrides USING btree (channel_id, role_id)

## public.kcircle_close_friends

RLS enabled: true; forced: false.

Columns: `user_id` (uuid), `friend_id` (uuid), `created_at` (timestamp with time zone)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| kcircle_close_friends_owner_all | ALL | public | (auth.uid() = user_id) | (auth.uid() = user_id) |

Constraints:
- CHECK ((user_id <> friend_id))
- PRIMARY KEY (user_id, friend_id)
- FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
- FOREIGN KEY (friend_id) REFERENCES auth.users(id) ON DELETE CASCADE

Indexes:
- CREATE UNIQUE INDEX kcircle_close_friends_pkey ON public.kcircle_close_friends USING btree (user_id, friend_id)

## public.kcircle_conversation_participants

RLS enabled: true; forced: false.

Columns: `conversation_id` (uuid), `user_id` (uuid), `history_enabled` (boolean)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| kcircle_participants_own_insert | INSERT | authenticated |  | ((auth.uid() = user_id) OR (EXISTS ( SELECT 1<br>   FROM kcircle_conversation_participants p<br>  WHERE ((p.conversation_id = kcircle_conversation_participants.conversation_id) AND (p.user_id = auth.uid()))))) |
| kcircle_participants_own_or_participant_delete | DELETE | authenticated | ((auth.uid() = user_id) OR (EXISTS ( SELECT 1<br>   FROM kcircle_conversation_participants p<br>  WHERE ((p.conversation_id = kcircle_conversation_participants.conversation_id) AND (p.user_id = auth.uid()))))) |  |
| kcircle_participants_self_read | SELECT | public | (EXISTS ( SELECT 1<br>   FROM kcircle_conversation_participants p2<br>  WHERE ((p2.conversation_id = kcircle_conversation_participants.conversation_id) AND (p2.user_id = auth.uid())))) |  |

Constraints:
- PRIMARY KEY (conversation_id, user_id)
- FOREIGN KEY (conversation_id) REFERENCES kcircle_conversations(id) ON DELETE CASCADE
- FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE

Indexes:
- CREATE UNIQUE INDEX kcircle_conversation_participants_pkey ON public.kcircle_conversation_participants USING btree (conversation_id, user_id)
- CREATE INDEX kcircle_conversation_participants_user_id_idx ON public.kcircle_conversation_participants USING btree (user_id)

## public.kcircle_conversations

RLS enabled: true; forced: false.

Columns: `id` (uuid), `created_at` (timestamp with time zone), `last_message_at` (timestamp with time zone), `is_group` (boolean), `created_by` (uuid), `is_broadcast` (boolean), `is_watch_thread` (boolean), `is_creator_lounge` (boolean), `name` (text), `title` (text), `participant_key` (text)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| kcircle_conversations_authenticated_insert | INSERT | authenticated |  | ((NOT is_broadcast) OR (created_by = auth.uid())) |
| kcircle_conversations_broadcast_public_read | SELECT | authenticated | is_broadcast |  |
| kcircle_conversations_participant_read | SELECT | public | (EXISTS ( SELECT 1<br>   FROM kcircle_conversation_participants p<br>  WHERE ((p.conversation_id = kcircle_conversations.id) AND (p.user_id = auth.uid())))) |  |
| kcircle_conversations_participant_update | UPDATE | authenticated | (EXISTS ( SELECT 1<br>   FROM kcircle_conversation_participants p<br>  WHERE ((p.conversation_id = kcircle_conversations.id) AND (p.user_id = auth.uid())))) |  |

Constraints:
- PRIMARY KEY (id)
- FOREIGN KEY (created_by) REFERENCES auth.users(id)

Indexes:
- CREATE UNIQUE INDEX kcircle_conversations_pkey ON public.kcircle_conversations USING btree (id)
- CREATE UNIQUE INDEX kcircle_conversations_one_broadcast_per_creator ON public.kcircle_conversations USING btree (created_by) WHERE is_broadcast
- CREATE UNIQUE INDEX kcircle_conversations_watch_thread_key_idx ON public.kcircle_conversations USING btree (participant_key) WHERE is_watch_thread
- CREATE UNIQUE INDEX kcircle_conversations_one_lounge_idx ON public.kcircle_conversations USING btree (is_creator_lounge) WHERE is_creator_lounge

## public.kcircle_group_channels

RLS enabled: true; forced: false.

Columns: `id` (uuid), `conversation_id` (uuid), `position` (integer), `created_by` (uuid), `created_at` (timestamp with time zone), `name` (text), `topic` (text)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| kcircle_group_channels_manage_delete | DELETE | authenticated | (kcircle_is_group_participant(conversation_id) AND kcircle_has_permission(conversation_id, 8)) |  |
| kcircle_group_channels_manage_update | UPDATE | authenticated | (kcircle_is_group_participant(conversation_id) AND kcircle_has_permission(conversation_id, 8)) | (kcircle_is_group_participant(conversation_id) AND kcircle_has_permission(conversation_id, 8)) |
| kcircle_group_channels_manage_write | INSERT | authenticated |  | (kcircle_is_group_participant(conversation_id) AND kcircle_has_permission(conversation_id, 8)) |
| kcircle_group_channels_participant_read | SELECT | public | kcircle_is_group_participant(conversation_id) |  |

Constraints:
- PRIMARY KEY (id)
- FOREIGN KEY (conversation_id) REFERENCES kcircle_conversations(id) ON DELETE CASCADE
- FOREIGN KEY (created_by) REFERENCES auth.users(id)

Indexes:
- CREATE UNIQUE INDEX kcircle_group_channels_pkey ON public.kcircle_group_channels USING btree (id)
- CREATE INDEX kcircle_group_channels_conversation_id_idx ON public.kcircle_group_channels USING btree (conversation_id)

## public.kcircle_group_role_members

RLS enabled: true; forced: false.

Columns: `role_id` (uuid), `user_id` (uuid), `created_at` (timestamp with time zone)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| kcircle_group_role_members_manage_delete | DELETE | authenticated | (EXISTS ( SELECT 1<br>   FROM kcircle_group_roles r<br>  WHERE ((r.id = kcircle_group_role_members.role_id) AND kcircle_is_group_participant(r.conversation_id) AND kcircle_has_permission(r.conversation_id, 16) AND (kcircle_has_permission(r.conversation_id, 128) OR (r."position" < kcircle_my_highest_role_position(r.conversation_id)))))) |  |
| kcircle_group_role_members_manage_write | INSERT | authenticated |  | (EXISTS ( SELECT 1<br>   FROM kcircle_group_roles r<br>  WHERE ((r.id = kcircle_group_role_members.role_id) AND kcircle_is_group_participant(r.conversation_id) AND kcircle_has_permission(r.conversation_id, 16) AND (kcircle_has_permission(r.conversation_id, 128) OR (r."position" < kcircle_my_highest_role_position(r.conversation_id)))))) |
| kcircle_group_role_members_participant_read | SELECT | public | (EXISTS ( SELECT 1<br>   FROM kcircle_group_roles r<br>  WHERE ((r.id = kcircle_group_role_members.role_id) AND kcircle_is_group_participant(r.conversation_id)))) |  |

Constraints:
- PRIMARY KEY (role_id, user_id)
- FOREIGN KEY (role_id) REFERENCES kcircle_group_roles(id) ON DELETE CASCADE
- FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE

Indexes:
- CREATE UNIQUE INDEX kcircle_group_role_members_pkey ON public.kcircle_group_role_members USING btree (role_id, user_id)

## public.kcircle_group_roles

RLS enabled: true; forced: false.

Columns: `id` (uuid), `conversation_id` (uuid), `position` (integer), `permissions` (bigint), `is_default` (boolean), `created_at` (timestamp with time zone), `name` (text), `color` (text)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| kcircle_group_roles_manage_delete | DELETE | authenticated | (kcircle_is_group_participant(conversation_id) AND (NOT is_default) AND kcircle_has_permission(conversation_id, 16) AND (kcircle_has_permission(conversation_id, 128) OR ("position" < kcircle_my_highest_role_position(conversation_id)))) |  |
| kcircle_group_roles_manage_update | UPDATE | authenticated | (kcircle_is_group_participant(conversation_id) AND kcircle_has_permission(conversation_id, 16) AND (kcircle_has_permission(conversation_id, 128) OR ("position" < kcircle_my_highest_role_position(conversation_id)))) | (kcircle_is_group_participant(conversation_id) AND kcircle_has_permission(conversation_id, 16) AND (kcircle_has_permission(conversation_id, 128) OR ("position" < kcircle_my_highest_role_position(conversation_id)))) |
| kcircle_group_roles_manage_write | INSERT | authenticated |  | (kcircle_is_group_participant(conversation_id) AND kcircle_has_permission(conversation_id, 16) AND (kcircle_has_permission(conversation_id, 128) OR ("position" < kcircle_my_highest_role_position(conversation_id)))) |
| kcircle_group_roles_participant_read | SELECT | public | kcircle_is_group_participant(conversation_id) |  |

Constraints:
- PRIMARY KEY (id)
- FOREIGN KEY (conversation_id) REFERENCES kcircle_conversations(id) ON DELETE CASCADE

Indexes:
- CREATE UNIQUE INDEX kcircle_group_roles_pkey ON public.kcircle_group_roles USING btree (id)
- CREATE INDEX kcircle_group_roles_conversation_id_idx ON public.kcircle_group_roles USING btree (conversation_id)
- CREATE UNIQUE INDEX kcircle_group_roles_one_default_idx ON public.kcircle_group_roles USING btree (conversation_id) WHERE is_default

## public.kcircle_message_hidden_for

RLS enabled: true; forced: false.

Columns: `message_id` (uuid), `user_id` (uuid), `created_at` (timestamp with time zone)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| kcircle_message_hidden_for_own_delete | DELETE | authenticated | (auth.uid() = user_id) |  |
| kcircle_message_hidden_for_own_insert | INSERT | authenticated |  | ((auth.uid() = user_id) AND (EXISTS ( SELECT 1<br>   FROM (kcircle_messages m<br>     JOIN kcircle_conversation_participants p ON ((p.conversation_id = m.conversation_id)))<br>  WHERE ((m.id = kcircle_message_hidden_for.message_id) AND (p.user_id = auth.uid()))))) |
| kcircle_message_hidden_for_own_read | SELECT | authenticated | (auth.uid() = user_id) |  |

Constraints:
- PRIMARY KEY (message_id, user_id)
- FOREIGN KEY (message_id) REFERENCES kcircle_messages(id) ON DELETE CASCADE
- FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE

Indexes:
- CREATE UNIQUE INDEX kcircle_message_hidden_for_pkey ON public.kcircle_message_hidden_for USING btree (message_id, user_id)

## public.kcircle_messages

RLS enabled: true; forced: false.

Columns: `id` (uuid), `conversation_id` (uuid), `sender_id` (uuid), `created_at` (timestamp with time zone), `short_ref_id` (uuid), `text` (text), `attachment_url` (text), `attachment_type` (text)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| kcircle_messages_broadcast_owner_insert | INSERT | authenticated |  | ((auth.uid() = sender_id) AND (EXISTS ( SELECT 1<br>   FROM kcircle_conversations c<br>  WHERE ((c.id = kcircle_messages.conversation_id) AND c.is_broadcast AND (c.created_by = auth.uid()))))) |
| kcircle_messages_broadcast_public_read | SELECT | authenticated | (EXISTS ( SELECT 1<br>   FROM kcircle_conversations c<br>  WHERE ((c.id = kcircle_messages.conversation_id) AND c.is_broadcast))) |  |
| kcircle_messages_participant_insert | INSERT | authenticated |  | ((auth.uid() = sender_id) AND (EXISTS ( SELECT 1<br>   FROM kcircle_conversation_participants p<br>  WHERE ((p.conversation_id = kcircle_messages.conversation_id) AND (p.user_id = auth.uid()))))) |
| kcircle_messages_participant_read | SELECT | public | (EXISTS ( SELECT 1<br>   FROM kcircle_conversation_participants p<br>  WHERE ((p.conversation_id = kcircle_messages.conversation_id) AND (p.user_id = auth.uid())))) |  |
| kcircle_messages_watch_thread_participant_delete | DELETE | authenticated | (EXISTS ( SELECT 1<br>   FROM (kcircle_conversations c<br>     JOIN kcircle_conversation_participants p ON ((p.conversation_id = c.id)))<br>  WHERE ((c.id = kcircle_messages.conversation_id) AND (c.is_watch_thread = true) AND (p.user_id = auth.uid())))) |  |

Constraints:
- PRIMARY KEY (id)
- FOREIGN KEY (conversation_id) REFERENCES kcircle_conversations(id) ON DELETE CASCADE
- FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE CASCADE
- CHECK (((attachment_type = 'image'::text) OR (attachment_type IS NULL)))
- CHECK (((text IS NOT NULL) OR (attachment_url IS NOT NULL)))
- FOREIGN KEY (short_ref_id) REFERENCES videos(id) ON DELETE SET NULL

Indexes:
- CREATE UNIQUE INDEX kcircle_messages_pkey ON public.kcircle_messages USING btree (id)
- CREATE INDEX kcircle_messages_conversation_id_idx ON public.kcircle_messages USING btree (conversation_id, created_at)
- CREATE INDEX kcircle_messages_short_ref_id_idx ON public.kcircle_messages USING btree (short_ref_id) WHERE (short_ref_id IS NOT NULL)

## public.kcircle_notifications

RLS enabled: true; forced: false.

Columns: `id` (uuid), `recipient_id` (uuid), `actor_id` (uuid), `post_id` (uuid), `conversation_id` (uuid), `read` (boolean), `created_at` (timestamp with time zone), `room_id` (uuid), `type` (text), `preview` (text)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| kcircle_notifications_actor_insert | INSERT | authenticated |  | ((auth.uid() = actor_id) AND (actor_id <> recipient_id)) |
| kcircle_notifications_recipient_read | SELECT | authenticated | (auth.uid() = recipient_id) |  |
| kcircle_notifications_recipient_update | UPDATE | authenticated | (auth.uid() = recipient_id) | (auth.uid() = recipient_id) |

Constraints:
- PRIMARY KEY (id)
- FOREIGN KEY (recipient_id) REFERENCES auth.users(id) ON DELETE CASCADE
- FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL
- FOREIGN KEY (post_id) REFERENCES kcircle_posts(id) ON DELETE CASCADE
- FOREIGN KEY (conversation_id) REFERENCES kcircle_conversations(id) ON DELETE CASCADE
- FOREIGN KEY (room_id) REFERENCES watch_rooms(id) ON DELETE CASCADE
- CHECK ((type = ANY (ARRAY['like'::text, 'comment'::text, 'message'::text, 'group_add'::text, 'broadcast'::text, 'watch_invite'::text])))

Indexes:
- CREATE UNIQUE INDEX kcircle_notifications_pkey ON public.kcircle_notifications USING btree (id)
- CREATE INDEX kcircle_notifications_recipient_idx ON public.kcircle_notifications USING btree (recipient_id, created_at DESC)

## public.kcircle_poll_options

RLS enabled: true; forced: false.

Columns: `id` (uuid), `post_id` (uuid), `position` (integer), `option_text` (text)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| kcircle_poll_options_author_insert | INSERT | authenticated |  | (EXISTS ( SELECT 1<br>   FROM kcircle_posts p<br>  WHERE ((p.id = kcircle_poll_options.post_id) AND (p.author_id = auth.uid())))) |
| kcircle_poll_options_public_read | SELECT | public | true |  |

Constraints:
- PRIMARY KEY (id)
- FOREIGN KEY (post_id) REFERENCES kcircle_posts(id) ON DELETE CASCADE

Indexes:
- CREATE UNIQUE INDEX kcircle_poll_options_pkey ON public.kcircle_poll_options USING btree (id)
- CREATE INDEX kcircle_poll_options_post_id_idx ON public.kcircle_poll_options USING btree (post_id)

## public.kcircle_poll_votes

RLS enabled: true; forced: false.

Columns: `post_id` (uuid), `option_id` (uuid), `voter_id` (uuid), `created_at` (timestamp with time zone)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| kcircle_poll_votes_own_delete | DELETE | authenticated | (auth.uid() = voter_id) |  |
| kcircle_poll_votes_own_insert | INSERT | authenticated |  | (auth.uid() = voter_id) |
| kcircle_poll_votes_own_update | UPDATE | authenticated | (auth.uid() = voter_id) | (auth.uid() = voter_id) |
| kcircle_poll_votes_public_read | SELECT | public | true |  |

Constraints:
- PRIMARY KEY (post_id, voter_id)
- FOREIGN KEY (post_id) REFERENCES kcircle_posts(id) ON DELETE CASCADE
- FOREIGN KEY (option_id) REFERENCES kcircle_poll_options(id) ON DELETE CASCADE
- FOREIGN KEY (voter_id) REFERENCES auth.users(id) ON DELETE CASCADE

Indexes:
- CREATE UNIQUE INDEX kcircle_poll_votes_pkey ON public.kcircle_poll_votes USING btree (post_id, voter_id)

## public.kcircle_post_comment_likes

RLS enabled: true; forced: false.

Columns: `comment_id` (uuid), `liker_id` (uuid), `created_at` (timestamp with time zone)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| kcircle_post_comment_likes_own_delete | DELETE | authenticated | (auth.uid() = liker_id) |  |
| kcircle_post_comment_likes_own_insert | INSERT | authenticated |  | (auth.uid() = liker_id) |
| kcircle_post_comment_likes_public_read | SELECT | public | true |  |

Constraints:
- PRIMARY KEY (comment_id, liker_id)
- FOREIGN KEY (comment_id) REFERENCES kcircle_post_comments(id) ON DELETE CASCADE
- FOREIGN KEY (liker_id) REFERENCES auth.users(id) ON DELETE CASCADE

Indexes:
- CREATE UNIQUE INDEX kcircle_post_comment_likes_pkey ON public.kcircle_post_comment_likes USING btree (comment_id, liker_id)
- CREATE INDEX kcircle_post_comment_likes_comment_id_idx ON public.kcircle_post_comment_likes USING btree (comment_id)

## public.kcircle_post_comments

RLS enabled: true; forced: false.

Columns: `id` (uuid), `post_id` (uuid), `author_id` (uuid), `created_at` (timestamp with time zone), `text` (text)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| kcircle_comments_own_delete | DELETE | authenticated | (auth.uid() = author_id) |  |
| kcircle_comments_own_insert | INSERT | authenticated |  | (auth.uid() = author_id) |
| kcircle_comments_public_read | SELECT | public | true |  |

Constraints:
- PRIMARY KEY (id)
- FOREIGN KEY (post_id) REFERENCES kcircle_posts(id) ON DELETE CASCADE
- FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE CASCADE

Indexes:
- CREATE UNIQUE INDEX kcircle_post_comments_pkey ON public.kcircle_post_comments USING btree (id)
- CREATE INDEX kcircle_comments_post_id_idx ON public.kcircle_post_comments USING btree (post_id)

## public.kcircle_post_likes

RLS enabled: true; forced: false.

Columns: `post_id` (uuid), `liker_id` (uuid), `created_at` (timestamp with time zone)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| kcircle_post_likes_own_delete | DELETE | authenticated | (auth.uid() = liker_id) |  |
| kcircle_post_likes_own_insert | INSERT | authenticated |  | (auth.uid() = liker_id) |
| kcircle_post_likes_public_read | SELECT | public | true |  |

Constraints:
- PRIMARY KEY (post_id, liker_id)
- FOREIGN KEY (post_id) REFERENCES kcircle_posts(id) ON DELETE CASCADE
- FOREIGN KEY (liker_id) REFERENCES auth.users(id) ON DELETE CASCADE

Indexes:
- CREATE UNIQUE INDEX kcircle_post_likes_pkey ON public.kcircle_post_likes USING btree (post_id, liker_id)

## public.kcircle_posts

RLS enabled: true; forced: false.

Columns: `id` (uuid), `author_id` (uuid), `created_at` (timestamp with time zone), `pinned_by` (uuid), `pinned_at` (timestamp with time zone), `caption` (text), `image_url` (text), `tag` (text), `link_url` (text), `link_label` (text), `image_urls` (ARRAY)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| kcircle_posts_own_delete | DELETE | authenticated | (auth.uid() = author_id) |  |
| kcircle_posts_own_insert | INSERT | authenticated |  | (auth.uid() = author_id) |
| kcircle_posts_own_update | UPDATE | authenticated | (auth.uid() = author_id) |  |
| kcircle_posts_public_read | SELECT | public | true |  |

Constraints:
- PRIMARY KEY (id)
- FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE CASCADE
- FOREIGN KEY (pinned_by) REFERENCES auth.users(id) ON DELETE SET NULL

Indexes:
- CREATE UNIQUE INDEX kcircle_posts_pkey ON public.kcircle_posts USING btree (id)
- CREATE INDEX kcircle_posts_author_id_idx ON public.kcircle_posts USING btree (author_id)
- CREATE INDEX kcircle_posts_created_at_idx ON public.kcircle_posts USING btree (created_at DESC)

## public.kcircle_saved_posts

RLS enabled: true; forced: false.

Columns: `user_id` (uuid), `post_id` (uuid), `created_at` (timestamp with time zone)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| kcircle_saved_posts_owner_all | ALL | public | (auth.uid() = user_id) | (auth.uid() = user_id) |

Constraints:
- PRIMARY KEY (user_id, post_id)
- FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
- FOREIGN KEY (post_id) REFERENCES kcircle_posts(id) ON DELETE CASCADE

Indexes:
- CREATE UNIQUE INDEX kcircle_saved_posts_pkey ON public.kcircle_saved_posts USING btree (user_id, post_id)
- CREATE INDEX kcircle_saved_posts_post_id_idx ON public.kcircle_saved_posts USING btree (post_id)

## public.kcircle_server_channels

RLS enabled: true; forced: false.

Columns: `id` (uuid), `server_id` (uuid), `position` (integer), `created_at` (timestamp with time zone), `name` (text)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| kcircle_server_channels_manage_delete | DELETE | authenticated | kcircle_user_has_server_permission(server_id, auth.uid(), 'manage_channels'::text) |  |
| kcircle_server_channels_manage_insert | INSERT | authenticated |  | kcircle_user_has_server_permission(server_id, auth.uid(), 'manage_channels'::text) |
| kcircle_server_channels_manage_update | UPDATE | authenticated | kcircle_user_has_server_permission(server_id, auth.uid(), 'manage_channels'::text) |  |
| kcircle_server_channels_visible_read | SELECT | authenticated | ((EXISTS ( SELECT 1<br>   FROM kcircle_server_members m<br>  WHERE ((m.server_id = kcircle_server_channels.server_id) AND (m.user_id = auth.uid())))) AND kcircle_user_can_view_channel(id, auth.uid())) |  |

Constraints:
- PRIMARY KEY (id)
- FOREIGN KEY (server_id) REFERENCES kcircle_servers(id) ON DELETE CASCADE

Indexes:
- CREATE UNIQUE INDEX kcircle_server_channels_pkey ON public.kcircle_server_channels USING btree (id)

## public.kcircle_server_member_roles

RLS enabled: true; forced: false.

Columns: `server_id` (uuid), `user_id` (uuid), `role_id` (uuid)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| kcircle_server_member_roles_manage_delete | DELETE | authenticated | kcircle_user_has_server_permission(server_id, auth.uid(), 'manage_roles'::text) |  |
| kcircle_server_member_roles_manage_insert | INSERT | authenticated |  | kcircle_user_has_server_permission(server_id, auth.uid(), 'manage_roles'::text) |
| kcircle_server_member_roles_public_read | SELECT | authenticated | true |  |

Constraints:
- PRIMARY KEY (server_id, user_id, role_id)
- FOREIGN KEY (role_id) REFERENCES kcircle_server_roles(id) ON DELETE CASCADE
- FOREIGN KEY (server_id, user_id) REFERENCES kcircle_server_members(server_id, user_id) ON DELETE CASCADE

Indexes:
- CREATE UNIQUE INDEX kcircle_server_member_roles_pkey ON public.kcircle_server_member_roles USING btree (server_id, user_id, role_id)

## public.kcircle_server_members

RLS enabled: true; forced: false.

Columns: `server_id` (uuid), `user_id` (uuid), `joined_at` (timestamp with time zone)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| kcircle_server_members_leave_or_kick | DELETE | authenticated | ((user_id = auth.uid()) OR kcircle_user_has_server_permission(server_id, auth.uid(), 'kick_members'::text)) |  |
| kcircle_server_members_public_read | SELECT | authenticated | true |  |
| kcircle_server_members_self_join | INSERT | authenticated |  | (user_id = auth.uid()) |

Constraints:
- PRIMARY KEY (server_id, user_id)
- FOREIGN KEY (server_id) REFERENCES kcircle_servers(id) ON DELETE CASCADE
- FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE

Indexes:
- CREATE UNIQUE INDEX kcircle_server_members_pkey ON public.kcircle_server_members USING btree (server_id, user_id)

## public.kcircle_server_roles

RLS enabled: true; forced: false.

Columns: `id` (uuid), `server_id` (uuid), `position` (integer), `permissions` (jsonb), `is_default` (boolean), `created_at` (timestamp with time zone), `name` (text), `color` (text)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| kcircle_server_roles_manage_delete | DELETE | authenticated | (kcircle_user_has_server_permission(server_id, auth.uid(), 'manage_roles'::text) AND (NOT is_default)) |  |
| kcircle_server_roles_manage_insert | INSERT | authenticated |  | kcircle_user_has_server_permission(server_id, auth.uid(), 'manage_roles'::text) |
| kcircle_server_roles_manage_update | UPDATE | authenticated | kcircle_user_has_server_permission(server_id, auth.uid(), 'manage_roles'::text) |  |
| kcircle_server_roles_public_read | SELECT | authenticated | true |  |

Constraints:
- PRIMARY KEY (id)
- FOREIGN KEY (server_id) REFERENCES kcircle_servers(id) ON DELETE CASCADE

Indexes:
- CREATE UNIQUE INDEX kcircle_server_roles_pkey ON public.kcircle_server_roles USING btree (id)
- CREATE UNIQUE INDEX kcircle_server_roles_one_default ON public.kcircle_server_roles USING btree (server_id) WHERE is_default

## public.kcircle_servers

RLS enabled: true; forced: false.

Columns: `id` (uuid), `owner_id` (uuid), `created_at` (timestamp with time zone), `name` (text), `description` (text)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| kcircle_servers_owner_delete | DELETE | authenticated | (owner_id = auth.uid()) |  |
| kcircle_servers_owner_insert | INSERT | authenticated |  | (owner_id = auth.uid()) |
| kcircle_servers_owner_update | UPDATE | authenticated | (owner_id = auth.uid()) |  |
| kcircle_servers_public_read | SELECT | authenticated | true |  |

Constraints:
- PRIMARY KEY (id)
- FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE

Indexes:
- CREATE UNIQUE INDEX kcircle_servers_pkey ON public.kcircle_servers USING btree (id)

## public.kcircle_stories

RLS enabled: true; forced: false.

Columns: `id` (uuid), `author_id` (uuid), `created_at` (timestamp with time zone), `expires_at` (timestamp with time zone), `close_friends_only` (boolean), `image_url` (text)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| kcircle_stories_own_delete | DELETE | authenticated | (auth.uid() = author_id) |  |
| kcircle_stories_own_insert | INSERT | authenticated |  | (auth.uid() = author_id) |
| kcircle_stories_public_read | SELECT | public | ((expires_at > now()) AND ((NOT close_friends_only) OR (auth.uid() = author_id) OR (EXISTS ( SELECT 1<br>   FROM kcircle_close_friends cf<br>  WHERE ((cf.user_id = kcircle_stories.author_id) AND (cf.friend_id = auth.uid())))))) |  |

Constraints:
- PRIMARY KEY (id)
- FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE CASCADE

Indexes:
- CREATE UNIQUE INDEX kcircle_stories_pkey ON public.kcircle_stories USING btree (id)
- CREATE INDEX kcircle_stories_author_id_idx ON public.kcircle_stories USING btree (author_id)
- CREATE INDEX kcircle_stories_expires_at_idx ON public.kcircle_stories USING btree (expires_at)

## public.kcircle_story_views

RLS enabled: true; forced: false.

Columns: `story_id` (uuid), `viewer_id` (uuid), `created_at` (timestamp with time zone)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| kcircle_story_views_own_insert | INSERT | authenticated |  | (auth.uid() = viewer_id) |
| kcircle_story_views_public_read | SELECT | public | true |  |

Constraints:
- PRIMARY KEY (story_id, viewer_id)
- FOREIGN KEY (story_id) REFERENCES kcircle_stories(id) ON DELETE CASCADE
- FOREIGN KEY (viewer_id) REFERENCES auth.users(id) ON DELETE CASCADE

Indexes:
- CREATE UNIQUE INDEX kcircle_story_views_pkey ON public.kcircle_story_views USING btree (story_id, viewer_id)
- CREATE INDEX kcircle_story_views_viewer_id_idx ON public.kcircle_story_views USING btree (viewer_id)

## public.kcircle_watch_history_prefs

RLS enabled: true; forced: false.

Columns: `user_id` (uuid), `save_history` (boolean), `updated_at` (timestamp with time zone)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| kcircle_watch_history_prefs_own_read | SELECT | authenticated | (auth.uid() = user_id) |  |
| kcircle_watch_history_prefs_own_update | UPDATE | authenticated | (auth.uid() = user_id) | (auth.uid() = user_id) |
| kcircle_watch_history_prefs_own_upsert | INSERT | authenticated |  | (auth.uid() = user_id) |

Constraints:
- PRIMARY KEY (user_id)
- FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE

Indexes:
- CREATE UNIQUE INDEX kcircle_watch_history_prefs_pkey ON public.kcircle_watch_history_prefs USING btree (user_id)

## public.lore_entries

RLS enabled: true; forced: false.

Columns: `updated_at` (timestamp with time zone), `id` (uuid), `user_id` (uuid), `series_id` (uuid), `created_at` (timestamp with time zone), `category` (text), `content` (text), `title` (text)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| lore_entries_owner_delete | DELETE | authenticated | (auth.uid() = user_id) |  |
| lore_entries_owner_insert | INSERT | authenticated |  | (auth.uid() = user_id) |
| lore_entries_owner_select | SELECT | authenticated | (auth.uid() = user_id) |  |
| lore_entries_owner_update | UPDATE | authenticated | (auth.uid() = user_id) |  |

Constraints:
- CHECK ((category = ANY (ARRAY['place'::text, 'item'::text, 'faction'::text, 'event'::text, 'concept'::text, 'other'::text])))
- PRIMARY KEY (id)
- FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
- FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE SET NULL

Indexes:
- CREATE UNIQUE INDEX lore_entries_pkey ON public.lore_entries USING btree (id)
- CREATE INDEX lore_entries_user_id_idx ON public.lore_entries USING btree (user_id)
- CREATE INDEX lore_entries_series_id_idx ON public.lore_entries USING btree (series_id)

## public.mangal_ideas

RLS enabled: true; forced: false.

Columns: `id` (uuid), `series_id` (uuid), `created_by` (uuid), `created_at` (timestamp with time zone), `source_post_id` (uuid), `type` (text), `title` (text), `description` (text), `link_url` (text)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| mangal_ideas_admin_write | ALL | authenticated | (EXISTS ( SELECT 1<br>   FROM profiles me<br>  WHERE ((me.id = auth.uid()) AND (me.role = 'developer'::text)))) | (EXISTS ( SELECT 1<br>   FROM profiles me<br>  WHERE ((me.id = auth.uid()) AND (me.role = 'developer'::text)))) |
| mangal_ideas_public_read | SELECT | public | true |  |

Constraints:
- CHECK (((type <> 'story_demand'::text) OR (series_id IS NOT NULL)))
- PRIMARY KEY (id)
- FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE
- FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL
- CHECK ((type = ANY (ARRAY['company'::text, 'story_demand'::text, 'audience'::text])))
- FOREIGN KEY (source_post_id) REFERENCES kcircle_posts(id) ON DELETE CASCADE
- CHECK (((type <> 'audience'::text) OR (source_post_id IS NOT NULL)))

Indexes:
- CREATE UNIQUE INDEX mangal_ideas_pkey ON public.mangal_ideas USING btree (id)
- CREATE INDEX mangal_ideas_type_idx ON public.mangal_ideas USING btree (type)
- CREATE INDEX mangal_ideas_series_id_idx ON public.mangal_ideas USING btree (series_id)
- CREATE INDEX mangal_ideas_created_at_idx ON public.mangal_ideas USING btree (created_at DESC)
- CREATE INDEX mangal_ideas_source_post_idx ON public.mangal_ideas USING btree (source_post_id)

## public.monthly_writer_awards

RLS enabled: true; forced: false.

Columns: `id` (uuid), `month` (date), `series_id` (uuid), `writer_id` (uuid), `score` (numeric), `rank` (integer), `created_at` (timestamp with time zone), `prize_note` (text)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| monthly_writer_awards_admin_write | ALL | authenticated | (EXISTS ( SELECT 1<br>   FROM profiles me<br>  WHERE ((me.id = auth.uid()) AND (me.role = 'developer'::text)))) | (EXISTS ( SELECT 1<br>   FROM profiles me<br>  WHERE ((me.id = auth.uid()) AND (me.role = 'developer'::text)))) |
| monthly_writer_awards_public_read | SELECT | public | true |  |

Constraints:
- PRIMARY KEY (id)
- FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE
- FOREIGN KEY (writer_id) REFERENCES auth.users(id) ON DELETE CASCADE
- UNIQUE (month, writer_id)

Indexes:
- CREATE UNIQUE INDEX monthly_writer_awards_pkey ON public.monthly_writer_awards USING btree (id)
- CREATE INDEX monthly_writer_awards_month_idx ON public.monthly_writer_awards USING btree (month)
- CREATE UNIQUE INDEX monthly_writer_awards_month_writer_id_key ON public.monthly_writer_awards USING btree (month, writer_id)

## public.pages

RLS enabled: true; forced: false.

Columns: `id` (uuid), `chapter_id` (uuid), `page_number` (integer), `created_at` (timestamp with time zone), `image_url` (text)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| Creators can manage pages of their own series | ALL | public | (EXISTS ( SELECT 1<br>   FROM (chapters<br>     JOIN series ON ((series.id = chapters.series_id)))<br>  WHERE ((chapters.id = pages.chapter_id) AND (series.creator_id = auth.uid())))) |  |
| Pages of published series are viewable by everyone | SELECT | public | (EXISTS ( SELECT 1<br>   FROM (chapters<br>     JOIN series ON ((series.id = chapters.series_id)))<br>  WHERE ((chapters.id = pages.chapter_id) AND ((series.status = 'published'::text) OR (series.creator_id = auth.uid()))))) |  |

Constraints:
- PRIMARY KEY (id)
- UNIQUE (chapter_id, page_number)
- FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE

Indexes:
- CREATE UNIQUE INDEX pages_pkey ON public.pages USING btree (id)
- CREATE UNIQUE INDEX pages_chapter_id_page_number_key ON public.pages USING btree (chapter_id, page_number)

## public.payments

RLS enabled: true; forced: false.

Columns: `id` (uuid), `user_id` (uuid), `amount_paise` (integer), `purpose_ref_id` (uuid), `created_at` (timestamp with time zone), `updated_at` (timestamp with time zone), `razorpay_order_id` (text), `razorpay_payment_id` (text), `razorpay_signature` (text), `currency` (text), `purpose` (text), `status` (text), `requested_method` (text), `method` (text), `bank` (text), `vpa` (text)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| Users can view their own payments | SELECT | public | (auth.uid() = user_id) |  |

Constraints:
- CHECK ((status = ANY (ARRAY['created'::text, 'authorized'::text, 'captured'::text, 'failed'::text, 'refunded'::text])))
- PRIMARY KEY (id)
- UNIQUE (razorpay_order_id)
- FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE

Indexes:
- CREATE UNIQUE INDEX payments_pkey ON public.payments USING btree (id)
- CREATE UNIQUE INDEX payments_razorpay_order_id_key ON public.payments USING btree (razorpay_order_id)
- CREATE INDEX payments_user_id_idx ON public.payments USING btree (user_id)
- CREATE INDEX payments_status_idx ON public.payments USING btree (status)
- CREATE INDEX payments_razorpay_order_id_idx ON public.payments USING btree (razorpay_order_id)

## public.profiles

RLS enabled: true; forced: false.

Columns: `id` (uuid), `created_at` (timestamp with time zone), `date_of_birth` (date), `is_minor` (boolean), `parent_consent_token` (uuid), `parent_consent_sent_at` (timestamp with time zone), `parent_consent_confirmed_at` (timestamp with time zone), `consent_given_at` (timestamp with time zone), `account_active` (boolean), `onboarded` (boolean), `parent_consent_email_sent_at` (timestamp with time zone), `full_name` (text), `role` (text), `parent_email` (text), `parent_consent_status` (text), `consent_version` (text), `gender` (text)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| Admin can update profiles | UPDATE | authenticated | (EXISTS ( SELECT 1<br>   FROM profiles me<br>  WHERE ((me.id = auth.uid()) AND (me.role = 'developer'::text)))) | (EXISTS ( SELECT 1<br>   FROM profiles me<br>  WHERE ((me.id = auth.uid()) AND (me.role = 'developer'::text)))) |
| Users can insert their own profile | INSERT | public |  | (auth.uid() = id) |
| Users can update own profile | UPDATE | public | (auth.uid() = id) | (auth.uid() = id) |
| Users can view own profile | SELECT | public | (auth.uid() = id) |  |

Constraints:
- PRIMARY KEY (id)
- FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
- CHECK ((role = ANY (ARRAY['creator'::text, 'reader'::text, 'developer'::text])))
- CHECK ((parent_consent_status = ANY (ARRAY['not_required'::text, 'pending'::text, 'confirmed'::text])))
- CHECK (((gender IS NULL) OR (gender = ANY (ARRAY['male'::text, 'female'::text, 'unspecified'::text]))))

Indexes:
- CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id)

## public.rate_limit_events

RLS enabled: true; forced: false.

Columns: `id` (bigint), `created_at` (timestamp with time zone), `bucket_key` (text)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| no public access to rate limit events | ALL | public | false |  |

Constraints:
- PRIMARY KEY (id)

Indexes:
- CREATE UNIQUE INDEX rate_limit_events_pkey ON public.rate_limit_events USING btree (id)
- CREATE INDEX rate_limit_events_bucket_created_idx ON public.rate_limit_events USING btree (bucket_key, created_at DESC)

## public.ratings

RLS enabled: true; forced: false.

Columns: `id` (uuid), `series_id` (uuid), `reader_id` (uuid), `stars` (integer), `created_at` (timestamp with time zone), `updated_at` (timestamp with time zone), `review_title` (text), `review_text` (text)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| Public read ratings | SELECT | public | true |  |
| Update own rating | UPDATE | public | (auth.uid() = reader_id) |  |
| Upsert own rating | INSERT | public |  | (auth.uid() = reader_id) |

Constraints:
- FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE
- CHECK (((stars >= 1) AND (stars <= 5)))
- PRIMARY KEY (id)
- UNIQUE (series_id, reader_id)
- FOREIGN KEY (reader_id) REFERENCES profiles(id) ON DELETE CASCADE

Indexes:
- CREATE UNIQUE INDEX ratings_pkey ON public.ratings USING btree (id)
- CREATE UNIQUE INDEX ratings_series_id_reader_id_key ON public.ratings USING btree (series_id, reader_id)

## public.reactions

RLS enabled: true; forced: false.

Columns: `chapter_id` (uuid), `reader_id` (uuid), `id` (uuid), `created_at` (timestamp with time zone), `emoji` (text)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| Delete own reaction | DELETE | public | (auth.uid() = reader_id) |  |
| Insert own reaction | INSERT | public |  | (auth.uid() = reader_id) |
| Public read reactions | SELECT | public | true |  |
| Update own reaction | UPDATE | public | (auth.uid() = reader_id) |  |

Constraints:
- PRIMARY KEY (id)
- UNIQUE (chapter_id, reader_id)
- FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
- FOREIGN KEY (reader_id) REFERENCES profiles(id) ON DELETE CASCADE

Indexes:
- CREATE UNIQUE INDEX reactions_pkey ON public.reactions USING btree (id)
- CREATE UNIQUE INDEX reactions_chapter_id_reader_id_key ON public.reactions USING btree (chapter_id, reader_id)

## public.reading_progress

RLS enabled: true; forced: false.

Columns: `id` (uuid), `reader_id` (uuid), `series_id` (uuid), `chapter_id` (uuid), `page_number` (integer), `updated_at` (timestamp with time zone)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| Creators can view reading progress on their own series | SELECT | public | (EXISTS ( SELECT 1<br>   FROM series<br>  WHERE ((series.id = reading_progress.series_id) AND (series.creator_id = auth.uid())))) |  |
| Reader can delete own progress | DELETE | authenticated | (reader_id = auth.uid()) |  |
| Reader can insert own progress | INSERT | public |  | (auth.uid() = reader_id) |
| Reader can read own progress | SELECT | public | (auth.uid() = reader_id) |  |
| Reader can update own progress | UPDATE | public | (auth.uid() = reader_id) |  |

Constraints:
- PRIMARY KEY (id)
- UNIQUE (reader_id, series_id)
- FOREIGN KEY (reader_id) REFERENCES auth.users(id) ON DELETE CASCADE
- FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE
- FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE

Indexes:
- CREATE UNIQUE INDEX reading_progress_pkey ON public.reading_progress USING btree (id)
- CREATE UNIQUE INDEX reading_progress_reader_id_series_id_key ON public.reading_progress USING btree (reader_id, series_id)
- CREATE INDEX reading_progress_series_id_idx ON public.reading_progress USING btree (series_id)
- CREATE INDEX reading_progress_chapter_id_idx ON public.reading_progress USING btree (chapter_id)

## public.reports

RLS enabled: true; forced: false.

Columns: `id` (uuid), `target_id` (uuid), `reporter_id` (uuid), `created_at` (timestamp with time zone), `is_auto_flagged` (boolean), `target_type` (text), `reason` (text), `details` (text), `status` (text)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| Admin can read all reports | SELECT | authenticated | (EXISTS ( SELECT 1<br>   FROM profiles<br>  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'developer'::text)))) |  |
| Admin can update reports | UPDATE | authenticated | (EXISTS ( SELECT 1<br>   FROM profiles<br>  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'developer'::text)))) | (EXISTS ( SELECT 1<br>   FROM profiles<br>  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'developer'::text)))) |
| Users can insert their own reports | INSERT | public |  | (auth.uid() = reporter_id) |
| Users can view their own reports | SELECT | public | (auth.uid() = reporter_id) |  |

Constraints:
- CHECK ((reason = ANY (ARRAY['Inappropriate'::text, 'Spam'::text, 'Copyright'::text, 'Other'::text])))
- CHECK ((status = ANY (ARRAY['open'::text, 'reviewed'::text, 'dismissed'::text])))
- PRIMARY KEY (id)
- FOREIGN KEY (reporter_id) REFERENCES auth.users(id) ON DELETE CASCADE
- CHECK ((target_type = ANY (ARRAY['series'::text, 'chapter'::text, 'comment'::text, 'video'::text, 'song'::text, 'kcircle_post'::text])))

Indexes:
- CREATE UNIQUE INDEX reports_pkey ON public.reports USING btree (id)
- CREATE INDEX reports_target_idx ON public.reports USING btree (target_type, target_id)
- CREATE INDEX reports_status_idx ON public.reports USING btree (status)
- CREATE INDEX reports_created_at_idx ON public.reports USING btree (created_at DESC)

## public.review_helpful_votes

RLS enabled: true; forced: false.

Columns: `rating_id` (uuid), `voter_id` (uuid), `created_at` (timestamp with time zone)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| review_helpful_votes_own_delete | DELETE | authenticated | (auth.uid() = voter_id) |  |
| review_helpful_votes_own_insert | INSERT | authenticated |  | (auth.uid() = voter_id) |
| review_helpful_votes_public_read | SELECT | public | true |  |

Constraints:
- PRIMARY KEY (rating_id, voter_id)
- FOREIGN KEY (rating_id) REFERENCES ratings(id) ON DELETE CASCADE
- FOREIGN KEY (voter_id) REFERENCES auth.users(id) ON DELETE CASCADE

Indexes:
- CREATE UNIQUE INDEX review_helpful_votes_pkey ON public.review_helpful_votes USING btree (rating_id, voter_id)
- CREATE INDEX review_helpful_votes_rating_id_idx ON public.review_helpful_votes USING btree (rating_id)

## public.series

RLS enabled: true; forced: false.

Columns: `id` (uuid), `creator_id` (uuid), `created_at` (timestamp with time zone), `views` (integer), `is_mature` (boolean), `title` (text), `synopsis` (text), `cover_url` (text), `reading_mode` (text), `status` (text), `genre` (text), `language` (text), `completion_status` (text), `content_type` (text), `reading_direction` (text)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| Admin can delete series | DELETE | authenticated | (EXISTS ( SELECT 1<br>   FROM profiles<br>  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'developer'::text)))) |  |
| Creators can delete their own series | DELETE | public | (auth.uid() = creator_id) |  |
| Creators can insert their own series | INSERT | public |  | (auth.uid() = creator_id) |
| Creators can update their own series | UPDATE | public | (auth.uid() = creator_id) |  |
| Published series are viewable by everyone | SELECT | public | ((status = 'published'::text) OR (auth.uid() = creator_id)) |  |

Constraints:
- CHECK ((reading_mode = ANY (ARRAY['scroll'::text, 'page'::text])))
- CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text])))
- PRIMARY KEY (id)
- FOREIGN KEY (creator_id) REFERENCES auth.users(id) ON DELETE CASCADE
- CHECK ((language = ANY (ARRAY['Hindi'::text, 'English'::text])))
- CHECK ((completion_status = ANY (ARRAY['ongoing'::text, 'completed'::text, 'hiatus'::text])))
- CHECK ((content_type = ANY (ARRAY['mangal'::text, 'novel'::text])))
- CHECK ((reading_direction = ANY (ARRAY['ltr'::text, 'rtl'::text])))

Indexes:
- CREATE UNIQUE INDEX series_pkey ON public.series USING btree (id)
- CREATE INDEX idx_series_title_trgm ON public.series USING gin (title gin_trgm_ops)
- CREATE INDEX idx_series_synopsis_trgm ON public.series USING gin (synopsis gin_trgm_ops)
- CREATE INDEX idx_series_genre_trgm ON public.series USING gin (genre gin_trgm_ops)
- CREATE INDEX series_creator_id_idx ON public.series USING btree (creator_id)
- CREATE INDEX series_status_created_at_idx ON public.series USING btree (status, created_at DESC)

## public.series_tags

RLS enabled: true; forced: false.

Columns: `series_id` (uuid), `tag_id` (uuid), `created_at` (timestamp with time zone)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| series_tags_creator_delete | DELETE | authenticated | (EXISTS ( SELECT 1<br>   FROM series<br>  WHERE ((series.id = series_tags.series_id) AND (series.creator_id = auth.uid())))) |  |
| series_tags_creator_write | INSERT | authenticated |  | (EXISTS ( SELECT 1<br>   FROM series<br>  WHERE ((series.id = series_tags.series_id) AND (series.creator_id = auth.uid())))) |
| series_tags_public_read | SELECT | public | true |  |

Constraints:
- PRIMARY KEY (series_id, tag_id)
- FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE
- FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE

Indexes:
- CREATE UNIQUE INDEX series_tags_pkey ON public.series_tags USING btree (series_id, tag_id)
- CREATE INDEX series_tags_series_id_idx ON public.series_tags USING btree (series_id)
- CREATE INDEX series_tags_tag_id_idx ON public.series_tags USING btree (tag_id)

## public.songs

RLS enabled: true; forced: false.

Columns: `id` (uuid), `creator_id` (uuid), `linked_series_id` (uuid), `linked_chapter_id` (uuid), `kcircle_user_id` (uuid), `blocks` (jsonb), `views` (integer), `kcircle_conversation_id` (uuid), `created_at` (timestamp with time zone), `title` (text), `cover_url` (text), `genre` (text), `language` (text), `status` (text)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| songs_owner_delete | DELETE | authenticated | (auth.uid() = creator_id) |  |
| songs_owner_insert | INSERT | authenticated |  | (auth.uid() = creator_id) |
| songs_owner_update | UPDATE | authenticated | (auth.uid() = creator_id) |  |
| songs_public_read_published | SELECT | public | ((status = 'published'::text) OR (auth.uid() = creator_id)) |  |

Constraints:
- CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text])))
- PRIMARY KEY (id)
- FOREIGN KEY (creator_id) REFERENCES auth.users(id) ON DELETE CASCADE
- FOREIGN KEY (linked_series_id) REFERENCES series(id) ON DELETE SET NULL
- FOREIGN KEY (linked_chapter_id) REFERENCES chapters(id) ON DELETE SET NULL
- FOREIGN KEY (kcircle_user_id) REFERENCES auth.users(id)
- FOREIGN KEY (kcircle_conversation_id) REFERENCES kcircle_conversations(id) ON DELETE SET NULL

Indexes:
- CREATE UNIQUE INDEX songs_pkey ON public.songs USING btree (id)
- CREATE INDEX songs_creator_id_idx ON public.songs USING btree (creator_id)
- CREATE INDEX songs_linked_series_id_idx ON public.songs USING btree (linked_series_id)
- CREATE INDEX songs_status_idx ON public.songs USING btree (status)

## public.tags

RLS enabled: true; forced: false.

Columns: `id` (uuid), `created_at` (timestamp with time zone), `name` (text), `slug` (text)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| tags_authenticated_insert | INSERT | authenticated |  | true |
| tags_public_read | SELECT | public | true |  |

Constraints:
- PRIMARY KEY (id)
- UNIQUE (name)
- UNIQUE (slug)

Indexes:
- CREATE UNIQUE INDEX tags_pkey ON public.tags USING btree (id)
- CREATE UNIQUE INDEX tags_name_key ON public.tags USING btree (name)
- CREATE UNIQUE INDEX tags_slug_key ON public.tags USING btree (slug)

## public.tool_clicks

RLS enabled: true; forced: false.

Columns: `id` (uuid), `tool_id` (uuid), `user_id` (uuid), `clicked_at` (timestamp with time zone)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| tool_clicks_authenticated_insert | INSERT | authenticated |  | (user_id = auth.uid()) |

Constraints:
- PRIMARY KEY (id)
- FOREIGN KEY (tool_id) REFERENCES ai_tools(id) ON DELETE CASCADE
- FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL

Indexes:
- CREATE UNIQUE INDEX tool_clicks_pkey ON public.tool_clicks USING btree (id)
- CREATE INDEX tool_clicks_tool_id_idx ON public.tool_clicks USING btree (tool_id)

## public.video_accuracy_reviews

RLS enabled: true; forced: false.

Columns: `id` (uuid), `video_id` (uuid), `reviewer_id` (uuid), `stars` (smallint), `created_at` (timestamp with time zone), `updated_at` (timestamp with time zone), `review_text` (text)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| video_accuracy_reviews_own_delete | DELETE | authenticated | (auth.uid() = reviewer_id) |  |
| video_accuracy_reviews_own_insert | INSERT | authenticated |  | (auth.uid() = reviewer_id) |
| video_accuracy_reviews_own_update | UPDATE | authenticated | (auth.uid() = reviewer_id) |  |
| video_accuracy_reviews_public_read | SELECT | public | true |  |

Constraints:
- CHECK (((stars >= 1) AND (stars <= 5)))
- PRIMARY KEY (id)
- UNIQUE (video_id, reviewer_id)
- FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
- FOREIGN KEY (reviewer_id) REFERENCES auth.users(id) ON DELETE CASCADE

Indexes:
- CREATE UNIQUE INDEX video_accuracy_reviews_pkey ON public.video_accuracy_reviews USING btree (id)
- CREATE UNIQUE INDEX video_accuracy_reviews_video_id_reviewer_id_key ON public.video_accuracy_reviews USING btree (video_id, reviewer_id)
- CREATE INDEX video_accuracy_reviews_video_id_idx ON public.video_accuracy_reviews USING btree (video_id)

## public.video_comment_likes

RLS enabled: true; forced: false.

Columns: `comment_id` (uuid), `liker_id` (uuid), `created_at` (timestamp with time zone)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| video_comment_likes_own_delete | DELETE | authenticated | (auth.uid() = liker_id) |  |
| video_comment_likes_own_insert | INSERT | authenticated |  | (auth.uid() = liker_id) |
| video_comment_likes_public_read | SELECT | public | true |  |

Constraints:
- PRIMARY KEY (comment_id, liker_id)
- FOREIGN KEY (comment_id) REFERENCES video_comments(id) ON DELETE CASCADE
- FOREIGN KEY (liker_id) REFERENCES auth.users(id) ON DELETE CASCADE

Indexes:
- CREATE UNIQUE INDEX video_comment_likes_pkey ON public.video_comment_likes USING btree (comment_id, liker_id)
- CREATE INDEX video_comment_likes_comment_id_idx ON public.video_comment_likes USING btree (comment_id)

## public.video_comments

RLS enabled: true; forced: false.

Columns: `id` (uuid), `video_id` (uuid), `commenter_id` (uuid), `created_at` (timestamp with time zone), `comment_text` (text)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| Creators can delete comments on their own videos | DELETE | public | (EXISTS ( SELECT 1<br>   FROM videos<br>  WHERE ((videos.id = video_comments.video_id) AND (videos.creator_id = auth.uid())))) |  |
| video_comments_own_delete | DELETE | authenticated | (auth.uid() = commenter_id) |  |
| video_comments_own_insert | INSERT | authenticated |  | (auth.uid() = commenter_id) |
| video_comments_public_read | SELECT | public | true |  |

Constraints:
- CHECK (((char_length(comment_text) >= 1) AND (char_length(comment_text) <= 1000)))
- PRIMARY KEY (id)
- FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
- FOREIGN KEY (commenter_id) REFERENCES auth.users(id) ON DELETE CASCADE

Indexes:
- CREATE UNIQUE INDEX video_comments_pkey ON public.video_comments USING btree (id)
- CREATE INDEX video_comments_video_id_idx ON public.video_comments USING btree (video_id, created_at DESC)

## public.video_dislikes

RLS enabled: true; forced: false.

Columns: `video_id` (uuid), `disliker_id` (uuid), `created_at` (timestamp with time zone)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| video_dislikes_own_delete | DELETE | authenticated | (auth.uid() = disliker_id) |  |
| video_dislikes_own_insert | INSERT | authenticated |  | (auth.uid() = disliker_id) |
| video_dislikes_own_read | SELECT | authenticated | (auth.uid() = disliker_id) |  |

Constraints:
- PRIMARY KEY (video_id, disliker_id)
- FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
- FOREIGN KEY (disliker_id) REFERENCES auth.users(id) ON DELETE CASCADE

Indexes:
- CREATE UNIQUE INDEX video_dislikes_pkey ON public.video_dislikes USING btree (video_id, disliker_id)
- CREATE INDEX video_dislikes_video_id_idx ON public.video_dislikes USING btree (video_id)

## public.video_likes

RLS enabled: true; forced: false.

Columns: `video_id` (uuid), `liker_id` (uuid), `created_at` (timestamp with time zone)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| video_likes_own_delete | DELETE | authenticated | (auth.uid() = liker_id) |  |
| video_likes_own_insert | INSERT | authenticated |  | (auth.uid() = liker_id) |
| video_likes_public_read | SELECT | public | true |  |

Constraints:
- PRIMARY KEY (video_id, liker_id)
- FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
- FOREIGN KEY (liker_id) REFERENCES auth.users(id) ON DELETE CASCADE

Indexes:
- CREATE UNIQUE INDEX video_likes_pkey ON public.video_likes USING btree (video_id, liker_id)

## public.video_votes

RLS enabled: true; forced: false.

Columns: `id` (uuid), `user_id` (uuid), `video_id` (uuid), `week_start_date` (date), `created_at` (timestamp with time zone), `reason_tags` (ARRAY), `comment` (text)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| video_votes_own_insert | INSERT | authenticated |  | (auth.uid() = user_id) |
| video_votes_own_read | SELECT | authenticated | (auth.uid() = user_id) |  |

Constraints:
- PRIMARY KEY (id)
- UNIQUE (user_id, week_start_date)
- FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
- FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
- CHECK ((reason_tags <@ ARRAY['Editing'::text, 'Sound'::text, 'Story'::text, 'Voice'::text, 'Animation'::text]))

Indexes:
- CREATE UNIQUE INDEX video_votes_pkey ON public.video_votes USING btree (id)
- CREATE UNIQUE INDEX video_votes_user_id_week_start_date_key ON public.video_votes USING btree (user_id, week_start_date)
- CREATE INDEX video_votes_video_idx ON public.video_votes USING btree (video_id)
- CREATE INDEX video_votes_week_idx ON public.video_votes USING btree (week_start_date)

## public.videos

RLS enabled: true; forced: false.

Columns: `id` (uuid), `creator_id` (uuid), `series_id` (uuid), `is_short` (boolean), `views` (integer), `likes` (integer), `created_at` (timestamp with time zone), `contains_synthetic_media` (boolean), `duration_seconds` (integer), `is_collab` (boolean), `collab_writer_id` (uuid), `title` (text), `youtube_id` (text), `category` (text), `ai_tool` (text), `moderation_status` (text), `description` (text)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| videos_own_delete | DELETE | authenticated | (auth.uid() = creator_id) |  |
| videos_own_insert | INSERT | authenticated |  | (auth.uid() = creator_id) |
| videos_own_update | UPDATE | authenticated | (auth.uid() = creator_id) |  |
| videos_public_read | SELECT | public | true |  |

Constraints:
- PRIMARY KEY (id)
- FOREIGN KEY (creator_id) REFERENCES auth.users(id) ON DELETE CASCADE
- FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE SET NULL
- CHECK ((moderation_status = ANY (ARRAY['approved'::text, 'pending_review'::text])))
- FOREIGN KEY (collab_writer_id) REFERENCES auth.users(id) ON DELETE SET NULL

Indexes:
- CREATE UNIQUE INDEX videos_pkey ON public.videos USING btree (id)
- CREATE INDEX videos_creator_id_idx ON public.videos USING btree (creator_id)
- CREATE INDEX videos_series_id_idx ON public.videos USING btree (series_id)
- CREATE INDEX videos_created_at_idx ON public.videos USING btree (created_at DESC)
- CREATE INDEX videos_is_collab_idx ON public.videos USING btree (is_collab) WHERE is_collab

## public.view_events

RLS enabled: true; forced: false.

Columns: `id` (uuid), `series_id` (uuid), `created_at` (timestamp with time zone), `country_code` (text)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| Anyone can insert view events | INSERT | public |  | true |
| View events are publicly readable | SELECT | public | true |  |

Constraints:
- PRIMARY KEY (id)
- FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE

Indexes:
- CREATE UNIQUE INDEX view_events_pkey ON public.view_events USING btree (id)
- CREATE INDEX view_events_series_idx ON public.view_events USING btree (series_id)
- CREATE INDEX view_events_created_idx ON public.view_events USING btree (created_at)
- CREATE INDEX idx_view_events_series_created ON public.view_events USING btree (series_id, created_at DESC)

## public.visual_quest_submissions

RLS enabled: true; forced: false.

Columns: `id` (uuid), `quest_id` (uuid), `submitter_id` (uuid), `created_at` (timestamp with time zone), `note` (text), `youtube_url` (text)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| visual_quest_submissions_own_delete | DELETE | authenticated | (auth.uid() = submitter_id) |  |
| visual_quest_submissions_own_insert | INSERT | authenticated |  | (auth.uid() = submitter_id) |
| visual_quest_submissions_public_read | SELECT | public | true |  |

Constraints:
- PRIMARY KEY (id)
- FOREIGN KEY (quest_id) REFERENCES visual_quests(id) ON DELETE CASCADE
- FOREIGN KEY (submitter_id) REFERENCES auth.users(id) ON DELETE CASCADE

Indexes:
- CREATE UNIQUE INDEX visual_quest_submissions_pkey ON public.visual_quest_submissions USING btree (id)
- CREATE INDEX visual_quest_submissions_quest_id_idx ON public.visual_quest_submissions USING btree (quest_id)

## public.visual_quest_votes

RLS enabled: true; forced: false.

Columns: `quest_id` (uuid), `submission_id` (uuid), `voter_id` (uuid), `created_at` (timestamp with time zone)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| visual_quest_votes_own_delete | DELETE | authenticated | (auth.uid() = voter_id) |  |
| visual_quest_votes_own_insert | INSERT | authenticated |  | (auth.uid() = voter_id) |
| visual_quest_votes_own_update | UPDATE | authenticated | (auth.uid() = voter_id) |  |
| visual_quest_votes_public_read | SELECT | public | true |  |

Constraints:
- PRIMARY KEY (quest_id, voter_id)
- FOREIGN KEY (quest_id) REFERENCES visual_quests(id) ON DELETE CASCADE
- FOREIGN KEY (submission_id) REFERENCES visual_quest_submissions(id) ON DELETE CASCADE
- FOREIGN KEY (voter_id) REFERENCES auth.users(id) ON DELETE CASCADE

Indexes:
- CREATE UNIQUE INDEX visual_quest_votes_pkey ON public.visual_quest_votes USING btree (quest_id, voter_id)
- CREATE INDEX visual_quest_votes_submission_id_idx ON public.visual_quest_votes USING btree (submission_id)

## public.visual_quests

RLS enabled: true; forced: false.

Columns: `id` (uuid), `series_id` (uuid), `creator_id` (uuid), `winner_submission_id` (uuid), `created_at` (timestamp with time zone), `chapter_label` (text), `description` (text), `status` (text)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| visual_quests_owner_delete | DELETE | authenticated | (auth.uid() = creator_id) |  |
| visual_quests_owner_insert | INSERT | authenticated |  | ((auth.uid() = creator_id) AND (EXISTS ( SELECT 1<br>   FROM series<br>  WHERE ((series.id = visual_quests.series_id) AND (series.creator_id = auth.uid()))))) |
| visual_quests_owner_update | UPDATE | authenticated | (auth.uid() = creator_id) |  |
| visual_quests_public_read | SELECT | public | true |  |

Constraints:
- CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text])))
- PRIMARY KEY (id)
- FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE
- FOREIGN KEY (creator_id) REFERENCES auth.users(id) ON DELETE CASCADE
- FOREIGN KEY (winner_submission_id) REFERENCES visual_quest_submissions(id) ON DELETE SET NULL

Indexes:
- CREATE UNIQUE INDEX visual_quests_pkey ON public.visual_quests USING btree (id)
- CREATE INDEX visual_quests_series_id_idx ON public.visual_quests USING btree (series_id)

## public.watch_room_members

RLS enabled: true; forced: false.

Columns: `room_id` (uuid), `user_id` (uuid), `joined_at` (timestamp with time zone)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| watch_room_members_read | SELECT | public | (EXISTS ( SELECT 1<br>   FROM watch_rooms r<br>  WHERE ((r.id = watch_room_members.room_id) AND ((r.visibility = 'public'::text) OR (r.host_id = auth.uid()) OR (EXISTS ( SELECT 1<br>           FROM watch_room_members m2<br>          WHERE ((m2.room_id = r.id) AND (m2.user_id = auth.uid())))))))) |  |
| watch_room_members_self_delete | DELETE | authenticated | (auth.uid() = user_id) |  |
| watch_room_members_self_insert | INSERT | authenticated |  | (auth.uid() = user_id) |

Constraints:
- PRIMARY KEY (room_id, user_id)
- FOREIGN KEY (room_id) REFERENCES watch_rooms(id) ON DELETE CASCADE
- FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE

Indexes:
- CREATE UNIQUE INDEX watch_room_members_pkey ON public.watch_room_members USING btree (room_id, user_id)

## public.watch_room_messages

RLS enabled: true; forced: false.

Columns: `id` (uuid), `room_id` (uuid), `sender_id` (uuid), `created_at` (timestamp with time zone), `short_id` (uuid), `message_text` (text)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| watch_room_messages_member_insert | INSERT | authenticated |  | ((auth.uid() = sender_id) AND (EXISTS ( SELECT 1<br>   FROM watch_rooms r<br>  WHERE ((r.id = watch_room_messages.room_id) AND ((r.host_id = auth.uid()) OR (EXISTS ( SELECT 1<br>           FROM watch_room_members m<br>          WHERE ((m.room_id = r.id) AND (m.user_id = auth.uid()))))))))) |
| watch_room_messages_member_read | SELECT | public | (EXISTS ( SELECT 1<br>   FROM watch_rooms r<br>  WHERE ((r.id = watch_room_messages.room_id) AND ((r.host_id = auth.uid()) OR (EXISTS ( SELECT 1<br>           FROM watch_room_members m<br>          WHERE ((m.room_id = r.id) AND (m.user_id = auth.uid())))))))) |  |

Constraints:
- PRIMARY KEY (id)
- FOREIGN KEY (room_id) REFERENCES watch_rooms(id) ON DELETE CASCADE
- FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE CASCADE
- FOREIGN KEY (short_id) REFERENCES videos(id) ON DELETE SET NULL

Indexes:
- CREATE UNIQUE INDEX watch_room_messages_pkey ON public.watch_room_messages USING btree (id)
- CREATE INDEX watch_room_messages_room_id_idx ON public.watch_room_messages USING btree (room_id, created_at)
- CREATE INDEX watch_room_messages_short_id_idx ON public.watch_room_messages USING btree (room_id, short_id)

## public.watch_rooms

RLS enabled: true; forced: false.

Columns: `id` (uuid), `video_id` (uuid), `host_id` (uuid), `is_active` (boolean), `created_at` (timestamp with time zone), `current_short_id` (uuid), `linked_conversation_id` (uuid), `visibility` (text), `title` (text), `mode` (text)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| watch_rooms_host_delete | DELETE | authenticated | (auth.uid() = host_id) |  |
| watch_rooms_host_insert | INSERT | authenticated |  | (auth.uid() = host_id) |
| watch_rooms_host_update | UPDATE | authenticated | (auth.uid() = host_id) |  |
| watch_rooms_read | SELECT | public | ((visibility = 'public'::text) OR (host_id = auth.uid()) OR (EXISTS ( SELECT 1<br>   FROM watch_room_members m<br>  WHERE ((m.room_id = watch_rooms.id) AND (m.user_id = auth.uid()))))) |  |

Constraints:
- CHECK ((visibility = ANY (ARRAY['private'::text, 'public'::text])))
- PRIMARY KEY (id)
- FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
- FOREIGN KEY (host_id) REFERENCES auth.users(id) ON DELETE CASCADE
- CHECK ((mode = ANY (ARRAY['video'::text, 'shorts'::text])))
- FOREIGN KEY (current_short_id) REFERENCES videos(id) ON DELETE SET NULL
- FOREIGN KEY (linked_conversation_id) REFERENCES kcircle_conversations(id) ON DELETE SET NULL

Indexes:
- CREATE UNIQUE INDEX watch_rooms_pkey ON public.watch_rooms USING btree (id)
- CREATE INDEX watch_rooms_video_id_idx ON public.watch_rooms USING btree (video_id)
- CREATE INDEX watch_rooms_host_id_idx ON public.watch_rooms USING btree (host_id)
- CREATE INDEX watch_rooms_public_active_idx ON public.watch_rooms USING btree (visibility, is_active) WHERE ((visibility = 'public'::text) AND (is_active = true))
- CREATE INDEX watch_rooms_current_short_id_idx ON public.watch_rooms USING btree (current_short_id)

## public.weekly_rankings

RLS enabled: true; forced: false.

Columns: `id` (uuid), `week_start_date` (date), `video_id` (uuid), `tier` (smallint), `votes_count` (integer), `views_snapshot` (integer), `final_score` (numeric), `rank` (integer), `created_at` (timestamp with time zone), `prize_note` (text)

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| weekly_rankings_admin_write | ALL | authenticated | (EXISTS ( SELECT 1<br>   FROM profiles me<br>  WHERE ((me.id = auth.uid()) AND (me.role = 'developer'::text)))) | (EXISTS ( SELECT 1<br>   FROM profiles me<br>  WHERE ((me.id = auth.uid()) AND (me.role = 'developer'::text)))) |
| weekly_rankings_public_read | SELECT | public | true |  |

Constraints:
- CHECK ((tier = ANY (ARRAY[1, 2])))
- PRIMARY KEY (id)
- UNIQUE (week_start_date, video_id)
- FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE

Indexes:
- CREATE UNIQUE INDEX weekly_rankings_pkey ON public.weekly_rankings USING btree (id)
- CREATE UNIQUE INDEX weekly_rankings_week_start_date_video_id_key ON public.weekly_rankings USING btree (week_start_date, video_id)
- CREATE INDEX weekly_rankings_week_idx ON public.weekly_rankings USING btree (week_start_date)
- CREATE INDEX weekly_rankings_rank_idx ON public.weekly_rankings USING btree (week_start_date, rank)

## storage.buckets

RLS enabled: true; forced: false.

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|

## storage.buckets_analytics

RLS enabled: true; forced: false.

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|

## storage.buckets_vectors

RLS enabled: true; forced: false.

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|

## storage.migrations

RLS enabled: true; forced: false.

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|

## storage.objects

RLS enabled: true; forced: false.

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|
| Anyone can view kcircle media | SELECT | public | (bucket_id = 'kcircle-media'::text) |  |
| Anyone can view manga pages | SELECT | public | (bucket_id = 'manga-pages'::text) |  |
| Authenticated users can upload kcircle media | INSERT | public |  | ((bucket_id = 'kcircle-media'::text) AND (auth.role() = 'authenticated'::text)) |
| Authenticated users can upload manga pages | INSERT | public |  | ((bucket_id = 'manga-pages'::text) AND (auth.role() = 'authenticated'::text)) |
| Creators can delete their own kcircle media | DELETE | public | ((bucket_id = 'kcircle-media'::text) AND (auth.uid() = owner)) |  |
| Creators can delete their own uploads | DELETE | public | ((bucket_id = 'manga-pages'::text) AND (auth.uid() = owner)) |  |
| Creators can update their own kcircle media | UPDATE | public | ((bucket_id = 'kcircle-media'::text) AND (auth.uid() = owner)) |  |
| Creators can update their own uploads | UPDATE | public | ((bucket_id = 'manga-pages'::text) AND (auth.uid() = owner)) |  |

## storage.s3_multipart_uploads

RLS enabled: true; forced: false.

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|

## storage.s3_multipart_uploads_parts

RLS enabled: true; forced: false.

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|

## storage.vector_indexes

RLS enabled: true; forced: false.

| Policy | Command | Roles | Using | With check |
|---|---|---|---|---|

## Public SECURITY DEFINER function ACLs

An ACL entry starting `=X/` grants EXECUTE to PUBLIC (including anon/authenticated).
This is a triage inventory, not certification of each function body.

- **kcircle_user_can_view_channel**: ["=X/postgres","postgres=X/postgres","anon=X/postgres","authenticated=X/postgres","service_role=X/postgres"]
- **kcircle_user_can_send_channel**: ["=X/postgres","postgres=X/postgres","anon=X/postgres","authenticated=X/postgres","service_role=X/postgres"]
- **kcircle_user_has_server_permission**: ["=X/postgres","postgres=X/postgres","anon=X/postgres","authenticated=X/postgres","service_role=X/postgres"]
- **increment_series_views**: ["=X/postgres","postgres=X/postgres","anon=X/postgres","authenticated=X/postgres","service_role=X/postgres"]
- **get_follow_count**: ["=X/postgres","postgres=X/postgres","anon=X/postgres","authenticated=X/postgres","service_role=X/postgres"]
- **handle_new_user**: ["=X/postgres","postgres=X/postgres","service_role=X/postgres"]
- **protect_creator_profile_privileged_columns**: ["=X/postgres","postgres=X/postgres","service_role=X/postgres"]
- **related_series**: ["=X/postgres","postgres=X/postgres","anon=X/postgres","authenticated=X/postgres","service_role=X/postgres"]
- **for_you_series**: ["=X/postgres","postgres=X/postgres","anon=X/postgres","authenticated=X/postgres","service_role=X/postgres"]
- **increment_series_views**: ["=X/postgres","postgres=X/postgres","anon=X/postgres","authenticated=X/postgres","service_role=X/postgres"]
- **related_videos**: ["=X/postgres","postgres=X/postgres","anon=X/postgres","authenticated=X/postgres","service_role=X/postgres"]
- **kcircle_create_conversation**: ["=X/postgres","postgres=X/postgres","anon=X/postgres","authenticated=X/postgres","service_role=X/postgres"]
- **kcircle_add_participant**: ["=X/postgres","postgres=X/postgres","anon=X/postgres","authenticated=X/postgres","service_role=X/postgres"]
- **kcircle_get_or_create_watch_thread**: ["=X/postgres","postgres=X/postgres","anon=X/postgres","authenticated=X/postgres","service_role=X/postgres"]
- **kcircle_invite_to_watch_thread**: ["=X/postgres","postgres=X/postgres","anon=X/postgres","authenticated=X/postgres","service_role=X/postgres"]
- **kcircle_find_watch_thread_for_superset**: ["=X/postgres","postgres=X/postgres","anon=X/postgres","authenticated=X/postgres","service_role=X/postgres"]
- **kcircle_expand_watch_thread**: ["=X/postgres","postgres=X/postgres","anon=X/postgres","authenticated=X/postgres","service_role=X/postgres"]
- **creator_leaderboard**: ["=X/postgres","postgres=X/postgres","anon=X/postgres","authenticated=X/postgres","service_role=X/postgres"]
- **kcircle_join_creator_lounge**: ["=X/postgres","postgres=X/postgres","anon=X/postgres","authenticated=X/postgres","service_role=X/postgres"]
- **refresh_mangal_ideas**: ["=X/postgres","postgres=X/postgres","anon=X/postgres","authenticated=X/postgres","service_role=X/postgres"]
- **get_mangal_ideas_feed**: ["=X/postgres","postgres=X/postgres","anon=X/postgres","authenticated=X/postgres","service_role=X/postgres"]
- **snapshot_weekly_top20**: ["=X/postgres","postgres=X/postgres","anon=X/postgres","authenticated=X/postgres","service_role=X/postgres"]
- **video_votes_enforce_min_account_age**: ["=X/postgres","postgres=X/postgres","service_role=X/postgres"]
- **finalize_weekly_rankings**: ["=X/postgres","postgres=X/postgres","anon=X/postgres","authenticated=X/postgres","service_role=X/postgres"]
- **get_mangal_of_the_week**: ["=X/postgres","postgres=X/postgres","anon=X/postgres","authenticated=X/postgres","service_role=X/postgres"]
- **get_writer_of_the_month**: ["=X/postgres","postgres=X/postgres","anon=X/postgres","authenticated=X/postgres","service_role=X/postgres"]
- **finalize_monthly_writer_awards**: ["=X/postgres","postgres=X/postgres","anon=X/postgres","authenticated=X/postgres","service_role=X/postgres"]
- **kcircle_server_after_insert**: ["=X/postgres","postgres=X/postgres","service_role=X/postgres"]
- **kcircle_member_after_insert**: ["=X/postgres","postgres=X/postgres","service_role=X/postgres"]
- **kcircle_group_bootstrap_channels_roles**: ["=X/postgres","postgres=X/postgres","service_role=X/postgres"]
- **kcircle_enforce_pin_permission**: ["=X/postgres","postgres=X/postgres","service_role=X/postgres"]
- **protect_profile_privileged_columns**: ["=X/postgres","postgres=X/postgres","service_role=X/postgres"]
- **get_katube_video_completion**: ["=X/postgres","postgres=X/postgres","authenticated=X/postgres","service_role=X/postgres"]
- **songs_bootstrap_kcircle_group**: ["=X/postgres","postgres=X/postgres","service_role=X/postgres"]
- **check_rate_limit**: ["=X/postgres","postgres=X/postgres","service_role=X/postgres"]
- **recompute_video_likes**: ["=X/postgres","postgres=X/postgres","anon=X/postgres","authenticated=X/postgres","service_role=X/postgres"]
- **get_follower_gender_breakdown**: ["=X/postgres","postgres=X/postgres","authenticated=X/postgres","service_role=X/postgres"]
- **admin_set_account_active**: ["=X/postgres","postgres=X/postgres","authenticated=X/postgres","service_role=X/postgres"]
- **get_katube_follower_gender_breakdown**: ["=X/postgres","postgres=X/postgres","authenticated=X/postgres","service_role=X/postgres"]
