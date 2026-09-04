'use client';

// Books module — the immersion reader. One component, two engines:
//
//   PDF  → pdf.js renders pages to canvases (cached as dataURLs); desktop
//          gets a two-page spread with a CSS-3D page-turn animation, mobile
//          gets a clean single page with slide transitions + swipe/tap zones.
//   EPUB → epub.js rendition into a container div; spreads come from epub.js
//          itself (`spread: 'auto'`), font-size/family/line-height are real
//          reflowable text styling.
//
// §142 reader upgrades (all in THIS component — no parallel reader exists):
//   • 4-theme engine: light / sepia / dark / midnight (OLED — pure-black desk,
//     near-black paper).
//   • Typography controls: font family (serif/sans/mono), 12–24px size slider,
//     1.2–2.0 line-height slider, narrow/normal/wide margins (EPUB text is
//     reflowable; margins also pad the stage for PDF pages).
//   • Continuous scroll vs paginated toggle, per engine: PDF gets a vertical
//     lazy-rendered page list; EPUB re-creates its rendition with
//     flow:'scrolled-doc' (no new dependencies — same vendored epub.js).
//   • Collapsible reading dock: settings panel (theme/mode/typography/zoom),
//     TOC drawer (EPUB navigation + PDF page directory), focus mode.
//   • Scroll-% progress mirrored to localStorage (book_reader_progress_<id>)
//     next to the existing book_reading_progress DB upsert — works signed-out.
//   • Mobile thumb-zone floating next/prev buttons (≥48px targets).
//
// Access control mirrors the gated file route: this component receives
// `hasAccess` from the page, and the file fetch itself is enforced again
// server-side — an unpurchased PAID book's response is byte-truncated by
// /api/books/file/[bookId] (X-Book-Preview header tells us so). PDF previews
// render whatever pages survive truncation, hard-capped at PREVIEW_PAGES
// client-side too; EPUB previews never attempt a parse (a truncated zip
// can't open) and show the cover + checkout card instead.
//
// NOTE ON THE READER ENGINES: pdf.js and epub.js are NOT bundled — not into
// the client chunks and critically not into the OpenNext server function.
// Client components are SSR'd, so a plain `import('pdfjs-dist')` here still
// pulled the whole library into handler.mjs, which blew past Cloudflare's
// 3 MiB free-plan Worker size limit on deploy ([code: 10027]). Instead both
// engines live as static assets under /vendor/ (see public/vendor/README.md)
// and are loaded at runtime by injecting script tags — see loadPdfjs() and
// loadEpub() below. The types they used to come from 'pdfjs-dist' are now
// minimal structural types defined locally.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, ArrowRight, Maximize, Minimize, Moon, MoonStar, Sun, Sunset,
  Type, ZoomIn, ZoomOut, Lock, Loader2, X, AlertCircle, List, Eye, EyeOff,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { openRazorpayCheckout } from '../../lib/payments/razorpayClient';
import BookPurchaseModal from '../shared/BookPurchaseModal';

export interface ReaderBookInfo {
  id: string;
  title: string;
  file_type: 'pdf' | 'epub';
  pricing_type: 'FREE' | 'PAID';
  price_paise: number | null;
  cover_image_url: string | null;
}

interface Props {
  book: ReaderBookInfo;
  hasAccess: boolean;
  userId: string | null;
  initialProgress?: { lastPage: number; lastLocation: string | null } | null;
}

type ThemeName = 'light' | 'sepia' | 'dark' | 'midnight';
type FontFamily = 'serif' | 'sans' | 'mono';
type ReadingMode = 'paginated' | 'scroll';
type MarginSize = 'narrow' | 'normal' | 'wide';

const PREVIEW_PAGES = 5;

const THEME_DESK: Record<ThemeName, string> = {
  light: '#e8e4da',
  sepia: '#cbb894',
  dark: '#101014',
  midnight: '#000000',
};

const THEME_PAPER: Record<ThemeName, string> = {
  light: '#fdfcf9',
  sepia: '#f4ecd8',
  dark: '#191921',
  midnight: '#0a0a0d',
};

// Reflowable EPUB text colors — midnight uses high-contrast dim-white ink on
// near-black paper (OLED power shape without crushed-grey text).
const THEME_INK: Record<ThemeName, string> = {
  light: '#1a1a1a',
  sepia: '#3b2f1e',
  dark: '#d8d4cc',
  midnight: '#e8e8ee',
};

// PDF pages are bitmap images; themes shade them via a CSS filter.
const THEME_PAPER_FILTER: Record<ThemeName, string | undefined> = {
  light: undefined,
  sepia: 'sepia(0.42) saturate(0.88)',
  dark: 'invert(0.9) hue-rotate(185deg) brightness(0.94)',
  midnight: 'invert(0.93) hue-rotate(185deg) brightness(0.85) contrast(1.08)',
};

const THEME_ICONS: Record<ThemeName, typeof Sun> = {
  light: Sun,
  sepia: Sunset,
  dark: Moon,
  midnight: MoonStar,
};

const FONT_STACKS: Record<FontFamily, string> = {
  serif: 'Georgia, "Times New Roman", serif',
  sans: '"Segoe UI", system-ui, -apple-system, Arial, sans-serif',
  mono: '"Cascadia Mono", "Courier New", monospace',
};

const FONT_SIZE_MIN = 12;
const FONT_SIZE_MAX = 24;
const FONT_SIZE_DEFAULT = 17;
const LINE_HEIGHT_MIN = 1.2;
const LINE_HEIGHT_MAX = 2;
const LINE_HEIGHT_DEFAULT = 1.6;

const MARGIN_PX: Record<MarginSize, number> = { narrow: 8, normal: 28, wide: 64 };
const MARGIN_LABELS: Record<MarginSize, string> = { narrow: 'Narrow', normal: 'Normal', wide: 'Wide' };

// localStorage keys — `book_reader_theme` predates §142; the rest follow the
// same book_reader_* namespace. Progress mirrors book_reading_progress.
const THEME_KEY = 'book_reader_theme';
const TYPOGRAPHY_KEY = 'book_reader_typography';
const READING_MODE_KEY = 'book_reader_mode';
const progressKey = (bookId: string) => `book_reader_progress_${bookId}`;

interface LocalProgress { lastPage?: number; lastLocation?: string | null; percent?: number | null; ts?: number }

/** localStorage progress mirror — DB row (if any) always wins on conflict. */
function readLocalProgress(bookId: string): LocalProgress | null {
  try {
    const raw = localStorage.getItem(progressKey(bookId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalProgress;
    if (parsed && typeof parsed === 'object') return parsed;
    return null;
  } catch {
    return null;
  }
}

const ZOOM_STEPS = [0.85, 1, 1.25, 1.5, 1.9];

function formatPaise(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

// ── Minimal structural types for the two reader engines ──────────────────
// Only the surface this component actually touches — the real libraries are
// loaded at runtime from /vendor static assets, never imported.

interface PdfViewport { width: number; height: number }
interface PdfPageProxy {
  getViewport(params: { scale: number }): PdfViewport;
  render(params: {
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfViewport;
    canvas: HTMLCanvasElement;
  }): { promise: Promise<void> };
}
interface PdfDocumentProxy {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPageProxy>;
}
interface PdfjsLib {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(src: { data: ArrayBuffer }): {
    promise: Promise<PdfDocumentProxy>;
    destroy(): Promise<void>;
  };
}

interface EpubLocation { start?: { cfi?: string; percentage?: number } }
interface EpubRendition {
  themes: {
    register(name: string, css: unknown): void;
    select(name: string): void;
    fontSize(size: string): void;
  };
  display(target?: string): Promise<unknown>;
  on(event: string, cb: (loc: EpubLocation) => void): void;
  next(): void;
  prev(): void;
  // Re-measures the rendition after its container's geometry changes (margins).
  resize?(width?: number | string, height?: number | string): void;
  destroy(): void;
}
interface EpubTocItem {
  label?: string;
  title?: string;
  href?: string;
  subitems?: EpubTocItem[];
}
interface EpubBook {
  ready: Promise<unknown>;
  loaded?: { navigation?: Promise<{ toc?: EpubTocItem[] }> };
  renderTo(el: HTMLElement, opts: Record<string, unknown>): EpubRendition;
  destroy(): void;
}
type EpubCtor = (data: ArrayBuffer) => EpubBook;

declare global {
  interface Window {
    pdfjsLib?: PdfjsLib;
    ePub?: EpubCtor;
  }
}

// Injects /vendor/pdf-loader.mjs once; resolves with the library after the
// module graph has fully evaluated (module scripts' load event guarantees
// that). Repeated calls reuse the same in-flight promise.
let pdfjsPromise: Promise<PdfjsLib> | null = null;
function loadPdfjs(): Promise<PdfjsLib> {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (!pdfjsPromise) {
    pdfjsPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.type = 'module';
      s.src = '/vendor/pdf-loader.mjs';
      s.onload = () => {
        if (window.pdfjsLib) resolve(window.pdfjsLib);
        else reject(new Error('PDF engine failed to initialize.'));
      };
      s.onerror = () => reject(new Error('Could not load the PDF engine.'));
      document.head.appendChild(s);
    });
  }
  return pdfjsPromise;
}

let epubPromise: Promise<EpubCtor> | null = null;
function loadEpub(): Promise<EpubCtor> {
  if (window.ePub) return Promise.resolve(window.ePub);
  if (!epubPromise) {
    epubPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = '/vendor/epub.min.js';
      s.onload = () => {
        if (window.ePub) resolve(window.ePub);
        else reject(new Error('EPUB engine failed to initialize.'));
      };
      s.onerror = () => reject(new Error('Could not load the EPUB engine.'));
      document.head.appendChild(s);
    });
  }
  return epubPromise;
}

