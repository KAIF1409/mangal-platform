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
// jsPDF is dynamically imported (never a static top-level import) so it
// never gets pulled into the server-rendered bundle for this ('use client')
// page — same reasoning BookReader.tsx documents for why pdf.js/epub.js are
// loaded as runtime script tags instead of static imports: a static import
// of a browser-only library still gets bundled into the OpenNext Cloudflare
// Worker during SSR unless it's excluded from the module graph some way.
// A dynamic import() inside an async function that only ever runs from a
// click handler is naturally code-split into its own chunk and is never
// evaluated during render, so it never enters the server bundle at all.

import { parseChapterContent } from './novelEditor';

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
  const { jsPDF } = await import('jspdf');
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
  const safeName = (title || 'book').trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'book';
  return new File([blob], `${safeName}.pdf`, { type: 'application/pdf' });
}
