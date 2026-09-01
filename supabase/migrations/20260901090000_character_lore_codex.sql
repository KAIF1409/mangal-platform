-- ═══════════════════════════════════════════════════════════════════════════════
-- Character profiles & lore codex — private creator-workspace tables backing
-- /mangal-studio/webmangal/codex (§138).
--
-- TWO tables (approved data model):
--   character_profiles — name, role, tags[], portrait key, freeform backstory
--   lore_entries       — title, category (CHECK-constrained), freeform content
-- Both carry a nullable series_id → public.series(id) ON DELETE SET NULL.
-- FK target verified live BEFORE apply: series.id is uuid with a single PK;
-- NULL series_id = standalone entry, valid by design.
--
-- SAFETY — idempotent throughout (create table if not exists / add column if
-- not exists / drop policy if exists), same pattern as the books hotfix
-- (§136). No DROP TABLE / DROP COLUMN / TRUNCATE anywhere. Owner-only RLS:
-- private drafting surfaces wired to the §134 AI editor (WebMangalAiEditor
-- feature="character" / "lore"); public display, if ever wanted, would be a
-- separate additive select policy — not in this scope.
--
-- HOW TO APPLY (books precedent — single file only, see §136 history warning):
--   npx supabase db query --linked -f supabase/migrations/20260901090000_character_lore_codex.sql
--   npx supabase migration repair --status applied 20260901090000 --linked
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. character_profiles ───────────────────────────────────────────────────
create table if not exists public.character_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  role text,
  tags text[] not null default '{}',
  image_url text,
  backstory text,
  series_id uuid references public.series(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Drift guards (books-hotfix pattern): backfill any missing column if the
-- table ever predates the module in a partial shape.
alter table public.character_profiles add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.character_profiles add column if not exists name text;
alter table public.character_profiles add column if not exists role text;
alter table public.character_profiles add column if not exists tags text[] default '{}';
alter table public.character_profiles add column if not exists image_url text;
alter table public.character_profiles add column if not exists backstory text;
alter table public.character_profiles add column if not exists series_id uuid references public.series(id) on delete set null;
alter table public.character_profiles add column if not exists created_at timestamptz default now();
alter table public.character_profiles add column if not exists updated_at timestamptz default now();

create index if not exists character_profiles_user_id_idx on public.character_profiles(user_id);
create index if not exists character_profiles_series_id_idx on public.character_profiles(series_id);

alter table public.character_profiles enable row level security;

drop policy if exists "character_profiles_owner_select" on public.character_profiles;
create policy "character_profiles_owner_select" on public.character_profiles for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "character_profiles_owner_insert" on public.character_profiles;
create policy "character_profiles_owner_insert" on public.character_profiles for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "character_profiles_owner_update" on public.character_profiles;
create policy "character_profiles_owner_update" on public.character_profiles for update to authenticated
  using (auth.uid() = user_id);

drop policy if exists "character_profiles_owner_delete" on public.character_profiles;
create policy "character_profiles_owner_delete" on public.character_profiles for delete to authenticated
  using (auth.uid() = user_id);

create or replace function public.set_character_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists character_profiles_updated_at on public.character_profiles;
create trigger character_profiles_updated_at
  before update on public.character_profiles
  for each row execute function public.set_character_profile_updated_at();

-- ── 2. lore_entries ─────────────────────────────────────────────────────────
create table if not exists public.lore_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  category text not null default 'other'
    check (category in ('place','item','faction','event','concept','other')),
  content text,
  series_id uuid references public.series(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.lore_entries add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.lore_entries add column if not exists title text;
alter table public.lore_entries add column if not exists category text default 'other';
alter table public.lore_entries add column if not exists content text;
alter table public.lore_entries add column if not exists series_id uuid references public.series(id) on delete set null;
alter table public.lore_entries add column if not exists created_at timestamptz default now();
alter table public.lore_entries add column if not exists updated_at timestamptz default now();

create index if not exists lore_entries_user_id_idx on public.lore_entries(user_id);
create index if not exists lore_entries_series_id_idx on public.lore_entries(series_id);

alter table public.lore_entries enable row level security;

drop policy if exists "lore_entries_owner_select" on public.lore_entries;
create policy "lore_entries_owner_select" on public.lore_entries for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "lore_entries_owner_insert" on public.lore_entries;
create policy "lore_entries_owner_insert" on public.lore_entries for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "lore_entries_owner_update" on public.lore_entries;
create policy "lore_entries_owner_update" on public.lore_entries for update to authenticated
  using (auth.uid() = user_id);

drop policy if exists "lore_entries_owner_delete" on public.lore_entries;
create policy "lore_entries_owner_delete" on public.lore_entries for delete to authenticated
  using (auth.uid() = user_id);

create or replace function public.set_lore_entry_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists lore_entries_updated_at on public.lore_entries;
create trigger lore_entries_updated_at
  before update on public.lore_entries
  for each row execute function public.set_lore_entry_updated_at();

-- ── 3. Reload the PostgREST schema cache (books-hotfix pattern) ─────────────
notify pgrst, 'reload schema';