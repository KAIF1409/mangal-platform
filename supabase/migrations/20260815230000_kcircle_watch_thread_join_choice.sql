-- KCircle Watch Together — "add a friend mid-session" choice (extends §36).
--
-- §36 made thread resolution fully automatic: presence set changes ->
-- silently resolves to a (possibly brand new) thread via participant_key,
-- with no say from anyone in the room. Founder's follow-up spec: when an
-- already-chatting group (>=2 people, already has a resolved thread) has
-- someone NEW added mid-session (nobody left, someone joined), that's not
-- "a fresh gathering" the way an exact-set reunion or a totally different
-- mix is — it should ask instead of silently switching everyone to a new
-- (empty) thread out from under them. Two RPCs, no schema change:
--
--   - kcircle_find_watch_thread_for_superset: given the currently-present
--     set, finds the most recently active existing watch thread whose
--     participant set is a smaller subset of it (i.e. "you're all already
--     mid-conversation and someone new just walked in"). Used by the
--     client to detect the choice moment — including by the new person's
--     own client, which has no local history of the older thread.
--   - kcircle_expand_watch_thread: the "Continue in this thread" outcome —
--     adds the new participant(s) to the EXISTING conversation row
--     (granting them real read access to full history via the existing
--     participant-only RLS, no separate grant needed) and repoints
--     participant_key at the new full set. Restricted to callers who are
--     already participants of that conversation, so only an existing
--     member of the old thread can pull someone new into it — the new
--     person can't grant themselves access.
--
-- The "Start a new thread instead" outcome needs no new RPC — it's just
-- the existing kcircle_get_or_create_watch_thread call with the full new
-- participant set, which is a different participant_key than the old
-- thread's, so it creates a fresh empty thread and leaves the old one
-- (and its history) untouched for whoever doesn't join the new one.

create or replace function kcircle_find_watch_thread_for_superset(p_participant_ids uuid[])
returns table(conversation_id uuid, participant_ids uuid[])
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sorted uuid[];
begin
  if auth.uid() is null or not (auth.uid() = any(p_participant_ids)) then
    raise exception 'must be one of the participants';
  end if;

  select array_agg(distinct x order by x) into v_sorted from unnest(p_participant_ids) as x;
  if v_sorted is null or array_length(v_sorted, 1) < 2 then
    return;
  end if;

  return query
    select c.id, string_to_array(c.participant_key, ',')::uuid[]
    from kcircle_conversations c
    where c.is_watch_thread
      and c.participant_key is not null
      -- old thread's people are all still present right now (nobody left,
      -- someone's just been added) — a set that lost someone isn't this
      -- case, that's just a different mix and the plain automatic
      -- resolution (existing §36 behaviour) is correct for it.
      and string_to_array(c.participant_key, ',')::uuid[] <@ v_sorted
      and array_length(string_to_array(c.participant_key, ','), 1) >= 2
      and array_length(string_to_array(c.participant_key, ','), 1) < array_length(v_sorted, 1)
    order by c.last_message_at desc
    limit 1;
end;
$$;

grant execute on function kcircle_find_watch_thread_for_superset(uuid[]) to authenticated;

create or replace function kcircle_expand_watch_thread(p_conversation_id uuid, p_full_participant_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sorted uuid[];
  v_key text;
  v_pid uuid;
  v_is_watch_thread boolean;
  v_caller_already_in boolean;
begin
  if auth.uid() is null then
    raise exception 'must be authenticated';
  end if;

  select is_watch_thread into v_is_watch_thread from kcircle_conversations where id = p_conversation_id;
  if v_is_watch_thread is null or not v_is_watch_thread then
    raise exception 'not a watch thread';
  end if;

  -- Only someone already IN the thread can pull a new person into it —
  -- the new arrival can't grant themselves history access this way, they
  -- can only wait for an existing member to choose "Continue", or start
  -- a fresh thread instead via the normal get_or_create path.
  select exists(
    select 1 from kcircle_conversation_participants
    where conversation_id = p_conversation_id and user_id = auth.uid()
  ) into v_caller_already_in;
  if not v_caller_already_in then
    raise exception 'only an existing participant of this thread can add someone to it';
  end if;

  select array_agg(distinct x order by x) into v_sorted from unnest(p_full_participant_ids) as x;
  if v_sorted is null or array_length(v_sorted, 1) < 2 then
    raise exception 'a watch thread needs at least 2 participants';
  end if;
  v_key := array_to_string(v_sorted, ',');

  if exists (
    select 1 from kcircle_conversations
    where is_watch_thread and participant_key = v_key and id <> p_conversation_id
  ) then
    -- Someone else already resolved this exact full set to a different
    -- thread (e.g. a race with another participant choosing "New" at the
    -- same moment) — just hand back that one instead of erroring the UI.
    return (select id from kcircle_conversations where is_watch_thread and participant_key = v_key limit 1);
  end if;

  foreach v_pid in array v_sorted loop
    insert into kcircle_conversation_participants (conversation_id, user_id, history_enabled)
      values (
        p_conversation_id, v_pid,
        coalesce((select save_history from kcircle_watch_history_prefs where user_id = v_pid), true)
      )
      on conflict (conversation_id, user_id) do nothing;
  end loop;

  update kcircle_conversations set participant_key = v_key where id = p_conversation_id;

  return p_conversation_id;
end;
$$;

grant execute on function kcircle_expand_watch_thread(uuid, uuid[]) to authenticated;
