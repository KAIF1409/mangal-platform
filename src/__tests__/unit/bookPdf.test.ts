import { describe, expect, it } from 'vitest';
import { bookPdfBlobToFile } from '@/app/lib/bookPdf';

const blob = new Blob(['%PDF-fake'], { type: 'application/pdf' });

describe('bookPdfBlobToFile — filename sanitizer', () => {
  it('slugifies a normal Latin title', () => {
    const file = bookPdfBlobToFile(blob, 'Ramayan Retold');
    expect(file.name).toBe('ramayan-retold.pdf');
  });

  // Regression: this used to strip everything outside [a-z0-9], so a pure
  // Devanagari title collapsed entirely to the generic "book.pdf" — on a
  // platform that ships full Hindi localization (lib/i18n.ts), Write-mode
  // authors very plausibly type Hindi titles.
  it('preserves a pure Devanagari (Hindi) title instead of collapsing to "book.pdf"', () => {
    const file = bookPdfBlobToFile(blob, 'मंगल की कहानी');
    expect(file.name).not.toBe('book.pdf');
    expect(file.name).toBe('मंगल-की-कहानी.pdf');
  });

  // Regression: a MIXED title used to collapse to just its stray ASCII
  // fragment — "श्री राम कथा - भाग 1" became "1.pdf", which looks like a
  // chapter/page number rather than the actual (Hindi) title.
  it('keeps the Hindi portion of a mixed Hindi/English/number title, not just the digit', () => {
    const file = bookPdfBlobToFile(blob, 'श्री राम कथा - भाग 1');
    expect(file.name).not.toBe('1.pdf');
    expect(file.name).toBe('श्री-राम-कथा-भाग-1.pdf');
  });

  it('preserves Devanagari vowel signs (matras) rather than stripping them into fragments', () => {
    // "की" = क + ी (a combining vowel sign). A naive \p{L}-only filter
    // strips combining marks, turning this into "क" alone.
    const file = bookPdfBlobToFile(blob, 'की');
    expect(file.name).toBe('की.pdf');
  });

  it('falls back to "book.pdf" for an empty title', () => {
    expect(bookPdfBlobToFile(blob, '').name).toBe('book.pdf');
  });

  it('falls back to "book.pdf" for a title with no letters/numbers at all', () => {
    expect(bookPdfBlobToFile(blob, '!!! ---').name).toBe('book.pdf');
  });

  it('collapses internal whitespace/punctuation runs to a single hyphen', () => {
    const file = bookPdfBlobToFile(blob, '  Multiple   Spaces -- and -- dashes  ');
    expect(file.name).toBe('multiple-spaces-and-dashes.pdf');
  });

  it('always produces a .pdf file with the correct mime type', () => {
    const file = bookPdfBlobToFile(blob, 'Anything');
    expect(file.name.endsWith('.pdf')).toBe(true);
    expect(file.type).toBe('application/pdf');
  });
});
