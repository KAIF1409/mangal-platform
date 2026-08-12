-- Image/attachment messages in K Circle chat (DMs + groups).
--
-- kcircle_messages.text was `not null`, which forced every message to have
-- text even if the whole point was to send a photo. Made nullable and
-- added attachment_url/attachment_type, with a check constraint that a
-- message row must carry at least one of the two (never a fully empty
-- row). Attachments reuse the existing `kcircle-media` storage bucket
-- (public read, authenticated insert/owner-delete — see
-- 20260812_kcircle_dedicated_media_bucket equivalent) under a new
-- `messages/{userId}-{ts}.ext` prefix, alongside the existing `posts/` and
-- `stories/` prefixes. No RLS/storage policy changes needed since the
-- bucket's existing authenticated-insert / public-read policies already
-- cover any prefix.

alter table kcircle_messages
  alter column text drop not null,
  add column if not exists attachment_url text,
  add column if not exists attachment_type text check (attachment_type in ('image') or attachment_type is null);

alter table kcircle_messages
  add constraint kcircle_messages_text_or_attachment
  check (text is not null or attachment_url is not null);
