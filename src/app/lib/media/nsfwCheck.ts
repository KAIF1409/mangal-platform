// KaTube §6b part 1 — NSFW thumbnail check, server-only.
//
// DISABLED on Cloudflare Workers (§87): the original implementation used
// NSFWJS + @tensorflow/tfjs + sharp. Two problems on Workers specifically:
//   1. sharp is a native binary (libvips) — Workers' V8 isolate has no
//      native addon / filesystem support, so it can't run there at all,
//      regardless of bundle size.
//   2. tfjs + nsfwjs + sharp together pushed the Worker script well past
//      Cloudflare's 3 MiB free-tier bundle limit
//      ([code: 10027] Worker exceeded the size limit).
// This worked fine on Vercel (Node.js serverless functions support native
// deps) but breaks on Workers. Since the original design was already
// "fail open, never block upload" (see the try/catch below returning null
// on any error), the safe stopgap is to make this a permanent, documented
// skip rather than a silent runtime crash. Uploads still go through the
// existing manual admin review queue — this only removes the *automatic*
// pre-flag step.
//
// TODO if automatic NSFW flagging is wanted back: use a Workers-native
// option instead of Node-only libs — e.g. Cloudflare Workers AI's image
// classification models (run in the same request, no native deps), or an
// external moderation API called over fetch().

export interface NsfwCheckResult {
  flagged: boolean;
  topClass: string;
  topProbability: number;
}

export async function checkThumbnailNsfw(_thumbnailUrl: string | null): Promise<NsfwCheckResult | null> {
  // Always skip — see note above. Never blocks or flags; admin manual
  // review remains the only moderation path for thumbnails for now.
  return null;
}
