-- Creators currently can't see who follows their own series, or how far
-- readers get into their chapters — the existing RLS only lets a reader see
-- their own rows. This blocks both the (already-shipped) Total Followers
-- stat and the new real Audience Insights / Completion Rate work. Adding a
-- narrow SELECT policy: a creator can read follows/reading_progress rows,
-- but only for series they themselves own — never another creator's data,
-- and never anything beyond aggregate-able rows (no reader identity is
-- exposed in the dashboard UI).

create policy "Creators can view follows on their own series"
  on public.follows
  for select
  using (
    exists (
      select 1 from public.series
      where series.id = follows.series_id
        and series.creator_id = auth.uid()
    )
  );

create policy "Creators can view reading progress on their own series"
  on public.reading_progress
  for select
  using (
    exists (
      select 1 from public.series
      where series.id = reading_progress.series_id
        and series.creator_id = auth.uid()
    )
  );
