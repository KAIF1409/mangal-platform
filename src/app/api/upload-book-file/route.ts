import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '../../lib/auth/authedServerClient';
import { getMediaBucket, MEDIA_FOLDERS } from '../../lib/media/r2';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '../../lib/rateLimit';

// Books module — dedicated upload route for the book FILE itself (PDF/EPUB),
// separate from /api/upload-media on purpose:
//
// 1. /api/upload-media is image-only BY DESIGN (its magic-byte allowlist is
//    the XSS boundary — see the SECURITY FIX comment there). Loosening it to
//    also accept documents would blur that boundary; a separate route keeps
//    each pipeline's allowlist obvious.
// 2. Different size class entirely: covers/pages are capped at 15MB, a real
//    book file needs much more headroom.
// 3. Different serving path: uploaded images are served back through the
//    public /api/media/[...path] route. A book file must NEVER be — paid
//    books would be readable without purchasing. Files land under
//    books/files/ in R2 and are only ever streamed through the gated
//    /api/books/file/[bookId] route, which checks ownership/purchase first.
//
// Same security posture as upload-media: the client-supplied Content-Type
// and filename are never trusted — the real format is sniffed from magic
// bytes, and the R2 key's extension comes from the sniffed type.

const rateLimitClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 50MB — generous for a novel-length EPUB or a text-heavy PDF while staying
// well inside Cloudflare's request-body limits and the Worker's 128MB memory
// (this route buffers the file once for sniffing + put). Founder explicitly
// confirmed (2026-08-22) this stays a hard 50MB cap on a single backend
// (R2) rather than a <10MB-goes-to-Supabase-Storage / >=10MB-goes-to-R2
// split — Supabase Storage isn't used anywhere else in this app (every
// media pipeline, including this one, already migrated fully onto R2; see
// upload-media/route.ts and delete-media/route.ts's "Replaces client-side
// supabase.storage..." comments), and splitting book files across two
// backends would mean duplicating the private-file/paid-book-gating
// security posture (see the module comment above) for Supabase Storage too,
// for a file class that's well within R2's free-tier limits either way.
const MAX_BYTES = 50 * 1024 * 1024;

function asciiIncludes(bytes: Uint8Array, needle: string, limit: number): boolean {
  const hay = bytes.slice(0, limit);
  const target = needle.split('').map((c) => c.charCodeAt(0));
  outer: for (let i = 0; i <= hay.length - target.length; i++) {
    for (let j = 0; j < target.length; j++) {
      if (hay[i + j] !== target[j]) continue outer;
    }
    return true;
  }
  return false;
}

/** Sniffs the real document format from content. Returns null for anything
 * that isn't a PDF or a genuine EPUB container. */
function sniffBookType(bytes: Uint8Array): 'pdf' | 'epub' | null {
  // PDF: "%PDF-" at offset 0 (spec allows leading junk up to byte 1024, but
  // every real-world generator writes it first — accept offset 0 only, so a
  // polyglot can't hide a PDF payload behind some other header).
  if (
    bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 &&
    bytes[3] === 0x46 && bytes[4] === 0x2d
  ) {
    return 'pdf';
  }

  // EPUB: OCF spec says the first entry must be an uncompressed "mimetype"
  // file containing "application/epub+zip". So: ZIP local-file-header magic
  // (PK\x03\x04) AND the literal mimetype string within the first 128 bytes.
  // A bare PK header alone would admit any zip (docx/jar/apk...) — the
  // marker check is what makes this an EPUB allowlist rather than a zip one.
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    if (asciiIncludes(bytes, 'application/epub+zip', 128)) {
      return 'epub';
    }
  }

  return null;
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  // Much tighter than image uploads — book files are big, and this endpoint
  // existing at all is a storage-cost lever.
  const withinLimit = await checkRateLimit(rateLimitClient, `upload-book-file:${auth.userId}`, 10, 600);
  if (!withinLimit) {
    return NextResponse.json({ error: 'Too many uploads. Please slow down.' }, { status: 429 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid upload — expected multipart/form-data.' }, { status: 400 });
  }

  const file = formData.get('file');
  const folder = formData.get('folder');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing file.' }, { status: 400 });
  }
  // Fixed folder — unlike upload-media this route only ever writes to the
  // books/files prefix, so the client doesn't get to choose at all.
  if (folder !== MEDIA_FOLDERS.booksFiles) {
    return NextResponse.json({ error: 'Invalid folder.' }, { status: 400 });
  }
  if (file.size <= 0) {
    return NextResponse.json({ error: 'File is empty.' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File too large — 50MB max.' }, { status: 413 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffedType = sniffBookType(bytes);
  if (!sniffedType) {
    return NextResponse.json(
      { error: 'Only PDF or EPUB files are allowed.' },
      { status: 415 }
    );
  }

  const ext = sniffedType === 'pdf' ? 'pdf' : 'epub';
  const contentType = sniffedType === 'pdf' ? 'application/pdf' : 'application/epub+zip';
  const key = `${MEDIA_FOLDERS.booksFiles}/${auth.userId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  try {
    const bucket = getMediaBucket();
    await bucket.put(key, bytes, {
      httpMetadata: { contentType },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Upload failed.' },
      { status: 500 }
    );
  }

  // Only the R2 key is returned — deliberately NO public URL. Callers store
  // this key in books.file_url; reads go through /api/books/file/[bookId].
  return NextResponse.json({
    path: key,
    fileType: sniffedType,
    fileSizeBytes: file.size,
  });
}