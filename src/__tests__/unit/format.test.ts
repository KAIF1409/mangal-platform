import { describe, expect, it } from 'vitest';
import { formatViews } from '@/app/lib/format';

// lib/format.ts is the single source of truth for view counters across every
// WebMangal surface (Home, Search, Library, Bookmarks, Tags, creator pages).
describe('formatViews — WebMangal view-count formatter', () => {
  it('renders small numbers as-is', () => {
    expect(formatViews(0)).toBe('0');
    expect(formatViews(7)).toBe('7');
    expect(formatViews(999)).toBe('999');
  });

  it('formats thousands with one decimal + K suffix', () => {
    expect(formatViews(1_000)).toBe('1.0K');
    expect(formatViews(1_500)).toBe('1.5K');
    expect(formatViews(99_999)).toBe('100.0K');
  });

  it('formats millions with one decimal + M suffix', () => {
    expect(formatViews(1_000_000)).toBe('1.0M');
    expect(formatViews(2_500_000)).toBe('2.5M');
  });

  it('pins the 999,999 boundary behavior (rounds inside the K band)', () => {
    // Known quirk: 999,999 ÷ 1000 = 1000.0 — regression-pinned so a future
    // fix (e.g. promoting it to 1.0M) is a conscious change, not silent.
    expect(formatViews(999_999)).toBe('1000.0K');
  });

  it('handles negative inputs without crashing (defensive)', () => {
    expect(formatViews(-5)).toBe('-5');
  });
});
