/**
 * Shared role-checking helpers — single source of truth for "who can see
 * creator tools." Import this everywhere instead of writing
 * `role === 'creator'` inline, so the role rules only have to live in one
 * place.
 *
 * Roles in profiles.role:
 *   'reader'    — default, no creator tools anywhere
 *   'creator'   — full creator tools, but only for series they own
 *   'developer' — admin/support account: creator tools + the /admin pages
 *                 everywhere, no "Become a Creator" form needed (set manually
 *                 via SQL, see set_developer_role.sql)
 *
 * AUTHORSHIP IS NOT A ROLE. A role decides which *tools* an account may open
 * (the studio, /admin, "start a new story", uploading pages); it never decides
 * whose *existing* content that account may edit. Every write that changes a
 * series that already exists — add/edit/delete a chapter, upload or renumber
 * its pages, delete the series, email its followers — requires
 *
 *     series.creator_id === auth.uid()
 *
 * for EVERYONE, developer accounts included. That is exactly what the live
 * RLS policies say ("Creators can manage chapters of their own series",
 * "Creators can manage pages of their own series", "Creators can
 * insert/update/delete their own series"), so `canManageSeries()` below must
 * never be looser than those policies — otherwise the UI offers an action the
 * database then refuses. (Regression, 2026-09-24: a developer account was
 * shown "+ Add Chapter" / chapter Edit-Delete on a series it did not own, and
 * the publish then died on "new row violates row-level security policy for
 * table chapters". The fix was to tighten the app-side gate to ownership, NOT
 * to widen the database.)
 */

export type Role = 'reader' | 'creator' | 'developer' | null | undefined;

/** True if this role should see creator tools (Dashboard, Upload, etc). */
export function hasCreatorAccess(role: Role): boolean {
  return role === 'creator' || role === 'developer';
}

/**
 * True if this role is the developer/admin account.
 *
 * Grants administrative *tools* (e.g. /admin/reports, /admin/mangal-ideas) and
 * the creator toolset everywhere — but never authorship of someone else's
 * series; see canManageSeries().
 */
export function isDeveloperRole(role: Role): boolean {
  return role === 'developer';
}

/**
 * True when `viewerId` IS the account that created the series.
 *
 * The single rule behind every authoring gate (Add Chapter, chapter
 * edit/delete, Manage Pages, series edit/delete, follower notifications) and
 * the reason those controls can be hidden safely: the DB policies for those
 * writes test series.creator_id = auth.uid() with no role escape hatch, so
 * "not the creator_id" is precisely "the write will be refused".
 */
export function ownsSeries(
  viewerId: string | null | undefined,
  creatorId: string | null | undefined
): boolean {
  if (!viewerId || !creatorId) return false;
  return viewerId === creatorId;
}

/**
 * For "is this MY series" checks (Add Chapter button, chapter edit/delete,
 * delete series): the viewer must hold a creator toolset AND be the series'
 * creator_id.
 *
 * A developer account deliberately does NOT pass on a series it didn't
 * create. Authorship belongs to the account in series.creator_id — a support
 * account editing someone's chapters from the outside would change published
 * work under the author's name, and the RLS write policies would refuse it
 * anyway (see this file's header).
 */
export function canManageSeries(role: Role, isOwner: boolean): boolean {
  return hasCreatorAccess(role) && isOwner;
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
 *
 * Ownership is the ONLY way through for every role — there is no
 * developer/admin override to mention here, because the database has none.
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
