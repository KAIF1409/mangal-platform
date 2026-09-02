-- §144 — founder-reported bug: WebMangal Songs reports could never be filed.
-- ReportButton emits target_type = 'song' from the Songs feature, but
-- reports.target_type's check constraint (last rebuilt by
-- 20260823090000_reports_allow_kcircle_post_target.sql) only allowed
-- series/chapter/comment/video/kcircle_post — every song report failed the
-- constraint at INSERT time, so songs were effectively un-reportable.
-- This rebuild adds 'song' to the allowed set.
--
-- Idempotent: inspects the live constraint definition and only drops/re-adds
-- it when 'song' is missing, so re-running migration history is a no-op.
-- Additive-only: no RLS changes, no other types removed.

do $$
declare
  existing_def text;
begin
  select pg_get_constraintdef(oid)
    into existing_def
    from pg_constraint
   where conname = 'reports_target_type_check'
     and conrelid = 'public.reports'::regclass;

  if existing_def is null then
    -- Constraint missing entirely (unexpected) — create it fresh, complete.
    alter table public.reports add constraint reports_target_type_check
      check (target_type = any (array[
        'series'::text, 'chapter'::text, 'comment'::text,
        'video'::text, 'song'::text, 'kcircle_post'::text
      ]));
  elsif existing_def not like '%song%' then
    alter table public.reports drop constraint reports_target_type_check;
    alter table public.reports add constraint reports_target_type_check
      check (target_type = any (array[
        'series'::text, 'chapter'::text, 'comment'::text,
        'video'::text, 'song'::text, 'kcircle_post'::text
      ]));
  end if;
end $$;
