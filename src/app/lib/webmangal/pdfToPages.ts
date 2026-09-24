/**
 * lib/webmangal/pdfToPages.ts
 *
 * "Upload via PDF" for manga chapters: converts every page of a PDF into a
 * normal raster image File, so the resulting pages flow through the exact
 * same quality gate, unified page list, reorder controls, and publish
 * pipeline as hand-picked images — no schema or storage changes at all.
 *
 * Design notes:
 *  - pdf.js is loaded at RUNTIME from the vendored /vendor/pdf-loader.mjs
 *    script (same pattern BookReader uses), so it never enters a JS bundle
 *    and cannot blow past Cloudflare's Worker size limit.
 *  - Everything runs in the browser: no server round-trip, no Worker CPU.
 *  - The conversion is ATOMIC — if any page fails, nothing is returned, so
 *    the creator never ends up with a half-converted chapter.
 *  - `deps` is injectable so the orchestration is unit-testable without a
 *    real canvas/pdf.js (mirrors the deps pattern in publishPages.ts).
 */

// ── Minimal structural types for the pdf.js surface we touch ─────────────
// The real library is loaded from /vendor at runtime, never imported.

export interface PdfViewport {
  width: number;
  height: number;
}

export interface PdfPageProxy {
  getViewport(params: { scale: number }): PdfViewport;
}

export interface PdfDocumentProxy {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPageProxy>;
}

export interface PdfjsLib {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(src: { data: ArrayBuffer }): {
    promise: Promise<PdfDocumentProxy>;
    destroy(): Promise<void>;
  };
}

// Injects /vendor/pdf-loader.mjs once; resolves after the module graph has
// evaluated (a module script's load event guarantees window.pdfjsLib is set).
// A failed load clears the cached promise so the creator can retry.
let pdfjsPromise: Promise<PdfjsLib> | null = null;
export function loadPdfjs(): Promise<PdfjsLib> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('PDF conversion requires a browser.'));
  }
  // Explicit cast: this module owns its own structural pdf.js types and must
  // not add a second `Window.pdfjsLib` declaration (BookReader.tsx already
  // augments Window with a structurally different PdfjsLib — duplicate
  // non-identical members in a merged interface are a TS error).
  const w = window as unknown as { pdfjsLib?: PdfjsLib };
  if (w.pdfjsLib) return Promise.resolve(w.pdfjsLib);
  if (!pdfjsPromise) {
    pdfjsPromise = new Promise<PdfjsLib>((resolve, reject) => {
      const s = document.createElement('script');
      s.type = 'module';
      s.src = '/vendor/pdf-loader.mjs';
      s.onload = () => {
        const lib = (window as unknown as { pdfjsLib?: PdfjsLib }).pdfjsLib;
        if (lib) resolve(lib);
        else reject(new Error('PDF engine failed to initialize.'));
      };
      s.onerror = () => reject(new Error('Could not load the PDF engine.'));
      document.head.appendChild(s);
    }).catch((err) => {
      pdfjsPromise = null;
      throw err;
    });
  }
  return pdfjsPromise;
}

// ── Rendering budget ────────────────────────────────────────────────────
// minWidth/minHeight must match imageQuality.ts's DEFAULTS, otherwise a
// converted page could be rejected by the very gate we route it through.
export const PDF_RENDER_DEFAULTS = {
  minWidth: 800,
  minHeight: 1000,
  // Cap the long edge and total pixels so a pathological page (huge scan or
  // absurd aspect ratio) can't allocate an enormous canvas and freeze the tab.
  maxDim: 3200,
  maxPixels: 16_000_000,
} as const;

export interface PdfRenderScaleOptions {
  minWidth?: number;
  minHeight?: number;
  maxDim?: number;
  maxPixels?: number;
}

