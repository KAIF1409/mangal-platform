import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PDF_MAX_BYTES,
  PDF_MAX_PAGES,
  PDF_RENDER_DEFAULTS,
  PDF_TO_PAGES_DEPS,
  loadPdfjs,
  pdfPageFileName,
  pdfRenderScale,
  pdfToPages,
  renderPdfPageToFile,
  validatePdfFile,
  type PdfDocumentProxy,
  type PdfPageProxy,
  type PdfToPagesDeps,
  type PdfViewport,
  type PdfjsLib,
} from '@/app/lib/webmangal/pdfToPages';

// ── Fixtures ─────────────────────────────────────────────────────────────

const PAGE_SIZE = { width: 1000, height: 1500 };

function makePdfFile(name = 'chapter.pdf'): File {
  return new File(['%PDF-1.4'], name, { type: 'application/pdf' });
}

function makePage(width: number, height: number): PdfPageProxy {
  return {
    getViewport: ({ scale }: { scale: number }) => ({
      width: width * scale,
      height: height * scale,
    }),
  };
}

interface HarnessOptions {
  total?: number;
  pageSize?: { width: number; height: number };
  /** Per-page native size — lets a test prove each page is scaled on its own. */
  pageSizeFor?: (pageNumber: number) => { width: number; height: number };
  /** 1-based page number whose render should blow up. */
  failRenderAt?: number;
}

/**
 * Fake pdf.js engine + renderer, so the orchestration can be exercised with no
 * canvas, no worker and no network (mirrors the deps pattern used by
 * publishPages.test.ts).
 */
function makeHarness(options: HarnessOptions = {}) {
  const total = options.total ?? 3;
  const pageSize = options.pageSize ?? PAGE_SIZE;

  const getPage = vi.fn(async (pageNumber: number) => {
    const size = options.pageSizeFor?.(pageNumber) ?? pageSize;
    return makePage(size.width, size.height);
  });
  const doc: PdfDocumentProxy = { numPages: total, getPage };
  const destroy = vi.fn(async () => {});

  const loadPdfjsDep = vi.fn(
    async (): Promise<PdfjsLib> => ({
      GlobalWorkerOptions: { workerSrc: '/pdf.worker.min.mjs' },
      getDocument: () => ({ promise: Promise.resolve(doc), destroy }),
    }),
  );

  const renderPage = vi.fn(
    async (_page: PdfPageProxy, pageNumber: number): Promise<File> => {
      if (options.failRenderAt === pageNumber) throw new Error('canvas exploded');
      return new File(['jpeg'], pdfPageFileName(pageNumber), { type: 'image/jpeg' });
    },
  );

  const deps: PdfToPagesDeps = { loadPdfjs: loadPdfjsDep, renderPage };
  return { deps, getPage, destroy, renderPage, loadPdfjs: loadPdfjsDep };
}

/** One argument position across every renderPage call, in call order. */
function renderArg(renderPage: { mock: { calls: unknown[][] } }, index: number): unknown[] {
  return renderPage.mock.calls.map((call) => call[index]);
}

// ── Scale math ───────────────────────────────────────────────────────────

describe('pdfRenderScale', () => {
  it('matches the image quality gate minimums, so converted pages cannot be rejected for resolution', () => {
    expect(PDF_RENDER_DEFAULTS.minWidth).toBe(800);
    expect(PDF_RENDER_DEFAULTS.minHeight).toBe(1000);
  });

  it('upscales a small page until it clears the minimum resolution', () => {
    // 400×500 is half of 800×1000, so exactly 2× is required.
    expect(pdfRenderScale({ width: 400, height: 500 })).toBe(2);
  });

  it('leaves an already-large-enough page at native scale', () => {
    expect(pdfRenderScale({ width: 1000, height: 1500 })).toBe(1);
  });

  it('honours the long-edge cap for an oversized page', () => {
    const scale = pdfRenderScale({ width: 4000, height: 5000 });
    expect(scale).toBeLessThan(1);
    expect(5000 * scale).toBeLessThanOrEqual(PDF_RENDER_DEFAULTS.maxDim + 0.001);
  });

  it('never drops below the minimum resolution just to satisfy the long-edge cap', () => {
    // Cap alone would ask for 0.16, but the gate minimum wins (0.4 → 800px wide).
    const scale = pdfRenderScale({ width: 2000, height: 20000 });
    expect(scale).toBe(0.4);
    expect(2000 * scale).toBe(800);
  });

  it('drops below the minimum resolution only for a pathological page, so the pixel cap holds', () => {
    const scale = pdfRenderScale({ width: 100, height: 20000 });
    expect(scale).toBeCloseTo(Math.sqrt(8), 6);
    expect(100 * scale * (20000 * scale)).toBeLessThanOrEqual(
      PDF_RENDER_DEFAULTS.maxPixels + 1,
    );
  });

  it('applies caller-supplied overrides instead of the defaults', () => {
    const scale = pdfRenderScale(
      { width: 1000, height: 1000 },
      { minWidth: 1, minHeight: 1, maxDim: 100000, maxPixels: 250_000 },
    );
    expect(scale).toBe(0.5);
  });

  it('returns a safe scale for a page with degenerate dimensions', () => {
    expect(pdfRenderScale({ width: 0, height: 1000 })).toBe(1);
    expect(pdfRenderScale({ width: -5, height: 10 })).toBe(1);
  });
});

