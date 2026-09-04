import { describe, expect, it } from 'vitest';
import { computeNovelScrollProgress } from '@/app/lib/novelEditor';

describe('computeNovelScrollProgress', () => {
  // Regression: a chapter short enough to fit the viewport with nothing to
  // scroll used to make the reader page's onScroll handler return early and
  // NEVER save reading_progress for it (the scroll event that would have
  // triggered a save simply never fires). The whole chapter is already
  // fully visible, so this must resolve as fully read (100), not 0/NaN.
  it('treats a chapter with nothing to scroll (scrollHeight <= clientHeight) as 100% read', () => {
    expect(computeNovelScrollProgress({ scrollTop: 0, scrollHeight: 400, clientHeight: 800 })).toBe(100);
  });

  it('treats an exact-fit chapter (scrollHeight === clientHeight) as 100% read', () => {
    expect(computeNovelScrollProgress({ scrollTop: 0, scrollHeight: 800, clientHeight: 800 })).toBe(100);
  });

  it('never returns NaN or Infinity for a zero-scrollable container (no division by zero)', () => {
    const pct = computeNovelScrollProgress({ scrollTop: 0, scrollHeight: 500, clientHeight: 500 });
    expect(Number.isFinite(pct)).toBe(true);
  });

  it('computes a real percentage for a normally-scrollable chapter', () => {
    // scrollHeight 2000, clientHeight 1000 -> 1000px of actual scroll range.
    // Halfway through that range (500px) should read as 50%.
    expect(computeNovelScrollProgress({ scrollTop: 500, scrollHeight: 2000, clientHeight: 1000 })).toBe(50);
  });

  it('reads 0% at the very top of a scrollable chapter', () => {
    expect(computeNovelScrollProgress({ scrollTop: 0, scrollHeight: 2000, clientHeight: 1000 })).toBe(0);
  });

  it('reads 100% at the very bottom of a scrollable chapter', () => {
    expect(computeNovelScrollProgress({ scrollTop: 1000, scrollHeight: 2000, clientHeight: 1000 })).toBe(100);
  });

  it('rounds to the nearest integer percent', () => {
    // 333 / 1000 = 33.3% -> rounds to 33
    expect(computeNovelScrollProgress({ scrollTop: 333, scrollHeight: 2000, clientHeight: 1000 })).toBe(33);
  });
});