/**
 * Pure scale calculation for one PDF page:
 *  - never downscale below native (keeps already-good pages intact),
 *  - upscale enough to satisfy the quality gate's minimum resolution,
 *  - cap the long edge, then (last) cap total pixels as a safety net.
 *
 * The final pixel cap can drop a degenerate-aspect page below the minimum
 * resolution — that is intentional: the quality gate then rejects it with a
 * clear reason instead of the browser running out of memory.
 */
export function pdfRenderScale(
  page: { width: number; height: number },
  options: PdfRenderScaleOptions = {},
): number {
  const minWidth = options.minWidth ?? PDF_RENDER_DEFAULTS.minWidth;
  const minHeight = options.minHeight ?? PDF_RENDER_DEFAULTS.minHeight;
  const maxDim = options.maxDim ?? PDF_RENDER_DEFAULTS.maxDim;
  const maxPixels = options.maxPixels ?? PDF_RENDER_DEFAULTS.maxPixels;

  if (!(page.width > 0) || !(page.height > 0)) return 1;

  const minScale = Math.max(minWidth / page.width, minHeight / page.height);
  let scale = Math.max(1, minScale);

  const capScale = Math.min(maxDim / page.width, maxDim / page.height);
  if (scale > capScale) scale = Math.max(minScale, capScale);

  const pixels = page.width * scale * (page.height * scale);
  if (pixels > maxPixels) {
    scale = Math.sqrt(maxPixels / (page.width * page.height));
  }
  return scale;
}

/** Zero-padded, stable filename for a converted page. */
export function pdfPageFileName(pageNumber: number): string {
  return `pdf-page-${String(pageNumber).padStart(3, '0')}.jpg`;
}

// One chapter can only upload 120 files per 5 minutes (see the rate-limit
// comment in api/upload-media/route.ts), and real chapters run 10–60 pages —
// so a 100-page ceiling guarantees a converted chapter can actually publish.
export const PDF_MAX_PAGES = 100;
export const PDF_MAX_BYTES = 80 * 1024 * 1024;

