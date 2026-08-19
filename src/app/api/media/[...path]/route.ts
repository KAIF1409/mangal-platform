import { NextRequest, NextResponse } from 'next/server';
import { getMediaBucket } from '../../../lib/media/r2';

// Public read route — no auth. The old Supabase public URLs were
// unauthenticated too (manga-pages/kcircle-media buckets were public),
// so this preserves the same behavior while keeping the R2 bucket itself
// set to "Public Access: Disabled" — only this route (with the binding)
// can reach it, nothing is exposed directly at r2.dev.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const key = path.join('/');

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

  return new NextResponse(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
      'Content-Length': String(object.size),
      ETag: object.etag,
      // Immutable — every upload gets a fresh random key (see
      // upload-media/route.ts), so a given key's content never changes.
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
