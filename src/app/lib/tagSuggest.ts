// §58b.3 — Rule-based tag inference (zero AI cost).
//
// Auto-suggests tags for a new series/chapter by matching its title +
// description text against the tag vocabulary that already exists in
// Supabase (`tags` table) — plain keyword/substring matching, no model
// call. Deliberately the "free" version described in CONTEXT.md §58b.3;
// an LLM-backed upgrade is a separate, paid, later item (§58e), not this.

export interface TagVocabEntry {
  id: string;
  name: string;
  slug: string;
}

export interface TagSuggestion {
  id: string;
  name: string;
}

// Common English/Hindi-in-English filler words that would otherwise match
// too eagerly against short tag names (e.g. a tag literally named "a" or
// "of" is unlikely, but this keeps the matcher honest either way).
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'is', 'it', 'for',
  'with', 'his', 'her', 'their', 'this', 'that', 'as', 'at', 'by', 'from',
  'but', 'be', 'are', 'was', 'were', 'he', 'she', 'they', 'his', 'him',
]);

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Suggests up to `limit` tags from `vocabulary` that appear (as a whole
 * word or a multi-word phrase) in `text`. Tags already present in
 * `excludeNames` (case-insensitive) are skipped. Pure function, no
 * network/DB call — caller is responsible for fetching the vocabulary
 * once and re-using it across renders.
 */
export function suggestTags(
  text: string,
  vocabulary: TagVocabEntry[],
  excludeNames: string[] = [],
  limit = 6,
): TagSuggestion[] {
  const normalizedText = normalize(text);
  if (!normalizedText) return [];

  const textWords = new Set(normalizedText.split(' ').filter((w) => w && !STOPWORDS.has(w)));
  const excluded = new Set(excludeNames.map((n) => n.trim().toLowerCase()).filter(Boolean));

  const scored: { entry: TagVocabEntry; score: number }[] = [];

  for (const tag of vocabulary) {
    const tagName = tag.name.trim();
    if (!tagName || excluded.has(tagName.toLowerCase())) continue;
    const normalizedTag = normalize(tagName);
    if (!normalizedTag) continue;

    let score = 0;
    if (normalizedTag.includes(' ')) {
      // Multi-word tag (e.g. "slow burn") — match as a phrase, not
      // word-by-word, so unrelated single-word hits don't count.
      if (normalizedText.includes(normalizedTag)) score = 2;
    } else if (textWords.has(normalizedTag)) {
      // Exact single-word match, e.g. tag "reincarnation" and the text
      // contains the standalone word "reincarnation".
      score = 2;
    } else if (normalizedTag.length >= 4 && normalizedText.includes(normalizedTag)) {
      // Substring match (e.g. tag "system" inside "the system awakens") —
      // weaker signal, ranked below exact-word matches. Skipped for very
      // short tag names to avoid noisy false positives (e.g. "ai", "op").
      score = 1;
    }

    if (score > 0) scored.push({ entry: tag, score });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name))
    .slice(0, limit)
    .map((s) => ({ id: s.entry.id, name: s.entry.name }));
}
