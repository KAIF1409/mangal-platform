'use client';

// Books module — the immersion reader. One component, two engines:
//
//   PDF  → pdf.js renders pages to canvases (cached as dataURLs); desktop
//          gets a two-page spread with a CSS-3D page-turn animation, mobile
//          gets a clean single page with slide transitions + swipe/tap zones.
//   EPUB → epub.js paginated rendition into a container div; spreads come
//          from epub.js itself (`spread: 'auto'`), font-size is real
//          reflowable text sizing.
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
  ArrowLeft, ArrowRight, Maximize, Minimize, Moon, Sun, Sunset,
  Type, ZoomIn, ZoomOut, Lock, Loader2, X, AlertCircle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { openRazorpayCheckout } from '../../lib/payments/razorpayClient';

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

type ThemeName = 'light' | 'sepia' | 'dark';

const PREVIEW_PAGES = 5;

const THEME_DESK: Record<ThemeName, string> = {
  light: '#e8e4da',
  sepia: '#cbb894',
  dark: '#101014',
};

const THEME_PAPER: Record<ThemeName, string> = {
  light: '#fdfcf9',
  sepia: '#f4ecd8',
  dark: '#191921',
};

const FONT_SIZES = ['90%', '100%', '112%', '125%', '140%'];
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
  destroy(): void;
}
interface EpubBook {
  ready: Promise<unknown>;
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
  const [access, setAccess] = useState(hasAccess);
  const rootRef = useRef<HTMLDivElement>(null);
  const flippingRef = useRef(false);

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
  const [fontIdx, setFontIdx] = useState(1);
  const [epubPercent, setEpubPercent] = useState<number | null>(null);
  const epubRefs = useRef<{ book: EpubBook; rendition: EpubRendition } | null>(null);

  const previewOnly = !access && book.pricing_type === 'PAID';

  // ── persisted prefs ───────────────────────────────────────────────────
  useEffect(() => {
    try {
      const t = localStorage.getItem('book_reader_theme');
      if (t === 'light' || t === 'sepia' || t === 'dark') setTheme(t);
    } catch { /* private mode */ }
  }, []);

  function applyTheme(t: ThemeName) {
    setTheme(t);
    try { localStorage.setItem('book_reader_theme', t); } catch { /* ignore */ }
  }

