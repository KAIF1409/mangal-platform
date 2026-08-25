-- ═══════════════════════════════════════════════════════════════════════════════
-- Books module HOTFIX — converge the live schema to the books module shape and
-- force PostgREST to rebuild its schema cache.
--
-- SYMPTOM THIS FIXES
--   "Could not find the table 'public.books' in the schema cache" (HTTP 404)
--   on /dashboard/books, /WebMangal/books, and every books API route.
--
-- ROOT CAUSE
--   PostgREST answers from a cached introspection of the exposed schemas. That
--   error means the DDL from 20260822000000_books_module.sql was never applied
--   to the remote project (or the cache went stale after an out-of-band
--   change) — the client code is fine; the database simply has no public.books.
--
-- HOW TO APPLY (either one is enough)
--   1. CLI:    npx supabase db push            (applies every pending migration)
--      dry-run npx supabase db push --dry-run (list what WOULD be applied)
--   2. Manual: Supabase Dashboard → SQL Editor → paste this whole file → Run.
--
-- SAFETY
--   Every statement is idempotent (create ... if not exists / drop policy if
--   exists / add column if not exists), so this converges the database to the
--   canonical shape no matter which prior state it was in — including the case
--   where the original migration ran cleanly (everything below is then a no-op).
--
-- COLUMN NAMING NOTE
--   Follows the committed application code: cover_image_url (NOT cover_url),
--   and there are deliberately NO slug/synopsis columns — nothing in src/
--   references them. Pricing stays in integer paise, per the payments tables'
--   convention. See 20260822000000_books_module.sql for the design rationale.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. books ────────────────────────────────────────────────────────────────
create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  -- R2 key routed through /api/media (never a raw public URL).
  cover_image_url text,
  -- R2 key served ONLY through the gated /api/books/file/[bookId] route.
  file_url text not null,
  -- Derived from magic bytes at upload time, never trusted from the client.
  file_type text not null check (file_type in ('pdf', 'epub')),
  file_size_bytes bigint,
  pricing_type text not null default 'FREE' check (pricing_type in ('FREE', 'PAID')),
  -- Paise. NULL for FREE; must be > 0 when PAID (books_pricing_price_check).
  price_paise integer,
  category text,
  status text not null default 'draft' check (status in ('draft', 'published')),
  views integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint books_pricing_price_check check (
    (pricing_type = 'FREE' and price_paise is null)
    or (pricing_type = 'PAID' and price_paise is not null and price_paise > 0)
  )
);

-- Drift guards: if the table ever predates the module in a partial shape,
-- backfill any missing column. Columns without a safe DEFAULT are added
-- nullable rather than failing mid-hotfix on legacy rows; a fresh apply
-- (table absent → create branch above) carries the canonical NOT NULLs.
alter table public.books add column if not exists author_id uuid references auth.users(id) on delete cascade;
alter table public.books add column if not exists title text;
alter table public.books add column if not exists description text;
alter table public.books add column if not exists cover_image_url text;
alter table public.books add column if not exists file_url text;
alter table public.books add column if not exists file_type text;
alter table public.books add column if not exists file_size_bytes bigint;
alter table public.books add column if not exists pricing_type text default 'FREE';
alter table public.books add column if not exists price_paise integer;
alter table public.books add column if not exists category text;
alter table public.books add column if not exists status text default 'draft';
alter table public.books add column if not exists views integer default 0;
alter table public.books add column if not exists created_at timestamptz default now();
alter table public.books add column if not exists updated_at timestamptz default now();

create index if not exists books_author_id_idx on public.books(author_id);
create index if not exists books_status_idx on public.books(status);
create index if not exists books_category_idx on public.books(category);
create index if not exists books_created_at_idx on public.books(created_at desc);

-- ── 2. Row Level Security on books ──────────────────────────────────────────
alter table public.books enable row level security;

