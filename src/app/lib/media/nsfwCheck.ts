// KaTube §6b part 1 — NSFW thumbnail check, server-only.
//
// Uses NSFWJS (free, open-source TFJS classifier) on the pure-JS `@tensorflow/tfjs`
// backend rather than `@tensorflow/tfjs-node` — tfjs-node needs a prebuilt native
// binary downloaded at install time, which is a common source of broken builds on
// serverless platforms (wrong platform binary, blocked download host, etc). Pure
// tfjs + the CPU backend has no native binary at all: slower per-classification,
// but it always builds and runs anywhere Node runs.
//
// Image decode/resize uses `@cf-wasm/photon` (a WASM build of the Rust `photon`
// image library, purpose-built as a `sharp` replacement for Cloudflare Workers —
// `sharp` needs a native binary and cannot run in the Workers isolate at all,
// not even with nodejs_compat on). Package auto-selects the right entrypoint
// (workerd on Cloudflare, Node locally/CI) via conditional exports, no separate
// init call needed here.
//
// Model loads once per warm instance (module-level singleton) and is reused
// across requests in that instance.

import '@tensorflow/tfjs-backend-cpu';
import * as tf from '@tensorflow/tfjs';
import * as nsfwjs from 'nsfwjs';
import { PhotonImage, resize, SamplingFilter } from '@cf-wasm/photon';

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
    // Photon's own resize (unlike sharp's `fit: 'fill'`) already stretches to
    // the exact target dims with no aspect-ratio cropping, so it's a direct
    // match. get_raw_pixels() comes back as RGBA — strip the alpha byte per
    // pixel to get the same 3-channel RGB buffer sharp used to produce.
    const inputImage = PhotonImage.new_from_byteslice(new Uint8Array(arrayBuffer));
    const resized = resize(inputImage, 224, 224, SamplingFilter.Lanczos3);
    const rgba = resized.get_raw_pixels();
    const rgb = new Uint8Array((rgba.length / 4) * 3);
    for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
      rgb[j] = rgba[i];
      rgb[j + 1] = rgba[i + 1];
      rgb[j + 2] = rgba[i + 2];
    }
    inputImage.free();
    resized.free();

    const tensor = tf.tensor3d(rgb, [224, 224, 3]);
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
