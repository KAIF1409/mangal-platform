/**
 * Shared role-checking helpers — single source of truth for "who can see
 * creator tools." Import this everywhere instead of writing
 * `role === 'creator'` inline, so the developer override only has to
 * live in one place.
 *
 * Roles in profiles.role:
 *   'reader'    — default, no creator tools anywhere
 *   'creator'   — full creator tools, but only for series they own
 *   'developer' — full creator + reader access everywhere, no
 *                 "Become a Creator" form needed (set manually via SQL,
 *                 see set_developer_role.sql)
 */

export type Role = 'reader' | 'creator' | 'developer' | null | undefined;

/** True if this role should see creator tools (Dashboard, Upload, etc). */
export function hasCreatorAccess(role: Role): boolean {
  return role === 'creator' || role === 'developer';
}

/** True if this role is the developer/owner override account. */
export function isDeveloperRole(role: Role): boolean {
  return role === 'developer';
}

/**
 * For "is this MY series" checks (Add Chapter button, edit/delete), a
 * developer account should also pass even if they didn't create the
 * series — useful for support/debugging without needing to be the
 * original creator_id.
 */
export function canManageSeries(role: Role, isOwner: boolean): boolean {
  if (role === 'developer') return true;
  return role === 'creator' && isOwner;
}
