-- CRITICAL SECURITY FIX: "Profiles are viewable by everyone" (USING (true))
-- meant ANY visitor - including unauthenticated ones, via the public
-- PostgREST API - could read every column of every profiles row. RLS is
-- row-level only, so this exposed parent_email, parent_consent_token (the
-- literal secret that activates a minor's account), date_of_birth of
-- minors, and every other column, to anyone. Same root-cause pattern as
-- CVE-2025-48757 (170+ Supabase apps breached this exact way in 2025) -
-- except here RLS was present but far too permissive, not missing.
--
-- Fix: base table restricted to owner-only reads. A new public_profiles
-- view exposes only the columns that are genuinely meant to be public
-- (verified against every actual call site in the app - all but a
-- handful already only ever read their OWN row).

drop policy "Profiles are viewable by everyone" on public.profiles;

create policy "Users can view own profile"
  on public.profiles
  for select
  using (auth.uid() = id);

create view public.public_profiles
  with (security_invoker = true)
  as
  select id, full_name, role, created_at, account_active, onboarded
  from public.profiles;

grant select on public.public_profiles to anon, authenticated;

-- Same issue on creator_profiles: "viewable by everyone" (true) exposed
-- phone, payout_method, payout_details (raw bank/UPI info), and
-- youtube_verification_code (a secret used to prove channel ownership -
-- world-readable meant anyone could see a creator's pending verification
-- code) to anyone. Unlike profiles, this table is read for OTHER users'
-- display info (username/avatar) in 60+ places across the app, all of
-- which already only ever select safe columns - so the fix here is
-- column-level, not a policy/view rewrite, to avoid touching every one
-- of those call sites.
revoke select (
  phone,
  payout_method,
  payout_details,
  payout_verified,
  pending_youtube_channel_id,
  youtube_verification_code,
  channel_verified_at
) on public.creator_profiles from anon, authenticated;

-- Aggregate-only follower gender breakdown for a creator's own dashboard.
-- Replaces a client-side query that pulled every individual follower's
-- `gender` column directly (only possible because of the now-removed
-- permissive profiles policy) - this returns counts only, never which
-- specific reader has which gender, and only to the creator who owns
-- those followers.
create or replace function public.get_follower_gender_breakdown(p_creator_id uuid)
returns table(male bigint, female bigint, unspecified bigint, unknown bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is distinct from p_creator_id then
    raise exception 'Not authorized.';
  end if;

  return query
    select
      count(*) filter (where p.gender = 'male'),
      count(*) filter (where p.gender = 'female'),
      count(*) filter (where p.gender = 'unspecified'),
      count(*) filter (where p.gender is null or p.gender not in ('male','female','unspecified'))
    from follows f
    join series s on s.id = f.series_id and s.creator_id = p_creator_id
    join profiles p on p.id = f.reader_id;
end;
$$;

revoke execute on function public.get_follower_gender_breakdown(uuid) from anon;

-- Server-verified account moderation. The two existing "ban user" UI
-- actions (WebMangal creator page, admin/reports page) were calling
-- `supabase.from('profiles').update({account_active:false})` directly on
-- ANOTHER user's row - RLS already blocked that silently (0 rows
-- updated, no error surfaced), so both ban buttons never actually worked,
-- and after account_active was locked to service_role in an earlier
-- migration they'd be blocked at the trigger level too. This RPC is the
-- real, working, properly-authorized replacement: verifies the caller is
-- a developer before touching another user's row.
create or replace function public.admin_set_account_active(p_target_user_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from profiles where id = auth.uid() and role = 'developer'
  ) then
    raise exception 'Developer access only.';
  end if;

  update profiles set account_active = p_active where id = p_target_user_id;
end;
$$;

revoke execute on function public.admin_set_account_active(uuid, boolean) from anon;
