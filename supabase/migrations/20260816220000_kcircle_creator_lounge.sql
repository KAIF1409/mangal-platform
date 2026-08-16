-- §27 item 8 — Creator-only K Circle space.
--
-- Reuses the existing Discord-style group/channels/roles system (§17,
-- 20260813170000_kcircle_channels_roles.sql) rather than building new
-- messaging infra: this is just ONE well-known singleton group
-- conversation that only verified creators/developers can join, using a
-- SECURITY DEFINER RPC as the gate (client-side role checks are UI-only,
-- so the actual "are you a creator" check has to happen server-side).
--
-- Everything else — #general channel, @everyone/Owner roles, realtime
-- chat, per-channel permission overwrites — is already provided by the
-- existing kcircle_group_bootstrap_channels_roles() trigger the moment
-- the singleton conversation row is inserted. No new channel/role tables.

alter table kcircle_conversations
  add column if not exists is_creator_lounge boolean not null default false;

-- Guarantees at most one lounge conversation ever exists, so the RPC below
-- can safely "find or create" it without a race producing duplicates.
create unique index if not exists kcircle_conversations_one_lounge_idx
  on kcircle_conversations (is_creator_lounge) where is_creator_lounge;

-- SECURITY DEFINER: runs with elevated rights so it can read `profiles.role`
-- (not otherwise selectable cross-user) and insert into
-- kcircle_conversations/kcircle_conversation_participants regardless of the
-- caller's own RLS grants — same pattern as kcircle_group_bootstrap_channels_roles().
-- Raises if the caller isn't a creator/developer, so a non-creator calling
-- this directly (bypassing the UI gate) still can't get in.
create or replace function kcircle_join_creator_lounge()
returns uuid language plpgsql security definer as $$
declare
  v_role text;
  v_conversation_id uuid;
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role is null or v_role not in ('creator', 'developer') then
    raise exception 'Creator Lounge is for verified creators only';
  end if;

  select id into v_conversation_id from kcircle_conversations where is_creator_lounge = true;

  if v_conversation_id is null then
    insert into kcircle_conversations (is_group, title, created_by, is_creator_lounge)
      values (true, 'Creator Lounge', auth.uid(), true)
      returning id into v_conversation_id;
    -- kcircle_group_bootstrap_channels_roles_trg fires here automatically,
    -- creating @everyone/Owner roles + #general for this conversation.
  end if;

  insert into kcircle_conversation_participants (conversation_id, user_id)
    values (v_conversation_id, auth.uid())
    on conflict do nothing;

  return v_conversation_id;
end;
$$;

grant execute on function kcircle_join_creator_lounge() to authenticated;

-- Pinned search_path, matching the fix applied live after this migration
-- (see the get_advisors security-lint follow-up) — every other kcircle_*
-- function in this repo has the same `function_search_path_mutable` WARN
-- pre-existing, but the fix is cheap enough to apply on this one at write
-- time rather than leaving it in the same backlog.
alter function kcircle_join_creator_lounge() set search_path = public;
