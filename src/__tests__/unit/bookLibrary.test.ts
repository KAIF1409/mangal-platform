import { describe, expect, it } from 'vitest';
import { activeBooks, moveQueueItem, progressPercent, releasedBook, type LibraryBook, type LibraryProgress } from '@/app/lib/books/library';

const book = (id: string, over: Partial<LibraryBook> = {}): LibraryBook => ({
  id, title: id, cover_image_url: null, file_type: 'epub', category: null, status: 'published', publish_at: null, ...over,
});
const progress = (id: string, over: Partial<LibraryProgress> = {}): LibraryProgress => ({
  book_id: id, last_page: 1, total_pages: null, percent: 42, updated_at: '2026-09-07T12:00:00Z', ...over,
});

describe('Book Library shelves', () => {
  it('uses PDF pages rather than stale scroll percentage', () => {
    expect(progressPercent(progress('a', { last_page: 14, total_pages: 100, percent: 80 }))).toBeCloseTo(14);
  });
  it('uses synced EPUB percentage and bounds invalid values', () => {
    expect(progressPercent(progress('a'))).toBe(42);
    expect(progressPercent(progress('a', { percent: 150 }))).toBe(100);
    expect(progressPercent(progress('a', { percent: -2 }))).toBe(0);
    expect(progressPercent(progress('a', { percent: NaN }))).toBe(0);
    expect(progressPercent(progress('a', { percent: null }))).toBe(0);
  });
  it('hides drafts, future releases and invalid release dates', () => {
    expect(releasedBook(book('a', { status: 'draft' }))).toBe(false);
    expect(releasedBook(book('a', { publish_at: '2999-01-01' }))).toBe(false);
    expect(releasedBook(book('a', { publish_at: 'invalid' }))).toBe(false);
    expect(releasedBook(book('a', { publish_at: '2020-01-01' }))).toBe(true);
  });
  it('selects recent unfinished reads, excluding inaccessible and completed books', () => {
    const rows = [progress('old', { updated_at: '2026-01-01' }), progress('new'), progress('done', { percent: 100 }), progress('draft'), progress('missing')];
    const books = [book('old'), book('new'), book('done'), book('draft', { status: 'draft' })];
    expect(activeBooks(books, rows).map(row => row.book.id)).toEqual(['new', 'old']);
  });
  it('reorders without mutating and ignores invalid moves', () => {
    const ids = ['a', 'b', 'c'];
    expect(moveQueueItem(ids, 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveQueueItem(ids, 2, 0)).toEqual(['c', 'a', 'b']);
    expect(ids).toEqual(['a', 'b', 'c']);
    expect(moveQueueItem(ids, -1, 0)).toBe(ids);
    expect(moveQueueItem(ids, 0, 3)).toBe(ids);
  });
});