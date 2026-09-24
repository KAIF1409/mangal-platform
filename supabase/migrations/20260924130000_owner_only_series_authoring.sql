-- FIX (supersedes 20260924120000_admin_write_access_chapters_pages.sql):
-- authorship is ownership — no role, developer included, may write to a series
-- it did not create.
--
-- WHAT WENT WRONG
-- The series page derived ONE flag from canManageSeries(role, isOwner), and
-- that helper returned true for every developer account regardless of
-- series.creator_id ("developer gets full creator powers everywhere"). That
-- flag is what renders "+ Add Chapter", the per-chapter Edit/Delete buttons
-- and Delete-series. So a developer-role account — not the author of the
-- series — was shown authoring controls on someone else's published work.
--
-- The live policies were never wrong: from docs/AUDIT_DATABASE.md
--   chapters: "Creators can manage chapters of their own series"
--             ALL, USING (EXISTS (... series.creator_id = auth.uid()))
--   pages:    "Creators can manage pages of their own series"    (same shape)
--   series:   "Creators can insert/update/delete their own series"
--             (auth.uid() = creator_id)
-- i.e. owner-only. The mismatch was therefore resolved on the APP side
-- (src/app/lib/auth/roles.ts: canManageSeries = hasCreatorAccess && isOwner,
-- plus ownsSeries()) — NOT by widening the database, which is what
-- 20260924120000 did. That earlier migration is superseded: the developer
-- INSERT/UPDATE overrides it created are dropped below.
--
-- WHY NOT KEEP A BREAK-GLASS WRITE OVERRIDE
-- An override lets a support account silently edit or delete published work
-- under the author's name, and no part of the product offers it (creator tools
-- are owner-only everywhere: dashboard, series page, upload page). Moderation
-- of someone else's content is handled by the pre-existing, intentionally
-- narrower "Admin can delete chapters" / "Admin can delete series" policies,
-- which this migration leaves in place. Everything it drops is INSERT/UPDATE
-- (a.k.a. "write as the author").
--
-- Safe/idempotent: `drop policy if exists`, so running it on a database where
-- 20260924120000 was never applied is a no-op. Postgres OR's permissive
-- policies per command, so removing these leaves exactly the original
-- owner-only policies in force — the creator-ownership writes keep working
-- (series INSERT still requires creator_id = auth.uid(), so a new series is
-- always self-assigned).

-- chapters — back to owner-only INSERT/UPDATE
-- ("Creators can manage chapters of their own series").
drop policy if exists "Admin can insert chapters" on public.chapters;
drop policy if exists "Admin can update chapters" on public.chapters;

-- pages — back to owner-only INSERT/UPDATE/DELETE
-- ("Creators can manage pages of their own series"). The upload flow's edit
-- mode renumbers/deletes pages and its rollback path deletes the rows it just
-- inserted, all of which the owner-only policy already covers.
drop policy if exists "Admin can insert pages" on public.pages;
drop policy if exists "Admin can update pages" on public.pages;
drop policy if exists "Admin can delete pages" on public.pages;

-- series — back to owner-only INSERT/UPDATE/DELETE
-- ("Creators can update their own series" covers the upload flow's closing
-- `status = 'published'` write and the dashboard's series-edit modal).
drop policy if exists "Admin can update series" on public.series;

-- NOT dropped (pre-existing moderation surface, unchanged by this incident):
--   "Admin can delete chapters"  DELETE, developer  -> Admin Reports -> Remove
--   "Admin can delete series"    DELETE, developer  -> Admin Reports -> Remove
-- They delete, they never author. If you want strict author-only even for
-- moderation, drop those two the same way — but Admin Reports would lose its
-- Remove action, so decide that separately.
