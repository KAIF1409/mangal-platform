// @vitest-environment node
// /api/books/file/[bookId] is the SINGLE access-control boundary for paid
// book files — the only way a book file ever leaves R2. These tests pin the
// full access matrix: free/paid × anonymous/owner/developer/purchased/other.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const createClientMock = vi.hoisted(() => vi.fn());
vi.mock('@supabase/supabase-js', () => ({ createClient: createClientMock }));

const authedServerClient = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getUserScopedClient: vi.fn(),
}));
vi.mock('@/app/lib/auth/authedServerClient', () => authedServerClient);

const r2 = vi.hoisted(() => ({ getMediaBucket: vi.fn() }));
vi.mock('@/app/lib/media/r2', () => r2);

type Row = Record<string, unknown>;

const FULL_BYTES = 2 * 1024 * 1024; // 2MB
const bytes = (n: number, fill = 7) => {
  const arr = new Uint8Array(n).fill(fill);
  return arr.buffer;
};

interface DbOpts {
  book?: Row | null;
  role?: string | null;
  purchased?: boolean;
}

/** PostgREST-style mock resolving per-table for .maybeSingle() chains. */
function makeDb({ book = null, role = null, purchased = false }: DbOpts = {}) {
  const resolve = (table: string) => {
    if (table === 'books') return { data: book };
    if (table === 'profiles') return { data: role === null ? null : { role } };
    if (table === 'book_purchases') return { data: purchased ? { id: 'p1' } : null };
    return { data: null };
  };
  const chain = (table: string) => {
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = () => b;
    b.maybeSingle = async () => resolve(table);
    return b;
  };
  return { from: (t: string) => chain(t) };
}

const makeObject = () => ({ arrayBuffer: async () => bytes(FULL_BYTES) });

const BUCKET = { get: vi.fn() };

const BOOK_ID = '11111111-1111-4111-8111-111111111111';
const freeBook = {
  id: BOOK_ID,
  title: 'Aryavarta Guide',
  author_id: 'author-1',
  pricing_type: 'FREE',
  price_paise: 0,
  file_url: 'books/files/abc.pdf',
  file_type: 'pdf',
  status: 'published',
};

let currentScopedDb: ReturnType<typeof makeDb> | null = null;

// The route captures its anon client at import time, so the mock must
// delegate per-call to a mutable ref rather than return a fixed object.
const anonDbRef = { current: makeDb({ book: null }) };

const call = async (bookId: string, token?: string) => {
  const { GET } = await import('@/app/api/books/file/[bookId]/route');
  return GET(
    new NextRequest(`http://localhost:3000/api/books/file/${bookId}`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }),
    { params: Promise.resolve({ bookId }) },
  );
};

describe('GET /api/books/file/[bookId] — paid-content access boundary', () => {
  it('404s a non-UUID id without touching storage', async () => {
    const res = await call('../../etc/passwd');
    expect(res.status).toBe(404);
    expect(r2.getMediaBucket).not.toHaveBeenCalled();
  });

  it('404s an unknown book id', async () => {
    const res = await call(BOOK_ID);
    expect(res.status).toBe(404);
    expect(BUCKET.get).not.toHaveBeenCalled();
  });

  it('serves a FREE book in full to anonymous readers, browser-cacheable', async () => {
    anonDbRef.current = makeDb({ book: freeBook });
    const res = await call(BOOK_ID);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=3600');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Content-Disposition')).toContain('.pdf');
    expect((await res.arrayBuffer()).byteLength).toBe(FULL_BYTES);
    expect(res.headers.get('X-Book-Preview')).toBeNull();
  });

  it('serves a PAID book to anonymous readers as a TRUNCATED 1MB preview, never cached', async () => {
    anonDbRef.current = makeDb({
      book: { ...freeBook, pricing_type: 'PAID', price_paise: 4900 },
    });
    const res = await call(BOOK_ID);
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Book-Preview')).toBe('1');
    expect(res.headers.get('X-Book-Total-Size')).toBe(String(FULL_BYTES));
    expect(Number(res.headers.get('Content-Length'))).toBeLessThanOrEqual(1024 * 1024);

describe('GET /api/books/file/[bookId] — signed-in access matrix', () => {
  const paidBook = { ...freeBook, pricing_type: 'PAID', price_paise: 4900 };

  const signIn = (userId: string, db: ReturnType<typeof makeDb>) => {
    authedServerClient.requireUser.mockResolvedValue({ userId });
    authedServerClient.getUserScopedClient.mockReturnValue(db);
  };

  it('gives the AUTHOR full access to their own paid book', async () => {
    const db = makeDb({ book: paidBook });
    signIn('author-1', db);
    const res = await call(BOOK_ID, 'token-a');
    expect(res.status).toBe(200);
    expect((await res.arrayBuffer()).byteLength).toBe(FULL_BYTES);
    expect(res.headers.get('X-Book-Preview')).toBeNull();
  });

  it('gives a developer-role account full access (canManageSeries parity)', async () => {
    const db = makeDb({ book: paidBook, role: 'developer' });
    signIn('dev-1', db);
    const res = await call(BOOK_ID, 'token-d');
    expect((await res.arrayBuffer()).byteLength).toBe(FULL_BYTES);
  });

  it('gives a reader who PURCHASED the book full access', async () => {
    const db = makeDb({ book: paidBook, role: 'reader', purchased: true });
    signIn('reader-1', db);
    const res = await call(BOOK_ID, 'token-r');
    expect((await res.arrayBuffer()).byteLength).toBe(FULL_BYTES);
  });

  it('keeps a signed-in non-purchaser at the preview tier', async () => {
    const db = makeDb({ book: paidBook, role: 'reader', purchased: false });
    signIn('reader-2', db);
    const res = await call(BOOK_ID, 'token-x');
    expect(res.headers.get('X-Book-Preview')).toBe('1');
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('refuses to serve files outside the books/files/ prefix (defense in depth)', async () => {
    anonDbRef.current = makeDb({
      book: { ...freeBook, file_url: 'katube/thumbs/x.jpg' },
    });
    const res = await call(BOOK_ID);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('Invalid file reference.');
    expect(BUCKET.get).not.toHaveBeenCalled();
  });

  it('maps epub files to the epub content type', async () => {
    anonDbRef.current = makeDb({ book: { ...freeBook, file_type: 'epub' } });
    const res = await call(BOOK_ID);
    expect(res.headers.get('Content-Type')).toBe('application/epub+zip');
  });

  it('404s when the storage object itself is missing', async () => {
    anonDbRef.current = makeDb({ book: freeBook });
    BUCKET.get.mockResolvedValue(null);
    const res = await call(BOOK_ID);
    expect(res.status).toBe(404);
  });

  it('paid responses are never cacheable even for the author', async () => {
    const db = makeDb({ book: { ...freeBook, pricing_type: 'PAID' } });
    signIn('author-1', db);
    const res = await call(BOOK_ID, 'token-a');
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });
});

    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect((await res.arrayBuffer()).byteLength).toBe(1024 * 1024);
  });
});


beforeEach(() => {
  vi.clearAllMocks();
  currentScopedDb = null;
  anonDbRef.current = makeDb({ book: null });
  createClientMock.mockImplementation(() => ({ from: (t: string) => anonDbRef.current.from(t) }));
  authedServerClient.requireUser.mockResolvedValue(null);
  authedServerClient.getUserScopedClient.mockImplementation(() => currentScopedDb ?? makeDb({}));
  r2.getMediaBucket.mockReturnValue(BUCKET);
  BUCKET.get.mockResolvedValue(makeObject());
});