  // ── responsive mode ───────────────────────────────────────────────────
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // ── fullscreen ────────────────────────────────────────────────────────
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await rootRef.current?.requestFullscreen();
    } catch { /* denied — ignore */ }
  }

  // ── file fetch (auth-aware) ───────────────────────────────────────────
  const fetchFileBuffer = useCallback(async (): Promise<{ buf: ArrayBuffer; truncated: boolean }> => {
    const headers: Record<string, string> = {};
    if (userId) {
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;
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

        // Resume: map saved page → spread (spread 0 = page 1 alone).
        const saved = initialProgress?.lastPage ?? 1;
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

  // Pre-render the pages around the current position.
  useEffect(() => {
    if (!pdfDoc) return;
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
  }, [pdfDoc, spread, mobilePage, isMobile, zoomIdx, getPageImage]);

  // Evict the whole cache when zoom changes so stale scales disappear.
  useEffect(() => {
    pageCacheRef.current.clear();
  }, [zoomIdx]);

  // ── EPUB engine ───────────────────────────────────────────────────────
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
          flow: 'paginated',
          spread: 'auto',
          allowScriptedContent: false,
        });

        epubRefs.current = { book: epubBook, rendition };

        const themes = rendition.themes;
        themes.register('light', { body: { background: THEME_PAPER.light, color: '#1a1a1a' } });
        themes.register('sepia', { body: { background: THEME_PAPER.sepia, color: '#3b2f1e' } });
        themes.register('dark', { body: { background: THEME_PAPER.dark, color: '#d8d4cc' } });
        themes.select(theme);
        themes.fontSize(FONT_SIZES[fontIdx]);

        await rendition.display(initialProgress?.lastLocation || undefined);
        if (cancelled) { rendition.destroy(); return; }

        rendition.on('relocated', (loc: EpubLocation) => {
          const pct = loc.start?.percentage ?? null;
          setEpubPercent(pct);
          if (userId && loc.start?.cfi) {
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
  }, [book.id, book.file_type]);

  // Live-apply theme/font changes to a mounted EPUB rendition.
  useEffect(() => {
    const themes = epubRefs.current?.rendition.themes;
    if (themes) {
      themes.select(theme);
      themes.fontSize(FONT_SIZES[fontIdx]);
    }
  }, [theme, fontIdx, epubReady]);

  // ── progress persistence (PDF) ────────────────────────────────────────
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function saveProgress(payload: { lastPage?: number; lastLocation?: string; percent?: number | null }) {
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

  useEffect(() => {
    if (book.file_type !== 'pdf' || !totalPages) return;
    const page = isMobile ? mobilePage : (spread === 0 ? 1 : 2 * spread);
    saveProgress({ lastPage: page });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spread, mobilePage, isMobile, totalPages]);

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
    if (isMobile) {
      if (mobilePage >= maxMobilePage) { if (previewOnly) setLockOpen(true); return; }
      setSlideDir('next');
      setMobilePage((p) => Math.min(p + 1, maxMobilePage));
      return;
    }
    if (spread >= maxSpread) { if (previewOnly) setLockOpen(true); return; }
    flippingRef.current = true;
    setFlip({ dir: 'next' });
  }, [book.file_type, isMobile, mobilePage, maxMobilePage, spread, maxSpread, previewOnly]);

  const goPrev = useCallback(() => {
    if (flippingRef.current) return;
    if (book.file_type === 'epub') {
      epubRefs.current?.rendition.prev();
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
  }, [book.file_type, isMobile, mobilePage, spread]);

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
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goPrev]);

  // Touch swipe (single-page mode).
  const touchStartX = useRef<number | null>(null);
  function onTouchStart(e: React.TouchEvent) { touchStartX.current = e.touches[0]?.clientX ?? null; }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 40) return;
    if (dx < 0) goNext(); else goPrev();
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

  // ── derived page images ───────────────────────────────────────────────
  const cache = pageCacheRef.current;
  const zoom = ZOOM_STEPS[zoomIdx];

  function imgFor(n: number): string | null {
    if (!n || n < 1) return null;
    return cache.get(`${n}@${zoom}`) ?? null;
  }

  // Spread geometry: spread 0 = [1], spread k≥1 = [2k, 2k+1].
  const shownSpread = flip?.dir === 'next' ? spread + 1 : flip?.dir === 'prev' ? spread - 1 : spread;
  const curLeft = shownSpread === 0 ? 1 : 2 * shownSpread;
  const curRight = shownSpread === 0 ? null : 2 * shownSpread + 1;
  const flipFrontRight = spread === 0 ? 1 : 2 * spread + 1;       // next-flip front face
  const flipBackLeft = 2 * (spread + 1);                          // next-flip back face
  const flipFrontLeft = spread === 0 ? 1 : 2 * spread;            // prev-flip front face
  const flipBackRight = spread === 0 ? null : 2 * spread - 1;     // prev-flip back face

  const paperFilter =
    theme === 'sepia' ? 'sepia(0.42) saturate(0.88)' :
    theme === 'dark' ? 'invert(0.9) hue-rotate(185deg) brightness(0.94)' :
    undefined;

  const iconBtnStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: '36px', height: '36px', borderRadius: '9px', cursor: 'pointer',
    border: '1px solid var(--border-color)', background: 'var(--bg-card)',
    color: 'var(--text-secondary)', flexShrink: 0,
  };

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
          <button onClick={handleBuy} disabled={buying} style={{
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
          <button onClick={handleBuy} disabled={buying} style={{
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
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px',
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
        {/* Font size — EPUB only */}
        {book.file_type === 'epub' && !previewOnly && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button style={iconBtnStyle} title="Smaller text" onClick={() => setFontIdx((i) => Math.max(0, i - 1))}><Type size={14} /></button>
            <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', minWidth: '34px', textAlign: 'center' }}>{FONT_SIZES[fontIdx]}</span>
            <button style={iconBtnStyle} title="Larger text" onClick={() => setFontIdx((i) => Math.min(FONT_SIZES.length - 1, i + 1))}><Type size={17} /></button>
          </div>
        )}
        {/* Zoom — PDF only */}
        {book.file_type === 'pdf' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button style={iconBtnStyle} title="Zoom out" onClick={() => setZoomIdx((i) => Math.max(0, i - 1))}><ZoomOut size={15} /></button>
            <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', minWidth: '38px', textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
            <button style={iconBtnStyle} title="Zoom in" onClick={() => setZoomIdx((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))}><ZoomIn size={15} /></button>
          </div>
        )}
        {/* Reading theme cycle */}
        <button
          style={iconBtnStyle}
          title={`Theme: ${theme}`}
          onClick={() => applyTheme(theme === 'light' ? 'sepia' : theme === 'sepia' ? 'dark' : 'light')}
        >
          {theme === 'light' ? <Sun size={16} /> : theme === 'sepia' ? <Sunset size={16} /> : <Moon size={16} />}
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
        <div
          ref={epubContainerRef}
          style={{ flex: 1, minHeight: 0 }}
        />
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 14px', borderTop: '1px solid var(--border-color)', background: 'var(--nav-bg)',
        }}>
          <button onClick={goPrev} style={{ ...iconBtnStyle, width: 'auto', padding: '0 14px', gap: '6px', fontSize: '12.5px', fontWeight: 700 }}>
            <ArrowLeft size={15} /> Prev
          </button>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
            {epubPercent !== null ? `${Math.round(epubPercent * 100)}% read` : '—'}
          </span>
          <button onClick={goNext} style={{ ...iconBtnStyle, width: 'auto', padding: '0 14px', gap: '6px', fontSize: '12.5px', fontWeight: 700 }}>
            Next <ArrowRight size={15} />
          </button>
        </div>
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

      {/* Stage */}
      <div
        style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isMobile ? '0' : '18px' }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
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
                {shownSpread > 0 && (
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
              <button onClick={handleBuy} disabled={buying} style={{
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

      {/* Bottom bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px', padding: '9px 14px',
        borderTop: '1px solid var(--border-color)', background: 'var(--nav-bg)',
      }}>
        <button onClick={goPrev} style={{ ...iconBtnStyle, width: 'auto', padding: '0 13px', gap: '6px', fontSize: '12.5px', fontWeight: 700 }}>
          <ArrowLeft size={15} /> Prev
        </button>

        {isMobile ? (
          <div style={{ flex: 1, textAlign: 'center', fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>
            Page {mobilePage}{totalPages ? ` of ${previewOnly ? Math.min(PREVIEW_PAGES, totalPages) : totalPages}` : ''}
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input
              type="range"
              min={0}
              max={maxSpread}
              value={shownSpread}
              onChange={(e) => { if (!flippingRef.current) setSpread(Number(e.target.value)); }}
              style={{ flex: 1, accentColor: 'var(--accent)', cursor: 'pointer' }}
            />
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', minWidth: '86px', textAlign: 'center' }}>
              {curLeft}{curRight && curRight <= totalPages ? `–${curRight}` : ''} / {totalPages || '—'}
            </span>
          </div>
        )}

        <button onClick={goNext} style={{ ...iconBtnStyle, width: 'auto', padding: '0 13px', gap: '6px', fontSize: '12.5px', fontWeight: 700 }}>
          Next <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}