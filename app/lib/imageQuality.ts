/**
 * lib/imageQuality.ts
 *
 * Client-side image quality gate, runs entirely in the browser before
 * a file is uploaded to Supabase storage — no server cost, instant feedback.
 *
 * Two checks:
 *  1. Resolution — reject images that are too small to read comfortably.
 *  2. Blur — Variance-of-Laplacian sharpness score. Sharp images have
 *     strong edges (high variance); blurry images have soft, smeared
 *     edges (low variance). This is the same technique used in OpenCV's
 *     standard blur-detection approach, reimplemented in pure JS/Canvas
 *     so it works without any extra dependency.
 *
 * Usage (inside an upload handler):
 *
 *   const result = await checkImageQuality(file);
 *   if (!result.passed) {
 *     setError(result.reason);
 *     return; // block the upload
 *   }
 */

export interface ImageQualityResult {
  passed: boolean;
  reason?: string;
  sharpnessScore?: number; // higher = sharper
  width?: number;
  height?: number;
}

export interface ImageQualityOptions {
  /** Minimum acceptable width in pixels. Default 800. */
  minWidth?: number;
  /** Minimum acceptable height in pixels. Default 1000 (comic pages are tall). */
  minHeight?: number;
  /**
   * Minimum Laplacian variance to be considered "sharp enough."
   * Lower = more lenient (lets more images pass). Comic/manga pages with
   * flat colors and line art score differently than photos, so this is
   * tuned looser than a typical photography threshold (~100 is common
   * there). Tune this after testing with a batch of real chapter pages.
   */
  blurThreshold?: number;
}

const DEFAULTS: Required<ImageQualityOptions> = {
  minWidth: 800,
  minHeight: 1000,
  blurThreshold: 60,
};

/** Loads a File into an HTMLImageElement. */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image file.'));
    };
    img.src = url;
  });
}

/**
 * Computes the Variance of Laplacian sharpness score for an image.
 * Downscales first for speed — full-res convolution on a 3000px comic
 * page would be slow; a 400px-wide sample is plenty to judge sharpness.
 */
function computeSharpness(img: HTMLImageElement): number {
  const SAMPLE_WIDTH = 400;
  const scale = SAMPLE_WIDTH / img.naturalWidth;
  const w = SAMPLE_WIDTH;
  const h = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return Infinity; // can't analyze — don't block the user

  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  // Grayscale buffer
  const gray = new Float32Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    // Standard luminance weights
    gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }

  // 4-neighbor Laplacian kernel: [[0,1,0],[1,-4,1],[0,1,0]]
  const laplacian: number[] = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const value =
        gray[idx - w] + gray[idx + w] + gray[idx - 1] + gray[idx + 1] - 4 * gray[idx];
      laplacian.push(value);
    }
  }

  if (laplacian.length === 0) return Infinity;

  const mean = laplacian.reduce((sum, v) => sum + v, 0) / laplacian.length;
  const variance =
    laplacian.reduce((sum, v) => sum + (v - mean) ** 2, 0) / laplacian.length;

  return variance;
}

/**
 * Runs the full quality gate on a single image file.
 * Designed to be called once per page during upload, before the file
 * is sent to Supabase storage.
 */
export async function checkImageQuality(
  file: File,
  options: ImageQualityOptions = {}
): Promise<ImageQualityResult> {
  const opts = { ...DEFAULTS, ...options };

  if (!file.type.startsWith('image/')) {
    return { passed: false, reason: 'File is not an image.' };
  }

  let img: HTMLImageElement;
  try {
    img = await loadImage(file);
  } catch {
    return { passed: false, reason: 'Could not read this image — file may be corrupted.' };
  }

  const width = img.naturalWidth;
  const height = img.naturalHeight;

  if (width < opts.minWidth || height < opts.minHeight) {
    return {
      passed: false,
      reason: `Image resolution too low (${width}×${height}px). Minimum is ${opts.minWidth}×${opts.minHeight}px — re-export at a higher resolution.`,
      width,
      height,
    };
  }

  const sharpness = computeSharpness(img);

  if (sharpness < opts.blurThreshold) {
    return {
      passed: false,
      reason: `This page looks blurry or low quality (sharpness score: ${sharpness.toFixed(1)}). Please upload a sharper version.`,
      sharpnessScore: sharpness,
      width,
      height,
    };
  }

  return { passed: true, sharpnessScore: sharpness, width, height };
}

/**
 * Convenience batch-checker for the multi-page chapter upload step.
 * Returns per-file results in the same order as the input array, plus
 * a flat list of failed filenames for easy display.
 */
export async function checkImageBatchQuality(
  files: File[],
  options: ImageQualityOptions = {}
): Promise<{ results: ImageQualityResult[]; failedFiles: string[] }> {
  const results = await Promise.all(files.map((f) => checkImageQuality(f, options)));
  const failedFiles = files
    .filter((_, i) => !results[i].passed)
    .map((f) => f.name);
  return { results, failedFiles };
}
