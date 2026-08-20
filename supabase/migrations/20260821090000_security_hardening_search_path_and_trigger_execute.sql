-- Security hardening pass (Supabase security advisor cleanup).
--
-- 1. Pin search_path on functions the linter flagged as mutable-search-path.
--    Without this, a malicious "public" schema object (or a role with CREATE
--    on public) could shadow an unqualified identifier inside the function
--    body. SECURITY DEFINER functions are highest risk since they run with
--    elevated privileges - pinning search_path closes that class of attack.
alter function public.handle_new_user() set search_path = public, pg_temp;
alter function public.trending_series(integer, integer) set search_path = public, pg_temp;
alter function public.compute_is_minor() set search_path = public, pg_temp;
alter function public.reevaluate_minor_status() set search_path = public, pg_temp;
alter function public.kcircle_user_has_server_permission(uuid, uuid, text) set search_path = public, pg_temp;
alter function public.kcircle_user_can_view_channel(uuid, uuid) set search_path = public, pg_temp;
alter function public.kcircle_user_can_send_channel(uuid, uuid) set search_path = public, pg_temp;
alter function public.kcircle_server_after_insert() set search_path = public, pg_temp;
alter function public.kcircle_member_after_insert() set search_path = public, pg_temp;
alter function public.kcircle_is_group_participant(uuid) set search_path = public, pg_temp;
alter function public.kcircle_group_bootstrap_channels_roles() set search_path = public, pg_temp;
alter function public.kcircle_my_highest_role_position(uuid) set search_path = public, pg_temp;
alter function public.kcircle_has_permission(uuid, integer) set search_path = public, pg_temp;
alter function public.set_payments_updated_at() set search_path = public, pg_temp;
alter function public.songs_bootstrap_kcircle_group() set search_path = public, pg_temp;
alter function public.kcircle_enforce_pin_permission() set search_path = public, pg_temp;
alter function public.protect_creator_profile_privileged_columns() set search_path = public, pg_temp;
alter function public.protect_profile_privileged_columns() set search_path = public, pg_temp;
alter function public.video_votes_enforce_min_account_age() set search_path = public, pg_temp;

-- 2. These are pure trigger handlers (RETURNS trigger) - Postgres already
--    refuses to run them via direct RPC call, but the Supabase advisor
--    flags them as callable-by-anon because EXECUTE is still GRANTed by
--    default. Revoke it explicitly so they don't show up as reachable API
--    surface at all. Triggers themselves are unaffected - trigger
--    invocation doesn't go through role EXECUTE grants.
revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.kcircle_server_after_insert() from anon, authenticated;
revoke execute on function public.kcircle_member_after_insert() from anon, authenticated;
revoke execute on function public.kcircle_group_bootstrap_channels_roles() from anon, authenticated;
revoke execute on function public.kcircle_enforce_pin_permission() from anon, authenticated;
revoke execute on function public.protect_creator_profile_privileged_columns() from anon, authenticated;
revoke execute on function public.protect_profile_privileged_columns() from anon, authenticated;
revoke execute on function public.video_votes_enforce_min_account_age() from anon, authenticated;
revoke execute on function public.set_payments_updated_at() from anon, authenticated;
revoke execute on function public.songs_bootstrap_kcircle_group() from anon, authenticated;
