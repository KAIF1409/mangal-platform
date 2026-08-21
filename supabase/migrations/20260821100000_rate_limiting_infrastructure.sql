-- Rate limiting, backed by Postgres rather than in-process memory.
--
-- Why not in-memory (a plain JS Map counter)? This app deploys to
-- Cloudflare Workers, where each request can land on a different isolate
-- and isolates are recycled unpredictably - an in-memory counter would
-- reset constantly and give no real protection. No KV/Durable Object
-- namespace is provisioned for this Worker, so Postgres (already the
-- single source of truth for everything else) is the correct place for
-- this: centralized, durable, and already reachable from every route.
--
-- Sliding-window fixed-bucket counter, keyed by caller-chosen string
-- (typically "<route>:<ip>" or "<route>:<user_id>").

create table if not exists public.rate_limit_events (
  id bigint generated always as identity primary key,
  bucket_key text not null,
  created_at timestamptz not null default now()
);

create index if not exists rate_limit_events_bucket_created_idx
  on public.rate_limit_events (bucket_key, created_at desc);

alter table public.rate_limit_events enable row level security;

-- No client (anon or authenticated) ever touches this table directly -
-- only through the SECURITY DEFINER function below, called from
-- server-side API routes using the service role.
create policy "no public access to rate limit events"
  on public.rate_limit_events
  for all
  using (false);

-- Atomically records this attempt and reports whether the caller is still
-- within the allowed rate. Also opportunistically deletes its own
-- now-irrelevant old rows so the table doesn't grow unbounded - no cron
-- job needed for a first version.
create or replace function public.check_rate_limit(
  p_bucket_key text,
  p_max_events integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_window_start timestamptz := now() - make_interval(secs => p_window_seconds);
  v_count integer;
begin
  delete from rate_limit_events
    where bucket_key = p_bucket_key and created_at < v_window_start;

  select count(*) into v_count
    from rate_limit_events
    where bucket_key = p_bucket_key and created_at >= v_window_start;

  if v_count >= p_max_events then
    return false;
  end if;

  insert into rate_limit_events (bucket_key) values (p_bucket_key);
  return true;
end;
$$;

-- Only service_role calls this (from server-side API routes) - anon and
-- authenticated should never call it directly with an attacker-chosen
-- bucket_key/limit of their own choosing.
revoke execute on function public.check_rate_limit(text, integer, integer) from anon, authenticated;
