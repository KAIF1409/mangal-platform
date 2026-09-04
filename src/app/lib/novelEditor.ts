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

    // Scene break: *** alone on a block. Also tolerates stray spaces
    // between the asterisks (e.g. "* * *"), which previously fell through
    // to the paragraph branch and got mangled by parseInlineRuns.
    if (/^\*{3,}$/.test(trimmed.replace(/\s+/g, ''))) {
      segments.push({ type: 'scene_break' });
      continue;
    }

    // Heading: line starting with one or more "#" markers, possibly
    // repeated with spaces between them (e.g. "# # # text").
    // FIXED: trimmed.slice(2) only ever stripped a single leading "# ",
    // so input like "# # # some text" (repeated/duplicated hashes — e.g.
    // from a paste or accidental double-click on the H toolbar button)
    // left the extra "# #" sitting as literal text inside the heading,
    // which is exactly the "# # # *****..." artifact seen in the reader.
    // The loop below strips EVERY leading "#" token (each optionally
    // followed by spaces) one at a time, however many there are, instead
    // of matching only the first contiguous run of "#" characters.
    if (/^#(\s|$)/.test(trimmed)) {
      let headingText = trimmed;
      while (/^#\s*/.test(headingText)) {
        headingText = headingText.replace(/^#\s*/, '');
      }
      // Headings render as plain text, so any stray *, **, *** markers that
      // ended up on the same line (e.g. pasted-in malformed content) are
      // stripped rather than shown as raw asterisks.
      headingText = headingText.replace(/\*+/g, '').trim();
      if (headingText) {
        segments.push({ type: 'heading', text: headingText });
      }
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

/**
 * Renders parsed chapter content to a small, safe HTML string for the
 * Upload Writer's live preview pane. Built directly on top of
 * parseChapterContent() above, so the preview a creator sees while
 * writing is guaranteed to match what readers actually see — there is
 * no separate/duplicate formatting logic to drift out of sync.
 *
 * Text is escaped BEFORE any HTML tags are added, so user-typed content
 * can never inject markup — this only ever emits the few fixed tags
 * below (p, strong, em, div).
 */
export function renderNovelPreviewHtml(raw: string): string {
  const escapeHtml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const segments = parseChapterContent(raw);
  const html: string[] = [];

  for (const segment of segments) {
    if (segment.type === 'scene_break') {
      html.push('<div style="text-align:center;color:#6b7280;margin:20px 0;letter-spacing:0.5em;font-size:13px;">• • •</div>');
      continue;
    }

    if (segment.type === 'heading') {
      html.push(`<strong style="font-size:18px;display:block;margin:16px 0 8px;">${escapeHtml(segment.text)}</strong>`);
      continue;
    }

    // paragraph
    const inner = segment.runs
      .map((run) => {
        const safe = escapeHtml(run.text);
        if (run.bold && run.italic) return `<strong><em>${safe}</em></strong>`;
        if (run.bold) return `<strong>${safe}</strong>`;
        if (run.italic) return `<em>${safe}</em>`;
        return safe;
      })
      .join('');
    html.push(`<p style="margin:0 0 16px 0;">${inner || '&nbsp;'}</p>`);
  }

  return html.join('');
}

/**
 * Novel-reader scroll progress, as a 0–100 percent.
 *
 * BUG FIX: the reader page used to compute this inline and bail out
 * entirely (return, writing NOTHING) whenever the chapter's content fit
 * the viewport with nothing to scroll (scrollHeight - clientHeight <= 0).
 * Since the scroll listener is the ONLY place reading_progress ever got
 * saved for novels, a short chapter — fully visible, fully read, zero
 * scrolling needed — never got recorded at all: "Continue Reading" would
 * silently strand a reader on whatever chapter came before it.
 *
 * Fixed behavior: a chapter with nothing to scroll is, by definition,
 * already 100% visible — treat it as fully read immediately instead of
 * silently skipping it. Extracted as a pure function (rather than left
 * inline in the page component) specifically so this exact edge case has
 * a direct, isolated regression test.
 */
export function computeNovelScrollProgress(el: {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}): number {
  const scrollable = el.scrollHeight - el.clientHeight;
  if (scrollable <= 0) return 100;
  return Math.round((el.scrollTop / scrollable) * 100);
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