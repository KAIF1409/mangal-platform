// Books module — metadata-manager helpers shared by every books surface.
//
// §142 adds three columns to public.books (see
// supabase/migrations/20260902090000_books_metadata.sql):
//
//   genre_tags  text[]      — multi-select genre tags (complements category)
//   is_mature   boolean     — mature-content flag (18+ badge on public surfaces)
//   publish_at  timestamptz — scheduling: a published book whose publish_at is
//                             in the future is treated as not-yet-live by the
//                             public surfaces until that moment
//
// Every reader degrades gracefully when the migration hasn't been applied yet:
// PostgREST then answers PGRST204 ("Could not find the 'genre_tags' column of
// 'books' in the schema cache") and the helpers below fall back to the legacy
// column list / treat the fields as absent. RLS is untouched in either state.
// No RLS change is contemplated in this file or the migration — the hard
// scope rule for books/payments tables' RLS holds.

export const BOOK_METADATA_COLUMNS = 'genre_tags, is_mature, publish_at';

export const BOOK_LIST_COLUMNS_LEGACY =
  'id, title, description, cover_image_url, file_type, pricing_type, price_paise, category, author_id, created_at';

export const BOOK_LIST_COLUMNS = `${BOOK_LIST_COLUMNS_LEGACY}, ${BOOK_METADATA_COLUMNS}`;

/** Optional row fields — absent (undefined) when the migration isn't applied. */
export interface BookMetadataFields {
  genre_tags?: string[] | null;
  is_mature?: boolean | null;
  publish_at?: string | null;
}

interface PgErrorShape {
  code?: string;
  message?: string;
  details?: string;
}

/** True when the query died specifically because the §142 columns are missing. */
export function isMissingMetadataColumnError(error: PgErrorShape | null | undefined): boolean {
  if (!error) return false;
  const haystack = `${error.message ?? ''} ${error.details ?? ''}`;
  return (
    error.code === 'PGRST204' ||
    /could not find the '(genre_tags|is_mature|publish_at)' column/i.test(haystack)
  );
}

type BooksQueryResult<R> = { data: R[] | null; error: PgErrorShape | null };

/**
 * Runs a books query selecting the full (metadata-augmented) column list,
 * transparently retrying with the legacy list when the DB predates the §142
 * migration. `build` receives the column string and must return the awaited
 * PostgREST result (a supabase query builder is directly awaitable, so call
 * sites pass `build = (cols) => supabase.from('books').select(cols).eq(...)`).
 */
export async function runBooksQueryWithMetadataFallback<R>(
  build: (columns: string) => PromiseLike<BooksQueryResult<R>>,
): Promise<BooksQueryResult<R>> {
  const primary = await build(BOOK_LIST_COLUMNS);
  if (primary.error && isMissingMetadataColumnError(primary.error)) {
    return build(BOOK_LIST_COLUMNS_LEGACY);
  }
  return primary;
}

/** True when the book is published but its schedule moment is still ahead. */
export function bookIsScheduled(
  book: BookMetadataFields,
  now: Date = new Date(),
): boolean {
  if (!book.publish_at) return false;
  const at = new Date(book.publish_at);
  return !Number.isNaN(at.getTime()) && at.getTime() > now.getTime();
}

/** Formatted schedule moment for "Scheduled for …" copy. */
export function formatScheduleAt(book: BookMetadataFields): string | null {
  if (!book.publish_at) return null;
  const at = new Date(book.publish_at);
  if (Number.isNaN(at.getTime())) return null;
  return at.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Row's genre tags — empty when the field is absent or unset. */
export function bookGenreTags(book: BookMetadataFields): string[] {
  return Array.isArray(book.genre_tags) ? book.genre_tags : [];
}

/** Mature-content flag — false when the field is absent or unset. */
export function bookIsMature(book: BookMetadataFields): boolean {
  return book.is_mature === true;
}
