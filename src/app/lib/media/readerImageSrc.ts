/**
 * lib/media/readerImageSrc.ts
 *
 * Resolves the actual <img src> the manga reader should request for a page,
 * given the reader's image-quality setting ('auto' resolved to 'low'/'high',
 * or an explicit manual choice).
 *
 * BUG FIX — broken "Data Saver" (low-quality) mode after the R2 migration:
 * this used to inline-check `url.includes('/object/public/')` (the legacy
 * Supabase Storage public-URL shape) and rewrite it to Supabase's
 * `/render/image/public/` image-transform endpoint. Since the R2 migration
 * (see CONTEXT.md §20 / §90), every newly-uploaded page is served from
 * `/api/media/...` instead — which never matches `/object/public/` — so the
 * low-quality toggle silently stopped doing anything for any page uploaded
 * after the migration. Worse, for the rare page still on a legacy Supabase
 * URL, the code always attempted the transform even though Supabase image
 * transforms require a paid plan/self-hosted imgproxy that this project
 * doesn't currently run — so readers on "Data Saver" paid for an extra
 * failed request (transform 400 -> onError fallback -> re-fetch original)
 * on every single page, which is strictly worse than just serving the
 * original image once.
 *
 * `/api/media/...` (R2) has no resize capability today (no Cloudflare Image
 * Resizing/Images binding in this project — see CONTEXT.md's Architecture
 * section), so the honest, bandwidth-correct behavior for those URLs is to
 * serve the original image directly rather than attempt a transform that's
 * guaranteed to fail.
 */

export type ImageQualityChoice = 'auto' | 'low' | 'high';
export type ResolvedImageQuality = 'low' | 'high';

const LEGACY_SUPABASE_PUBLIC_MARKER = '/object/public/';
const LEGACY_SUPABASE_RENDER_MARKER = '/render/image/public/';

/** True only for the old Supabase Storage public-URL shape, which supports
 * Supabase's own image-transform endpoint (when enabled on the project). */
export function supportsLowQualityTransform(url: string): boolean {
  return url.includes(LEGACY_SUPABASE_PUBLIC_MARKER);
}

export function getReaderImageSrc(
  url: string,
  effectiveQuality: ResolvedImageQuality
): string {
  if (effectiveQuality !== 'low') return url;
  if (!supportsLowQualityTransform(url)) return url; // R2 (/api/media/...) — no resize capability, serve original
  const transformed = url.replace(LEGACY_SUPABASE_PUBLIC_MARKER, LEGACY_SUPABASE_RENDER_MARKER);
  return `${transformed}${transformed.includes('?') ? '&' : '?'}width=720&quality=65`;
}
