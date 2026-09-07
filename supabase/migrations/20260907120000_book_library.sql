-- Section 1: additive Book-only library. Stage/review before applying.
-- Existing books/progress/payment policies are deliberately NOT modified.
begin;

create table if not exists public.book_reading_queues (
  user_id uuid primary key references auth.users(id) on delete cascade,
  book_ids uuid[] not null default '{}',
  revision integer not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now(),
  constraint book_queue_size check (cardinality(book_ids) <= 100)
);
alter table public.book_reading_queues enable row level security;
revoke all on public.book_reading_queues from public, anon, authenticated;
grant select on public.book_reading_queues to authenticated;
drop policy if exists book_queue_own_read on public.book_reading_queues;
create policy book_queue_own_read on public.book_reading_queues
  for select to authenticated using ((select auth.uid()) = user_id);

-- One transaction replaces the whole bounded queue. Row lock + expected revision
-- prevents concurrent tabs from silently losing edits. No user ID argument and
-- no client table writes; the caller can only ever mutate their own queue.
create or replace function public.save_book_reading_queue(p_book_ids uuid[], p_revision integer)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  current_queue public.book_reading_queues%rowtype;
begin
  if caller is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_book_ids is null or cardinality(p_book_ids) > 100
     or coalesce(array_ndims(p_book_ids), 1) <> 1
     -- array_position(arr, null) yields null (not a position), so it cannot
     -- detect null elements — unnest and test explicitly instead.
     or exists (select 1 from unnest(p_book_ids) as x(id) where x.id is null)
     or cardinality(p_book_ids) <> (select count(distinct id) from unnest(p_book_ids) as x(id))
     or p_revision is null or p_revision < 0 then
    raise exception 'Invalid queue' using errcode = '22023';
  end if;
  insert into public.book_reading_queues(user_id) values (caller) on conflict do nothing;
  select * into current_queue from public.book_reading_queues where user_id = caller for update;
  if current_queue.revision <> p_revision then
    raise exception 'Queue changed in another session. Reload before saving.' using errcode = '40001';
  end if;
  -- Only new additions must be currently released. Existing unavailable books
  -- may still be reordered/removed, without exposing their metadata.
  if exists (
    select 1 from unnest(p_book_ids) as x(id)
    where not (id = any(current_queue.book_ids)) and not exists (
      select 1 from public.books b where b.id = x.id and b.status = 'published'
        and (b.publish_at is null or b.publish_at <= now())
    )
  ) then raise exception 'Book unavailable' using errcode = '42501'; end if;
  update public.book_reading_queues set book_ids = p_book_ids,
    revision = revision + 1, updated_at = now() where user_id = caller;
  return current_queue.revision + 1;
end;
$$;
revoke all on function public.save_book_reading_queue(uuid[], integer) from public, anon;
grant execute on function public.save_book_reading_queue(uuid[], integer) to authenticated, service_role;

-- Explicit curated vibes, not inferred genres. No reader writes and no public
-- profile linkage. Service-role curation until creator metadata integration.
create table if not exists public.book_vibes (
  book_id uuid not null references public.books(id) on delete cascade,
  vibe text not null check (vibe in ('cozy-rainy-day', 'fast-paced', 'mind-bending', 'heartwarming', 'dark-and-tense')),
  primary key (book_id, vibe)
);
create index if not exists book_vibes_vibe_idx on public.book_vibes(vibe, book_id);
alter table public.book_vibes enable row level security;
revoke all on public.book_vibes from public, anon, authenticated;
grant select on public.book_vibes to anon, authenticated;
grant all on public.book_vibes, public.book_reading_queues to service_role;
drop policy if exists book_vibes_released_read on public.book_vibes;
create policy book_vibes_released_read on public.book_vibes for select to anon, authenticated
  using (exists (select 1 from public.books b where b.id = book_id
    and b.status = 'published' and (b.publish_at is null or b.publish_at <= now())));

notify pgrst, 'reload schema';
commit;