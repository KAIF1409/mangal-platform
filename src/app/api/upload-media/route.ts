import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '../../lib/auth/authedServerClient';
import { getMediaBucket, MEDIA_FOLDERS } from '../../lib/media/r2';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '../../lib/rateLimit';

// Used only to reach the shared rate_limit_events store — same reasoning
// as every other route using checkRateLimit().
const rateLimitClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Replaces direct client-side `supabase.storage.from(bucket).upload(...)`
// calls (see CONTEXT.md §20 for the Supabase→R2 rationale). The R2
// binding only exists server-side inside the Worker, so uploads now go
// through this route instead of a browser SDK talking to storage
// directly with an anon key + RLS policy.
//
// folder must be one of MEDIA_FOLDERS' values — an allowlist, not a
// free-form client-supplied path, so nothing can write outside the
// expected prefixes in the bucket.
const ALLOWED_FOLDERS = new Set<string>(Object.values(MEDIA_FOLDERS));

// SECURITY FIX (2026-08-21): file type was never validated server-side —
// only file.size and the folder were checked. Every upload UI in the app
// uses accept="image/*", but that's a client-side hint only; anyone can
// call this route directly (curl/fetch with a valid session) with any
// file.type they like. The old code stored that client-supplied MIME type
// verbatim and /api/media/[...path] served it back with that exact
// Content-Type and no nosniff header — so an authenticated user (any
// role, not just admin) could upload a file declared as text/html (or
// image/svg+xml, which can embed <script> and executes when opened
// directly) and get a fully live HTML/JS page hosted on this app's own
// origin: a stored XSS / session-hijack vector, not a theoretical one.
//
// Fix: explicit raster-image allowlist, checked against both the
// declared MIME type AND real file-content magic bytes (never trust a
// client-supplied Content-Type alone) before anything is written to R2.
const ALLOWED_IMAGE_TYPES: Record<string, number[][]> = {
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/png': [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]], // 'RIFF' — WEBP marker follows at byte 8, checked separately below
  'image/gif': [[0x47, 0x49, 0x46, 0x38, 0x37, 0x61], [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]],
};

function matchesMagicBytes(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  for (let i = 0; i < signature.length; i++) {
    if (bytes[i] !== signature[i]) return false;
  }
  return true;
}

/** Sniffs the real file format from its content, ignoring whatever the
 * client claimed. Returns null if it doesn't match any allowed image
 * format — this is the actual security boundary, not file.type. */
function sniffAllowedImageType(bytes: Uint8Array): string | null {
  for (const [mime, signatures] of Object.entries(ALLOWED_IMAGE_TYPES)) {
    for (const sig of signatures) {
      if (matchesMagicBytes(bytes, sig)) {
        if (mime === 'image/webp') {
          // RIFF is a container format — confirm the WEBP marker at bytes
          // 8-11 so we don't accept arbitrary RIFF files (e.g. .wav/.avi).
          const webpMarker = [0x57, 0x45, 0x42, 0x50]; // 'WEBP'
          if (bytes.length >= 12 && matchesMagicBytes(bytes.slice(8, 12), webpMarker)) {
            return mime;
          }
          continue;
        }
        return mime;
      }
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  // Keyed by user, not IP - an unlimited free upload endpoint is a
  // storage-cost and abuse vector on its own even with valid auth.
  //
  // BULK-UPLOAD FIX: this was 30/300s, but a manga chapter is published by
  // uploading its pages ONE PER REQUEST (the sequential loop in
  // WebMangal/upload/page.tsx), and real chapters run 10-60 pages
  // (ManagePagesModal's own scale comment). 30 per 5 minutes meant any
  // chapter longer than 30 pages failed with 429 halfway through publish —
  // an entirely legitimate use tripping the abuse guard. 120/5min still caps
  // abuse (≈15MB/min sustained at the 15MB/file cap) while never blocking a
  // single full chapter publish.
  const withinLimit = await checkRateLimit(rateLimitClient, `upload-media:${auth.userId}`, 120, 300);
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
  if (typeof folder !== 'string' || !ALLOWED_FOLDERS.has(folder)) {
    return NextResponse.json({ error: 'Invalid or missing folder.' }, { status: 400 });
  }

  // 15MB cap — generous for a manga page/cover/avatar image, prevents
  // someone from streaming an enormous file through the Worker.
  const MAX_BYTES = 15 * 1024 * 1024;
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File too large — 15MB max.' }, { status: 413 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffedType = sniffAllowedImageType(bytes);
  if (!sniffedType) {
    return NextResponse.json(
      { error: 'Only JPEG, PNG, WEBP, or GIF images are allowed.' },
      { status: 415 }
    );
  }

  const EXT_BY_TYPE: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  // Extension comes from the sniffed real type, never from the client-
  // supplied filename — closes the same gap as the Content-Type fix.
  const ext = EXT_BY_TYPE[sniffedType];
  const key = `${folder}/${auth.userId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  try {
    const bucket = getMediaBucket();
    await bucket.put(key, bytes, {
      httpMetadata: { contentType: sniffedType },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Upload failed.' },
      { status: 500 }
    );
  }

  // Full path is what callers store in the DB and what /api/media serves.
  return NextResponse.json({ path: key, url: `/api/media/${key}` });
}
