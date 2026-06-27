// MANGAL Novel Writer — helper functions
// Built from scratch for MANGAL's novel upload flow. No external rich-text
// library — plain textarea + a tiny custom formatting layer, kept deliberately
// minimal (Step 21 decision: novels are read-only-for-readers, Webnovel/Qidian
// style, not a Wattpad-style heavy editor).

// Average adult silent-reading speed used across most reading-time estimators
const WORDS_PER_MINUTE = 200;

/**
 * Counts words in raw chapter text. Splits on whitespace, ignores empty
 * tokens caused by multiple spaces/newlines.
 */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * Estimated reading time, formatted for display under the editor and
 * later on the series chapter list (replaces page-count for novels).
 */
export function estimateReadTime(wordCount: number): string {
  if (wordCount === 0) return '0 min read';
  const minutes = Math.max(1, Math.round(wordCount / WORDS_PER_MINUTE));
  return `${minutes} min read`;
}

/**
 * MANGAL's own lightweight formatting syntax — intentionally tiny, only
 * four rules, so it never turns into a full markdown/WYSIWYG dependency:
 *   **text**  -> bold
 *   *text*    -> italic
 *   # text    -> a soft in-chapter heading (own line only)
 *   ***       -> scene break (renders as • • • in the reader)
 * Returns an array of typed segments the reader/preview can render with
 * plain React elements — no dangerouslySetInnerHTML, no HTML injection.
 */
export type FormattedSegment =
  | { type: 'heading'; text: string }
  | { type: 'scene_break' }
  | { type: 'paragraph'; runs: { text: string; bold?: boolean; italic?: boolean }[] };

/**
 * Parse a single plain-text run (no bold/italic markers) into inline runs.
 * Handles bold (**), italic (*), and bold+italic (***) in one pass using
 * a character-level state machine so markers never confuse each other.
 */
function parseInlineRuns(text: string): { text: string; bold?: boolean; italic?: boolean }[] {
  const runs: { text: string; bold?: boolean; italic?: boolean }[] = [];
  let i = 0;
  let current = '';
  let boldOpen = false;
  let italicOpen = false;

  const flush = (bold: boolean, italic: boolean) => {
    if (current) {
      const run: { text: string; bold?: boolean; italic?: boolean } = { text: current };
      if (bold) run.bold = true;
      if (italic) run.italic = true;
      runs.push(run);
      current = '';
    }
  };

  while (i < text.length) {
    // Peek ahead for ** (bold) or * (italic)
    if (text[i] === '*') {
      const isDouble = text[i + 1] === '*';
      if (isDouble) {
        // ** — toggle bold
        flush(boldOpen, italicOpen);
        boldOpen = !boldOpen;
        i += 2;
      } else {
        // single * — toggle italic
        flush(boldOpen, italicOpen);
        italicOpen = !italicOpen;
        i += 1;
      }
    } else {
      current += text[i];
      i += 1;
    }
  }

  // Flush any remaining text (handles unclosed markers gracefully)
  flush(boldOpen, italicOpen);
  return runs.filter(r => r.text.length > 0);
}

export function parseChapterContent(raw: string): FormattedSegment[] {
  // Split on blank lines (two or more newlines) to group paragraphs
  const blocks = raw.split(/\n{2,}/);
  const segments: FormattedSegment[] = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    // Scene break: *** alone on a block
    if (trimmed === '***') {
      segments.push({ type: 'scene_break' });
      continue;
    }

    // Heading: line starting with # (only first line of block considered)
    if (trimmed.startsWith('# ')) {
      segments.push({ type: 'heading', text: trimmed.slice(2).trim() });
      continue;
    }

    // Paragraph: parse inline bold/italic formatting
    // Each block (separated by blank lines) becomes one paragraph.
    // Hard newlines within a block become a <br> by rendering \n in the text.
    const runs = parseInlineRuns(trimmed.replace(/\n/g, ' '));
    segments.push({ type: 'paragraph', runs });
  }

  return segments;
}

// ---- Local draft autosave (per chapter slot) ----
// Keeps an in-progress chapter safe from accidental tab close / refresh.
// Keyed by seriesId + chapterNumber so multiple in-progress chapters don't
// collide. Cleared automatically once a chapter publishes successfully.
const draftKey = (seriesId: string, chapterNumber: number) =>
  `mangal_novel_draft_${seriesId}_${chapterNumber}`;

export function saveDraft(seriesId: string, chapterNumber: number, content: string) {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(draftKey(seriesId, chapterNumber), content);
  } catch {
    // localStorage can throw in private-browsing/storage-full edge cases —
    // draft autosave is a convenience, never block writing on it failing
  }
}

export function loadDraft(seriesId: string, chapterNumber: number): string | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(draftKey(seriesId, chapterNumber));
  } catch {
    return null;
  }
}

export function clearDraft(seriesId: string, chapterNumber: number) {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(draftKey(seriesId, chapterNumber));
  } catch {
    // no-op
  }
}