drop policy if exists "books_public_read_published" on public.books;
create policy "books_public_read_published" on public.books for select
  using (status = 'published' or auth.uid() = author_id);

drop policy if exists "books_owner_insert" on public.books;
create policy "books_owner_insert" on public.books for insert to authenticated
  with check (auth.uid() = author_id);

drop policy if exists "books_owner_update" on public.books;
create policy "books_owner_update" on public.books for update to authenticated
  using (auth.uid() = author_id);

drop policy if exists "books_owner_delete" on public.books;
create policy "books_owner_delete" on public.books for delete to authenticated
  using (auth.uid() = author_id);

-- Table-level grants (RLS still scopes rows). Hosted Supabase grants these by
-- default; restating them rules out privilege drift on restored projects.
grant usage on schema public to anon, authenticated;
grant select on public.books to anon, authenticated;
grant insert, update, delete on public.books to authenticated;

-- updated_at touch trigger.
create or replace function public.set_books_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists books_updated_at on public.books;
create trigger books_updated_at
  before update on public.books
  for each row execute function public.set_books_updated_at();

-- ── 3. book_purchases ───────────────────────────────────────────────────────
-- Written server-side only (payments verify/webhook routes, service role). No
-- insert/update/delete policies ON PURPOSE — RLS denies client writes while
-- service role bypasses RLS entirely.
create table if not exists public.book_purchases (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_paid_paise integer not null,
  created_at timestamptz not null default now(),
  unique (book_id, user_id)
);

-- The payments FK is added conditionally so this hotfix can never be bricked
-- by apply order on a database where payments infra hasn't landed yet.
do $$
begin
  alter table public.book_purchases add column if not exists payment_id uuid;
  if to_regclass('public.payments') is not null
     and not exists (
       select 1 from pg_constraint
       where conname = 'book_purchases_payment_id_fkey'
         and conrelid = 'public.book_purchases'::regclass
     )
  then
    alter table public.book_purchases
      add constraint book_purchases_payment_id_fkey
      foreign key (payment_id) references public.payments(id) on delete set null;
  end if;
end $$;

create index if not exists book_purchases_user_id_idx on public.book_purchases(user_id);
create index if not exists book_purchases_book_id_idx on public.book_purchases(book_id);

alter table public.book_purchases enable row level security;

drop policy if exists "book_purchases_own_read" on public.book_purchases;
create policy "book_purchases_own_read" on public.book_purchases for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.books b
      where b.id = book_id and b.author_id = auth.uid()
    )
  );

grant select on public.book_purchases to anon, authenticated;

-- ── 4. book_reading_progress ────────────────────────────────────────────────
create table if not exists public.book_reading_progress (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- PDF resume position (1-based page). EPUBs resume via last_location (CFI).
  last_page integer not null default 1,
  total_pages integer,
  percent numeric(5, 2),
  last_location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (book_id, user_id)
);

create index if not exists book_reading_progress_user_id_idx on public.book_reading_progress(user_id);

alter table public.book_reading_progress enable row level security;

drop policy if exists "book_progress_own_select" on public.book_reading_progress;
create policy "book_progress_own_select" on public.book_reading_progress for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "book_progress_own_insert" on public.book_reading_progress;
create policy "book_progress_own_insert" on public.book_reading_progress for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "book_progress_own_update" on public.book_reading_progress;
create policy "book_progress_own_update" on public.book_reading_progress for update to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.book_reading_progress to authenticated;

create or replace function public.set_book_progress_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists book_reading_progress_updated_at on public.book_reading_progress;
create trigger book_reading_progress_updated_at
  before update on public.book_reading_progress
  for each row execute function public.set_book_progress_updated_at();

-- ── 5. Reload the PostgREST schema cache ────────────────────────────────────
-- Fires on commit. This is the step that clears the HTTP 404 — PostgREST
-- re-introspects the exposed schemas and picks up public.books immediately.
notify pgrst, 'reload schema';