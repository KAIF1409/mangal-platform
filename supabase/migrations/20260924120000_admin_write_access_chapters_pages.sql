-- FIX — a developer account could not publish a chapter to a series it does
-- not own: "new row violates row-level security policy for table chapters".
--
-- STATUS: SUPERSEDED — do not apply this on top of a fresh database.
--
-- The policies this file adds (developer INSERT/UPDATE on chapters, pages and
-- series) were removed again by
-- 20260924130000_owner_only_series_authoring.sql, after the app-side permission
-- model was corrected instead of the database: authorship belongs to the
-- account in series.creator_id for EVERY role, developer accounts included
-- (canManageSeries() in src/app/lib/auth/roles.ts). The live ownership policies
-- were already the correct, stricter truth — the bug was that the UI/roles
-- layer was looser than them, so a non-owner was offered "+ Add Chapter" for a
-- write Postgres refuses.
--
-- This file is kept as migration history (it records what the schema looked
-- like and why the developer overrides existed). If it WAS applied to a
-- database, run 20260924130000 there to drop those policies; if it never was,
-- that migration is a no-op.

--
-- The app's own permission model is explicit that a developer account gets
-- full creator powers EVERYWHERE, not only on its own content
-- (src/app/lib/auth/roles.ts):
--   * canManageSeries(role, isOwner) -> `if (role === 'developer') return true`
--     ("a developer account should also pass even if they didn't create the
--      series — useful for support/debugging without needing to be the
--      original creator_id")
--   * so the series page renders "+ Add Chapter" and the studio dashboard
--     renders every creator tool for a developer on ANY series.
--
-- Live RLS was out of step with that contract. As audited (docs/AUDIT_DATABASE.md
-- and .audit-schema.log), the policies on `chapters` were:
--   * "Chapters of published series are viewable by everyone"   SELECT (public)
--   * "Creators can manage chapters of their own series"        ALL, USING
--        (EXISTS (SELECT 1 FROM series WHERE series.id = chapters.series_id
--                 AND series.creator_id = auth.uid()))
--        — an ALL policy with no WITH CHECK, so Postgres reuses USING as the
--          INSERT/UPDATE check, and that tests ONLY series.creator_id
--   * "Admin can delete chapters"                    DELETE (developer role)
--
-- So a developer could DELETE a chapter it didn't own but not INSERT or
-- UPDATE one — and `pages` had NO developer override at all ("Creators can
-- manage pages of their own series", also ALL + creator_id-only). The
-- chapter INSERT is the very first write of the upload pipeline
-- (src/app/lib/webmangal/publishPages.ts), so a developer-account publish
-- failed there, before any page was even uploaded. (A published series and
-- its chapters/pages stay world-readable, which is why the upload screen
-- itself still loaded normally and only the write was refused.)
--
-- Fix: add the missing developer-override policies, mirroring the existing
-- "Admin can delete chapters" / "Admin can delete series" pattern. Postgres
-- OR's permissive policies for the same command, so each one only ADDS a
-- second valid path — the creator-ownership policies above are untouched,
-- and `series` INSERT still requires creator_id = auth.uid() (a developer
-- creating a series self-assigns, so that already passed).
--
-- The developer check is inlined exactly as the existing admin policies do
-- it (rather than introducing a new helper function) to keep one single
-- mechanism. It reads only the caller's OWN profiles row — precisely what
-- "Users can view own profile" allows as of
-- 20260821110000_lock_down_profiles_and_creator_profiles_pii.sql — so it
-- neither depends on, nor re-opens, any broader profile visibility.

-- chapters — INSERT + UPDATE (DELETE already covered by
-- "Admin can delete chapters").
drop policy if exists "Admin can insert chapters" on public.chapters;
create policy "Admin can insert chapters"
  on public.chapters
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'developer'
    )
  );

drop policy if exists "Admin can update chapters" on public.chapters;
create policy "Admin can update chapters"
  on public.chapters
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'developer'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'developer'
    )
  );

-- pages — none of INSERT / UPDATE / DELETE had a developer override. All
-- three are needed: the edit-mode save renumbers existing pages (two UPDATE
-- passes), deletes pages the creator removed, and the rollback path in
-- publishPages.ts deletes the page rows it just inserted.
drop policy if exists "Admin can insert pages" on public.pages;
create policy "Admin can insert pages"
  on public.pages
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'developer'
    )
  );

drop policy if exists "Admin can update pages" on public.pages;
create policy "Admin can update pages"
  on public.pages
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'developer'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'developer'
    )
  );

drop policy if exists "Admin can delete pages" on public.pages;
create policy "Admin can delete pages"
  on public.pages
  for delete to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'developer'
    )
  );

-- series — UPDATE (DELETE already covered by "Admin can delete series").
-- Needed for the upload flow's closing `status = 'published'` write and for
-- the series-edit modal on a series the developer didn't create.
drop policy if exists "Admin can update series" on public.series;
create policy "Admin can update series"
  on public.series
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'developer'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'developer'
    )
  );
