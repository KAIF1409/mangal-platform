/**
 * lib/media/mediaUrl.ts
 *
 * Where a stored media URL (`pages.image_url`, cover URLs, …) should actually
 * be fetched from, and which R2 object it points at.
 *
 * THE BUG THIS EXISTS FOR
 * `uploadMediaFile` stores an ABSOLUTE url — `window.location.origin` glued to
 * the served path (see uploadClient.ts) — and mirrors the old Supabase public
 * URL shape because a few call sites parse it with `new URL(...)`. That makes
 * every stored row a permanent record of the origin it was uploaded from.
 * The moment the app is opened from any other origin — a preview deployment,
 * localhost during development, or the day a custom domain replaces the
 * workers.dev one — every one of those URLs points somewhere that no longer
 * serves the file, and the creator sees the chapter's pages as empty/broken
 * boxes in the Edit screen while the files themselves are perfectly fine in
 * R2. That looks exactly like "my pages were deleted, I'll have to upload the
 * PDF again".
 *
 * `resolveMediaUrl` fixes that at render time, without migrating a single row:
 * a URL that names OUR media route but a DIFFERENT origin is rewritten back to
 * the relative `/api/media/...` path, which the browser then resolves against
 * whatever origin the page is being served from. Same-origin URLs, relative
 * paths, blob:/data: previews and legacy Supabase/CDN URLs are returned
 * untouched.
 */

/** The only route that serves R2 objects (see api/media/[...path]/route.ts). */
export const MEDIA_ROUTE_PREFIX = '/api/media/';

/**
 * The R2 object key stored in a media URL, or null when the URL isn't one of
 * ours (`/api/media/<key>`). Used by the delete/replace flows, which need the
 * key rather than the URL. Percent-encoding is decoded, matching the key that
 * was handed to /api/delete-media.
 */
export function mediaPathFromUrl(url: string): string | null {
  if (!url) return null;
  const index = url.indexOf(MEDIA_ROUTE_PREFIX);
  if (index === -1) return null;
  const key = url.slice(index + MEDIA_ROUTE_PREFIX.length).split(/[?#]/)[0];
  if (!key) return null;
  try {
    return decodeURIComponent(key);
  } catch {
    // Malformed escape sequence — the raw key is still the best answer.
    return key;
  }
}

/**
 * The URL to render. `origin` defaults to the current page's origin and is
 * injectable so this is testable outside a browser.
 */
export function resolveMediaUrl(url: string, origin?: string): string {
  if (!url) return url;
  // Already relative (or protocol-relative like `//host/x`, which has no
  // scheme to parse without a base) — the browser resolves it correctly.
  if (url.startsWith('/') || url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }

  const index = url.indexOf(MEDIA_ROUTE_PREFIX);
  if (index === -1) return url; // legacy Supabase Storage / external CDN — not ours to rewrite

  const currentOrigin =
    origin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  if (!currentOrigin) return url; // SSR with no origin — leave the URL alone

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  if (parsed.origin === currentOrigin) return url; // same deployment — nothing to fix

  // Different origin: keep the path (and any query), drop the stale host.
  return `${parsed.pathname}${parsed.search}`;
}
