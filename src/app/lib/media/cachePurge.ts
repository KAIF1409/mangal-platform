// lib/media/cachePurge.ts
//
// Edge-cache hygiene for /api/media. That route serves R2 objects with a
// one-year immutable Cache-Control and explicitly populates the Workers
// Cache API (caches.default) — safe while keys are content-immutable, but it
// means an object DELETED from R2 (a page removed from a chapter, a cover
// pulled on a takedown, …) keeps being served from the edge for up to a
// year. This helper best-effort purges those entries after deletion.
//
// Limitation, by design: the Workers Cache API can only purge entries in the
// PoP handling the request. Other PoPs that already served the object keep
// it until their own eviction; purging those would need the Cloudflare
// zone-purge API and a token with purge permission, which this app's
// server-side client deliberately doesn't hold. Browser caches are likewise
// untouched. A partial-but-real improvement with zero new credentials.

export interface EdgeCacheLike {
  delete(request: Request): Promise<boolean>;
}

/** Returns the runtime's Cache API (Workers `caches.default`), or null when
 *  running outside the Worker (plain `next dev`, tests, node) — callers then
 *  simply skip purging. */
export function getEdgeCache(): EdgeCacheLike | null {
  const cachesRef = (globalThis as unknown as { caches?: { default?: EdgeCacheLike } }).caches;
  return cachesRef?.default ?? null;
}

/**
 * Purges the edge-cache entries for the given storage keys' /api/media URLs.
 * Best-effort and never throws; returns how many entries reported a purge.
 */
export async function purgeMediaEdgeCache(origin: string, paths: string[]): Promise<number> {
  const cache = getEdgeCache();
  if (!cache || paths.length === 0) return 0;

  let purged = 0;
  for (const rawPath of paths) {
    try {
      const clean = rawPath.replace(/^\/+/, '');
      if (!clean) continue;
      const url = new URL(`/api/media/${clean}`, origin || 'https://localhost');
      if (await cache.delete(new Request(url.toString(), { method: 'GET' }))) {
        purged += 1;
      }
    } catch {
      // Non-fatal: a purge failure must never fail the delete request itself.
    }
  }
  return purged;
}