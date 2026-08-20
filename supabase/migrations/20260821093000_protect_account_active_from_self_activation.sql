-- SECURITY FIX: account_active was NOT in the protected-columns list, and
-- defaults to `true` on the column itself. Combined with the RLS policy
-- "Users can update own profile" (auth.uid() = id, no column restriction),
-- ANY signed-in user - including a self-declared minor mid-consent-flow -
-- could call supabase.from('profiles').update({ account_active: true })
-- directly from client JS and fully bypass parental consent. This was a
-- real, exploitable gap, not just a lint warning.
--
-- Fix: lock account_active the same way parent_consent_* is already locked
-- - only service_role (server-side, our API routes) can change it. Default
-- flips to false (fail closed) so a row is inactive until a server route
-- explicitly activates it.

alter table public.profiles alter column account_active set default false;

create or replace function public.protect_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if old.role = 'reader' and new.role = 'creator' then
    null;
  else
    new.role := old.role;
  end if;

  new.parent_consent_status         := old.parent_consent_status;
  new.parent_consent_token          := old.parent_consent_token;
  new.parent_consent_email_sent_at  := old.parent_consent_email_sent_at;
  new.account_active                := old.account_active;

  return new;
end;
$function$;
