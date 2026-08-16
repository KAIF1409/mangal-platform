/**
 * K Circle group channels/roles — Discord-style permission model.
 *
 * A permission set is a bitmask on kcircle_group_roles.permissions (the
 * role's server-wide default). A channel can override that per-role via
 * kcircle_channel_overwrites (allow/deny bitmasks). Resolution order
 * mirrors Discord's documented behaviour: base role permissions (OR'd
 * across every role the member has) -> channel-level role denies ->
 * channel-level role allows. ADMINISTRATOR short-circuits everything.
 *
 * Schema: supabase/migrations/20260813170000_kcircle_channels_roles.sql
 */

export const PERM = {
  VIEW_CHANNEL: 1 << 0,   // 1
  SEND_MESSAGES: 1 << 1,  // 2
  MANAGE_MESSAGES: 1 << 2, // 4  — delete/pin others' messages
  MANAGE_CHANNELS: 1 << 3, // 8  — create/rename/delete channels
  MANAGE_ROLES: 1 << 4,   // 16 — create roles, assign members, edit overwrites
  KICK_MEMBERS: 1 << 5,   // 32
  BAN_MEMBERS: 1 << 6,    // 64
  ADMINISTRATOR: 1 << 7,  // 128 — bypasses every other check
} as const;

export type PermKey = keyof typeof PERM;

export interface RoleRow {
  id: string;
  permissions: number;
  is_default: boolean;
  position: number;
}

export interface OverwriteRow {
  channel_id: string;
  role_id: string;
  allow: number;
  deny: number;
}

/** Base (channel-agnostic) permission bitmask for a member across all their roles. */
export function resolveBasePermissions(memberRoles: RoleRow[]): number {
  return memberRoles.reduce((acc, r) => acc | r.permissions, 0);
}

/**
 * Effective bitmask for a member in a specific channel: base role perms,
 * then every applicable role's channel overwrite deny bits are cleared,
 * then every applicable role's overwrite allow bits are set — same
 * "deny before allow, allow wins on tie" rule Discord uses.
 */
export function resolveChannelPermissions(
  memberRoles: RoleRow[],
  channelId: string,
  overwrites: OverwriteRow[],
): number {
  const base = resolveBasePermissions(memberRoles);
  if (base & PERM.ADMINISTRATOR) return 0xffffffff;

  const roleIds = new Set(memberRoles.map(r => r.id));
  const relevant = overwrites.filter(o => o.channel_id === channelId && roleIds.has(o.role_id));

  let denyMask = 0;
  let allowMask = 0;
  for (const o of relevant) {
    denyMask |= o.deny;
    allowMask |= o.allow;
  }
  return (base & ~denyMask) | allowMask;
}

export function can(effectivePermissions: number, perm: keyof typeof PERM): boolean {
  if (effectivePermissions & PERM.ADMINISTRATOR) return true;
  return (effectivePermissions & PERM[perm]) !== 0;
}

/** Highest `position` among a member's own roles — the rank they can manage strictly below. */
export function highestRolePosition(memberRoles: RoleRow[]): number {
  return memberRoles.reduce((max, r) => Math.max(max, r.position), 0);
}

/**
 * Can this member manage (edit/delete/assign) a role at `targetPosition`?
 * Mirrors the DB-level rule in kcircle_my_highest_role_position /
 * kcircle_has_permission: ADMINISTRATOR bypasses rank entirely, everyone
 * else can only touch roles ranked strictly below their own highest role.
 */
export function canManageRoleAt(memberRoles: RoleRow[], targetPosition: number): boolean {
  const base = resolveBasePermissions(memberRoles);
  if (base & PERM.ADMINISTRATOR) return true;
  if (!(base & PERM.MANAGE_ROLES)) return false;
  return targetPosition < highestRolePosition(memberRoles);
}

export const PERMISSION_LABELS: { key: PermKey; label: string; description: string }[] = [
  { key: 'VIEW_CHANNEL', label: 'View Channel', description: 'See this channel and read its messages' },
  { key: 'SEND_MESSAGES', label: 'Send Messages', description: 'Post messages in this channel' },
  { key: 'MANAGE_MESSAGES', label: 'Manage Messages', description: "Delete other members' messages" },
  { key: 'MANAGE_CHANNELS', label: 'Manage Channels', description: 'Create, rename, and delete channels' },
  { key: 'MANAGE_ROLES', label: 'Manage Roles', description: 'Create roles and assign them to members' },
  { key: 'KICK_MEMBERS', label: 'Kick Members', description: 'Remove members from the group' },
  { key: 'BAN_MEMBERS', label: 'Ban Members', description: 'Remove and block members from rejoining' },
  { key: 'ADMINISTRATOR', label: 'Administrator', description: 'All permissions, on every channel, always' },
];
