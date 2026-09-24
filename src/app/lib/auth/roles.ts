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

/**
 * Why a write to this series (add/edit chapter, save draft) must be blocked,
 * or '' when it's allowed.
 *
 * `canManageSeries` answers the same question as a boolean, but the upload
 * flow needs to explain a refusal to the creator. Without this, the only
 * feedback a blocked viewer gets is PostgREST's raw
 * `new row violates row-level security policy for table "chapters"` — accurate
 * but useless: it doesn't say whether you're signed out, signed in as the
 * wrong account, or simply not the series' owner.
 *
 * This mirrors the UI gate (the series page only renders "+ Add Chapter" when
 * canManageSeries passes) and is enforced independently by the database, so
 * it's a pre-flight explanation, never the security boundary itself.
 */
export function seriesWriteBlockReason(
  role: Role,
  isOwner: boolean,
  isAuthenticated: boolean
): string {
  if (!isAuthenticated) {
    return 'Your session has expired — please log in again before publishing a chapter.';
  }
  if (canManageSeries(role, isOwner)) return '';
  return 'This series belongs to a different creator account, so chapters can’t be published to it from here. Log in with the account that created it.';
}
