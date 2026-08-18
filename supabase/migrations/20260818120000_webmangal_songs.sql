-- §85 — WebMangal "Songs" category, phase 1 (data model).
-- Third WebMangal content type alongside Manga/Novel. Lyrics/text only for
-- now (no audio upload — see CONTEXT.md §85 for full spec + explicitly
-- deferred future phases). Blocks stored as jsonb since they're always
-- read/written as one unit (whole song = one page), never queried
-- individually — matches the `content jsonb`-style shape already used
-- elsewhere in this schema rather than a separate rows-per-block table.

create table if not exists songs (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  cover_url text,
  genre text,
  language text,
  linked_series_id uuid references series(id) on delete set null,
  linked_chapter_id uuid references chapters(id) on delete set null,
  -- Resolved K Circle profile, not a free-typed URL — validated against
  -- creator_profiles at submit time so it can't be faked or go stale (see
  -- §85). NOT NULL: every song requires a real point of contact.
  kcircle_user_id uuid not null references auth.users(id),
  blocks jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'published')),
  views integer not null default 0,
  -- Set by the bootstrap trigger below the first time a linked song is
  -- created, so a re-save doesn't spawn a second group.
  kcircle_conversation_id uuid references kcircle_conversations(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists songs_creator_id_idx on songs(creator_id);
create index if not exists songs_linked_series_id_idx on songs(linked_series_id);
create index if not exists songs_status_idx on songs(status);

alter table songs enable row level security;

drop policy if exists "songs_public_read_published" on songs;
create policy "songs_public_read_published" on songs for select
  using (status = 'published' or auth.uid() = creator_id);

drop policy if exists "songs_owner_insert" on songs;
create policy "songs_owner_insert" on songs for insert to authenticated
  with check (auth.uid() = creator_id);

drop policy if exists "songs_owner_update" on songs;
create policy "songs_owner_update" on songs for update to authenticated
  using (auth.uid() = creator_id);

drop policy if exists "songs_owner_delete" on songs;
create policy "songs_owner_delete" on songs for delete to authenticated
  using (auth.uid() = creator_id);

-- Auto K Circle group on link (§85 section 3). Reuses the existing group
-- infra as-is: inserting an is_group=true kcircle_conversations row already
-- bootstraps @everyone/Owner roles + #general via
-- kcircle_group_bootstrap_channels_roles_trg (20260813170000). This trigger
-- just creates that group + adds the songwriter and the linked series'
-- creator as initial members, then stores the conversation id back on the
-- song row. Fires immediately at link time (insert with linked_series_id
-- set), not gated on publish status, per founder's explicit ask. A group
-- isn't created for unlinked songs (nothing to coordinate with).
create or replace function songs_bootstrap_kcircle_group()
returns trigger language plpgsql security definer as $$
declare
  v_series_creator_id uuid;
  v_series_title text;
  v_convo_id uuid;
begin
  if new.linked_series_id is not null and new.kcircle_conversation_id is null then
    select creator_id, title into v_series_creator_id, v_series_title
      from series where id = new.linked_series_id;

    if v_series_creator_id is not null then
      insert into kcircle_conversations (is_group, created_by, title)
        values (true, new.creator_id, 'Song: ' || coalesce(new.title, 'Untitled'))
        returning id into v_convo_id;

      insert into kcircle_conversation_participants (conversation_id, user_id)
        values (v_convo_id, new.creator_id)
      on conflict do nothing;

      -- Only add the series creator as a separate participant if they're
      -- not the same person as the songwriter (self-covers are allowed).
      if v_series_creator_id <> new.creator_id then
        insert into kcircle_conversation_participants (conversation_id, user_id)
          values (v_convo_id, v_series_creator_id)
        on conflict do nothing;
      end if;

      update songs set kcircle_conversation_id = v_convo_id where id = new.id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists songs_bootstrap_kcircle_group_trg on songs;
create trigger songs_bootstrap_kcircle_group_trg
  after insert on songs
  for each row execute function songs_bootstrap_kcircle_group();
