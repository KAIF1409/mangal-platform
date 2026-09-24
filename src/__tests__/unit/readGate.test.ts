// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  FREE_CHAPTERS_PER_SERIES,
  FREE_SERIES_LIMIT,
  evaluateReadGate,
  shouldRecordRead,
} from '@/app/lib/webmangal/readGate';

// The regression this file exists for: the creator of a series opened chapter
// 3 of their OWN story and was shown the "Aur Padh Liye?" upgrade wall, with
// "2 Chapter/Series" printed next to "Tumhare Paas 2 Chapter". Ownership, not
// role, is what decides it — same rule as every write path (lib/auth/roles.ts).
describe('read gate — a series’ own author', () => {
  it('is never gated, however many chapters they have read', () => {
    for (const chaptersReadInSeries of [0, 1, 2, 3, 25, 300]) {
      expect(
        evaluateReadGate({
          isOwner: true,
          alreadyRead: false,
          chaptersReadInSeries,
          uniqueSeriesRead: 0,
        })
      ).toEqual({ gated: false, reason: null });
    }
  });

  it('is not gated by the distinct-series limit either', () => {
    expect(
      evaluateReadGate({
        isOwner: true,
        alreadyRead: false,
        chaptersReadInSeries: 42,
        uniqueSeriesRead: 99,
      })
    ).toEqual({ gated: false, reason: null });
  });

  it('never spends free-tier budget by reading its own series', () => {
    // Otherwise reading your own 20 chapters would leave you with zero free
    // chapters when you later open somebody else's story.
    expect(shouldRecordRead({ isOwner: true, alreadyRead: false })).toBe(false);
  });
});

describe('read gate — readers', () => {
  it('allows the first two chapters of a series', () => {
    expect(
      evaluateReadGate({
        isOwner: false,
        alreadyRead: false,
        chaptersReadInSeries: 0,
        uniqueSeriesRead: 0,
      })
    ).toEqual({ gated: false, reason: null });

    expect(
      evaluateReadGate({
        isOwner: false,
        alreadyRead: false,
        chaptersReadInSeries: 1,
        uniqueSeriesRead: 1,
      })
    ).toEqual({ gated: false, reason: null });
  });

  it(`closes at chapter ${FREE_CHAPTERS_PER_SERIES + 1} of the same series`, () => {
    expect(
      evaluateReadGate({
        isOwner: false,
        alreadyRead: false,
        chaptersReadInSeries: FREE_CHAPTERS_PER_SERIES,
        uniqueSeriesRead: 1,
      })
    ).toEqual({ gated: true, reason: 'chapter_limit' });
  });

  it(`closes on series ${FREE_SERIES_LIMIT + 1}`, () => {
    // A brand-new series is one the reader has never opened (0 chapters read).
    expect(
      evaluateReadGate({
        isOwner: false,
        alreadyRead: false,
        chaptersReadInSeries: 0,
        uniqueSeriesRead: FREE_SERIES_LIMIT,
      })
    ).toEqual({ gated: true, reason: 'series_limit' });
  });

  it('reports the series limit first when both walls apply', () => {
    // 3 chapters read in this series (chapter wall) AND a 4th distinct series
    // already opened (series wall) — the more actionable message wins.
    expect(
      evaluateReadGate({
        isOwner: false,
        alreadyRead: false,
        chaptersReadInSeries: FREE_CHAPTERS_PER_SERIES + 1,
        uniqueSeriesRead: FREE_SERIES_LIMIT + 1,
      })
    ).toEqual({ gated: true, reason: 'series_limit' });
  });

  it('always allows re-reading a chapter that was already unlocked', () => {
    expect(
      evaluateReadGate({
        isOwner: false,
        alreadyRead: true,
        chaptersReadInSeries: 9,
        uniqueSeriesRead: 9,
      })
    ).toEqual({ gated: false, reason: null });
    expect(shouldRecordRead({ isOwner: false, alreadyRead: true })).toBe(false);
  });

  it('records a fresh, budget-spending read exactly once', () => {
    expect(shouldRecordRead({ isOwner: false, alreadyRead: false })).toBe(true);
  });
});

describe('read gate — defensive input handling', () => {
  it('treats corrupt localStorage counts as zero instead of disabling the gate', () => {
    // A NaN would make every comparison false and silently let everything
    // through, which is the failure mode worth pinning.
    expect(
      evaluateReadGate({
        isOwner: false,
        alreadyRead: false,
        chaptersReadInSeries: Number.NaN,
        uniqueSeriesRead: Number.NaN,
      })
    ).toEqual({ gated: false, reason: null });

    expect(
      evaluateReadGate({
        isOwner: false,
        alreadyRead: false,
        chaptersReadInSeries: -5,
        uniqueSeriesRead: -3,
      })
    ).toEqual({ gated: false, reason: null });
  });

  it('still counts a negative-but-real series history correctly', () => {
    expect(
      evaluateReadGate({
        isOwner: false,
        alreadyRead: false,
        chaptersReadInSeries: 1,
        uniqueSeriesRead: FREE_SERIES_LIMIT + 1,
      })
    ).toEqual({ gated: true, reason: 'series_limit' });
  });
});
