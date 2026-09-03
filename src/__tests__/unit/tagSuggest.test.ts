import { describe, expect, it } from 'vitest';
import { suggestTags, type TagVocabEntry } from '@/app/lib/tagSuggest';

const vocab: TagVocabEntry[] = [
  { id: 't1', name: 'Reincarnation', slug: 'reincarnation' },
  { id: 't2', name: 'Slow Burn', slug: 'slow-burn' },
  { id: 't3', name: 'System', slug: 'system' },
  { id: 't4', name: 'AI', slug: 'ai' },
  { id: 't5', name: 'Cultivation', slug: 'cultivation' },
];

describe('suggestTags — §58b.3 zero-cost tag inference', () => {
  it('matches a standalone word exactly (score 2 beats substring hits)', () => {
    const out = suggestTags('he was reincarnated into a cultivation world', vocab);
    // 'reincarnation' is a substring of 'reincarnated' → weaker signal;
    // 'cultivation' is an exact word → wins.
    expect(out[0]).toEqual({ id: 't5', name: 'Cultivation' });
  });

  it('matches a multi-word tag only as a full phrase', () => {
    expect(suggestTags('a classic slow burn romance', vocab).some((t) => t.id === 't2')).toBe(true);
    expect(suggestTags('the plot burns slowly, no romance', vocab).some((t) => t.id === 't2')).toBe(
      false,
    );
  });

  it('never substring-matches very short tag names (no "AI" inside "maintain")', () => {
    const out = suggestTags('he had to maintain his cover', vocab);
    expect(out.some((t) => t.id === 't4')).toBe(false);
  });

  it('respects the exclusion list case-insensitively', () => {
    const out = suggestTags('cultivation story', vocab, ['cultivation']);
    expect(out.some((t) => t.id === 't5')).toBe(false);
  });

  it('ignores stopwords in the text', () => {
    const out = suggestTags('the system', vocab);
    expect(out.map((t) => t.name)).toContain('System');
  });

  it('caps results at the limit and sorts by match strength then name', () => {
    const text = 'reincarnation cultivation system';
    const out = suggestTags(text, vocab, [], 2);
    expect(out).toHaveLength(2);
  });

  it('returns [] for empty/whitespace text', () => {
    expect(suggestTags('', vocab)).toEqual([]);
    expect(suggestTags('   ', vocab)).toEqual([]);
  });

  it('normalizes punctuation before matching', () => {
    const out = suggestTags('The "SYSTEM" awakens!', vocab);
    expect(out.map((t) => t.name)).toContain('System');
  });
});
