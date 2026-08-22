// Client-side avatar compression — pure HTML5 Canvas, zero dependencies.
//
// WHY CLIENT-SIDE (and why NOT sharp/jimp server-side): this app deploys
// through OpenNext to a Cloudflare Worker with a 3MB bundle limit. Native
// image codecs (sharp et al.) are native binaries + WASM — they blow past
// that limit instantly. Every modern browser already ships a full image
// decoder + encoder (Canvas), so resizing happens here, before the bytes
// ever leave the device: smaller uploads, faster saves, zero server cost.
//
// What it does: decodes the picked file (JPG/PNG/WebP natively everywhere;
// HEIC too on Safari/iOS, which is where HEIC files actually come from),
// center-crops to a square (avatars render in a circle — corners would be
// invisible anyway), downscales to at most 512×512 (rendered at 64–96px,
// so 512 is comfortably past 2× retina), and encodes as JPEG q0.85 —
// typically ~50-150KB regardless of whether the input was a 12MB phone
// photo.
//
// EXIF orientation is respected automatically: drawing an HTMLImageElement
// to a canvas applies the image's EXIF rotation in every current browser,
// so portrait phone photos come out upright.
//
// Deliberately NOT a `browser-image-compression` dependency: the native
// pipeline below is ~80 lines, does everything an avatar needs, and keeps
// the client bundle lean (the npm package pulls in web-workers +
// UZIP-style machinery we don't need for a fixed-size square JPEG).

const MAX_DIMENSION = 512;
const JPEG_QUALITY = 0.85;

export interface CompressedAvatar {
  blob: Blob;
  width: number;
  height: number;
}

/** Loads a File/Blob into an <img> (not createImageBitmap — bitmap decoding
 * can't touch HEIC even on Safari, while <img> goes through the platform
 * decoder that iOS ships for it). */
function loadImageElement(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode-failed'));
    };
    img.src = url;
  });
}

/**
 * Square-crop + downscale + JPEG-encode an avatar image entirely in the
 * browser. Throws Error with a short machine-readable message — callers
 * map those to user-facing copy:
 *   'decode-failed'        — unreadable/corrupt, or HEIC outside Safari
 *   'canvas-unavailable'   — ancient browser, no 2d context
 *   'encode-failed'        — toBlob returned null (out-of-memory edge)
 */
export async function compressAvatarImage(file: File | Blob): Promise<CompressedAvatar> {
  const img = await loadImageElement(file);

  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  if (!srcW || !srcH) throw new Error('decode-failed');

  const canvas = document.createElement('canvas');
  canvas.width = MAX_DIMENSION;
  canvas.height = MAX_DIMENSION;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas-unavailable');

  // Center square crop: take the largest square that fits the source,
  // then draw it scaled into the 512×512 output. (fillRect white first so
  // transparent PNGs don't turn black once flattened to JPEG.)
  const side = Math.min(srcW, srcH);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, MAX_DIMENSION, MAX_DIMENSION);
  ctx.drawImage(
    img,
    (srcW - side) / 2, // sx — center the crop
    (srcH - side) / 2, // sy
    side,
    side,
    0,
    0,
    MAX_DIMENSION,
    MAX_DIMENSION,
  );

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
  );
  if (!blob) throw new Error('encode-failed');

  return { blob, width: MAX_DIMENSION, height: MAX_DIMENSION };
}