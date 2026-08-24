// app/lib/ai/textDiff.ts
//
// Tiny dependency-free word-level differ for the "Diff / Review" modal.
// Compares one original paragraph with its AI-polished counterpart using a
// classic LCS table (fine at page scale: a 500-word paragraph is a
// 500×500 = 250k-cell table, trivial for a browser) and renders as
// same/removed/added runs so creators can see exactly what the model changed.

export interface DiffRun {
  type: 'same' | 'removed' | 'added';
  text: string;
}

function tokenize(text: string): string[] {
  // Words + trailing punctuation kept attached; whitespace collapses into
  // single spaces so the diff reads like prose, not a character dump.
  return text.match(/\S+\s*/g) ?? [];
}

/** Word-level LCS diff between two versions of a paragraph. */
export function diffWords(original: string, polished: string): DiffRun[] {
  const a = tokenize(original);
  const b = tokenize(polished);
  const n = a.length;
  const m = b.length;

  // lcs[i][j] = LCS length of a[i..] vs b[j..]
  const table: Uint32Array[] = Array.from(
    { length: n + 1 },
    () => new Uint32Array(m + 1),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] =
        a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const runs: DiffRun[] = [];
  const push = (type: DiffRun['type'], text: string) => {
    const last = runs[runs.length - 1];
    if (last && last.type === type) last.text += text;
    else runs.push({ type, text });
  };

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push('same', b[j]);
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      push('removed', a[i]);
      i++;
    } else {
      push('added', b[j]);
      j++;
    }
  }
  while (i < n) {
    push('removed', a[i]);
    i++;
  }
  while (j < m) {
    push('added', b[j]);
    j++;
  }
  return runs;
}

/** Split raw manuscript text into non-empty paragraphs on blank lines. */
export function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Pair each original paragraph with the polished paragraph that replaced it.
 * Paragraph order/count is preserved by the system prompt, so index pairing
 * is correct in practice; any surplus paragraphs on either side still come
 * through so nothing silently disappears from review.
 */
export interface ParagraphPair {
  index: number;
  original: string;
  polished: string;
  changed: boolean;
}

export function buildParagraphPairs(originalText: string, polishedText: string): ParagraphPair[] {
  const originals = splitParagraphs(originalText);
  const polished = splitParagraphs(polishedText);
  const len = Math.max(originals.length, polished.length);
  const pairs: ParagraphPair[] = [];
  for (let idx = 0; idx < len; idx++) {
    const o = originals[idx] ?? '';
    const p = polished[idx] ?? '';
    if (!o && !p) continue;
    pairs.push({ index: idx, original: o, polished: p, changed: normalize(o) !== normalize(p) });
  }
  return pairs;
}

function normalize(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}
