-- Closes the same class of gap the role hierarchy guard fixed
-- (20260813180000_kcircle_role_hierarchy_guard.sql), but for channels and
-- per-channel role overwrites: the original RLS on kcircle_group_channels
-- and kcircle_channel_overwrites only checked group membership, not the
-- relevant permission bit, so any participant could create/rename/delete
-- channels, or write channel-level permission overwrites, directly via
-- the API (bypassing the UI, which does gate on MANAGE_CHANNELS/
-- MANAGE_ROLES but that's client-side only).

-- kcircle_group_channels: requires MANAGE_CHANNELS (8), or ADMINISTRATOR
-- via kcircle_has_permission's built-in bypass.
drop policy if exists "kcircle_group_channels_participant_write" on kcircle_group_channels;
drop policy if exists "kcircle_group_channels_manage_write" on kcircle_group_channels;
create policy "kcircle_group_channels_manage_write" on kcircle_group_channels for insert to authenticated
  with check (kcircle_is_group_participant(conversation_id) and kcircle_has_permission(conversation_id, 8));

drop policy if exists "kcircle_group_channels_participant_update" on kcircle_group_channels;
drop policy if exists "kcircle_group_channels_manage_update" on kcircle_group_channels;
create policy "kcircle_group_channels_manage_update" on kcircle_group_channels for update to authenticated
  using (kcircle_is_group_participant(conversation_id) and kcircle_has_permission(conversation_id, 8))
  with check (kcircle_is_group_participant(conversation_id) and kcircle_has_permission(conversation_id, 8));

drop policy if exists "kcircle_group_channels_participant_delete" on kcircle_group_channels;
drop policy if exists "kcircle_group_channels_manage_delete" on kcircle_group_channels;
create policy "kcircle_group_channels_manage_delete" on kcircle_group_channels for delete to authenticated
  using (kcircle_is_group_participant(conversation_id) and kcircle_has_permission(conversation_id, 8));

-- kcircle_channel_overwrites: editing a role's permission overwrite on a
-- channel is permission management, so it requires MANAGE_ROLES (16) —
-- same bit that gates editing the role itself — AND the same rank guard:
-- the role being overwritten must be ranked strictly below the caller's
-- own highest role, unless the caller is ADMINISTRATOR.
drop policy if exists "kcircle_channel_overwrites_participant_write" on kcircle_channel_overwrites;
drop policy if exists "kcircle_channel_overwrites_manage_write" on kcircle_channel_overwrites;
create policy "kcircle_channel_overwrites_manage_write" on kcircle_channel_overwrites for insert to authenticated
  with check (
    exists (
      select 1 from kcircle_group_channels c
      join kcircle_group_roles r on r.id = role_id
      where c.id = channel_id and r.conversation_id = c.conversation_id
        and kcircle_is_group_participant(c.conversation_id)
        and kcircle_has_permission(c.conversation_id, 16)
        and (kcircle_has_permission(c.conversation_id, 128) or r.position < kcircle_my_highest_role_position(c.conversation_id))
    )
  );

drop policy if exists "kcircle_channel_overwrites_participant_update" on kcircle_channel_overwrites;
drop policy if exists "kcircle_channel_overwrites_manage_update" on kcircle_channel_overwrites;
create policy "kcircle_channel_overwrites_manage_update" on kcircle_channel_overwrites for update to authenticated
  using (
    exists (
      select 1 from kcircle_group_channels c
      join kcircle_group_roles r on r.id = role_id
      where c.id = channel_id and r.conversation_id = c.conversation_id
        and kcircle_is_group_participant(c.conversation_id)
        and kcircle_has_permission(c.conversation_id, 16)
        and (kcircle_has_permission(c.conversation_id, 128) or r.position < kcircle_my_highest_role_position(c.conversation_id))
    )
  )
  with check (
    exists (
      select 1 from kcircle_group_channels c
      join kcircle_group_roles r on r.id = role_id
      where c.id = channel_id and r.conversation_id = c.conversation_id
        and kcircle_is_group_participant(c.conversation_id)
        and kcircle_has_permission(c.conversation_id, 16)
        and (kcircle_has_permission(c.conversation_id, 128) or r.position < kcircle_my_highest_role_position(c.conversation_id))
    )
  );

drop policy if exists "kcircle_channel_overwrites_participant_delete" on kcircle_channel_overwrites;
drop policy if exists "kcircle_channel_overwrites_manage_delete" on kcircle_channel_overwrites;
create policy "kcircle_channel_overwrites_manage_delete" on kcircle_channel_overwrites for delete to authenticated
  using (
    exists (
      select 1 from kcircle_group_channels c
      join kcircle_group_roles r on r.id = role_id
      where c.id = channel_id and r.conversation_id = c.conversation_id
        and kcircle_is_group_participant(c.conversation_id)
        and kcircle_has_permission(c.conversation_id, 16)
        and (kcircle_has_permission(c.conversation_id, 128) or r.position < kcircle_my_highest_role_position(c.conversation_id))
    )
  );