// ── Page filenames ───────────────────────────────────────────────────────

describe('pdfPageFileName', () => {
  it('zero-pads page numbers so the chapter list sorts correctly', () => {
    expect(pdfPageFileName(1)).toBe('pdf-page-001.jpg');
    expect(pdfPageFileName(12)).toBe('pdf-page-012.jpg');
    expect(pdfPageFileName(100)).toBe('pdf-page-100.jpg');
  });

  it('does not truncate page numbers beyond the padding width', () => {
    expect(pdfPageFileName(1234)).toBe('pdf-page-1234.jpg');
  });
});

// ── PDF validation ───────────────────────────────────────────────────────

describe('validatePdfFile', () => {
  it('rejects a file that is neither typed nor named as a PDF', () => {
    expect(validatePdfFile({ name: 'cover.png', type: 'image/png', size: 10 }))
      .toMatch(/Only PDF files/);
  });

  it('accepts a PDF identified only by its extension (some browsers omit the type)', () => {
    expect(validatePdfFile({ name: 'chapter.PDF', type: '', size: 10 })).toBeNull();
  });

  it('rejects a PDF above the size ceiling, naming both sizes in MB', () => {
    const reason = validatePdfFile({
      name: 'big.pdf',
      type: 'application/pdf',
      size: 90 * 1024 * 1024,
    });
    expect(reason).toMatch(/90MB/);
    expect(reason).toMatch(/80MB max/);
  });

  it('accepts a PDF exactly at the ceiling', () => {
    expect(validatePdfFile({ name: 'ok.pdf', type: 'application/pdf', size: PDF_MAX_BYTES }))
      .toBeNull();
  });

  it('honours a caller-supplied ceiling', () => {
    expect(validatePdfFile({ name: 'ok.pdf', type: 'application/pdf', size: 20 }, 10))
      .toMatch(/too large/);
  });
});

// ── Orchestration: happy path ────────────────────────────────────────────

