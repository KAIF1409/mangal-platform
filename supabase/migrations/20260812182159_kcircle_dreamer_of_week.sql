-- K Circle: "Dreamer of the week" pinned posts. Applied live across two
-- migrations in an earlier session (this one + the trigger-fix follow-up
-- at 20260812182224); reconstructed here to bring the repo in sync. The
-- pre-fix version of the trigger wasn't recoverable from the live project
-- (only the current function body is inspectable), so this file ships the
-- final, working trigger rather than the original buggy one — functionally
-- equivalent to applying both live migrations in sequence.
--
-- No UI anywhere in the repo sets `pinned_by` yet — dormant backlog item.

alter table kcircle_posts add column if not exists pinned_by uuid references auth.users(id) on delete set null;
alter table kcircle_posts add column if not exists pinned_at timestamptz;

-- Server-side enforcement (not RLS, since this is a column-level rule on
-- an UPDATE the author-owner policy already allows): only a verified
-- creator (verified YouTube channel, or owns a series) may set
-- pinned_by, and only to their own uid — no pinning on someone else's
-- behalf. pinned_at is auto-managed, not settable by the client.
create or replace function kcircle_enforce_pin_permission()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.pinned_by is distinct from old.pinned_by then
    if new.pinned_by is not null then
      if new.pinned_by != auth.uid() then
        raise exception 'pinned_by must be the acting user';
      end if;
      if not exists (
        select 1 from creator_profiles cp
        where cp.user_id = auth.uid() and cp.verified_youtube_channel_id is not null
      ) and not exists (
        select 1 from series s where s.creator_id = auth.uid()
      ) then
        raise exception 'only creators can pin a dreamer-of-the-week post';
      end if;
      new.pinned_at := now();
    else
      new.pinned_at := null;
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists kcircle_pin_permission_trigger on kcircle_posts;
create trigger kcircle_pin_permission_trigger
  before update on kcircle_posts
  for each row execute function kcircle_enforce_pin_permission();
