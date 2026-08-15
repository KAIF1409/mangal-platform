-- KCircle Watch Together — participant-set chat history (extends §34).
--
-- Replaces §34's "host picks an existing group at room-creation time" Chat
-- destination with the founder's finalized "Participant-Set" approach:
-- a Fast tap room's Chat now resolves, at send time, to a thread identified
-- purely by the exact set of people currently chatting together (sorted
-- user_ids -> deterministic key) — not a pre-chosen group. Same exact set
-- reunites -> same thread reused. Set changes -> new thread, old one
-- untouched. 1:1 is just the 2-person case of the same mechanism.
--
-- Reuses kcircle_conversations/kcircle_messages rather than a parallel
-- schema (attachments, realtime, RLS already wired to those tables) —
-- "alag but linked": a watch thread is a normal kcircle_conversations row,
-- just flagged is_watch_thread=true and keyed by participant_key, so it
-- shares infra with regular chat but never appears in the regular Chat
-- tab's conversation list (that list query already filters on other
-- conditions per app/kalpana-circle/chat/page.tsx; nothing there needs to
-- change since is_watch_thread rows are only ever queried explicitly by
-- the Watch Together page going forward).
--
-- Scope note: everything below is additive and scoped to K Circle only —
-- no KaTube tables (videos, video_comments) are touched.

-- ── thread identity ──
alter table kcircle_conversations add column if not exists is_watch_thread boolean not null default false;
alter table kcircle_conversations add column if not exists participant_key text;

-- Partial unique index (not a table constraint) since participant_key is
-- only ever set on watch-thread rows — regular DMs/groups leave it null.
create unique index if not exists kcircle_conversations_watch_thread_key_idx
  on kcircle_conversations(participant_key) where is_watch_thread;

-- ── per-participant history opt-in snapshot ──
-- Copied onto the participant row from the user's own global preference
-- (below) at the moment they're added to a thread. This is what "delete
-- for me only" / "my ON doesn't force your ON" actually means on a shared-
-- row chat model: the message itself is one row both people can see live,
-- but history_enabled=false means it's left out of *that user's own*
-- Watch Together thread list afterward. Documented as an explicit
-- approximation, not per-user data isolation — flagged in CONTEXT.md.
alter table kcircle_conversation_participants add column if not exists history_enabled boolean not null default true;

-- ── global per-user opt-in (the actual "Save watch-together chat history"
-- toggle) — lives in K Circle, not app-wide settings, per founder's scope
-- call. Default true (opt-out model): the feature works the first time
-- someone chats without extra setup; anyone can flip it off. Founder can
-- flip the default if opt-in-only is preferred later.
create table if not exists kcircle_watch_history_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  save_history boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table kcircle_watch_history_prefs enable row level security;

create policy "kcircle_watch_history_prefs_own_read" on kcircle_watch_history_prefs for select
  to authenticated using (auth.uid() = user_id);
create policy "kcircle_watch_history_prefs_own_upsert" on kcircle_watch_history_prefs for insert
  to authenticated with check (auth.uid() = user_id);
create policy "kcircle_watch_history_prefs_own_update" on kcircle_watch_history_prefs for update
  to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── "delete for me" — per-user hide, doesn't touch the row for anyone else ──
create table if not exists kcircle_message_hidden_for (
  message_id uuid not null references kcircle_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
alter table kcircle_message_hidden_for enable row level security;

create policy "kcircle_message_hidden_for_own_read" on kcircle_message_hidden_for for select
  to authenticated using (auth.uid() = user_id);
create policy "kcircle_message_hidden_for_own_insert" on kcircle_message_hidden_for for insert
  to authenticated with check (
    auth.uid() = user_id and exists (
      select 1 from kcircle_messages m
      join kcircle_conversation_participants p on p.conversation_id = m.conversation_id
      where m.id = message_id and p.user_id = auth.uid()
    )
  );
create policy "kcircle_message_hidden_for_own_delete" on kcircle_message_hidden_for for delete
  to authenticated using (auth.uid() = user_id);

-- ── "delete for both" — real delete, scoped to watch threads only ──
-- No delete policy exists on kcircle_messages at all today (regular K
-- Circle group/DM chat has no delete feature), so this is additive and
-- narrowly scoped via the is_watch_thread check — it does NOT grant
-- delete on ordinary group/DM messages.
create policy "kcircle_messages_watch_thread_participant_delete" on kcircle_messages for delete
  to authenticated using (
    exists (
      select 1 from kcircle_conversations c
      join kcircle_conversation_participants p on p.conversation_id = c.id
      where c.id = kcircle_messages.conversation_id
        and c.is_watch_thread = true
        and p.user_id = auth.uid()
    )
  );

-- ── get-or-create-thread RPC ──
-- Client calls this with the current room's active participant set
-- (resolved from Realtime Presence, see shorts/[roomId]/page.tsx) right
-- before sending a Chat message. security definer so it can insert the
-- conversation + participant rows for everyone in the set in one atomic
-- step (a plain client-side insert would need each *other* participant's
-- own session to add themselves).
create or replace function kcircle_get_or_create_watch_thread(p_participant_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sorted uuid[];
  v_key text;
  v_conv_id uuid;
  v_pid uuid;
begin
  if auth.uid() is null or not (auth.uid() = any(p_participant_ids)) then
    raise exception 'must be one of the participants';
  end if;

  select array_agg(distinct x order by x) into v_sorted from unnest(p_participant_ids) as x;
  if v_sorted is null or array_length(v_sorted, 1) < 2 then
    raise exception 'a watch thread needs at least 2 participants';
  end if;
  v_key := array_to_string(v_sorted, ',');

  select id into v_conv_id from kcircle_conversations
    where is_watch_thread and participant_key = v_key;

  if v_conv_id is null then
    insert into kcircle_conversations (is_watch_thread, participant_key)
      values (true, v_key) returning id into v_conv_id;

    foreach v_pid in array v_sorted loop
      insert into kcircle_conversation_participants (conversation_id, user_id, history_enabled)
        values (
          v_conv_id, v_pid,
          coalesce((select save_history from kcircle_watch_history_prefs where user_id = v_pid), true)
        )
        on conflict (conversation_id, user_id) do nothing;
    end loop;
  end if;

  return v_conv_id;
end;
$$;

grant execute on function kcircle_get_or_create_watch_thread(uuid[]) to authenticated;
