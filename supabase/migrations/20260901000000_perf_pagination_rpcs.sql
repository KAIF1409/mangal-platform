-- §139 — performance hardening pass, category 1 (pagination) support RPCs.
-- Idempotent by construction: `create or replace function` re-runs safely,
-- same convention as the rest of this folder.

-- ── §139-A1 / §139-A3 — per-conversation latest message ─────────────────
-- The chat list and the broadcasts list used to fetch EVERY kcircle_messages
-- row in every conversation the viewer can see, just to derive one preview
-- line per thread client-side (whole DM/broadcast history shipped per visit,
-- and it grows without bound). This returns exactly one row per conversation
-- via DISTINCT ON. SECURITY INVOKER (default) so RLS still applies — the
-- viewer only ever gets previews for conversations they can already read.
create or replace function public.kcircle_latest_messages(p_conversation_ids uuid[])
returns table (conversation_id uuid, text text, attachment_url text, created_at timestamptz)
language sql
stable
as $$
  select distinct on (m.conversation_id)
    m.conversation_id, m.text, m.attachment_url, m.created_at
  from public.kcircle_messages m
  where m.conversation_id = any(p_conversation_ids)
  order by m.conversation_id, m.created_at desc;
$$;

-- ── §139-A6 — profile header stats without shipping every like row ──────
-- The K Circle profile page used to fetch ALL of a user's posts AND every
-- kcircle_post_likes/kcircle_post_comments row across them to compute the
-- header "Posts / Likes" stats and the grid badges. The grid becomes
-- paginated; this keeps the two header numbers exact with one aggregate
-- query server-side instead of client-side row shipping.
create or replace function public.kcircle_profile_stats(p_user_id uuid)
returns table (post_count bigint, like_count bigint)
language sql
stable
as $$
  select
    (select count(*) from public.kcircle_posts p where p.author_id = p_user_id),
    (select count(*) from public.kcircle_post_likes l
      join public.kcircle_posts p on p.id = l.post_id
      where p.author_id = p_user_id);
$$;

grant execute on function public.kcircle_latest_messages(uuid[]) to authenticated;
grant execute on function public.kcircle_profile_stats(uuid) to anon, authenticated;
