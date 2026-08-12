-- K Circle polls: as-shipped live, kcircle_poll_votes only had an INSERT
-- policy — the PK (post_id, voter_id) blocks a second vote outright rather
-- than letting someone switch options, which reads as a bug/dead-end to a
-- user tapping a different option. Adding UPDATE (switch option_id on the
-- existing row) and DELETE (retract a vote) so voting behaves like a
-- normal toggle, same spirit as the one-like-per-user pattern documented
-- in CONTEXT.md §11 — still exactly one vote per user per poll, just not
-- a one-way door.

create policy "kcircle_poll_votes_own_update" on kcircle_poll_votes
  for update to authenticated
  using (auth.uid() = voter_id)
  with check (auth.uid() = voter_id);

create policy "kcircle_poll_votes_own_delete" on kcircle_poll_votes
  for delete to authenticated
  using (auth.uid() = voter_id);
