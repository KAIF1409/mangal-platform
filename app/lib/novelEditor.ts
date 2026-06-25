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
 * three rules, so it never turns into a full markdown/WYSIWYG dependency:
 *   **text**  -> bold
 *   *text*    -> italic
 *   # text    -> a soft in-chapter heading (own line only)
 * Returns an array of typed segments the reader/preview can render with
 * plain React elements — no dangerouslySetInnerHTML, no HTML injection.
 */
export type FormattedSegment =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; runs: { text: string; bold?: boolean; italic?: boolean }[] };

export function parseChapterContent(raw: string): FormattedSegment[] {
  const lines = raw.split('\n');
  const segments: FormattedSegment[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('# ')) {
      segments.push({ type: 'heading', text: trimmed.slice(2).trim() });
      continue;
    }

    const runs: { text: string; bold?: boolean; italic?: boolean }[] = [];
    // Split on **bold** first, then *italic* within remaining plain runs
    const boldSplit = line.split(/(\*\*[^*]+\*\*)/g);
    for (const chunk of boldSplit) {
      if (chunk.startsWith('**') && chunk.endsWith('**')) {
        runs.push({ text: chunk.slice(2, -2), bold: true });
        continue;
      }
      const italicSplit = chunk.split(/(\*[^*]+\*)/g);
      for (const sub of italicSplit) {
        if (!sub) continue;
        if (sub.startsWith('*') && sub.endsWith('*')) {
          runs.push({ text: sub.slice(1, -1), italic: true });
        } else {
          runs.push({ text: sub });
        }
      }
    }
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