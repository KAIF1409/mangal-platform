// Server-only. R2 storage for series covers, chapter pages, K Circle
// avatars/attachments, and stories — replaces Supabase Storage
// (manga-pages, kcircle-media buckets). See CONTEXT.md §20 for why:
// Supabase free tier caps bandwidth at 5GB/month, R2 free tier is 10GB
// storage with zero egress fees — a much better fit for a content
// platform where reads >> writes.
//
// Same binding-access pattern as nsfwCheck.ts's Workers AI binding —
// getCloudflareContext() only resolves real bindings inside the deployed
// Worker (or `wrangler dev`), so this throws in the plain `next dev`
// local flow. Callers should surface that as a normal 500, not crash the
// whole route.

import { getCloudflareContext } from '@opennextjs/cloudflare';

// Minimal shape of the subset of the R2Bucket API this app uses — avoids
// pulling in @cloudflare/workers-types project-wide just for this one file.
export interface R2Bucket {
  get(key: string): Promise<R2ObjectBody | null>;
  put(key: string, value: ArrayBuffer | ArrayBufferView | ReadableStream | Blob, options?: {
    httpMetadata?: { contentType?: string };
  }): Promise<unknown>;
  delete(key: string | string[]): Promise<void>;
}

export interface R2ObjectBody {
  body: ReadableStream;
  httpMetadata?: { contentType?: string };
  size: number;
  etag: string;
}

export function getMediaBucket(): R2Bucket {
  const { env } = getCloudflareContext();
  const bucket = (env as unknown as { MEDIA_BUCKET?: R2Bucket }).MEDIA_BUCKET;
  if (!bucket) {
    throw new Error(
      'MEDIA_BUCKET binding not found — only available in the deployed Worker ' +
      'or `wrangler dev`, not plain `next dev`.'
    );
  }
  return bucket;
}

// Folder prefixes inside the single mangal-media bucket, mirroring the
// old Supabase bucket/path split so existing path-building logic barely
// has to change at the call sites.
export const MEDIA_FOLDERS = {
  seriesCovers: 'manga-pages/covers',
  chapterPages: 'manga-pages/chapters',
  kcircleMedia: 'kcircle-media',
} as const;
