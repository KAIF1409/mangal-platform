-- Real analytics data support: country on each view event (via Vercel's
-- edge geo header, no raw IP ever stored), and an optional self-reported
-- gender field on profiles (nullable — most users won't set it, and that's
-- shown honestly as "Unknown" rather than guessed).

alter table public.view_events
  add column if not exists country_code text;

comment on column public.view_events.country_code is
  'ISO 3166-1 alpha-2 country code, derived server-side from Vercel''s x-vercel-ip-country header at log time. No IP address is ever stored.';

create index if not exists idx_view_events_series_created
  on public.view_events (series_id, created_at desc);

alter table public.profiles
  add column if not exists gender text
  check (gender is null or gender in ('male', 'female', 'unspecified'));

comment on column public.profiles.gender is
  'Optional, self-reported by the user in Settings. Null means not provided — shown as Unknown in creator analytics, never inferred or guessed.';

-- Extend increment_series_views to optionally record the country the view
-- came from. Backward compatible: existing callers that omit the second
-- argument keep working exactly as before (country_code stays null).
create or replace function public.increment_series_views(series_id_input uuid, country_input text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update series
  set views = views + 1
  where id = series_id_input;

  insert into view_events (series_id, country_code)
  values (series_id_input, country_input);
end;
$function$;
