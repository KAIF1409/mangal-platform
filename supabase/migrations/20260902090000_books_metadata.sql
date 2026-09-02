-- ═══════════════════════════════════════════════════════════════════════════════
-- Books module — metadata-manager columns (§142).
--
-- Three additive columns for the /dashboard/books metadata manager:
--   genre_tags  text[]      — multi-select genre tags (complements category)
--   is_mature   boolean     — mature-content flag (18+ badge on public surfaces)
--   publish_at  timestamptz — scheduling: a published book whose publish_at is
--                             in the future is treated as not-yet-live by the
--                             public surfaces (catalog, detail, reader, gated
--                             file route) until that moment
--
-- Deliberately NO RLS changes — the hard scope rule for this session forbids
-- touching books/payments RLS. The existing policies
-- (books_public_read_published, books_owner_insert/update/delete) keep
-- applying unchanged; scheduling is enforced at the application queries and
-- the gated file route, not via policy edits.
--
-- Idempotent throughout. Client readers degrade gracefully pre-apply (see
-- src/app/lib/booksMetadata.ts: PGRST204 fallback), so the app keeps working
-- even before this file is run.
--
-- Apply via the §136/§138 safe path (NOT `db push`, per §136 history):
--   npx supabase db query --linked -f supabase/migrations/20260902090000_books_metadata.sql

alter table public.books add column if not exists genre_tags text[] not null default '{}';
alter table public.books add column if not exists is_mature boolean not null default false;
alter table public.books add column if not exists publish_at timestamptz;

create index if not exists books_publish_at_idx on public.books(publish_at);

-- Force PostgREST to pick up the new columns immediately (same convention as
-- the books hotfix / codex migrations).
notify pgrst, 'reload schema';
