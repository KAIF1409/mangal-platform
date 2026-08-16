// KaTube §6b part 1 — NSFW thumbnail check, server-only.
//
// Uses NSFWJS (free, open-source TFJS classifier) on the pure-JS `@tensorflow/tfjs`
// backend rather than `@tensorflow/tfjs-node` — tfjs-node needs a prebuilt native
// binary downloaded at install time, which is a common source of broken builds on
// serverless platforms (wrong platform binary, blocked download host, etc). Pure
// tfjs + the CPU backend has no native binary at all: slower per-classification,
// but it always builds and runs anywhere Node runs, including Vercel's functions.
// Image decode/resize uses `sharp` (already a de-facto standard native dep — Next.js
// itself uses it for image optimization when present) instead of tf.node.decodeImage.
//
// Model loads once per warm serverless instance (module-level singleton) and is
// reused across requests in that instance.

import '@tensorflow/tfjs-backend-cpu';
import * as tf from '@tensorflow/tfjs';
import * as nsfwjs from 'nsfwjs';
import sharp from 'sharp';

let modelPromise: Promise<nsfwjs.NSFWJS> | null = null;

function getModel(): Promise<nsfwjs.NSFWJS> {
  if (!modelPromise) {
    modelPromise = (async () => {
      await tf.setBackend('cpu');
      await tf.ready();
      // Default MobileNetV2-based model, loaded from NSFWJS's public CDN.
      return nsfwjs.load();
    })();
  }
  return modelPromise;
}

export interface NsfwCheckResult {
  flagged: boolean;
  // Top prediction label + probability, for the report/admin trail.
  topClass: string;
  topProbability: number;
}

// Classes NSFWJS returns: Drawing, Hentai, Neutral, Porn, Sexy.
// Flag on Porn/Hentai/Sexy crossing this probability threshold. Threshold
// picked conservatively (favor false positives over false negatives) since
// this only routes to admin review, per §6b — it never hard-blocks.
const FLAG_CLASSES = new Set(['Porn', 'Hentai', 'Sexy']);
const FLAG_THRESHOLD = 0.6;

// Fetches a thumbnail and classifies it. Returns null (not flagged, check
// skipped) on ANY failure — network error, decode error, model load error —
// so a broken/slow classifier can never block a legitimate upload. This
// mirrors the soft-enforcement philosophy already used for the AI-disclosure
// check in §6b part 2.
export async function checkThumbnailNsfw(thumbnailUrl: string | null): Promise<NsfwCheckResult | null> {
  if (!thumbnailUrl) return null;

  try {
    const imgRes = await fetch(thumbnailUrl);
    if (!imgRes.ok) return null;
    const arrayBuffer = await imgRes.arrayBuffer();

    // Decode + resize to the 224x224 RGB input NSFWJS's MobileNet expects.
    const { data, info } = await sharp(Buffer.from(arrayBuffer))
      .resize(224, 224, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const tensor = tf.tensor3d(new Uint8Array(data), [info.height, info.width, info.channels]);
    const model = await getModel();
    const predictions = await model.classify(tensor);
    tensor.dispose();

    const top = predictions.reduce((a, b) => (b.probability > a.probability ? b : a));
    const flagged = FLAG_CLASSES.has(top.className) && top.probability >= FLAG_THRESHOLD;

    return { flagged, topClass: top.className, topProbability: top.probability };
  } catch (err) {
    console.error('NSFW thumbnail check failed, skipping (non-blocking):', err);
    return null;
  }
}
