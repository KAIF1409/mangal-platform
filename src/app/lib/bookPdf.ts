// Books module — "Write" mode PDF generator.
//
// The Books table/reader/purchase-gating/preview machinery all assume a real
// PDF or EPUB file (see supabase/migrations/20260822000000_books_module.sql
// and /api/upload-book-file's magic-byte sniff). Rather than add a third
// "text" content type and thread it through the reader, gated file route,
// preview-truncation logic, etc, a "Write" mode simply renders the author's
// typed manuscript into a real, valid PDF client-side and uploads it through
// the exact same /api/upload-book-file pipeline an "Upload a file" author
// already uses — everything downstream (BookReader, purchases, previews)
// works completely unchanged.
//
// Formatting reuses lib/novelEditor.ts's parseChapterContent() — the same
// tiny **bold** / *italic* / "# heading" / "***" scene-break syntax the
// novel chapter writer already uses — so a creator who's used one editor
// already knows the other, and both surfaces share one parser.
//
// jsPDF is NOT bundled — not into the client chunks and critically not into
// the OpenNext server bundle. This lib is imported by 'use client' pages,
// which are still server-compiled for SSR, so even a dynamic
// `import('jspdf')` here got traced into the server module graph and either
// inlined into or externalized-onto the Cloudflare Worker (§141: 874 KB of
// dead weight + a Windows build crash on Next 16's hashed standalone
// junctions). Same reasoning BookReader.tsx documents for pdf.js/epub.js:
// the library lives as a static asset under /vendor/
// (public/vendor/README.md) and is loaded at runtime by injecting a script
// tag — loadJspdf() below. The npm package stays a dependency for TYPES
// ONLY (type-only imports are erased at compile time and never traced) —
// exactly the gsap convention recorded in public/vendor/README.md.

import type { jsPDF } from 'jspdf';

import { parseChapterContent } from './novelEditor';

// ── Runtime loader for the vendored UMD build ────────────────────────────
// The UMD build exposes `window.jspdf = { jsPDF }` (standard jsPDF usage).
// Singleton promise: one script tag no matter how many PDFs get generated.

interface JspdfGlobal {
  jsPDF: typeof jsPDF;
}

declare global {
  interface Window {
    jspdf?: JspdfGlobal;
  }
}

let jspdfPromise: Promise<JspdfGlobal> | null = null;

function loadJspdf(): Promise<JspdfGlobal> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('PDF generation is browser-only.'));
  }
  if (window.jspdf?.jsPDF) return Promise.resolve(window.jspdf);
  if (!jspdfPromise) {
    jspdfPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/vendor/jspdf.umd.min.js';
      script.async = true;
      script.onload = () => {
        if (window.jspdf?.jsPDF) {
          resolve(window.jspdf);
        } else {
          reject(new Error('The PDF engine loaded but did not initialise.'));
        }
      };
      script.onerror = () => {
        jspdfPromise = null; // allow a retry on the next attempt
        reject(new Error('Could not load the PDF engine. Check your connection and try again.'));
      };
      document.head.appendChild(script);
    });
  }
  return jspdfPromise;
}

const PAGE_MARGIN = 56; // pt
const BODY_FONT_SIZE = 12;
const BODY_LINE_HEIGHT = 18;
const HEADING_FONT_SIZE = 16;
const HEADING_LINE_HEIGHT = 22;

type FontStyle = 'normal' | 'bold' | 'italic' | 'bolditalic';

/**
 * Renders a written manuscript (MANGAL's lightweight bold / italic /
 * heading / scene-break syntax — see lib/novelEditor.ts) into a real PDF
 * file, ready to be uploaded through /api/upload-book-file exactly like a
 * hand-picked PDF would be.
 */
