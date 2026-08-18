-- §0/Phase 2 "Mangal of the Week" — schema additions.

-- Prize money is a text/display field only (CONTEXT.md §0c Phase 2 step 5,
-- §0d anti-abuse notes) — no payout integration. Per-row (per rank) so an
-- admin can set a different amount for #1 vs #2 etc, not just one figure
-- for the whole week.
alter table weekly_rankings add column if not exists prize_note text;

-- Reason-tag vocabulary is fixed (Editing / Sound / Story / Voice /
-- Animation per CONTEXT.md §0c step 2) — enforce server-side too, not just
-- in the picker UI, same spirit as other check constraints in this schema.
alter table video_votes drop constraint if exists video_votes_reason_tags_vocab;
alter table video_votes add constraint video_votes_reason_tags_vocab
  check (reason_tags <@ array['Editing','Sound','Story','Voice','Animation']::text[]);

-- §0d anti-abuse — minimum account-age threshold before a user can vote,
-- so freshly-created bot accounts can't stuff votes. 24h chosen as a
-- reasonable floor; tune later if needed (documented as a decision made
-- alongside Phase 2, not deferred, per §0d).
create or replace function video_votes_enforce_min_account_age()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_created_at timestamptz;
begin
  select created_at into v_created_at from profiles where id = new.user_id;
  if v_created_at is null or v_created_at > now() - interval '24 hours' then
    raise exception 'Account must be at least 24 hours old to vote for Mangal of the Week';
  end if;
  return new;
end;
$$;

drop trigger if exists video_votes_min_account_age_trigger on video_votes;
create trigger video_votes_min_account_age_trigger
  before insert on video_votes
  for each row execute function video_votes_enforce_min_account_age();