describe('pdfToPages — success path', () => {
  it('converts every page in order and returns one image File per page', async () => {
    const { deps, getPage, destroy, renderPage } = makeHarness();
    const result = await pdfToPages(makePdfFile(), deps);

    expect(result.success).toBe(true);
    expect(result.renderedCount).toBe(3);
    expect(result.files?.map((file) => file.name)).toEqual([
      'pdf-page-001.jpg',
      'pdf-page-002.jpg',
      'pdf-page-003.jpg',
    ]);
    expect(result.files?.every((file) => file.type === 'image/jpeg')).toBe(true);
    // pdf.js page numbers are 1-based and requested in document order.
    expect(getPage.mock.calls.map((call) => call[0])).toEqual([1, 2, 3]);
    // The worker is always torn down, even on success.
    expect(destroy).toHaveBeenCalledTimes(1);
    // A 1000×1500 page already clears the 800×1000 gate, so nothing is rescaled.
    expect(renderArg(renderPage, 2)).toEqual([1, 1, 1]);
    expect(renderArg(renderPage, 3)).toEqual([0.92, 0.92, 0.92]);
  });

  it('reports progress after each page as (pagesDone, pagesTotal)', async () => {
    const { deps } = makeHarness({ total: 3 });
    const onProgress = vi.fn();
    await pdfToPages(makePdfFile(), deps, { onProgress });

    expect(onProgress.mock.calls).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it('scales each page from its own native viewport, not from page 1', async () => {
    const { deps, renderPage } = makeHarness({
      total: 2,
      pageSizeFor: (pageNumber) =>
        pageNumber === 1 ? { width: 400, height: 500 } : { width: 2000, height: 3000 },
    });
    await pdfToPages(makePdfFile(), deps);

    // Small page is upscaled to clear the gate; the large one stays native.
    expect(renderArg(renderPage, 2)).toEqual([2, 1]);
  });

  it('passes a caller-supplied JPEG quality straight through to the renderer', async () => {
    const { deps, renderPage } = makeHarness({ total: 1 });
    await pdfToPages(makePdfFile(), deps, { quality: 0.5 });

    expect(renderArg(renderPage, 3)).toEqual([0.5]);
  });
});

// ── Orchestration: atomicity ─────────────────────────────────────────────

describe('pdfToPages — atomic failure', () => {
  it('returns no files at all when one page fails partway through', async () => {
    const { deps, getPage, destroy } = makeHarness({ total: 3, failRenderAt: 2 });
    const onProgress = vi.fn();
    const result = await pdfToPages(makePdfFile(), deps, { onProgress });

    expect(result.success).toBe(false);
    expect(result.files).toBeUndefined();
    expect(result.renderedCount).toBe(1);
    expect(result.error).toMatch(/Page 2/);
    expect(result.error).toMatch(/canvas exploded/);
    expect(result.error).toMatch(/Nothing was added/);
    // Page 3 is never attempted, but the worker is still torn down.
    expect(getPage).toHaveBeenCalledTimes(2);
    expect(onProgress.mock.calls).toEqual([[1, 3]]);
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});

// ── Orchestration: rejected input (no work attempted) ────────────────────

describe('pdfToPages — rejects bad input before doing any work', () => {
  it('refuses a non-PDF file without even loading the engine', async () => {
    const { deps } = makeHarness();
    const result = await pdfToPages(new File(['x'], 'cover.png', { type: 'image/png' }), deps);

    expect(result).toEqual({
      success: false,
      error: 'Only PDF files can be converted into pages.',
      renderedCount: 0,
    });
    expect(deps.loadPdfjs).not.toHaveBeenCalled();
  });

  it('refuses a PDF above the ceiling without loading the engine', async () => {
    const { deps } = makeHarness();
    const result = await pdfToPages(makePdfFile(), deps, { maxBytes: 1 });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/too large/);
    expect(deps.loadPdfjs).not.toHaveBeenCalled();
  });

  it('turns an engine load failure into a retryable message', async () => {
    const { deps } = makeHarness();
    deps.loadPdfjs = vi.fn(async (): Promise<PdfjsLib> => {
      throw new Error('offline');
    });
    const result = await pdfToPages(makePdfFile(), deps);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/PDF engine could not load/);
    expect(result.renderedCount).toBe(0);
  });
});

// ── Orchestration: document-level failures ───────────────────────────────

describe('pdfToPages — document-level failures', () => {
  it('reports an unreadable file instead of throwing', async () => {
    const { deps } = makeHarness();
    const file = makePdfFile();
    Object.defineProperty(file, 'arrayBuffer', {
      value: () => Promise.reject(new Error('io error')),
    });

    const result = await pdfToPages(file, deps);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Could not read this PDF/);
    expect(deps.loadPdfjs).toHaveBeenCalledTimes(1);
  });

  it('reports a corrupt or password-protected PDF when the document fails to open', async () => {
    const { deps } = makeHarness();
    deps.loadPdfjs = vi.fn(
      async (): Promise<PdfjsLib> => ({
        GlobalWorkerOptions: { workerSrc: '/pdf.worker.min.mjs' },
        getDocument: () => ({
          promise: Promise.reject(new Error('PasswordException')),
          destroy: vi.fn(async () => {}),
        }),
      }),
    );

    const result = await pdfToPages(makePdfFile(), deps);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/password-protected|corrupted/);
  });

  it('survives getDocument throwing synchronously', async () => {
    const { deps } = makeHarness();
    deps.loadPdfjs = vi.fn(
      async (): Promise<PdfjsLib> => ({
        GlobalWorkerOptions: { workerSrc: '/pdf.worker.min.mjs' },
        getDocument: () => {
          throw new Error('InvalidPDFException');
        },
      }),
    );

    const result = await pdfToPages(makePdfFile(), deps);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/could not be opened as a PDF/);
  });

  it('rejects a PDF with no pages', async () => {
    const { deps, destroy } = makeHarness({ total: 0 });
    const result = await pdfToPages(makePdfFile(), deps);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no pages/);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('rejects a PDF longer than the per-chapter ceiling before rendering anything', async () => {
    const { deps, getPage } = makeHarness({ total: PDF_MAX_PAGES + 1 });
    const result = await pdfToPages(makePdfFile(), deps);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(new RegExp(`${PDF_MAX_PAGES + 1} pages`));
    expect(result.error).toMatch(new RegExp(`${PDF_MAX_PAGES} max per chapter`));
    expect(getPage).not.toHaveBeenCalled();
  });

  it('honours a caller-supplied page ceiling', async () => {
    const { deps, getPage } = makeHarness({ total: 3 });
    const result = await pdfToPages(makePdfFile(), deps, { maxPages: 2 });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/3 pages/);
    expect(result.error).toMatch(/2 max per chapter/);
    expect(getPage).not.toHaveBeenCalled();
  });
});

// ── Engine wiring ────────────────────────────────────────────────────────

