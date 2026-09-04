import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireUser, getUserScopedClient } from '../../../../lib/auth/authedServerClient';
import { getMediaBucket } from '../../../../lib/media/r2';

// The ONLY way a book file ever leaves R2. /api/media/[...path] must never
// serve books/files/* — it has no purchase check — so this route is the
// single access-control boundary for paid content:
//
//   FREE book            → full file, anyone (cacheable)
//   PAID + owner         → full file
//   PAID + developer     → full file (same override as canManageSeries)
//   PAID + purchased     → full file (verified book_purchases row only —
//                          rows are inserted server-side by the payments
//                          verify/webhook routes after signature checks)
//   PAID + everyone else → TRUNCATED preview (first PREVIEW_MAX_BYTES),
//                          signed-in or not. The server literally never
//                          sends the rest of the bytes, so "preview" is an
//                          enforcement, not just a UI suggestion. pdf.js's
//                          recovery mode can usually reconstruct the first
//                          pages from a truncated stream; if a given PDF's
//                          layout defeats that, the reader degrades to the
//                          cover + purchase prompt rather than leaking.
//
// No edge caching here (unlike /api/media): access status changes the moment
// a purchase captures, and a cached "preview" response served to someone who
// just bought would be a correctness bug. FREE responses are browser-cacheable.

const anonClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ~1MB covers the first several pages of a typical text PDF. Chosen once,
// applied uniformly — not derived from anything client-supplied.
const PREVIEW_MAX_BYTES = 1024 * 1024;

const CONTENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  epub: 'application/epub+zip',
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;

  // UUID-shaped ids only — anything else can't be a real book id, don't
  // bother hitting the DB with it.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bookId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Auth is optional: anonymous readers get previews of paid books and full
  // access to free ones. When a session IS present, use the user-scoped
  // client so the same RLS policy also resolves the author's own drafts.
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '');
  let userId: string | null = null;
  let dbClient = anonClient;
  if (accessToken) {
    const authed = await requireUser(req);
    if (authed) {
      userId = authed.userId;
      dbClient = getUserScopedClient(accessToken);
    }
  }

  const { data: book } = await dbClient
    .from('books')
    .select('id, title, author_id, pricing_type, price_paise, file_url, file_type, status')
    .eq('id', bookId)
    .maybeSingle();

  if (!book) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Defense in depth: even if a row were ever written with a foreign key,
  // refuse to serve anything outside the books/files prefix through this
  // route (other prefixes belong to /api/media or nothing at all).
  const key = typeof book.file_url === 'string' ? book.file_url : '';
  if (!key.startsWith('books/files/')) {
    return NextResponse.json({ error: 'Invalid file reference.' }, { status: 500 });
  }

  // ── Access decision ──────────────────────────────────────────────────
  let hasFullAccess = false;
  if (book.pricing_type === 'FREE') {
    hasFullAccess = true;
  } else if (userId) {
    if (book.author_id === userId) {
      hasFullAccess = true;
    } else {
      const { data: profile } = await dbClient
        .from('profiles').select('role').eq('id', userId).maybeSingle();
      if (profile?.role === 'developer') {
        hasFullAccess = true;
      } else {
        const { data: purchase } = await dbClient
          .from('book_purchases')
          .select('id')
          .eq('book_id', bookId)
          .eq('user_id', userId)
          .maybeSingle();
        hasFullAccess = !!purchase;
      }
    }
  }

  let object;
  try {
    object = await getMediaBucket().get(key);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Storage lookup failed.' },
      { status: 500 }
    );
  }
  if (!object) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const contentType = CONTENT_TYPES[book.file_type] ?? 'application/octet-stream';
  const safeTitle = String(book.title ?? 'book').replace(/[^\x20-\x7e]/g, '').replace(/"/g, '');

  if (!hasFullAccess) {
    // Truncated preview — read the head of the object and stop there.
    const full = await object.arrayBuffer();
    const sliced = full.slice(0, Math.min(full.byteLength, PREVIEW_MAX_BYTES));
    return new Response(sliced, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(sliced.byteLength),
        'X-Book-Preview': '1',
        'X-Book-Total-Size': String(full.byteLength),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        ...(safeTitle ? { 'Content-Disposition': `inline; filename="${safeTitle}.${book.file_type}"` } : {}),
      },
    });
  }

  // Full access: stream straight from R2 instead of buffering the whole
  // object into an ArrayBuffer first. `object.arrayBuffer()` forces the
  // Worker to read the entire file into memory before the response can
  // start sending a single byte — for a multi-MB book that's exactly what
  // was showing up as the reader spinning on "Opening book…" and never
  // finishing. `object.body` is already a ReadableStream; handing it
  // straight to Response lets bytes flow to the client as R2 delivers them.
  return new Response(object.body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(object.size),
      // Paid files must never sit in a shared cache; free ones may.
      'Cache-Control': book.pricing_type === 'PAID' ? 'private, no-store' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      ...(safeTitle ? { 'Content-Disposition': `inline; filename="${safeTitle}.${book.file_type}"` } : {}),
    },
  });
}