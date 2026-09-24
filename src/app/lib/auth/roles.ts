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
 *
 * THIS RULE IS NOT SPECIFIC TO SERIES. Every authored content type on the
 * platform — series, books, songs, KaTube videos, and whatever is added next
 * (novels, playlists, anything with a single owning account) — follows the
 * identical shape: an `<owner_column> uuid references auth.users(id)`, RLS
 * that tests `auth.uid() = <owner_column>` with no role escape hatch, and a
 * UI gate that hides authoring controls (Add/Edit/Delete/"+ New Chapter",
 * etc.) for everyone except that owner. `ownsContent()` / `canManageContent()`
 * / `contentWriteBlockReason()` below are the type-agnostic versions of the
 * series-specific ones this file already had; `ownsSeries()` /
 * `canManageSeries()` / `seriesWriteBlockReason()` are now thin wrappers
 * around them, kept so existing call sites and their tests don't have to
 * change. When adding a new content type, call the generic three directly
 * (or add a same-shaped wrapper named for that type, matching the series
 * ones) — never write a fresh `role === 'developer' || isOwner` check by
 * hand. See docs/CONTENT_OWNERSHIP_PATTERN.md for the matching RLS template.
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
 * True when `viewerId` IS the account in the content's owner column —
 * series.creator_id, books.author_id, songs.creator_id, videos.creator_id,
 * or the equivalent on any future content table.
 *
 * The single rule behind every authoring gate (Add Chapter, chapter
 * edit/delete, Manage Pages, series/book/song/video edit/delete, follower
 * notifications) and the reason those controls can be hidden safely: the DB
 * policies for those writes test `auth.uid() = <owner column>` with no role
 * escape hatch, so "not the owner" is precisely "the write will be refused".
 */
export function ownsContent(
  viewerId: string | null | undefined,
  ownerId: string | null | undefined
): boolean {
  if (!viewerId || !ownerId) return false;
  return viewerId === ownerId;
}

/**
 * For "is this MINE" checks (Add Chapter button, chapter edit/delete, Edit,
 * Delete — on a series, book, song, video, or any future content type): the
 * viewer must hold a creator toolset AND be that content's owner.
 *
 * A developer account deliberately does NOT pass on content it didn't
 * create. Authorship belongs to the account in the owner column — a support
 * account editing someone's content from the outside would change published
 * work under the author's name, and the RLS write policies would refuse it
 * anyway (see this file's header).
 */
export function canManageContent(role: Role, isOwner: boolean): boolean {
  return hasCreatorAccess(role) && isOwner;
}

/**
 * Why a write to this content (add/edit a unit of it, save a draft) must be
 * blocked, or '' when it's allowed. `contentNoun` names the content type in
 * the message shown to the blocked viewer, e.g. 'series', 'book', 'song'.
 *
 * `canManageContent` answers the same question as a boolean, but a save/
 * publish flow needs to explain a refusal to the creator. Without this, the
 * only feedback a blocked viewer gets is PostgREST's raw `new row violates
 * row-level security policy for table "…"` — accurate but useless: it
 * doesn't say whether you're signed out, signed in as the wrong account, or
 * simply not the owner.
 *
 * This mirrors the UI gate (the content's page only renders its authoring
 * controls when canManageContent passes) and is enforced independently by
 * the database, so it's a pre-flight explanation, never the security
 * boundary itself.
 *
 * Ownership is the ONLY way through for every role — there is no
 * developer/admin override to mention here, because the database has none.
 */
export function contentWriteBlockReason(
  role: Role,
  isOwner: boolean,
  isAuthenticated: boolean,
  contentNoun: string = 'content'
): string {
  if (!isAuthenticated) {
    return `Your session has expired — please log in again before publishing to this ${contentNoun}.`;
  }
  if (canManageContent(role, isOwner)) return '';
  return `This ${contentNoun} belongs to a different creator account, so it can’t be edited from here. Log in with the account that created it.`;
}

/** Series-specific name for {@link ownsContent}; series call sites use this. */
export function ownsSeries(
  viewerId: string | null | undefined,
  creatorId: string | null | undefined
): boolean {
  return ownsContent(viewerId, creatorId);
}

/** Series-specific name for {@link canManageContent}; series call sites use this. */
export function canManageSeries(role: Role, isOwner: boolean): boolean {
  return canManageContent(role, isOwner);
}

/** Series-specific name for {@link contentWriteBlockReason}; series call sites use this. */
export function seriesWriteBlockReason(
  role: Role,
  isOwner: boolean,
  isAuthenticated: boolean
): string {
  if (!isAuthenticated) {
    return 'Your session has expired — please log in again before publishing a chapter.';
  }
  return contentWriteBlockReason(role, isOwner, isAuthenticated, 'series');
}
