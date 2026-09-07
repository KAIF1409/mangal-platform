import { supabase } from '../supabase';
import { releasedBook, type BookQueue, type LibraryBook, type LibraryProgress } from './library';

const BOOK_COLUMNS = 'id, title, cover_image_url, file_type, category, status, publish_at';
export interface LibrarySnapshot {
  books: LibraryBook[];
  progress: LibraryProgress[];
  queue: BookQueue | null;
  queueError: string | null;
}

export async function loadBookLibrary(userId: string): Promise<LibrarySnapshot> {
  const [progress, queue] = await Promise.all([
    supabase.from('book_reading_progress')
      .select('book_id, last_page, total_pages, percent, updated_at')
      .eq('user_id', userId).order('updated_at', { ascending: false }).limit(100),
    supabase.from('book_reading_queues').select('book_ids, revision').eq('user_id', userId).maybeSingle(),
  ]);
  if (progress.error) throw new Error('Reading progress could not be loaded. Please retry.');
  const rows = (progress.data ?? []) as LibraryProgress[];
  const savedQueue = queue.error ? null : (queue.data as BookQueue | null) ?? { book_ids: [], revision: 0 };
  const ids = [...new Set([...rows.map(row => row.book_id), ...(savedQueue?.book_ids ?? [])])];
  let books: LibraryBook[] = [];
  if (ids.length) {
    const result = await supabase.from('books').select(BOOK_COLUMNS).in('id', ids)
      .eq('status', 'published').or(`publish_at.is.null,publish_at.lte.${new Date().toISOString()}`);
    if (result.error) throw new Error('Your books could not be loaded. Please retry.');
    books = ((result.data ?? []) as LibraryBook[]).filter(book => releasedBook(book));
  }
  return { books, progress: rows, queue: savedQueue,
    queueError: queue.error ? 'Up Next is unavailable. Your saved reading progress is still available. Retry after the library service is ready.' : null };
}

export async function saveBookQueue(ids: string[], revision: number): Promise<BookQueue> {
  if (ids.length > 100 || new Set(ids).size !== ids.length) throw new Error('Up Next allows 100 unique books.');
  const { data, error } = await supabase.rpc('save_book_reading_queue', { p_book_ids: ids, p_revision: revision });
  if (error) throw new Error(error.code === '40001'
    ? 'Your queue changed in another session. Reload the library before trying again.'
    : 'Queue could not be saved. Your previous order has been kept.');
  if (!Number.isInteger(data)) throw new Error('Queue save could not be confirmed. Reload the library.');
  return { book_ids: ids, revision: data };
}

export async function discoverLibraryBooks(vibe: string | null, page: number): Promise<LibraryBook[]> {
  let ids: string[] | null = null;
  if (vibe) {
    const result = await supabase.from('book_vibes').select('book_id').eq('vibe', vibe)
      .order('book_id').range(page * 24, page * 24 + 23);
    if (result.error) throw new Error('Mood Matcher is unavailable. Try All books or retry later.');
    ids = (result.data ?? []).map(row => row.book_id);
    if (!ids.length) return [];
  }
  let query = supabase.from('books').select(BOOK_COLUMNS).eq('status', 'published')
    .or(`publish_at.is.null,publish_at.lte.${new Date().toISOString()}`)
    .order('created_at', { ascending: false }).order('id');
  query = ids ? query.in('id', ids) : query.range(page * 24, page * 24 + 23);
  const { data, error } = await query;
  if (error) throw new Error('Books could not be loaded. Please retry.');
  return ((data ?? []) as LibraryBook[]).filter(book => releasedBook(book));
}