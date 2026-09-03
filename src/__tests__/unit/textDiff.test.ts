import { describe, expect, it } from 'vitest';
import { buildParagraphPairs, diffWords, splitParagraphs } from '@/app/lib/ai/textDiff';

describe('diffWords — word-level LCS differ (Diff/Review modal)', () => {
  it('identical text collapses into a single "same" run', () => {
    const runs = diffWords('hello world', 'hello world');
    expect(runs).toEqual([{ type: 'same', text: 'hello world' }]);
  });

  it('marks inserted words as "added"', () => {
    const runs = diffWords('hello world', 'hello brave world');
    expect(runs).toContainEqual({ type: 'added', text: 'brave ' });
    expect(runs.every((r) => r.type !== 'removed')).toBe(true);
  });

  it('marks deleted words as "removed"', () => {
    const runs = diffWords('hello brave world', 'hello world');
    expect(runs).toContainEqual({ type: 'removed', text: 'brave ' });
    expect(runs.every((r) => r.type !== 'added')).toBe(true);
  });

  it('merges adjacent tokens of the same type into one run', () => {
    // Tokens keep their trailing whitespace attached, so 'three' (no trailing
    // space) does not match the polished 'three ' and lands in the runs.
    const runs = diffWords('one two three', 'one two three four five');
    expect(runs.filter((r) => r.type === 'added')).toHaveLength(1);
    expect(runs.filter((r) => r.type === 'added')[0].text).toBe('three four five');
    expect(runs.filter((r) => r.type === 'removed')[0].text).toBe('three');
  });

  it('handles empty inputs', () => {
    expect(diffWords('', '')).toEqual([]);
    expect(diffWords('only original', '')).toEqual([{ type: 'removed', text: 'only original' }]);
  });
});

describe('splitParagraphs — manuscript segmentation', () => {
  it('splits on blank lines and drops empties', () => {
    expect(splitParagraphs('a\n\nb\n\nc')).toEqual(['a', 'b', 'c']);
    expect(splitParagraphs('a\n\n\n\n\nb')).toEqual(['a', 'b']);
    expect(splitParagraphs('single')).toEqual(['single']);
    expect(splitParagraphs('')).toEqual([]);
  });
});

describe('buildParagraphPairs — original vs polished pairing', () => {
  it('pairs by index and flags real changes', () => {
    const pairs = buildParagraphPairs('alpha\n\nbeta', 'alpha\n\nBETA!');
    expect(pairs).toHaveLength(2);
    expect(pairs[0].changed).toBe(false);
    expect(pairs[1].changed).toBe(true);
    expect(pairs[1].polished).toBe('BETA!');
  });

  it('is whitespace-insensitive for the changed flag', () => {
    const pairs = buildParagraphPairs('a  b', 'a b');
    expect(pairs[0].changed).toBe(false);
  });

  it('keeps surplus paragraphs from either side (nothing silently disappears)', () => {
    const pairs = buildParagraphPairs('one\n\ntwo\n\nthree', 'one\n\ntwo');
    expect(pairs).toHaveLength(3);
    expect(pairs[2].polished).toBe('');
  });
});
