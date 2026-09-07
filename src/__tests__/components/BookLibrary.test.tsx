import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LibraryShelves } from '@/app/components/books/BookLibrary';
import { discoverLibraryBooks, loadBookLibrary, saveBookQueue, type LibrarySnapshot } from '@/app/lib/books/libraryClient';
import type { LibraryBook } from '@/app/lib/books/library';

vi.mock('@/app/lib/books/libraryClient', () => ({
  discoverLibraryBooks: vi.fn(), loadBookLibrary: vi.fn(), saveBookQueue: vi.fn(),
}));
vi.mock('@/app/lib/supabase', () => ({ supabase: {} }));

const books: LibraryBook[] = ['River', 'Forest'].map((title, index) => ({
  id: `book-${index}`, title, file_type: 'epub', cover_image_url: null, category: 'Fiction', status: 'published', publish_at: null,
}));
const snapshot = (): LibrarySnapshot => ({
  books, queue: { book_ids: books.map(book => book.id), revision: 3 }, queueError: null,
  progress: [{ book_id: books[0].id, last_page: 1, total_pages: null, percent: 42, updated_at: '2026-09-07' }],
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(loadBookLibrary).mockResolvedValue(snapshot());
  vi.mocked(discoverLibraryBooks).mockResolvedValue(books);
  vi.mocked(saveBookQueue).mockImplementation(async ids => ({ book_ids: ids, revision: 4 }));
});

describe('Book Library', () => {
  it('shows a sign-in path without fetching private shelves for guests', async () => {
    render(<LibraryShelves userId={null} />);
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
    await screen.findByRole('button', { name: 'Add River to Up Next' });
    expect(loadBookLibrary).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Add River to Up Next' })).toBeDisabled();
  });
  it('resumes the current book and renders horizontal shelves', async () => {
    render(<LibraryShelves userId="reader-a" />);
    expect(await screen.findByRole('link', { name: 'Resume Reading' })).toHaveAttribute('href', '/WebMangal/books/book-0/read');
    expect(screen.getByRole('region', { name: 'Current Read' })).toHaveTextContent('42% completed');
    expect(screen.getByRole('list', { name: 'In Progress books' })).toBeInTheDocument();
  });
  it('persists keyboard/touch reordering with a revision', async () => {
    render(<LibraryShelves userId="reader-a" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Move Forest earlier' }));
    await waitFor(() => expect(saveBookQueue).toHaveBeenCalledWith(['book-1', 'book-0'], 3));
    await screen.findByText('Up Next saved.');
    const items = within(screen.getByRole('list', { name: 'Up Next books' })).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Forest');
  });
  it('retains the old order and announces failed saves', async () => {
    vi.mocked(saveBookQueue).mockRejectedValue(new Error('Queue could not be saved.'));
    render(<LibraryShelves userId="reader-a" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Move Forest earlier' }));
    await screen.findByText('Queue could not be saved.');
    expect(within(screen.getByRole('list', { name: 'Up Next books' })).getAllByRole('listitem')[0]).toHaveTextContent('River');
  });
  it('persists drag-and-drop order', async () => {
    render(<LibraryShelves userId="reader-a" />);
    const list = await screen.findByRole('list', { name: 'Up Next books' });
    const items = within(list).getAllByRole('listitem');
    fireEvent.dragStart(items[0], { dataTransfer: { setData: vi.fn() } });
    fireEvent.drop(items[1]);
    await waitFor(() => expect(saveBookQueue).toHaveBeenCalledWith(['book-1', 'book-0'], 3));
  });
  it('adds a discovered book and disables duplicate additions', async () => {
    vi.mocked(loadBookLibrary).mockResolvedValue({ ...snapshot(), queue: { book_ids: [], revision: 0 } });
    render(<LibraryShelves userId="reader-a" />);
    const add = await screen.findByRole('button', { name: 'Add River to Up Next' });
    await waitFor(() => expect(add).toBeEnabled());
    fireEvent.click(add);
    await waitFor(() => expect(saveBookQueue).toHaveBeenCalledWith(['book-0'], 0));
    await screen.findByText('Up Next saved.');
    expect(add).toBeDisabled();
  });
  it('keeps progress visible when the queue migration is unavailable', async () => {
    vi.mocked(loadBookLibrary).mockResolvedValue({ ...snapshot(), queue: null, queueError: 'Up Next is unavailable.' });
    render(<LibraryShelves userId="reader-a" />);
    await screen.findByRole('link', { name: 'Resume Reading' });
    expect(screen.getByRole('alert')).toHaveTextContent('Up Next is unavailable.');
    expect(screen.getByRole('button', { name: 'Add River to Up Next' })).toBeDisabled();
  });
  it('filters by explicit vibe and shows discovery errors', async () => {
    render(<LibraryShelves userId={null} />);
    await screen.findByRole('button', { name: 'Add River to Up Next' });
    vi.mocked(discoverLibraryBooks).mockRejectedValue(new Error('Mood Matcher is unavailable.'));
    fireEvent.click(screen.getByRole('button', { name: 'Cozy rainy day' }));
    await waitFor(() => expect(discoverLibraryBooks).toHaveBeenLastCalledWith('cozy-rainy-day', 0));
    expect(await screen.findByRole('alert')).toHaveTextContent('Mood Matcher is unavailable.');
  });
  it('removes unavailable queue entries without displaying private metadata', async () => {
    vi.mocked(loadBookLibrary).mockResolvedValue({ ...snapshot(), books: [books[0]] });
    render(<LibraryShelves userId="reader-a" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Unavailable book from Up Next' }));
    await waitFor(() => expect(saveBookQueue).toHaveBeenCalledWith(['book-0'], 3));
  });
});