export async function generateBookPdfBlob(
  title: string,
  authorName: string | null,
  content: string
): Promise<Blob> {
  const { jsPDF } = await loadJspdf();
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = pageWidth - PAGE_MARGIN * 2;

  // ── Title page ──────────────────────────────────────────────────────
  doc.setFont('times', 'bold');
  doc.setFontSize(28);
  const titleLines: string[] = doc.splitTextToSize(title || 'Untitled', maxWidth);
  const titleBlockHeight = titleLines.length * 34;
  let ty = pageHeight / 2 - titleBlockHeight / 2;
  for (const line of titleLines) {
    doc.text(line, pageWidth / 2, ty, { align: 'center' });
    ty += 34;
  }
  if (authorName) {
    doc.setFont('times', 'italic');
    doc.setFontSize(14);
    doc.text(`by ${authorName}`, pageWidth / 2, ty + 22, { align: 'center' });
  }

  doc.addPage();
  let y = PAGE_MARGIN;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - PAGE_MARGIN) {
      doc.addPage();
      y = PAGE_MARGIN;
    }
  };

  const spaceWidth = (() => {
    doc.setFont('times', 'normal');
    doc.setFontSize(BODY_FONT_SIZE);
    return doc.getTextWidth(' ');
  })();

  const styleFor = (bold?: boolean, italic?: boolean): FontStyle =>
    bold && italic ? 'bolditalic' : bold ? 'bold' : italic ? 'italic' : 'normal';

  const segments = parseChapterContent(content);
  doc.setFont('times', 'normal');
  doc.setFontSize(BODY_FONT_SIZE);

  for (const segment of segments) {
    if (segment.type === 'scene_break') {
      ensureSpace(BODY_LINE_HEIGHT + 10);
      doc.setFont('times', 'normal');
      doc.setFontSize(BODY_FONT_SIZE);
      doc.text('•   •   •', pageWidth / 2, y, { align: 'center' });
      y += BODY_LINE_HEIGHT + 10;
      continue;
    }

    if (segment.type === 'heading') {
      doc.setFont('times', 'bold');
      doc.setFontSize(HEADING_FONT_SIZE);
      const lines: string[] = doc.splitTextToSize(segment.text, maxWidth);
      for (const line of lines) {
        ensureSpace(HEADING_LINE_HEIGHT);
        doc.text(line, PAGE_MARGIN, y);
        y += HEADING_LINE_HEIGHT;
      }
      y += 8;
      doc.setFont('times', 'normal');
      doc.setFontSize(BODY_FONT_SIZE);
      continue;
    }

    // Paragraph — word-wrap manually so bold/italic runs can mix on one
    // line (jsPDF's own splitTextToSize only handles a single font style).
    type Word = { text: string; bold?: boolean; italic?: boolean };
    const words: Word[] = [];
    for (const run of segment.runs) {
      for (const token of run.text.split(/\s+/).filter((t) => t.length > 0)) {
        words.push({ text: token, bold: run.bold, italic: run.italic });
      }
    }

    let lineWords: Word[] = [];
    let lineWidth = 0;

    const flushLine = () => {
      if (lineWords.length === 0) return;
      ensureSpace(BODY_LINE_HEIGHT);
      let x = PAGE_MARGIN;
      lineWords.forEach((w, idx) => {
        doc.setFont('times', styleFor(w.bold, w.italic));
        if (idx > 0) x += spaceWidth;
        doc.text(w.text, x, y);
        x += doc.getTextWidth(w.text);
      });
      y += BODY_LINE_HEIGHT;
      lineWords = [];
      lineWidth = 0;
    };

    for (const w of words) {
      doc.setFont('times', styleFor(w.bold, w.italic));
      const wWidth = doc.getTextWidth(w.text);
      const extra = lineWords.length > 0 ? spaceWidth : 0;
      if (lineWidth + extra + wWidth > maxWidth && lineWords.length > 0) {
        flushLine();
      }
      if (lineWords.length > 0) lineWidth += spaceWidth;
      lineWords.push(w);
      lineWidth += wWidth;
    }
    flushLine();
    y += 10; // paragraph spacing
  }

  return doc.output('blob');
}

/** Wraps the generated PDF blob as a File, ready for the same upload path
 * used by a hand-picked file (`fd.append('file', file)`). */
export function bookPdfBlobToFile(blob: Blob, title: string): File {
  // BUG FIX: this used to strip everything outside [a-z0-9] before
  // falling back to the generic "book" name. That's fine for Latin
  // titles but WebMangal ships full Hindi localization (see lib/i18n.ts)
  // and Write-mode authors very plausibly type Devanagari titles — those
  // collapsed entirely to "book.pdf", and a MIXED title like
  // "श्री राम कथा - भाग 1" collapsed to just "1.pdf" (misleadingly
  // looking like a chapter/page number instead of the actual title).
  // Fix: keep any Unicode letter/number/combining-mark (\p{L}/\p{N}/\p{M},
  // via the /u flag) — \p{M} matters because Devanagari vowel signs
  // (matras, e.g. "ी" in "की") are combining marks, not letters on their
  // own, so without it they'd still get stripped one-by-one leaving a
  // mangled "म-गल-क-कह-न" instead of "मंगल-की-कहानी".
  const safeName =
    (title || 'book')
      .trim()
      .replace(/[^\p{L}\p{N}\p{M}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'book';
  return new File([blob], `${safeName}.pdf`, { type: 'application/pdf' });
}
