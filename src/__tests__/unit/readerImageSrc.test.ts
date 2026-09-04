import { describe, expect, it } from 'vitest';
import { getReaderImageSrc, supportsLowQualityTransform } from '@/app/lib/media/readerImageSrc';

const LEGACY_URL = 'https://xyz.supabase.co/storage/v1/object/public/manga-pages/p1.jpg';
const R2_URL = 'https://mangal-platform.mangak.workers.dev/api/media/manga-pages/p1.jpg';

describe('getReaderImageSrc — data-saver / low-quality transform', () => {
  it('returns the original URL untouched on "high" quality, for either URL shape', () => {
    expect(getReaderImageSrc(LEGACY_URL, 'high')).toBe(LEGACY_URL);
    expect(getReaderImageSrc(R2_URL, 'high')).toBe(R2_URL);
  });

  it('rewrites a legacy Supabase Storage URL to the render/image transform endpoint on "low"', () => {
    const result = getReaderImageSrc(LEGACY_URL, 'low');
    expect(result).toContain('/render/image/public/');
    expect(result).toContain('width=720');
    expect(result).toContain('quality=65');
    expect(result).not.toContain('/object/public/');
  });

  it('BUG FIX: does NOT attempt a broken transform on the current R2-served (/api/media/) URL shape — serves the original directly', () => {
    // Before the fix, this fell through to the Supabase-only rewrite logic,
    // which is a no-op on this URL shape (no '/object/public/' substring to
    // replace), silently doing nothing while still being routed through the
    // "low quality" code path as if it worked. Verify the function is
    // explicit about it: recognizes it can't transform, and returns the
    // original URL rather than fabricating a URL that would 404.
    expect(getReaderImageSrc(R2_URL, 'low')).toBe(R2_URL);
  });

  it('appends to an existing query string instead of overwriting it (legacy URLs only)', () => {
    const withQuery = `${LEGACY_URL}?download=true`;
    const result = getReaderImageSrc(withQuery, 'low');
    expect(result).toContain('download=true');
    expect(result).toContain('&width=720');
  });
});

describe('supportsLowQualityTransform', () => {
  it('is true only for the legacy Supabase Storage public-URL shape', () => {
    expect(supportsLowQualityTransform(LEGACY_URL)).toBe(true);
    expect(supportsLowQualityTransform(R2_URL)).toBe(false);
  });
});