function formatMb(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))}`;
}

// ── Canvas rendering (browser-only) ─────────────────────────────────────

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

/**
 * Renders one pdf.js page to an in-memory JPEG File.
 * A white background is painted first because pdf.js leaves the canvas
 * transparent, and JPEG encodes transparent pixels as black.
 */
export async function renderPdfPageToFile(
  page: PdfPageProxy,
  pageNumber: number,
  scale: number,
  quality: number,
): Promise<File> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.width = 0;
    canvas.height = 0;
    throw new Error('Canvas is not available in this browser.');
  }
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // render() lives only on the concrete pdf.js page type — keep the
  // structural PdfPageProxy above minimal so test fakes stay trivial.
  const renderable = page as PdfPageProxy & {
    render(params: {
      canvasContext: CanvasRenderingContext2D;
      viewport: PdfViewport;
      canvas: HTMLCanvasElement;
    }): { promise: Promise<void> };
  };
  try {
    await renderable.render({ canvasContext: ctx, viewport, canvas }).promise;
    const blob = await canvasToJpegBlob(canvas, quality);
    if (!blob) throw new Error('Could not encode this page as an image.');
    return new File([blob], pdfPageFileName(pageNumber), { type: 'image/jpeg' });
  } finally {
    // Release the backing store immediately — a long chapter would otherwise
    // keep every full-size canvas alive until GC.
    canvas.width = 0;
    canvas.height = 0;
  }
}

// ── Orchestration ───────────────────────────────────────────────────────

export interface PdfToPagesOptions {
  maxPages?: number;
  maxBytes?: number;
  quality?: number;
  minWidth?: number;
  minHeight?: number;
  /** Called after each page is converted: (pagesDone, pagesTotal). */
  onProgress?: (done: number, total: number) => void;
}

export interface PdfToPagesDeps {
  loadPdfjs: () => Promise<PdfjsLib>;
  renderPage: (
    page: PdfPageProxy,
    pageNumber: number,
    scale: number,
    quality: number,
  ) => Promise<File>;
}

export interface PdfToPagesResult {
  success: boolean;
  /** Present only on success — one File per PDF page, in order. */
  files?: File[];
  /** User-facing reason, set only when success is false. */
  error?: string;
  /** How many pages were converted before giving up (0 on early failure). */
  renderedCount: number;
}

export const PDF_TO_PAGES_DEPS: PdfToPagesDeps = {
  loadPdfjs,
  renderPage: renderPdfPageToFile,
};

export async function pdfToPages(
  file: File,
  deps: PdfToPagesDeps = PDF_TO_PAGES_DEPS,
  options: PdfToPagesOptions = {},
): Promise<PdfToPagesResult> {
  const maxPages = options.maxPages ?? PDF_MAX_PAGES;
  const maxBytes = options.maxBytes ?? PDF_MAX_BYTES;
  const quality = options.quality ?? 0.92;

  const invalid = validatePdfFile(file, maxBytes);
  if (invalid) return { success: false, error: invalid, renderedCount: 0 };

  let pdfjs: PdfjsLib;
  try {
    pdfjs = await deps.loadPdfjs();
  } catch {
    return {
      success: false,
      error: 'The PDF engine could not load. Check your connection and try again.',
      renderedCount: 0,
    };
  }

  let data: ArrayBuffer;
  try {
    data = await file.arrayBuffer();
  } catch {
    return {
      success: false,
      error: 'Could not read this PDF file — it may be corrupted.',
      renderedCount: 0,
    };
  }

  // getDocument() can throw synchronously (e.g. a corrupt container), so it
  // gets the same guard as the promise it returns.
  let task: { promise: Promise<PdfDocumentProxy>; destroy(): Promise<void> };
  try {
    task = pdfjs.getDocument({ data });
  } catch {
    return {
      success: false,
      error: 'This file could not be opened as a PDF — it may be corrupted or password-protected.',
      renderedCount: 0,
    };
  }

  let doc: PdfDocumentProxy;
  try {
    doc = await task.promise;
  } catch {
    return {
      success: false,
      error: 'This file could not be opened as a PDF — it may be corrupted or password-protected.',
      renderedCount: 0,
    };
  }

  try {
    const total = doc.numPages;
    if (!total || total < 1) {
      return { success: false, error: 'This PDF has no pages.', renderedCount: 0 };
    }
    if (total > maxPages) {
      return {
        success: false,
        error: `This PDF has ${total} pages — ${maxPages} max per chapter. Split it into smaller chapters first.`,
        renderedCount: 0,
      };
    }

    const files: File[] = [];
    for (let pageNumber = 1; pageNumber <= total; pageNumber++) {
      try {
        const page = await doc.getPage(pageNumber);
        const native = page.getViewport({ scale: 1 });
        const scale = pdfRenderScale(
          { width: native.width, height: native.height },
          { minWidth: options.minWidth, minHeight: options.minHeight },
        );
        files.push(await deps.renderPage(page, pageNumber, scale, quality));
      } catch (err) {
        // Atomic: return no files so the creator never gets a partial chapter.
        return {
          success: false,
          error: `Page ${pageNumber} could not be converted: ${err instanceof Error ? err.message : 'unknown error'}. Nothing was added to your chapter.`,
          renderedCount: files.length,
        };
      }
      options.onProgress?.(pageNumber, total);
    }
    return { success: true, files, renderedCount: files.length };
  } finally {
    try {
      await task.destroy();
    } catch {
      /* best-effort worker teardown */
    }
  }
}

/** Returns a human-readable reason, or null when the file is acceptable. */
export function validatePdfFile(
  file: { name?: string; type?: string; size?: number },
  maxBytes: number = PDF_MAX_BYTES,
): string | null {
  const looksLikePdf =
    file.type === 'application/pdf' || /\.pdf$/i.test(file.name ?? '');
  if (!looksLikePdf) return 'Only PDF files can be converted into pages.';
  if (typeof file.size === 'number' && file.size > maxBytes) {
    return `PDF is too large (${formatMb(file.size)}MB) — ${formatMb(maxBytes)}MB max.`;
  }
  return null;
}
