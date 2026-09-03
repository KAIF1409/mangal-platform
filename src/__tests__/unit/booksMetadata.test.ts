import { describe, expect, it, vi } from 'vitest';
import {
  BOOK_LIST_COLUMNS,
  BOOK_LIST_COLUMNS_LEGACY,
  bookGenreTags,
  bookIsMature,
  bookIsScheduled,
  formatScheduleAt,
  isMissingMetadataColumnError,
  runBooksQueryWithMetadataFallback,
} from '@/app/lib/booksMetadata';

const future = new Date(Date.now() + 7 * 86_400_000).toISOString();
const past = new Date(Date.now() - 7 * 86_400_000).toISOString();

describe('isMissingMetadataColumnError — §142 schema-fallback detection', () => {
  it('is false for a clean result', () => {
    expect(isMissingMetadataColumnError(null)).toBe(false);
    expect(isMissingMetadataColumnError(undefined)).toBe(false);
  });

  it('detects the PGRST204 schema-cache error code', () => {
    expect(isMissingMetadataColumnError({ code: 'PGRST204' })).toBe(true);
  });

  it('detects the human message variant even without the code', () => {
    expect(
      isMissingMetadataColumnError({
        message: `Could not find the 'genre_tags' column of 'books' in the schema cache`,
      }),
    ).toBe(true);
    expect(isMissingMetadataColumnError({ details: "could not find the 'is_mature' column" })).toBe(true);
  });

  it('does not misclassify unrelated errors', () => {
    expect(isMissingMetadataColumnError({ code: '42501', message: 'permission denied' })).toBe(false);
  });
});

describe('runBooksQueryWithMetadataFallback', () => {
  const ok = (rows: unknown[]) => ({ data: rows, error: null });

  it('selects the full metadata column list first', async () => {
    const build = vi.fn(async () => ok([]));
    await runBooksQueryWithMetadataFallback(build);
    expect(build).toHaveBeenCalledTimes(1);
    expect(build).toHaveBeenCalledWith(BOOK_LIST_COLUMNS);
    expect(BOOK_LIST_COLUMNS).toContain('genre_tags');
    expect(BOOK_LIST_COLUMNS).toContain('is_mature');
    expect(BOOK_LIST_COLUMNS).toContain('publish_at');
  });

  it('retries once with the legacy column list on PGRST204', async () => {
    const build = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { code: 'PGRST204' } })
      .mockResolvedValueOnce(ok([{ id: 'b1' }]));
    const result = await runBooksQueryWithMetadataFallback(build);
    expect(build).toHaveBeenCalledTimes(2);
    expect(build).toHaveBeenLastCalledWith(BOOK_LIST_COLUMNS_LEGACY);
    expect(result.data).toEqual([{ id: 'b1' }]);
    expect(result.error).toBeNull();
  });

  it('does NOT retry on unrelated errors', async () => {
    const build = vi.fn(async () => ({ data: null, error: { code: '42501', message: 'denied' } }));
    const result = await runBooksQueryWithMetadataFallback(build);
    expect(build).toHaveBeenCalledTimes(1);
    expect(result.error?.code).toBe('42501');
  });
});

describe('bookIsScheduled — publish_at gating', () => {
  it('treats a missing publish_at as live now', () => {
    expect(bookIsScheduled({})).toBe(false);
    expect(bookIsScheduled({ publish_at: null })).toBe(false);
  });

  it('hides a published book whose schedule moment is still ahead', () => {
    expect(bookIsScheduled({ publish_at: future })).toBe(true);
  });

  it('shows a book whose schedule moment has passed', () => {
    expect(bookIsScheduled({ publish_at: past })).toBe(false);
  });

  it('fails safe on an invalid timestamp', () => {
    expect(bookIsScheduled({ publish_at: 'not-a-date' })).toBe(false);
  });
});

describe('formatScheduleAt', () => {
  it('returns null for missing/invalid timestamps', () => {
    expect(formatScheduleAt({})).toBeNull();
    expect(formatScheduleAt({ publish_at: 'nope' })).toBeNull();
  });

  it('formats a valid schedule moment (en-IN)', () => {
    const out = formatScheduleAt({ publish_at: future });
    expect(typeof out).toBe('string');
    expect(out!.length).toBeGreaterThan(0);
  });
});

describe('metadata field accessors', () => {
  it('bookGenreTags defaults to [] when the column is absent', () => {
    expect(bookGenreTags({})).toEqual([]);
    expect(bookGenreTags({ genre_tags: null })).toEqual([]);
    expect(bookGenreTags({ genre_tags: ['Action', 'Fantasy'] })).toEqual(['Action', 'Fantasy']);
  });

  it('bookIsMature is true only for an explicit true flag', () => {
    expect(bookIsMature({ is_mature: true })).toBe(true);
    expect(bookIsMature({ is_mature: false })).toBe(false);
    expect(bookIsMature({})).toBe(false);
    expect(bookIsMature({ is_mature: null })).toBe(false);
  });
});
