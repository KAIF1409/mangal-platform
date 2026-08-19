import { NextRequest, NextResponse } from 'next/server';
import { getMediaBucket } from '../../../lib/media/r2';
import { getCloudflareContext } from '@opennextjs/cloudflare';

// Public read route — no auth. The old Supabase public URLs were
// unauthenticated too (manga-pages/kcircle-media buckets were public),
// so this preserves the same behavior while keeping the R2 bucket itself
// set to "Public Access: Disabled" — only this route (with the binding)
// can reach it, nothing is exposed directly at r2.dev.
//
// Edge caching: a `Cache-Control` header alone only caches in each
// individual visitor's browser — it does NOT get cached at Cloudflare's
// edge automatically for Worker responses (unlike static assets). That
// meant every single reader, on every first visit (or in Incognito),
// was paying a full R2 round-trip per image, which made reader pages feel
// slow. Since every key's content is immutable (fresh random key per
// upload), it's safe to also cache the response at Cloudflare's edge via
// the Cache API, so after the first request anywhere, everyone else gets
// it served instantly from the nearest edge without touching R2 again.
export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const key = path.join('/');

  // `caches.default` is a Cloudflare Workers runtime extension not present
  // in the standard DOM `CacheStorage` type — same reasoning as the
  // hand-rolled R2Bucket interface in r2.ts, avoids a project-wide
  // @cloudflare/workers-types dependency for one call site.
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(req.url, req);

  const cached = await cache.match(cacheKey);
  if (cached) return cached;

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

  const response = new NextResponse(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
      'Content-Length': String(object.size),
      ETag: object.etag,
      // Immutable — every upload gets a fresh random key (see
      // upload-media/route.ts), so a given key's content never changes.
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });

  try {
    const { ctx } = getCloudflareContext();
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
  } catch {
    // Non-fatal — just means this response won't be edge-cached this
    // time (e.g. running outside the deployed Worker). Reader still
    // gets their image either way.
  }

  return response;
}