describe('pdf.js engine wiring', () => {
  it('ships the real browser deps by default, so production never injects anything', () => {
    expect(PDF_TO_PAGES_DEPS.renderPage).toBe(renderPdfPageToFile);
    expect(typeof PDF_TO_PAGES_DEPS.loadPdfjs).toBe('function');
  });

  it('refuses to run during the server render instead of crashing', async () => {
    vi.stubGlobal('window', undefined);
    try {
      await expect(loadPdfjs()).rejects.toThrow(/requires a browser/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

// ── Canvas rendering ─────────────────────────────────────────────────────
// jsdom has no rasteriser, so the 2D context and toBlob are faked — this is
// what proves the page really is painted white before being encoded (pdf.js
// leaves the canvas transparent, and JPEG turns transparency into black).

describe('renderPdfPageToFile', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeRenderSpy(promise: Promise<void> = Promise.resolve()) {
    // The parameter type only exists to type the recorded calls, so the
    // assertions below can read back the viewport and the canvas.
    return vi.fn((params: { viewport: PdfViewport; canvas: HTMLCanvasElement }) => {
      void params;
      return { promise };
    });
  }

  function makeRenderablePage(render: ReturnType<typeof makeRenderSpy>): PdfPageProxy {
    return {
      // 400×500 native page — the same shape the scale test above uses.
      getViewport: ({ scale }: { scale: number }) => ({ width: 400 * scale, height: 500 * scale }),
      render,
    } as unknown as PdfPageProxy;
  }

  function fakeCanvasApi(options: { context?: boolean; blob?: Blob | null } = {}) {
    const fillRect = vi.fn();
    const ctx = { fillStyle: '', fillRect } as unknown as CanvasRenderingContext2D;
    // HTMLCanvasElement.getContext is overloaded (2d, webgl, webgpu…), so the
    // fake is cast to the whole overloaded method type instead of one overload.
    const fakeGetContext = () => (options.context === false ? null : ctx);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      fakeGetContext as unknown as HTMLCanvasElement['getContext'],
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(((
      callback: BlobCallback,
    ) => {
      callback(
        options.blob === undefined ? new Blob(['jpeg'], { type: 'image/jpeg' }) : options.blob,
      );
    }) as typeof HTMLCanvasElement.prototype.toBlob);
    return { ctx, fillRect };
  }

  it('paints a white background, then returns a JPEG File named for the page', async () => {
    const render = makeRenderSpy();
    const { fillRect } = fakeCanvasApi();

    const file = await renderPdfPageToFile(makeRenderablePage(render), 2, 2, 0.92);

    expect(file.name).toBe('pdf-page-002.jpg');
    expect(file.type).toBe('image/jpeg');
    // 2× scale on a 400×500 page → an 800×1000 canvas, fully whitewashed.
    expect(fillRect).toHaveBeenCalledWith(0, 0, 800, 1000);
    expect(render.mock.calls[0][0].viewport).toEqual({ width: 800, height: 1000 });
  });

  it('frees the canvas as soon as the page is encoded', async () => {
    const render = makeRenderSpy();
    fakeCanvasApi();

    await renderPdfPageToFile(makeRenderablePage(render), 1, 2, 0.92);

    const canvas = render.mock.calls[0][0].canvas;
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
  });

  it('frees the canvas even when rendering fails, so a long chapter cannot leak memory', async () => {
    const render = makeRenderSpy(
      Promise.resolve().then(() => {
        throw new Error('render died');
      }),
    );
    fakeCanvasApi();

    await expect(renderPdfPageToFile(makeRenderablePage(render), 1, 1, 0.92)).rejects.toThrow(
      /render died/,
    );

    const canvas = render.mock.calls[0][0].canvas;
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
  });

  it('reports a failed encode instead of pushing an empty page into the chapter', async () => {
    const render = makeRenderSpy();
    fakeCanvasApi({ blob: null });

    await expect(renderPdfPageToFile(makeRenderablePage(render), 1, 1, 0.92)).rejects.toThrow(
      /Could not encode/,
    );
  });

  it('refuses to render when the browser has no 2D canvas support', async () => {
    const render = makeRenderSpy();
    fakeCanvasApi({ context: false });

    await expect(renderPdfPageToFile(makeRenderablePage(render), 1, 1, 0.92)).rejects.toThrow(
      /Canvas is not available/,
    );
    expect(render).not.toHaveBeenCalled();
  });

  it('requests the page at exactly the scale the caller computed', async () => {
    const render = makeRenderSpy();
    fakeCanvasApi();

    await renderPdfPageToFile(makeRenderablePage(render), 1, 0.5, 0.92);

    expect(render.mock.calls[0][0].viewport).toEqual({ width: 200, height: 250 });
  });
});
