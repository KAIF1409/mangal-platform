-- Books / Digital Publishing module for WebMangal.
--
-- Three tables:
--   books                  — the book entity itself (metadata + R2 file key)
--   book_purchases         — one row per (user, book) purchase, created
--                            server-side only by the payments verify/webhook
--                            routes after Razorpay signature verification
--   book_reading_progress  — per-reader resume position, upserted by the reader
--
-- Conventions mirror the songs/payments migrations: uuid PKs defaulting to
-- gen_random_uuid(), timestamptz defaults, status check constraints, RLS on
-- every table, owner-scoped write policies, and an updated_at trigger where
-- the column exists.
--
-- Pricing is stored in paise (integer), matching the `payments` table's
-- convention — never floats. The strict "PAID requires price > 0" rule is a
-- CHECK constraint so it holds no matter which client writes the row; the
-- upload UI validates the same thing client-side, but the DB is the boundary.

create table if not exists books (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  -- R2 keys (not public URLs): covers go through /api/media like every other
  -- image; the book FILE goes through the gated /api/books/file/[bookId]
  -- route instead, which checks purchase status before streaming bytes —
  -- storing a publicly-servable URL here would let anyone read paid books
  -- without buying them.
  cover_image_url text,
  file_url text not null,
  -- Which renderer the reader should use. Derived from magic bytes at
  -- upload time, never trusted from the client.
  file_type text not null check (file_type in ('pdf', 'epub')),
  file_size_bytes bigint,
  pricing_type text not null default 'FREE' check (pricing_type in ('FREE', 'PAID')),
  -- Paise. NULL for FREE; must be > 0 when PAID (enforced below).
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

create index if not exists books_author_id_idx on books(author_id);
create index if not exists books_status_idx on books(status);
create index if not exists books_category_idx on books(category);
create index if not exists books_created_at_idx on books(created_at desc);

alter table books enable row level security;

drop policy if exists "books_public_read_published" on books;
create policy "books_public_read_published" on books for select
  using (status = 'published' or auth.uid() = author_id);

drop policy if exists "books_owner_insert" on books;
create policy "books_owner_insert" on books for insert to authenticated
  with check (auth.uid() = author_id);

drop policy if exists "books_owner_update" on books;
create policy "books_owner_update" on books for update to authenticated
  using (auth.uid() = author_id);

drop policy if exists "books_owner_delete" on books;
create policy "books_owner_delete" on books for delete to authenticated
  using (auth.uid() = author_id);

create or replace function set_books_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists books_updated_at on books;
create trigger books_updated_at
  before update on books
  for each row execute function set_books_updated_at();

-- ── Purchases ────────────────────────────────────────────────────────────
-- Rows are ONLY inserted server-side (payments verify route + webhook,
-- both holding a service-role client) after Razorpay's signature verifies.
-- No insert/update/delete policies exist on purpose: with RLS enabled and
-- no policy, client-side writes are denied outright, while service-role
-- bypasses RLS entirely. Readers can see their own purchases (that's what
-- unlocks the gated file route's client-side UX); authors can see who
-- bought their books (needed for future earnings/royalty views).

create table if not exists book_purchases (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references books(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  payment_id uuid references payments(id) on delete set null,
  amount_paid_paise integer not null,
  created_at timestamptz not null default now(),

  unique (book_id, user_id)
);

create index if not exists book_purchases_user_id_idx on book_purchases(user_id);
create index if not exists book_purchases_book_id_idx on book_purchases(book_id);

alter table book_purchases enable row level security;

drop policy if exists "book_purchases_own_read" on book_purchases;
create policy "book_purchases_own_read" on book_purchases for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from books b
      where b.id = book_id and b.author_id = auth.uid()
    )
  );

-- ── Reading progress ─────────────────────────────────────────────────────
-- One row per (reader, book). The reader upserts on page turns (debounced)
-- and reads its own row on open to resume where it left off.

create table if not exists book_reading_progress (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references books(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- PDF resume position (1-based page). EPUBs don't have stable page numbers
  -- (they're reflowable), so those resume via last_location instead.
  last_page integer not null default 1,
  total_pages integer,
  percent numeric(5,2),
  -- EPUB resume position: the epub.js CFI of the last relocated-to spot.
  -- Opaque string, only ever interpreted by epub.js itself.
  last_location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (book_id, user_id)
);

create index if not exists book_reading_progress_user_id_idx on book_reading_progress(user_id);

alter table book_reading_progress enable row level security;

drop policy if exists "book_progress_own_select" on book_reading_progress;
create policy "book_progress_own_select" on book_reading_progress for select
  using (auth.uid() = user_id);

drop policy if exists "book_progress_own_insert" on book_reading_progress;
create policy "book_progress_own_insert" on book_reading_progress for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "book_progress_own_update" on book_reading_progress;
create policy "book_progress_own_update" on book_reading_progress for update to authenticated
  using (auth.uid() = user_id);

create or replace function set_book_progress_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists book_reading_progress_updated_at on book_reading_progress;
create trigger book_reading_progress_updated_at
  before update on book_reading_progress
  for each row execute function set_book_progress_updated_at();