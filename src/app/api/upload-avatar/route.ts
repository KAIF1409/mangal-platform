import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '../../lib/auth/authedServerClient';
import { getMediaBucket } from '../../lib/media/r2';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '../../lib/rateLimit';

// Dedicated avatar upload endpoint (profile settings). Split from
// /api/upload-media so avatars get their own tighter rules: no GIF
// (animated profile pictures are an abuse magnet), a 2MB cap instead of
// 15MB, keys namespaced under kcircle-media/avatars/, and their own rate
// bucket. The heavy lifting (decode/resize/re-encode) happens client-side
// via Canvas — see lib/media/compressAvatarImage.ts — so this route stays
// pure standard fetch/Web APIs and adds ~nothing to the OpenNext Worker
// bundle (sharp or any native image lib would blow its 3MB limit).
//
// Used only to reach the shared rate_limit_events store — same reasoning
// as every other route using checkRateLimit().
const rateLimitClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Same stored-XSS defense as upload-media: validate the real bytes via
// magic numbers, never the client-supplied Content-Type/filename. HEIC is
// intentionally absent — the client converts it to JPEG before sending;
// if it arrives here as HEIC anyway, it simply fails this sniff.
const ALLOWED_AVATAR_TYPES: Record<string, number[][]> = {
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/png': [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]], // 'RIFF' — WEBP marker verified at bytes 8-11 below
};

function matchesMagicBytes(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  for (let i = 0; i < signature.length; i++) {
    if (bytes[i] !== signature[i]) return false;
  }
  return true;
}

function sniffAllowedAvatarType(bytes: Uint8Array): string | null {
  for (const [mime, signatures] of Object.entries(ALLOWED_AVATAR_TYPES)) {
    for (const sig of signatures) {
      if (!matchesMagicBytes(bytes, sig)) continue;
      if (mime === 'image/webp') {
        // RIFF is a container — confirm the actual WEBP marker at bytes
        // 8-11 so arbitrary RIFF files (.wav/.avi) can't slip through.
        const webpMarker = [0x57, 0x45, 0x42, 0x50]; // 'WEBP'
        return bytes.length >= 12 && matchesMagicBytes(bytes.slice(8, 12), webpMarker) ? mime : null;
      }
      return mime;
    }
  }
  return null;
}

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

// Avatars arrive canvas-compressed (~100KB typical); 2MB is a generous
// ceiling that still stops anyone bypassing the client and streaming a
// huge body through the Worker.
const MAX_BYTES = 2 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  // Own bucket keyed by user — avatar changes are rare, 10 per 5 min is far
  // above normal use while capping storage-cost abuse.
  const withinLimit = await checkRateLimit(rateLimitClient, `upload-avatar:${auth.userId}`, 10, 300);
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
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing file.' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Image too large — 2MB max after compression.' }, { status: 413 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffedType = sniffAllowedAvatarType(bytes);
  if (!sniffedType) {
    return NextResponse.json(
      { error: 'Only JPEG, PNG, or WebP images are supported for avatars.' },
      { status: 415 }
    );
  }

  // Ownership prefix (<folder>/<userId>-...) mirrors upload-media's key
  // shape — it's what /api/delete-media's ownership check relies on.
  const ext = EXT_BY_TYPE[sniffedType];
  const key = `kcircle-media/avatars/${auth.userId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

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

  // Callers store `path` in DB updates (validated there by ownership
  // prefix) and render `url` directly.
  return NextResponse.json({ path: key, url: `/api/media/${key}` });
}