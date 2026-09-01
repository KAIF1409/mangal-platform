// Shared types for the Codex tab (§138) — character profiles + lore entries.
// Kept tiny and local to the feature: the platform's supabase client is not
// schema-typed, so each module owns its row shapes (see BookRow precedent in
// lib/database.types.ts for the shared-table case; these are single-feature).

export type LoreCategory = 'place' | 'item' | 'faction' | 'event' | 'concept' | 'other';

export const LORE_CATEGORIES: { value: LoreCategory; label: string }[] = [
  { value: 'place', label: 'Place' },
  { value: 'item', label: 'Item' },
  { value: 'faction', label: 'Faction' },
  { value: 'event', label: 'Event' },
  { value: 'concept', label: 'Concept' },
  { value: 'other', label: 'Other' },
];

/** Row shape of public.character_profiles (owner-only, see migration). */
export interface CharacterRow {
  id: string;
  user_id: string;
  name: string;
  role: string | null;
  tags: string[];
  image_url: string | null;
  backstory: string | null;
  series_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Editable draft shape — tags held as raw comma text until save. */
export interface CharacterDraft {
  id: string | null;
  name: string;
  role: string;
  tagsText: string;
  backstory: string;
  image_url: string | null;
  series_id: string | null;
}

/** Row shape of public.lore_entries (owner-only, see migration). */
export interface LoreRow {
  id: string;
  user_id: string;
  title: string;
  category: LoreCategory;
  content: string | null;
  series_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Editable draft shape for lore entries. */
export interface LoreDraft {
  id: string | null;
  title: string;
  category: LoreCategory;
  content: string;
  series_id: string | null;
}

export function newCharacterDraft(): CharacterDraft {
  return { id: null, name: '', role: '', tagsText: '', backstory: '', image_url: null, series_id: null };
}

export function characterToDraft(row: CharacterRow): CharacterDraft {
  return {
    id: row.id,
    name: row.name,
    role: row.role ?? '',
    tagsText: (row.tags ?? []).join(', '),
    backstory: row.backstory ?? '',
    image_url: row.image_url ?? null,
    series_id: row.series_id ?? null,
  };
}

export function newLoreDraft(): LoreDraft {
  return { id: null, title: '', category: 'other', content: '', series_id: null };
}

export function loreToDraft(row: LoreRow): LoreDraft {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    content: row.content ?? '',
    series_id: row.series_id ?? null,
  };
}

/** "a, b, c" → ['a','b','c'] — trims, drops empties, dedupes case-sensitively. */
export function parseTagsText(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const tag = part.trim();
    if (tag && !seen.has(tag)) {
      seen.add(tag);
      out.push(tag);
    }
  }
  return out;
}