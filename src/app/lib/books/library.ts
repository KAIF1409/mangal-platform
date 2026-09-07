import type { BookReadingProgressRow, BookRow } from '../database.types';

export const BOOK_VIBES = [
  { id: 'cozy-rainy-day', label: 'Cozy rainy day' },
  { id: 'fast-paced', label: 'Fast-paced' },
  { id: 'mind-bending', label: 'Mind-bending' },
  { id: 'heartwarming', label: 'Heartwarming' },
  { id: 'dark-and-tense', label: 'Dark & tense' },
] as const;

export type LibraryBook = Pick<BookRow, 'id' | 'title' | 'cover_image_url' | 'file_type' | 'category' | 'status' | 'publish_at'>;
export type LibraryProgress = Pick<BookReadingProgressRow, 'book_id' | 'last_page' | 'total_pages' | 'percent' | 'updated_at'>;
export interface BookQueue { book_ids: string[]; revision: number }
export interface ActiveBook { book: LibraryBook; progress: LibraryProgress; percent: number }

export function progressPercent(progress: LibraryProgress): number {
  // Paginated PDFs update pages but may retain a stale scroll-mode percent.
  const value = progress.total_pages && progress.total_pages > 0
    ? (progress.last_page / progress.total_pages) * 100
    : progress.percent ?? 0;
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}

export function releasedBook(book: LibraryBook, now = Date.now()): boolean {
  return book.status === 'published' &&
    (book.publish_at === null || Date.parse(book.publish_at) <= now);
}

export function activeBooks(books: LibraryBook[], progress: LibraryProgress[]): ActiveBook[] {
  const byId = new Map(books.filter(book => releasedBook(book)).map(book => [book.id, book]));
  return progress.flatMap(row => {
    const book = byId.get(row.book_id);
    const percent = progressPercent(row);
    return book && percent < 100 ? [{ book, progress: row, percent }] : [];
  }).sort((a, b) => Date.parse(b.progress.updated_at) - Date.parse(a.progress.updated_at));
}

export function moveQueueItem(ids: string[], from: number, to: number): string[] {
  if (from < 0 || from >= ids.length || to < 0 || to >= ids.length || from === to) return ids;
  const result = [...ids];
  const [item] = result.splice(from, 1);
  result.splice(to, 0, item);
  return result;
}