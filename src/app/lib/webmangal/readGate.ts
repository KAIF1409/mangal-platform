/**
 * lib/webmangal/readGate.ts
 *
 * Pure decision logic for the WebMangal free-tier read gate — the
 * "Aur Padh Liye?" upgrade screen in read/[chapterId]/page.tsx.
 *
 * WHY THIS IS EXTRACTED
 * The rule used to live inline in the reader page, which made it
 * unit-untestable and hid the fact that it was a product decision rather than
 * plumbing. Two things came out of that:
 *
 *  1. THE AUTHOR WAS LOCKED OUT OF THEIR OWN STORY. The gate counted chapters
 *     out of localStorage and nothing else, so the one account that must be
 *     able to read every chapter it published — series.creator_id — hit
 *     "2 chapters per series" on chapter 3 of its own work and was shown an
 *     upgrade wall with a pay button. `isOwner` below is the fix: the free
 *     tier limits OTHER PEOPLE'S content, never your own. Ownership, not
 *     role, is the test — deliberately the same rule as every write path
 *     (see lib/auth/roles.ts's header).
 *
 *  2. A READ WAS COUNTED TWICE. `alreadyRead` and the "would this push me
 *     over the limit?" arithmetic were interleaved with state updates, so the
 *     same chapter could be counted as a fresh read on one code path and as a
 *     re-read on another. The whole decision now happens in one pure call.
 *
 * `shouldRecordRead` is the other half: an author reading chapter 3 of their
 * own series must not silently spend the free-tier budget they need later for
 * somebody else's series. Own-series reads are never recorded, so they can
 * never be counted.
 */

/** Chapters a reader may open per series before the gate closes. */
export const FREE_CHAPTERS_PER_SERIES = 2;

/** Distinct series a reader may open before the gate closes. */
export const FREE_SERIES_LIMIT = 3;

/** Which wall the reader hit — decides the copy on the gate screen. */
export type ReadGateReason = 'series_limit' | 'chapter_limit';

export interface ReadGateInput {
  /**
   * True when the viewer IS the series' creator (series.creator_id). Bypasses
   * the gate completely — an author can always read their own work.
   */
  isOwner: boolean;
  /** True when this exact chapter is already in the reader's history. */
  alreadyRead: boolean;
  /** How many chapters of THIS series the reader has already opened. */
  chaptersReadInSeries: number;
  /** How many DISTINCT series the reader has already opened. */
  uniqueSeriesRead: number;
}

export interface ReadGateDecision {
  gated: boolean;
  /** Set only when `gated` is true. */
  reason: ReadGateReason | null;
}

/** Counts come from localStorage JSON — a corrupted entry must read as 0,
 * never as NaN (which would silently disable every comparison below). */
function normalizeCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Should the reader be stopped before this chapter opens?
 *
 * Order matters and mirrors the live behavior: ownership first (an author is
 * never gated), then the re-read pass, then the series limit, then the
 * per-series chapter limit. `series_limit` is reported first because "you've
 * opened 3 different stories" is the more actionable wall once both apply.
 */
export function evaluateReadGate(input: ReadGateInput): ReadGateDecision {
  const chaptersReadInSeries = normalizeCount(input.chaptersReadInSeries);
  const uniqueSeriesRead = normalizeCount(input.uniqueSeriesRead);

  // Your own work is never gated — not on chapter 3, not on chapter 300.
  if (input.isOwner) return { gated: false, reason: null };

  // Re-opening a chapter that was already unlocked always passes, otherwise
  // the gate would also punish re-reading.
  if (input.alreadyRead) return { gated: false, reason: null };

  // Opening the first chapter of a NEW series spends one series slot; later
  // chapters of the same series do not.
  const willHaveSeriesRead = uniqueSeriesRead + (chaptersReadInSeries === 0 ? 1 : 0);
  if (willHaveSeriesRead > FREE_SERIES_LIMIT) {
    return { gated: true, reason: 'series_limit' };
  }

  if (chaptersReadInSeries + 1 > FREE_CHAPTERS_PER_SERIES) {
    return { gated: true, reason: 'chapter_limit' };
  }

  return { gated: false, reason: null };
}

/**
 * Should this read be written to the reader's local history?
 *
 * Only reads that actually consume free-tier budget are recorded: an author's
 * own series never does. Without this, an author who reads through their own
 * 20-chapter series would arrive at somebody else's story with zero free
 * chapters left — the gate would be charging them for their own work.
 */
export function shouldRecordRead(input: {
  isOwner: boolean;
  alreadyRead: boolean;
}): boolean {
  return !input.isOwner && !input.alreadyRead;
}
