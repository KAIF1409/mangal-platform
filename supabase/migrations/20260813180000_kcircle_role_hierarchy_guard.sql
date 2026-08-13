-- Role hierarchy guard for K Circle channels/roles (see
-- 20260813170000_kcircle_channels_roles.sql for the base schema).
--
-- Gap this closes: the original policies only checked group membership,
-- not the MANAGE_ROLES permission bit, and had no concept of role rank —
-- any participant could write to kcircle_group_roles /
-- kcircle_group_role_members directly (bypassing the UI) and edit or
-- delete ANY role, including Owner, or assign themselves a higher role.
-- That's privilege escalation. This migration enforces, at the RLS level
-- (not just hiding buttons client-side):
--   1. Only members with the MANAGE_ROLES bit (or ADMINISTRATOR) can
--      create/edit/delete roles or assign/unassign role membership.
--   2. A member can only manage roles ranked (by `position`) strictly
--      below their own highest-ranked role — same rule Discord enforces.
--      ADMINISTRATOR bypasses the rank check entirely (server-owner
--      pattern).

create or replace function kcircle_my_highest_role_position(p_conversation_id uuid)
returns int language sql stable as $$
  select coalesce(max(r.position), 0)
  from kcircle_group_roles r
  where r.conversation_id = p_conversation_id
    and (
      (r.is_default and exists (select 1 from kcircle_conversation_participants p where p.conversation_id = p_conversation_id and p.user_id = auth.uid()))
      or exists (select 1 from kcircle_group_role_members rm where rm.role_id = r.id and rm.user_id = auth.uid())
    );
$$;

-- p_bit is a single permission bit (see app/lib/kcirclePermissions.ts PERM);
-- ADMINISTRATOR (128) always returns true regardless of p_bit, matching
-- the "bypasses every other check" rule the resolver uses client-side.
create or replace function kcircle_has_permission(p_conversation_id uuid, p_bit int)
returns boolean language sql stable as $$
  select coalesce(bool_or((r.permissions & p_bit) <> 0) or bool_or((r.permissions & 128) <> 0), false)
  from kcircle_group_roles r
  where r.conversation_id = p_conversation_id
    and (
      (r.is_default and exists (select 1 from kcircle_conversation_participants p where p.conversation_id = p_conversation_id and p.user_id = auth.uid()))
      or exists (select 1 from kcircle_group_role_members rm where rm.role_id = r.id and rm.user_id = auth.uid())
    );
$$;

drop policy if exists "kcircle_group_roles_participant_write" on kcircle_group_roles;
drop policy if exists "kcircle_group_roles_manage_write" on kcircle_group_roles;
create policy "kcircle_group_roles_manage_write" on kcircle_group_roles for insert to authenticated
  with check (
    kcircle_is_group_participant(conversation_id)
    and kcircle_has_permission(conversation_id, 16)
    and (kcircle_has_permission(conversation_id, 128) or position < kcircle_my_highest_role_position(conversation_id))
  );

drop policy if exists "kcircle_group_roles_participant_update" on kcircle_group_roles;
drop policy if exists "kcircle_group_roles_manage_update" on kcircle_group_roles;
create policy "kcircle_group_roles_manage_update" on kcircle_group_roles for update to authenticated
  using (
    kcircle_is_group_participant(conversation_id)
    and kcircle_has_permission(conversation_id, 16)
    and (kcircle_has_permission(conversation_id, 128) or position < kcircle_my_highest_role_position(conversation_id))
  )
  with check (
    kcircle_is_group_participant(conversation_id)
    and kcircle_has_permission(conversation_id, 16)
    and (kcircle_has_permission(conversation_id, 128) or position < kcircle_my_highest_role_position(conversation_id))
  );

drop policy if exists "kcircle_group_roles_participant_delete" on kcircle_group_roles;
drop policy if exists "kcircle_group_roles_manage_delete" on kcircle_group_roles;
create policy "kcircle_group_roles_manage_delete" on kcircle_group_roles for delete to authenticated
  using (
    kcircle_is_group_participant(conversation_id)
    and not is_default
    and kcircle_has_permission(conversation_id, 16)
    and (kcircle_has_permission(conversation_id, 128) or position < kcircle_my_highest_role_position(conversation_id))
  );

drop policy if exists "kcircle_group_role_members_participant_write" on kcircle_group_role_members;
drop policy if exists "kcircle_group_role_members_manage_write" on kcircle_group_role_members;
create policy "kcircle_group_role_members_manage_write" on kcircle_group_role_members for insert to authenticated
  with check (
    exists (
      select 1 from kcircle_group_roles r
      where r.id = role_id
        and kcircle_is_group_participant(r.conversation_id)
        and kcircle_has_permission(r.conversation_id, 16)
        and (kcircle_has_permission(r.conversation_id, 128) or r.position < kcircle_my_highest_role_position(r.conversation_id))
    )
  );

drop policy if exists "kcircle_group_role_members_participant_delete" on kcircle_group_role_members;
drop policy if exists "kcircle_group_role_members_manage_delete" on kcircle_group_role_members;
create policy "kcircle_group_role_members_manage_delete" on kcircle_group_role_members for delete to authenticated
  using (
    exists (
      select 1 from kcircle_group_roles r
      where r.id = role_id
        and kcircle_is_group_participant(r.conversation_id)
        and kcircle_has_permission(r.conversation_id, 16)
        and (kcircle_has_permission(r.conversation_id, 128) or r.position < kcircle_my_highest_role_position(r.conversation_id))
    )
  );