export default function BookReader({ book, hasAccess, userId, initialProgress }: Props) {
  // ── shared state ──────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeName>('light');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [purchasePending, setPurchasePending] = useState(false);
  const [access, setAccess] = useState(hasAccess);
  const rootRef = useRef<HTMLDivElement>(null);
  const flippingRef = useRef(false);

  // ── §142 reading-dock state ────────────────────────────────────────────
  const [dockOpen, setDockOpen] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const [tocItems, setTocItems] = useState<EpubTocItem[] | null>(null); // EPUB navigation
  const [focusMode, setFocusMode] = useState(false); // session-only by design
  const [readingMode, setReadingMode] = useState<ReadingMode>('paginated');
  const [fontFamily, setFontFamily] = useState<FontFamily>('serif');
  const [fontSizePx, setFontSizePx] = useState(FONT_SIZE_DEFAULT);
  const [lineHeight, setLineHeight] = useState(LINE_HEIGHT_DEFAULT);
  const [marginSize, setMarginSize] = useState<MarginSize>('normal');
  const [scrollPct, setScrollPct] = useState(0); // PDF continuous-scroll progress 0..1
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef<number | null>(null);
  const ioRef = useRef<IntersectionObserver | null>(null);
  const lastEpubCfiRef = useRef<string | null>(initialProgress?.lastLocation ?? null);

  // ── PDF state ─────────────────────────────────────────────────────────
  const [pdfDoc, setPdfDoc] = useState<PdfDocumentProxy | null>(null);
  // The teardown method lives on the loading task, not the document proxy —
  // keep a ref so unmount can stop the worker cleanly.
  const pdfLoadingTaskRef = useRef<{
    promise: Promise<PdfDocumentProxy>;
    destroy(): Promise<void>;
  } | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [spread, setSpread] = useState(0);
  const [mobilePage, setMobilePage] = useState(1);
  const [zoomIdx, setZoomIdx] = useState(1);
  const [flip, setFlip] = useState<{ dir: 'next' | 'prev' } | null>(null);
  const [slideDir, setSlideDir] = useState<'next' | 'prev'>('next');
  const pageCacheRef = useRef<Map<string, string>>(new Map());
  const [, forceTick] = useState(0); // re-render when cache fills asynchronously

  // ── EPUB state ────────────────────────────────────────────────────────
  const epubContainerRef = useRef<HTMLDivElement>(null);
  const [epubReady, setEpubReady] = useState(false);
  const [epubPercent, setEpubPercent] = useState<number | null>(null);
  const epubRefs = useRef<{ book: EpubBook; rendition: EpubRendition } | null>(null);

  const previewOnly = !access && book.pricing_type === 'PAID';

  // ── persisted prefs ───────────────────────────────────────────────────
  useEffect(() => {
    try {
      const t = localStorage.getItem(THEME_KEY);
      if (t === 'light' || t === 'sepia' || t === 'dark' || t === 'midnight') setTheme(t);
    } catch { /* private mode */ }
    try {
      const raw = localStorage.getItem(TYPOGRAPHY_KEY);
      if (raw) {
        const p = JSON.parse(raw) as Partial<{ fontFamily: FontFamily; fontSizePx: number; lineHeight: number; marginSize: MarginSize }>;
        if (p.fontFamily === 'serif' || p.fontFamily === 'sans' || p.fontFamily === 'mono') setFontFamily(p.fontFamily);
        if (typeof p.fontSizePx === 'number' && p.fontSizePx >= FONT_SIZE_MIN && p.fontSizePx <= FONT_SIZE_MAX) setFontSizePx(Math.round(p.fontSizePx));
        if (typeof p.lineHeight === 'number' && p.lineHeight >= LINE_HEIGHT_MIN && p.lineHeight <= LINE_HEIGHT_MAX) setLineHeight(Math.round(p.lineHeight * 10) / 10);
        if (p.marginSize === 'narrow' || p.marginSize === 'normal' || p.marginSize === 'wide') setMarginSize(p.marginSize);
      }
    } catch { /* corrupted prefs — defaults */ }
    try {
      const m = localStorage.getItem(READING_MODE_KEY);
      if (m === 'paginated' || m === 'scroll') setReadingMode(m);
    } catch { /* private mode */ }
  }, []);

  function applyTheme(t: ThemeName) {
    setTheme(t);
    try { localStorage.setItem(THEME_KEY, t); } catch { /* ignore */ }
  }

  function applyTypography(patch: Partial<{ fontFamily: FontFamily; fontSizePx: number; lineHeight: number; marginSize: MarginSize }>) {
    if (patch.fontFamily !== undefined) setFontFamily(patch.fontFamily);
    if (patch.fontSizePx !== undefined) setFontSizePx(Math.round(patch.fontSizePx));
    if (patch.lineHeight !== undefined) setLineHeight(Math.round(patch.lineHeight * 10) / 10);
    if (patch.marginSize !== undefined) setMarginSize(patch.marginSize);
    // Persist the merged next values.
    try {
      const merged = {
        fontFamily: patch.fontFamily ?? fontFamily,
        fontSizePx: patch.fontSizePx !== undefined ? Math.round(patch.fontSizePx) : fontSizePx,
        lineHeight: patch.lineHeight !== undefined ? Math.round(patch.lineHeight * 10) / 10 : lineHeight,
        marginSize: patch.marginSize ?? marginSize,
      };
      localStorage.setItem(TYPOGRAPHY_KEY, JSON.stringify(merged));
    } catch { /* ignore */ }
  }

  function applyReadingMode(m: ReadingMode) {
    setReadingMode(m);
    setFlip(null);
    try { localStorage.setItem(READING_MODE_KEY, m); } catch { /* ignore */ }
  }

  // ── responsive mode ───────────────────────────────────────────────────
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // ── drawer scroll-lock (dock/TOC open) ────────────────────────────────
  const overlayOpen = dockOpen || tocOpen;
  useEffect(() => {
    if (!overlayOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [overlayOpen]);

  // ── fullscreen ────────────────────────────────────────────────────────
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  async function toggleFullscreen() {
    // BUG FIX: this used to target rootRef.current (the reader's own div),
    // which the manga reader tried first and moved away from — arbitrary
    // elements reject requestFullscreen far more often (notably iOS Safari,
    // which doesn't support it on non-<video> elements at all), so the
    // button silently did nothing on those browsers. document.documentElement
    // is the same target the manga reader uses and is far more reliably
    // accepted. We also set isFullscreen unconditionally instead of relying
    // solely on the 'fullscreenchange' listener, so the button/icon always
    // reflects the toggle even where the real Fullscreen API is unsupported
    // or denied — matching the manga reader's fallback behavior.
    const goingFullscreen = !isFullscreen;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        // Controls must stay reachable in fullscreen: entering drops focus
        // mode so the top/bottom bars (and the "Show controls" pill) can
        // never strand a reader in a chrome-less fullscreen. Focus mode can
        // still be entered afterwards deliberately via the eye button.
        setFocusMode(false);
        await document.documentElement.requestFullscreen?.();
      }
    } catch { /* denied/unsupported — fall through to state toggle below */ }
    setIsFullscreen(goingFullscreen);
  }

  // ── file fetch (auth-aware) ───────────────────────────────────────────
  const fetchFileBuffer = useCallback(async (): Promise<{ buf: ArrayBuffer; truncated: boolean }> => {
    const headers: Record<string, string> = {};
    if (userId) {
      // BUG FIX: getSession() can hang forever on a stale cross-tab auth
      // lock (works in Incognito — no existing session/lock — but stalls
      // the reader indefinitely in a normal browser with a live session).
      // Time out and fall through unauthenticated rather than never
      // resolving; the file route still degrades to the free preview for
      // paid books instead of erroring outright.
      const session = await Promise.race([
        supabase.auth.getSession().then((r) => r.data.session),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
      ]).catch(() => null);
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    }
    const res = await fetch(`/api/books/file/${book.id}`, { headers });
    if (!res.ok) throw new Error('Could not load the book file.');
    const buf = await res.arrayBuffer();
    return { buf, truncated: res.headers.get('X-Book-Preview') === '1' };
  }, [book.id, userId]);

  // ── PDF engine ────────────────────────────────────────────────────────
  useEffect(() => {
    if (book.file_type !== 'pdf') return;
    let cancelled = false;

    (async () => {
      try {
        // Engine + file load in parallel — the engine comes from the
        // /vendor static asset, never from a bundle.
        const [buf, pdfjsLib] = await Promise.all([
          fetchFileBuffer().then((r) => r.buf),
          loadPdfjs(),
        ]);
        if (cancelled) return;

        const loadingTask = pdfjsLib.getDocument({ data: buf });
        pdfLoadingTaskRef.current = loadingTask;
        const doc = await loadingTask.promise;
        if (cancelled) { void loadingTask.destroy(); return; }

        setTotalPages(doc.numPages);
        setPdfDoc(doc);

        // Resume: DB row wins; localStorage mirror is the signed-out fallback.
        const local = initialProgress?.lastPage ? null : readLocalProgress(book.id);
        const saved = initialProgress?.lastPage ?? local?.lastPage ?? 1;
        if (readingMode === 'scroll') {
          // Continuous scroll: jump straight to the saved page element once the
          // lazy page list lays out (the scroll-mode effect handles it).
          setMobilePage(Math.min(Math.max(saved, 1), doc.numPages));
          return;
        }
        // Paginated: map saved page → spread (spread 0 = page 1 alone).
        const startSpread = saved <= 1 ? 0 : Math.min(Math.floor(saved / 2), Math.floor(doc.numPages / 2));
        setSpread(startSpread);
        setMobilePage(Math.min(Math.max(saved, 1), doc.numPages));
      } catch {
        if (!cancelled) {
          setLoadError(
            previewOnly
              ? 'The free preview could not be opened for this file. Purchase the book to read the full version.'
              : 'This file could not be opened. It may be corrupted or in an unsupported format.'
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      void pdfLoadingTaskRef.current?.destroy();
      pdfLoadingTaskRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id, book.file_type]);

  // Render one PDF page to a cached dataURL at the current zoom.
  const getPageImage = useCallback(async (n: number): Promise<string | null> => {
    const doc = pdfDoc;
    if (!doc || n < 1 || n > doc.numPages) return null;
    const zoom = ZOOM_STEPS[zoomIdx];
    const key = `${n}@${zoom}`;
    const hit = pageCacheRef.current.get(key);
    if (hit) return hit;

    const page = await doc.getPage(n);
    // Render sharp enough for the stage height, bounded so huge zooms don't
    // blow up canvas memory.
    const scale = Math.min(Math.max(1.1 * zoom, 0.7), 2.6);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    const url = canvas.toDataURL('image/jpeg', 0.88);

    // FIFO eviction — keep memory bounded across long books.
    const cache = pageCacheRef.current;
    cache.set(key, url);
    while (cache.size > 28) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
    forceTick((t) => t + 1);
    return url;
  }, [pdfDoc, zoomIdx]);

  // Pre-render the pages around the current position (paginated mode only —
  // continuous scroll lazy-renders via its own IntersectionObserver).
  useEffect(() => {
    if (!pdfDoc || readingMode === 'scroll') return;
    if (isMobile) {
      void getPageImage(mobilePage);
      void getPageImage(mobilePage + 1);
      void getPageImage(mobilePage - 1);
    } else {
      const left = spread === 0 ? 1 : 2 * spread;
      const right = spread === 0 ? null : 2 * spread + 1;
      for (const p of [left, right, left - 1, left + 1, right !== null ? right + 1 : null]) {
        if (p && p >= 1 && p <= pdfDoc.numPages) void getPageImage(p);
      }
    }
  }, [pdfDoc, spread, mobilePage, isMobile, zoomIdx, getPageImage, readingMode]);

  // Evict the whole cache when zoom changes so stale scales disappear.
  useEffect(() => {
    pageCacheRef.current.clear();
  }, [zoomIdx]);

  // ── continuous-scroll lazy rendering (PDF) ─────────────────────────────
  const scrollPageCount = previewOnly
    ? Math.min(PREVIEW_PAGES, totalPages || PREVIEW_PAGES)
    : totalPages;

  // IntersectionObserver renders pages as they approach the viewport, for any
  // scroll/jump position — not just the ones adjacent to the last seen page.
  useEffect(() => {
    if (!pdfDoc || readingMode !== 'scroll') {
      ioRef.current?.disconnect();
      ioRef.current = null;
      return;
    }
    const rootEl = scrollContainerRef.current;
    if (!rootEl) return;
    const queued = new Set<number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const n = Number((entry.target as HTMLElement).dataset.page);
          if (!Number.isFinite(n) || n < 1 || queued.has(n)) continue;
          queued.add(n);
          void getPageImage(n).finally(() => queued.delete(n));
        }
      },
      { root: rootEl, rootMargin: '900px 0px' },
    );
    ioRef.current = io;
    rootEl.querySelectorAll<HTMLElement>('[data-page]').forEach((el) => io.observe(el));
    return () => {
      io.disconnect();
      if (ioRef.current === io) ioRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfDoc, readingMode, scrollPageCount, zoomIdx]);

  // rAF-throttled scroll handler — computes % + nearest page.
  const handlePdfScroll = useCallback(() => {
    if (scrollRafRef.current !== null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const el = scrollContainerRef.current;
      if (!el) return;
      const max = el.scrollHeight - el.clientHeight;
      const pct = max > 0 ? Math.min(1, Math.max(0, el.scrollTop / max)) : 0;
      setScrollPct(pct);
    });
  }, []);

  // ── EPUB engine ───────────────────────────────────────────────────────
  // Recreated when the book changes OR when the reading mode toggles —
  // epub.js fixes its flow at renderTo() time, so paginated ⇄ scroll needs a
  // fresh rendition. `lastEpubCfiRef` carries the position across recreations.
  useEffect(() => {
    if (book.file_type !== 'epub') return;
    // A truncated zip cannot be parsed — don't attempt it for previews.
    if (previewOnly) { setLoading(false); return; }
    let cancelled = false;

    (async () => {
      try {
        const [buf, ePub] = await Promise.all([
          fetchFileBuffer().then((r) => r.buf),
          loadEpub(),
        ]);
        if (cancelled) return;

        const epubBook = ePub(buf);
        const rendition = epubBook.renderTo(epubContainerRef.current!, {
          width: '100%',
          height: '100%',
          flow: readingMode === 'scroll' ? 'scrolled-doc' : 'paginated',
          spread: readingMode === 'scroll' ? 'none' : 'auto',
          allowScriptedContent: false,
        });

        epubRefs.current = { book: epubBook, rendition };

        // TOC for the chapter drawer — epub.js exposes the navigation document.
        epubBook.loaded?.navigation
          ?.then((nav) => { if (!cancelled) setTocItems(nav.toc ?? []); })
          .catch(() => { if (!cancelled) setTocItems(null); });

        const themes = rendition.themes;
        (Object.keys(THEME_PAPER) as ThemeName[]).forEach((t) => {
          themes.register(t, {
            body: {
              background: THEME_PAPER[t],
              color: THEME_INK[t],
              'font-family': FONT_STACKS[fontFamily],
              'line-height': String(lineHeight),
            },
          });
        });
        themes.select(theme);
        themes.fontSize(`${fontSizePx}px`);

        await rendition.display(lastEpubCfiRef.current || undefined);
        if (cancelled) { rendition.destroy(); return; }

        rendition.on('relocated', (loc: EpubLocation) => {
          const pct = loc.start?.percentage ?? null;
          setEpubPercent(pct);
          if (loc.start?.cfi) lastEpubCfiRef.current = loc.start.cfi;
          if (loc.start?.cfi) {
            saveProgress({ lastLocation: loc.start.cfi, percent: pct });
          }
        });

        setEpubReady(true);
      } catch {
        if (!cancelled) setLoadError('This EPUB could not be opened. It may be corrupted or DRM-protected.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      const refs = epubRefs.current;
      if (refs) {
        try { refs.rendition.destroy(); } catch { /* ignore */ }
        try { refs.book.destroy(); } catch { /* ignore */ }
        epubRefs.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id, book.file_type, readingMode]);

  // Live-apply theme/typography changes to a mounted EPUB rendition.
  useEffect(() => {
    const themes = epubRefs.current?.rendition.themes;
    if (themes) {
      (Object.keys(THEME_PAPER) as ThemeName[]).forEach((t) => {
        themes.register(t, {
          body: {
            background: THEME_PAPER[t],
            color: THEME_INK[t],
            'font-family': FONT_STACKS[fontFamily],
            'line-height': String(lineHeight),
          },
        });
      });
      themes.select(theme);
      themes.fontSize(`${fontSizePx}px`);
    }
    // Margins change the container geometry — re-measure the rendition.
    try { epubRefs.current?.rendition.resize?.(); } catch { /* ignore */ }
  }, [theme, fontFamily, lineHeight, fontSizePx, marginSize, epubReady, readingMode]);

  // ── progress persistence ────────────────────────────────────────────────
  // localStorage mirror ALWAYS (works signed-out, survives re-opens); the
  // book_reading_progress upsert runs only for signed-in users, exactly as
  // before §142.
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function saveProgress(payload: { lastPage?: number; lastLocation?: string; percent?: number | null }) {
    try {
      localStorage.setItem(
        progressKey(book.id),
        JSON.stringify({
          lastPage: payload.lastPage,
          lastLocation: payload.lastLocation ?? null,
          percent: payload.percent ?? null,
          ts: Date.now(),
        } satisfies LocalProgress),
      );
    } catch { /* private mode / storage full — non-fatal */ }
    if (!userId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void supabase
        .from('book_reading_progress')
        .upsert(
          {
            book_id: book.id,
            user_id: userId,
            ...(payload.lastPage !== undefined ? { last_page: payload.lastPage, total_pages: totalPages || null } : {}),
            ...(payload.percent !== undefined && payload.percent !== null ? { percent: Math.round(payload.percent * 10000) / 100 } : {}),
            ...(payload.lastLocation !== undefined ? { last_location: payload.lastLocation } : {}),
          },
          { onConflict: 'book_id,user_id' }
        );
    }, 700);
  }

  // Paginated PDF progress — page-turn driven (existing behavior).
  useEffect(() => {
    if (book.file_type !== 'pdf' || !totalPages) return;
    if (readingMode === 'scroll') return;
    const page = isMobile ? mobilePage : (spread === 0 ? 1 : 2 * spread);
    saveProgress({ lastPage: page });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spread, mobilePage, isMobile, totalPages, readingMode]);

  // Continuous-scroll PDF progress — scroll-% driven.
  useEffect(() => {
    if (book.file_type !== 'pdf' || readingMode !== 'scroll' || !scrollPageCount) return;
    const nearPage = Math.min(Math.max(1, Math.round(scrollPct * (scrollPageCount - 1)) + 1), scrollPageCount);
    saveProgress({ lastPage: nearPage, percent: scrollPct });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollPct, scrollPageCount, readingMode]);

  // ── navigation ────────────────────────────────────────────────────────
  const maxSpread = totalPages
    ? (previewOnly ? Math.floor(PREVIEW_PAGES / 2) : Math.floor(totalPages / 2))
    : 0;
  const maxMobilePage = previewOnly ? Math.min(PREVIEW_PAGES, totalPages || PREVIEW_PAGES) : totalPages;

  const [lockOpen, setLockOpen] = useState(false);

  // useCallback so the keyboard-nav effect below doesn't re-subscribe on
  // every render — these only change when their nav-state deps change.
  const goNext = useCallback(() => {
    if (flippingRef.current) return;
    if (book.file_type === 'epub') {
      epubRefs.current?.rendition.next();
      return;
    }
    // Continuous scroll: a thumb-zone/keyboard "page turn" scrolls ~85% of a
    // viewport, like a native reader. Flips/steps don't apply here.
    if (readingMode === 'scroll') {
      const el = scrollContainerRef.current;
      if (el) el.scrollBy({ top: el.clientHeight * 0.85, behavior: 'smooth' });
      return;
    }
    if (isMobile) {
      if (mobilePage >= maxMobilePage) { if (previewOnly) setLockOpen(true); return; }
      setSlideDir('next');
      setMobilePage((p) => Math.min(p + 1, maxMobilePage));
      return;
    }
    if (spread >= maxSpread) { if (previewOnly) setLockOpen(true); return; }
    flippingRef.current = true;
    setFlip({ dir: 'next' });
  }, [book.file_type, isMobile, mobilePage, maxMobilePage, spread, maxSpread, previewOnly, readingMode]);

  const goPrev = useCallback(() => {
    if (flippingRef.current) return;
    if (book.file_type === 'epub') {
      epubRefs.current?.rendition.prev();
      return;
    }
    if (readingMode === 'scroll') {
      const el = scrollContainerRef.current;
      if (el) el.scrollBy({ top: -el.clientHeight * 0.85, behavior: 'smooth' });
      return;
    }
    if (isMobile) {
      if (mobilePage <= 1) return;
      setSlideDir('prev');
      setMobilePage((p) => Math.max(p - 1, 1));
      return;
    }
    if (spread <= 0) return;
    flippingRef.current = true;
    setFlip({ dir: 'prev' });
  }, [book.file_type, isMobile, mobilePage, spread, readingMode]);

  function handleFlipEnd() {
    setFlip((f) => {
      if (f?.dir === 'next') setSpread((s) => s + 1);
      if (f?.dir === 'prev') setSpread((s) => s - 1);
      return null;
    });
    flippingRef.current = false;
  }

  // Keyboard nav.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
      if (e.key === 'Escape') {
        setFocusMode(false);
        setDockOpen(false);
        setTocOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goPrev]);

  // Touch swipe (single-page mode). In continuous scroll the gesture is
  // native scrolling — and a vertical-dominant swipe is never a page turn.
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touchStart.current = t ? { x: t.clientX, y: t.clientY } : null;
  }
  function onTouchEnd(e: React.TouchEvent) {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || readingMode === 'scroll') return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 40 || Math.abs(dy) > Math.abs(dx)) return;
    if (dx < 0) goNext(); else goPrev();
  }

  // Tap-anywhere restore: once focus mode hides all the chrome, a single tap
  // on the page itself brings the controls back (native reader pattern) —
  // this backs up the "Show controls" pill so focus mode can never strand a
  // reader with no way out. In normal mode a tap does nothing: navigation
  // stays with the buttons, swipe gestures, and arrow keys.
  function handleStageTap() {
    if (focusMode) setFocusMode(false);
  }

  // ── purchase (inline, same pair as the detail page) ───────────────────
  async function handleBuy() {
    if (!userId) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
      return;
    }
    if (!book.price_paise) return;
    setBuying(true);
    setBuyError(null);
    try {
      const res = await fetch('/api/payments/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountPaise: book.price_paise, purpose: 'book_purchase', purposeRefId: book.id }),
      });
      const orderData = await res.json();
      if (!res.ok) throw new Error(orderData.error || 'Could not start payment.');

      const opened = await openRazorpayCheckout({
        orderId: orderData.orderId,
        amountPaise: book.price_paise,
        description: `Buy “${book.title}”`,
        onSuccess: async (response) => {
          const verifyRes = await fetch('/api/payments/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(response),
          });
          const verifyData = await verifyRes.json();
          if (verifyRes.ok && verifyData.verified) {
            setAccess(true);
            setLockOpen(false);
            // Reload the file at full length: reset engines.
            setLoading(true);
            setPdfDoc(null);
            setTotalPages(0);
            setSpread(0);
            setMobilePage(1);
            pageCacheRef.current.clear();
            // Re-trigger the PDF effect by nudging state below.
            requestAnimationFrame(() => setLoading(false));
            window.location.reload(); // simplest correct path: fresh reader with access
          } else {
            setBuyError(verifyData.error ?? 'Payment could not be verified.');
          }
          setBuying(false);
        },
        onDismiss: () => setBuying(false),
      });
      if (!opened.ok) throw new Error(opened.error);
    } catch (err) {
      setBuyError(err instanceof Error ? err.message : 'Something went wrong.');
      setBuying(false);
    }
  }

  // §141 — all three lock-screen buttons below open the same direct-UPI
  // modal instead of calling handleBuy() (Razorpay) directly; handleBuy
  // itself is still here and still works, just as the modal's secondary
  // "Card/Netbanking" option, gated behind NEXT_PUBLIC_ENABLE_GLOBAL_PAYMENTS.
  function openBuyFlow() {
    if (!userId) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
      return;
    }
    setShowBuyModal(true);
  }

  // ── derived page images ───────────────────────────────────────────────
  const cache = pageCacheRef.current;
  const zoom = ZOOM_STEPS[zoomIdx];

  function imgFor(n: number): string | null {
    if (!n || n < 1) return null;
    return cache.get(`${n}@${zoom}`) ?? null;
  }

  // Spread geometry: spread 0 = [cover — page 1 alone on the RIGHT, like a
  // real book's closed cover], spread k≥1 = [2k, 2k+1]. curLeft is null at
  // spread 0 so the left sheet intentionally stays blank there, while page 1
  // itself shows on the right sheet — the old geometry parked page 1 on a
  // sheet neither branch rendered, leaving spread 0 (the very first page)
  // completely empty.
  const shownSpread = flip?.dir === 'next' ? spread + 1 : flip?.dir === 'prev' ? spread - 1 : spread;
  const curLeft = shownSpread === 0 ? null : 2 * shownSpread;
  const curRight = shownSpread === 0 ? 1 : 2 * shownSpread + 1;
  const flipFrontRight = spread === 0 ? 1 : 2 * spread + 1;       // next-flip front face
  const flipBackLeft = 2 * (spread + 1);                          // next-flip back face
  const flipFrontLeft = spread === 0 ? 1 : 2 * spread;            // prev-flip front face
  const flipBackRight = spread === 0 ? null : 2 * spread - 1;     // prev-flip back face

  const paperFilter = THEME_PAPER_FILTER[theme];

  const iconBtnStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: '36px', height: '36px', borderRadius: '9px', cursor: 'pointer',
    border: '1px solid var(--border-color)', background: 'var(--bg-card)',
    color: 'var(--text-secondary)', flexShrink: 0,
  };
  // Stage side padding from the margins control (halved on small screens).
  const stagePad = isMobile ? Math.round(MARGIN_PX[marginSize] / 2) : MARGIN_PX[marginSize];

  // Current page for the PDF bottom bar, per mode.
  const paginatedCurrentPage = isMobile
    ? mobilePage
    : (shownSpread === 0 ? 1 : 2 * shownSpread);
  const scrollCurrentPage = Math.min(
    Math.max(1, Math.round(scrollPct * (scrollPageCount - 1)) + 1),
    scrollPageCount || 1,
  );
  const bottomBarVisible = !focusMode;

  // ── §142 overlays: settings dock / TOC drawer / focus pill / thumb buttons ──
  function ReadingDock() {
    if (!dockOpen) return null;
    const seg = (active: boolean): React.CSSProperties => ({
      flex: 1, minHeight: '44px', borderRadius: '9px', cursor: 'pointer',
      fontSize: '12px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: active ? '1px solid var(--accent)' : '1px solid var(--border-color)',
      background: active ? 'rgba(var(--accent-rgb), 0.12)' : 'transparent',
      color: active ? 'var(--accent)' : 'var(--text-secondary)',
    });
    return (
      <div style={{ position: 'absolute', inset: 0, zIndex: 40 }} role="dialog" aria-label="Reading settings">
        {/* click-away layer (blurred backdrop on small screens) */}
        <button
          aria-label="Close reading settings"
          onClick={() => setDockOpen(false)}
          style={{
            position: 'absolute', inset: 0, border: 'none', cursor: 'default', padding: 0,
            background: isMobile ? 'rgba(5,5,8,0.45)' : 'transparent',
            backdropFilter: isMobile ? 'blur(3px)' : undefined,
            WebkitBackdropFilter: isMobile ? 'blur(3px)' : undefined,
          }}
        />
        <div
          className="book-reader-dock"
          style={{
            position: 'absolute', right: '12px', top: '58px', width: 'min(340px, calc(100vw - 24px))',
            maxHeight: 'calc(100% - 120px)', overflowY: 'auto', background: 'var(--bg-card)',
            border: '1px solid var(--border-color)', borderRadius: '14px',
            boxShadow: '0 16px 44px rgba(0,0,0,0.45)', padding: '14px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>Reading settings</strong>
            <button aria-label="Close settings" onClick={() => setDockOpen(false)} style={{ ...iconBtnStyle, width: '32px', height: '32px' }}>
              <X size={14} />
            </button>
          </div>

          {/* Theme */}
          <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', marginBottom: '6px' }}>Theme</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
            {(Object.keys(THEME_PAPER) as ThemeName[]).map((t) => {
              const Icon = THEME_ICONS[t];
              const active = t === theme;
              return (
                <button
                  key={t}
                  onClick={() => applyTheme(t)}
                  title={t}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px', minHeight: '44px', padding: '0 12px',
                    borderRadius: '10px', cursor: 'pointer', fontSize: '12px', fontWeight: 800,
                    border: active ? '2px solid var(--accent)' : '1px solid var(--border-color)',
                    background: active ? 'rgba(var(--accent-rgb), 0.1)' : 'transparent',
                    color: 'var(--text-primary)',
                  }}
                >
                  <span style={{ width: '14px', height: '14px', borderRadius: '4px', background: THEME_PAPER[t], border: '1px solid var(--border-color)', flexShrink: 0 }} />
                  <Icon size={13} /> {t === 'midnight' ? 'Midnight' : t[0].toUpperCase() + t.slice(1)}
                </button>
              );
            })}
          </div>

          {/* Reading mode */}
          <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', marginBottom: '6px' }}>Layout</div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
            <button style={seg(readingMode === 'paginated')} onClick={() => applyReadingMode('paginated')}>Pages</button>
            <button style={seg(readingMode === 'scroll')} onClick={() => applyReadingMode('scroll')}>Continuous scroll</button>
          </div>

          {/* Typography — meaningful for reflowable EPUB text */}
          {book.file_type === 'epub' ? (
            <>
              <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', marginBottom: '6px' }}>Font</div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                {(Object.keys(FONT_STACKS) as FontFamily[]).map((f) => (
                  <button key={f} style={{ ...seg(fontFamily === f), fontFamily: FONT_STACKS[f] }} onClick={() => applyTypography({ fontFamily: f })}>
                    {f === 'serif' ? 'Serif' : f === 'sans' ? 'Sans' : 'Mono'}
                  </button>
                ))}
              </div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '2px' }}>
                Text size · {fontSizePx}px
              </label>
              <input
                type="range" min={FONT_SIZE_MIN} max={FONT_SIZE_MAX} step={1} value={fontSizePx}
                onChange={(e) => applyTypography({ fontSizePx: Number(e.target.value) })}
                aria-label="Text size"
                style={{ width: '100%', height: '40px', accentColor: 'var(--accent)', cursor: 'pointer', marginBottom: '10px' }}
              />
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '2px' }}>
                Line height · {lineHeight.toFixed(1)}
              </label>
              <input
                type="range" min={LINE_HEIGHT_MIN} max={LINE_HEIGHT_MAX} step={0.1} value={lineHeight}
                onChange={(e) => applyTypography({ lineHeight: Number(e.target.value) })}
                aria-label="Line height"
                style={{ width: '100%', height: '40px', accentColor: 'var(--accent)', cursor: 'pointer', marginBottom: '14px' }}
              />
            </>
          ) : (
            <p style={{ fontSize: '11.5px', color: 'var(--text-tertiary)', margin: '0 0 14px', lineHeight: 1.5 }}>
              PDF pages have fixed layout — use zoom instead of typography.
            </p>
          )}

          {/* Margins — pads the stage for both engines */}
          <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', marginBottom: '6px' }}>Margins</div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
            {(Object.keys(MARGIN_PX) as MarginSize[]).map((m) => (
              <button key={m} style={seg(marginSize === m)} onClick={() => applyTypography({ marginSize: m })}>
                {MARGIN_LABELS[m]}
              </button>
            ))}
          </div>

          {/* Zoom — PDF only */}
          {book.file_type === 'pdf' && (
            <>
              <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', marginBottom: '6px' }}>Zoom</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button style={iconBtnStyle} aria-label="Zoom out" onClick={() => setZoomIdx((i) => Math.max(0, i - 1))}><ZoomOut size={15} /></button>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', minWidth: '44px', textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
                <button style={iconBtnStyle} aria-label="Zoom in" onClick={() => setZoomIdx((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))}><ZoomIn size={15} /></button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  function TocDrawer() {
    if (!tocOpen) return null;
    const isPdf = book.file_type === 'pdf';
    const jumpPdfPage = (n: number) => {
      if (previewOnly && n > scrollPageCount) return;
      setTocOpen(false);
      if (readingMode === 'scroll') {
        // Wait for the drawer scroll-lock to release, then jump.
        requestAnimationFrame(() => {
          document.getElementById(`br-page-${n}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      } else if (isMobile) {
        setSlideDir(n >= mobilePage ? 'next' : 'prev');
        setMobilePage(n);
      } else {
        setSpread(n <= 1 ? 0 : Math.min(Math.floor(n / 2), maxSpread));
      }
    };
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex' }} role="dialog" aria-label="Table of contents">
        <button
          aria-label="Close contents"
          onClick={() => setTocOpen(false)}
          style={{
            position: 'absolute', inset: 0, border: 'none', cursor: 'default', padding: 0,
            background: 'rgba(5,5,8,0.55)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
          }}
        />
        <div
          className="book-reader-toc"
          style={{
            position: 'relative', zIndex: 1, width: 'min(360px, 100vw)', maxWidth: '100vw', height: '100%',
            display: 'flex', flexDirection: 'column', background: 'var(--bg-card)',
            borderRight: '1px solid var(--border-color)', boxShadow: '14px 0 36px rgba(0,0,0,0.4)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--border-color)' }}>
            <strong style={{ fontSize: '13.5px', color: 'var(--text-primary)' }}>Contents</strong>
            <button aria-label="Close contents" onClick={() => setTocOpen(false)} style={{ ...iconBtnStyle, width: '36px', height: '36px' }}>
              <X size={15} />
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px', minWidth: 0 }}>
            {isPdf ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))', gap: '8px' }}>
                  {Array.from({ length: scrollPageCount }, (_, i) => i + 1).map((n) => {
                    const active = readingMode === 'scroll' ? n === scrollCurrentPage : n === paginatedCurrentPage;
                    return (
                      <button
                        key={n}
                        onClick={() => jumpPdfPage(n)}
                        style={{
                          minHeight: '48px', borderRadius: '10px', cursor: 'pointer', fontSize: '12.5px', fontWeight: 800,
                          border: active ? '1px solid var(--accent)' : '1px solid var(--border-color)',
                          background: active ? 'rgba(var(--accent-rgb), 0.12)' : 'transparent',
                          color: active ? 'var(--accent)' : 'var(--text-secondary)',
                        }}
                      >
                        {n}
                      </button>
                    );
                  })}
                </div>
                {previewOnly && (
                  <p style={{ fontSize: '11.5px', color: 'var(--text-tertiary)', margin: '12px 4px 0' }}>
                    Preview is capped at {scrollPageCount} pages — buy to see the rest.
                  </p>
                )}
              </>
            ) : tocItems && tocItems.length > 0 ? (
              tocItems.map((item, i) => {
                const label = item.label ?? item.title ?? 'Untitled';
                const href = item.href;
                return (
                  <button
                    key={`${label}-${i}`}
                    disabled={!href}
                    onClick={() => {
                      if (!href) return;
                      setTocOpen(false);
                      void epubRefs.current?.rendition.display(href);
                    }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', minHeight: '48px', padding: '11px 12px',
                      borderRadius: '10px', cursor: href ? 'pointer' : 'default', fontSize: '12.5px', fontWeight: 700,
                      color: href ? 'var(--text-primary)' : 'var(--text-faint)', background: 'transparent',
                      border: 'none', borderBottom: '1px solid var(--border-color)',
                    }}
                  >
                    {label}
                    {Array.isArray(item.subitems) && item.subitems.length > 0 && (
                      <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 600, marginTop: '2px' }}>
                        {item.subitems.length} section{item.subitems.length === 1 ? '' : 's'}
                      </span>
                    )}
                  </button>
                );
              })
            ) : (
              <p style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', padding: '12px 6px', lineHeight: 1.6 }}>
                This book doesn&apos;t expose a table of contents. Use the Pages slider or continuous scroll to navigate.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  function FocusPill() {
    if (!focusMode) return null;
    // exitFocus fires on pointerdown AND click: pointerdown responds fastest
    // on touch (no click-resolution wait), while click keeps keyboard and
    // assistive-tech activation working. Both are idempotent — the second
    // identical setFocusMode(false) is a React no-op.
    const exitFocus = () => setFocusMode(false);
    return (
      <button
        onPointerDown={exitFocus}
        onClick={exitFocus}
        aria-label="Exit focus mode"
        style={{
          position: 'fixed', bottom: 'calc(20px + env(safe-area-inset-bottom))', left: '50%',
          transform: 'translateX(-50%)', zIndex: 80, display: 'flex', alignItems: 'center', gap: '7px',
          minHeight: '52px', padding: '0 22px', borderRadius: '999px', cursor: 'pointer',
          touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
          border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(20,20,26,0.72)',
          backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
          color: 'rgba(255,255,255,0.85)', fontSize: '12.5px', fontWeight: 800,
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        }}
      >
        <Eye size={15} /> Show controls
      </button>
    );
  }

  function ThumbButtons() {
    if (!isMobile || focusMode) return null;
    const thumb: React.CSSProperties = {
      position: 'fixed', bottom: 'calc(64px + env(safe-area-inset-bottom))', zIndex: 55,
      width: '52px', height: '52px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.14)',
      background: 'rgba(20,20,26,0.72)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
      boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
    };
    return (
      <>
        <button onClick={goPrev} aria-label="Previous page" style={{ ...thumb, left: '14px' }}>
          <ArrowLeft size={22} />
        </button>
        <button onClick={goNext} aria-label="Next page" style={{ ...thumb, right: '14px' }}>
          <ArrowRight size={22} />
        </button>
      </>
    );
  }

  // ── loading / error screens ───────────────────────────────────────────
  if (loading) {
    return (
      <div ref={rootRef} style={{ minHeight: '100vh', background: THEME_DESK[theme], display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
        <Loader2 size={30} style={{ animation: 'book-reader-spin 0.9s linear infinite', color: 'var(--text-secondary)' }} />
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Opening “{book.title}”…</p>
        <style>{`@keyframes book-reader-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (loadError) {
    return (
      <div ref={rootRef} style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px', padding: '20px', textAlign: 'center' }}>
        <AlertCircle size={38} style={{ color: '#ef4444' }} />
        <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', maxWidth: '420px', lineHeight: 1.6 }}>{loadError}</p>
        {!access && book.pricing_type === 'PAID' && (
          <button onClick={openBuyFlow} disabled={buying} style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '12px 24px',
            borderRadius: '10px', border: 'none', background: 'var(--accent)', color: '#fff',
            fontWeight: 800, fontSize: '14px', cursor: buying ? 'wait' : 'pointer',
          }}>
            <Lock size={15} /> {buying ? 'Opening checkout…' : `Buy ${book.price_paise ? formatPaise(book.price_paise) : ''}`}
          </button>
        )}
        <Link href={`/WebMangal/books/${book.id}`} style={{ color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 700 }}>← Back to book</Link>
      </div>
    );
  }

  // ── EPUB locked preview screen ────────────────────────────────────────
  if (book.file_type === 'epub' && previewOnly) {
    return (
      <div ref={rootRef} style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
        <ReaderTopBar />
        <div style={{ maxWidth: '520px', margin: '48px auto', padding: '0 20px', textAlign: 'center' }}>
          <div style={{
            width: '170px', aspectRatio: '2/3', margin: '0 auto 20px', borderRadius: '10px', overflow: 'hidden',
            border: '1px solid var(--border-color)', background: 'var(--bg-input)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
          }}>
            {book.cover_image_url
              ? <img src={book.cover_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <Lock size={34} style={{ color: 'var(--text-faint)' }} />}
          </div>
          <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px' }}>Preview not available in-app</h2>
          <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: 1.65, margin: '0 0 18px' }}>
            This book is paid, and EPUB previews cannot be partially unlocked. Purchase it once to read the
            full book here — your progress will be saved automatically.
          </p>
          <button onClick={openBuyFlow} disabled={buying} style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '12px 26px',
            borderRadius: '10px', border: 'none', background: 'var(--accent)', color: '#fff',
            fontWeight: 800, fontSize: '14.5px', cursor: buying ? 'wait' : 'pointer',
          }}>
            <Lock size={15} /> {buying ? 'Opening checkout…' : `Buy ${book.price_paise ? formatPaise(book.price_paise) : ''}`}
          </button>
          {buyError && <p style={{ color: '#ef4444', fontSize: '13px', marginTop: '10px' }}>{buyError}</p>}
        </div>
      </div>
    );
  }

  // ── top bar (shared by both engines) ──────────────────────────────────
  function ReaderTopBar() {
    const ThemeIcon = THEME_ICONS[theme];
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px',
        borderBottom: '1px solid var(--border-color)', background: 'var(--nav-bg)',
        backdropFilter: 'blur(10px)', position: 'sticky', top: 0, zIndex: 30,
      }}>
        <Link href={`/WebMangal/books/${book.id}`} style={{ ...iconBtnStyle, textDecoration: 'none' }} title="Close reader">
          <ArrowLeft size={17} />
        </Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {book.title}
          </div>
          {previewOnly && (
            <span style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Free preview · {PREVIEW_PAGES} pages
            </span>
          )}
        </div>
        {/* TOC / page directory */}
        <button style={iconBtnStyle} title="Contents" aria-label="Open contents" onClick={() => { setDockOpen(false); setTocOpen(true); }}>
          <List size={16} />
        </button>
        {/* Reading dock: theme, mode, typography, zoom */}
        <button
          style={{ ...iconBtnStyle, ...(dockOpen ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : null) }}
          title="Reading settings"
          aria-label="Open reading settings"
          aria-expanded={dockOpen}
          onClick={() => { setTocOpen(false); setDockOpen((v) => !v); }}
        >
          <Type size={16} />
        </button>
        {/* Focus mode */}
        {!previewOnly && (
          <button style={iconBtnStyle} title="Focus mode" aria-label="Enter focus mode" onClick={() => { setFocusMode(true); setDockOpen(false); setTocOpen(false); }}>
            <EyeOff size={16} />
          </button>
        )}
        {/* Reading theme cycle — 4 themes since §142 */}
        <button
          style={iconBtnStyle}
          title={`Theme: ${theme}`}
          aria-label={`Reading theme: ${theme}`}
          onClick={() => applyTheme((theme === 'light' ? 'sepia' : theme === 'sepia' ? 'dark' : theme === 'dark' ? 'midnight' : 'light') as ThemeName)}
        >
          <ThemeIcon size={16} />
        </button>
        <button style={iconBtnStyle} title="Fullscreen" onClick={toggleFullscreen}>
          {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
        </button>
      </div>
    );
  }

  // ── EPUB body ─────────────────────────────────────────────────────────
  if (book.file_type === 'epub') {
    return (
      <div ref={rootRef} style={{ minHeight: '100vh', background: THEME_DESK[theme], display: 'flex', flexDirection: 'column' }}>
        <ReaderTopBar />
        {/* Margins control pads the reflowable area (desktop paginated only —
            epub.js scrolled-doc manages its own chrome-less flow on mobile). */}
        <div style={{ flex: 1, minHeight: 0, padding: !isMobile && readingMode === 'paginated' ? `0 ${stagePad}px` : 0 }}>
          <div
            ref={epubContainerRef}
            style={{ width: '100%', height: '100%' }}
          />
        </div>
        {bottomBarVisible && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 14px', borderTop: '1px solid var(--border-color)', background: 'var(--nav-bg)',
          }}>
            <button onClick={goPrev} style={{ ...iconBtnStyle, width: 'auto', minHeight: '44px', padding: '0 14px', gap: '6px', fontSize: '12.5px', fontWeight: 700 }}>
              <ArrowLeft size={15} /> Prev
            </button>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
              {epubPercent !== null ? `${Math.round(epubPercent * 100)}% read` : '—'}
            </span>
            <button onClick={goNext} style={{ ...iconBtnStyle, width: 'auto', minHeight: '44px', padding: '0 14px', gap: '6px', fontSize: '12.5px', fontWeight: 700 }}>
              Next <ArrowRight size={15} />
            </button>
          </div>
        )}
        <ReadingDock />
        <TocDrawer />
        <FocusPill />
        <ThumbButtons />
      </div>
    );
  }

  // ── PDF body ──────────────────────────────────────────────────────────
  const pageImgStyle: React.CSSProperties = {
    maxWidth: '100%', maxHeight: '100%', objectFit: 'contain',
    filter: paperFilter, transition: 'filter 0.25s',
  };

  return (
    <div ref={rootRef} style={{ minHeight: '100vh', background: THEME_DESK[theme], display: 'flex', flexDirection: 'column', transition: 'background 0.25s' }}>
      <style>{`
        @keyframes book-flip-next { from { transform: rotateY(0deg); } to { transform: rotateY(-180deg); } }
        @keyframes book-flip-prev { from { transform: rotateY(0deg); } to { transform: rotateY(180deg); } }
        @keyframes book-slide-next { from { opacity: 0; transform: translateX(36px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes book-slide-prev { from { opacity: 0; transform: translateX(-36px); } to { opacity: 1; transform: translateX(0); } }
      `}</style>

      <ReaderTopBar />

      {/* Stage — paginated: spreads; continuous scroll: vertical page list */}
      {readingMode === 'scroll' ? (
        <div
          ref={scrollContainerRef}
          onScroll={handlePdfScroll}
          onClick={handleStageTap}
          style={{ flex: 1, minHeight: 0, position: 'relative', overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch' }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', padding: `${stagePad}px ${stagePad}px 32px` }}>
            {Array.from({ length: scrollPageCount }, (_, i) => i + 1).map((n) => {
              const img = imgFor(n);
              return (
                <div
                  key={n}
                  data-page={n}
                  id={`br-page-${n}`}
                  style={{
                    width: `${Math.round(zoom * 100)}%`, maxWidth: '860px', minWidth: '240px',
                    minHeight: 'calc(min(100vw, 860px) * 1.2)', background: THEME_PAPER[theme],
                    borderRadius: '4px', boxShadow: '0 2px 12px rgba(0,0,0,0.35)',
                    overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {img
                    // eslint-disable-next-line @next/next/no-img-element -- dynamic client-rendered page bitmap (data: URL from pdf.js/epub.js, variable intrinsic size per page); next/image cannot optimize or take static dimensions for these, same justification as the vendored reader engines ignored in eslint.config.mjs.
                    ? <img src={img} alt={`Page ${n}`} style={{ width: '100%', height: 'auto', display: 'block', filter: paperFilter, transition: 'filter 0.25s' }} draggable={false} />
                    : <Loader2 size={24} style={{ animation: 'book-reader-spin 0.9s linear infinite', color: 'var(--text-secondary)' }} />}
                </div>
              );
            })}
            {previewOnly && (
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '24px 22px', maxWidth: '400px', width: '100%', textAlign: 'center' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(var(--accent-rgb), 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                  <Lock size={22} style={{ color: 'var(--accent)' }} />
                </div>
                <h3 style={{ fontSize: '15.5px', fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 6px' }}>End of the free preview</h3>
                <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 14px' }}>
                  Unlock the full book to keep reading.
                </p>
                <button onClick={() => setLockOpen(true)} disabled={buying} style={{ width: '100%', minHeight: '48px', borderRadius: '10px', border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 800, fontSize: '14px', cursor: 'pointer' }}>
                  {buying ? 'Opening checkout…' : `Buy now · ${book.price_paise ? formatPaise(book.price_paise) : ''}`}
                </button>
                {buyError && <p style={{ color: '#ef4444', fontSize: '12px', marginTop: '8px' }}>{buyError}</p>}
              </div>
            )}
          </div>
        </div>
      ) : (
      <div
        style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isMobile ? `${Math.max(4, Math.round(stagePad / 2))}px` : `${stagePad}px` }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onClick={handleStageTap}
      >
        {isMobile ? (
          /* Mobile: single page */
          <div
            key={`${mobilePage}-${slideDir}`}
            style={{
              height: '100%', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: `book-slide-${slideDir} 0.28s ease-out`,
            }}
          >
            {imgFor(mobilePage)
              ? <img src={imgFor(mobilePage)!} alt={`Page ${mobilePage}`} style={pageImgStyle} draggable={false} />
              : <Loader2 size={26} style={{ animation: 'book-reader-spin 0.9s linear infinite', color: 'var(--text-secondary)' }} />}
          </div>
        ) : (
          /* Desktop: two-page spread with 3D flip */
          <div style={{ perspective: '2600px', height: '100%', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{
              position: 'relative', height: '100%', aspectRatio: '2 / 1.42', maxWidth: '100%',
              display: 'flex', borderRadius: '6px',
              boxShadow: '0 18px 50px rgba(0,0,0,0.35)',
            }}>
              {/* Left sheet */}
              <div style={{ flex: 1, background: THEME_PAPER[theme], transition: 'background 0.25s', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: '6px 0 0 6px', position: 'relative' }}>
                {curLeft !== null && (
                  imgFor(curLeft)
                    ? <img src={imgFor(curLeft)!} alt={`Page ${curLeft}`} style={pageImgStyle} draggable={false} />
                    : <Loader2 size={22} style={{ animation: 'book-reader-spin 0.9s linear infinite', color: 'rgba(0,0,0,0.3)' }} />
                )}
                {/* center spine shadow */}
                <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '26px', background: 'linear-gradient(to left, rgba(0,0,0,0.18), transparent)', pointerEvents: 'none' }} />
              </div>
              {/* Right sheet */}
              <div style={{ flex: 1, background: THEME_PAPER[theme], transition: 'background 0.25s', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: '0 6px 6px 0', position: 'relative' }}>
                {curRight && curRight <= totalPages && (
                  imgFor(curRight)
                    ? <img src={imgFor(curRight)!} alt={`Page ${curRight}`} style={pageImgStyle} draggable={false} />
                    : <Loader2 size={22} style={{ animation: 'book-reader-spin 0.9s linear infinite', color: 'rgba(0,0,0,0.3)' }} />
                )}
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '26px', background: 'linear-gradient(to right, rgba(0,0,0,0.18), transparent)', pointerEvents: 'none' }} />
              </div>

              {/* Flip leaf */}
              {flip && (
                <div
                  onAnimationEnd={handleFlipEnd}
                  style={{
                    position: 'absolute', top: 0, bottom: 0,
                    ...(flip.dir === 'next' ? { left: '50%', width: '50%' } : { left: 0, width: '50%' }),
                    transformStyle: 'preserve-3d',
                    transformOrigin: flip.dir === 'next' ? 'left center' : 'right center',
                    animation: `book-flip-${flip.dir} 0.62s cubic-bezier(0.55, 0.06, 0.35, 1) forwards`,
                    zIndex: 5,
                  }}
                >
                  {/* front face */}
                  <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', background: THEME_PAPER[theme], display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: flip.dir === 'next' ? '0 6px 6px 0' : '6px 0 0 6px' }}>
                    {flip.dir === 'next'
                      ? (imgFor(flipFrontRight) ? <img src={imgFor(flipFrontRight)!} alt="" style={pageImgStyle} draggable={false} /> : null)
                      : (imgFor(flipFrontLeft) ? <img src={imgFor(flipFrontLeft)!} alt="" style={pageImgStyle} draggable={false} /> : null)}
                  </div>
                  {/* back face */}
                  <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', transform: 'rotateY(180deg)', background: THEME_PAPER[theme], display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: flip.dir === 'next' ? '6px 0 0 6px' : '0 6px 6px 0' }}>
                    {flip.dir === 'next'
                      ? (imgFor(flipBackLeft) ? <img src={imgFor(flipBackLeft)!} alt="" style={pageImgStyle} draggable={false} /> : null)
                      : (flipBackRight && imgFor(flipBackRight) ? <img src={imgFor(flipBackRight)!} alt="" style={pageImgStyle} draggable={false} /> : null)}
                  </div>
                  {/* moving shade for depth */}
                  <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: flip.dir === 'next' ? 'linear-gradient(to left, rgba(0,0,0,0.22), transparent 60%)' : 'linear-gradient(to right, rgba(0,0,0,0.22), transparent 60%)' }} />
                </div>
              )}

              {/* Click zones (desktop) */}
              <button aria-label="Previous page" onClick={goPrev} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '22%', cursor: 'w-resize', background: 'transparent', border: 'none', zIndex: 6 }} />
              <button aria-label="Next page" onClick={goNext} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '22%', cursor: 'e-resize', background: 'transparent', border: 'none', zIndex: 6 }} />
            </div>
          </div>
        )}

        {/* Preview lock overlay */}
        {lockOpen && previewOnly && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(10,10,14,0.72)', backdropFilter: 'blur(6px)', padding: '20px',
          }}>
            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px',
              padding: '28px 26px', maxWidth: '400px', width: '100%', textAlign: 'center',
            }}>
              <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: 'rgba(var(--accent-rgb), 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <Lock size={24} style={{ color: 'var(--accent)' }} />
              </div>
              <h3 style={{ fontSize: '17px', fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 8px' }}>
                You have reached the end of the free preview
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 18px' }}>
                Unlock the full book — read it here anytime, on any device, with your progress saved.
              </p>
              <button onClick={openBuyFlow} disabled={buying} style={{
                width: '100%', padding: '13px', borderRadius: '10px', border: 'none',
                background: 'var(--accent)', color: '#fff', fontWeight: 800, fontSize: '14.5px',
                cursor: buying ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              }}>
                {buying ? <Loader2 size={16} className="book-reader-spin-icon" /> : <Lock size={15} />}
                {buying ? 'Opening checkout…' : `Buy now · ${book.price_paise ? formatPaise(book.price_paise) : ''}`}
              </button>
              {buyError && <p style={{ color: '#ef4444', fontSize: '12.5px', marginTop: '10px' }}>{buyError}</p>}
              <button onClick={() => setLockOpen(false)} style={{
                marginTop: '12px', background: 'none', border: 'none', color: 'var(--text-tertiary)',
                fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px',
              }}>
                <X size={13} /> Back to preview
              </button>
            </div>
          </div>
        )}
      </div>
      )}

      {/* Bottom bar — mode-aware, hidden in focus mode */}
      {bottomBarVisible && (
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px', padding: '9px 14px',
        borderTop: '1px solid var(--border-color)', background: 'var(--nav-bg)',
      }}>
        <button onClick={goPrev} style={{ ...iconBtnStyle, width: 'auto', minHeight: '44px', padding: '0 13px', gap: '6px', fontSize: '12.5px', fontWeight: 700 }}>
          <ArrowLeft size={15} /> Prev
        </button>

        {readingMode === 'scroll' ? (
          /* Continuous scroll: slider IS the scroll position. */
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.001}
              value={scrollPct}
              onChange={(e) => {
                const el = scrollContainerRef.current;
                if (!el) return;
                const max = el.scrollHeight - el.clientHeight;
                el.scrollTo({ top: max * Number(e.target.value) });
              }}
              aria-label="Scroll position"
              style={{ flex: 1, minWidth: 0, height: '44px', accentColor: 'var(--accent)', cursor: 'pointer' }}
            />
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', minWidth: '96px', textAlign: 'center', flexShrink: 0 }}>
              {Math.round(scrollPct * 100)}% · p.{scrollCurrentPage}{totalPages ? `/${previewOnly ? scrollPageCount : totalPages}` : ''}
            </span>
          </div>
        ) : isMobile ? (
          /* Page-by-page slider on mobile too — parity with desktop. This used
             to be a static "Page X of Y" label, which gave phones no way to
             jump/skim to a page. maxMobilePage already handles the preview
             cap, and the value is clamped so a stale counter can't scroll the
             range input out of range mid-update. */
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <input
              type="range"
              min={1}
              max={Math.max(1, maxMobilePage || 1)}
              value={Math.min(Math.max(paginatedCurrentPage, 1), Math.max(1, maxMobilePage || 1))}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isFinite(n) || n === mobilePage) return;
                setSlideDir(n >= mobilePage ? 'next' : 'prev');
                setMobilePage(n);
              }}
              aria-label="Go to page"
              style={{ flex: 1, minWidth: 0, height: '44px', accentColor: 'var(--accent)', cursor: 'pointer' }}
            />
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', minWidth: '64px', textAlign: 'center', flexShrink: 0 }}>
              {paginatedCurrentPage}{totalPages ? ` / ${previewOnly ? Math.min(PREVIEW_PAGES, totalPages) : totalPages}` : ''}
            </span>
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input
              type="range"
              min={0}
              max={maxSpread}
              value={shownSpread}
              onChange={(e) => { if (!flippingRef.current) setSpread(Number(e.target.value)); }}
              style={{ flex: 1, height: '44px', accentColor: 'var(--accent)', cursor: 'pointer' }}
            />
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', minWidth: '86px', textAlign: 'center' }}>
              {curLeft ?? 1}{curRight > 1 && curRight <= totalPages ? `–${curRight}` : ''} / {totalPages || '—'}
            </span>
          </div>
        )}

        <button onClick={goNext} style={{ ...iconBtnStyle, width: 'auto', minHeight: '44px', padding: '0 13px', gap: '6px', fontSize: '12.5px', fontWeight: 700 }}>
          Next <ArrowRight size={15} />
        </button>
      </div>
      )}

      {/* §141 — direct-UPI purchase modal + its "pending confirmation"
          banner. purchasePending stays true for the rest of this reader
          session once the payer self-reports "I've paid" — there's no
          instant unlock for a raw UPI transfer, so this is deliberately
          not the same as `access` flipping true. */}
      {purchasePending && !access && (
        <div style={{
          padding: '10px 14px', textAlign: 'center', fontSize: '12.5px', fontWeight: 700,
          color: '#d97706', background: 'rgba(217,119,6,0.1)', borderTop: '1px solid rgba(217,119,6,0.3)',
        }}>
          Payment reported — we&apos;ll confirm and unlock this book shortly.
        </div>
      )}

      <ReadingDock />
      <TocDrawer />
      <FocusPill />
      <ThumbButtons />

      {showBuyModal && book.price_paise && (
        <BookPurchaseModal
          bookId={book.id}
          bookTitle={book.title}
          pricePaise={book.price_paise}
          onClose={() => setShowBuyModal(false)}
          onPending={() => { setPurchasePending(true); setShowBuyModal(false); }}
          onRazorpayBuy={() => { setShowBuyModal(false); handleBuy(); }}
          razorpayBuying={buying}
        />
      )}
    </div>
  );
}