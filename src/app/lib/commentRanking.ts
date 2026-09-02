// Per-product comment ranking algorithms + pagination limits.
//
// Founder ask: every comment section across the app (KaTube, K Circle,
// WebMangal) had no sort algorithm at all — comments just rendered in
// insertion order with no cap — and each product should instead behave
// like its own reference platform:
//   - KaTube    -> YouTube-style "Top comments" (likes + recency decay)
//   - K Circle  -> Instagram-style (most-liked preview, chronological on expand)
//   - WebMangal -> Webnovel-style "Popular" (likes, gentle long-tail decay)
//
// All three are pure functions over { likes, createdAt } so each page just
// needs to fetch a like count per comment (see the new *_comment_likes
// tables, 20260820100000_comment_likes.sql) and hand it to the matching
// function below — no page needs its own scoring logic.

function ageInHours(createdAt: string): number {
  return Math.max(0, (Date.now() - new Date(createdAt).getTime()) / 36e5);
}

// ── KaTube — YouTube "Top comments" ──
// YouTube's exact ranking isn't public, but its observed behavior is: a
// comment that gathers likes quickly outranks an older comment with a
// similar total, and a very old comment needs meaningfully more likes to
// stay above a fresh one. Modeled as likes divided by a moderate power-law
// age decay — comments under ~2 days old are barely discounted, older ones
// fall off more the longer they sit without new likes.
export function youtubeCommentScore(likes: number, createdAt: string): number {
  const hours = ageInHours(createdAt);
  return (likes + 1) / Math.pow(1 + hours / 48, 1.3);
}

// ── K Circle — Instagram ──
// Instagram doesn't re-rank a whole thread by score; it shows a short
// preview of the most-liked comment(s) under a post, ties broken oldest-
// first, then reveals everything else chronologically behind "View all N
// comments" with no decay applied to the expanded list.
export function instagramPreviewComments<T>(
  comments: T[],
  getLikes: (c: T) => number,
  getCreatedAt: (c: T) => string,
  previewCount = 2,
): T[] {
  return [...comments]
    .sort((a, b) => getLikes(b) - getLikes(a) || new Date(getCreatedAt(a)).getTime() - new Date(getCreatedAt(b)).getTime())
    .slice(0, previewCount);
}

// ── WebMangal — Webnovel "Popular" ──
// Reading-platform comment/review sections stay relevant for months or
// years, not hours, so a well-liked comment should keep its place near the
// top far longer than on a video platform — the decay here is measured in
// months rather than hours, and total likes matter more than freshness.
export function webnovelCommentScore(likes: number, createdAt: string): number {
  const days = ageInHours(createdAt) / 24;
  return (likes + 1) / Math.pow(1 + days / 30, 0.6);
}

// Sorts any comment list (KaTube or WebMangal) by one of the score
// functions above, highest first. Takes accessor functions rather than
// assuming a fixed field-name shape, since each product's comment table
// names these differently (comment_text/created_at, text/created_at,
// body/created_at, ...).
export function sortByScore<T>(
  comments: T[],
  getLikes: (c: T) => number,
  getCreatedAt: (c: T) => string,
  scoreFn: (likes: number, createdAt: string) => number,
): T[] {
  return [...comments].sort((a, b) => scoreFn(getLikes(b), getCreatedAt(b)) - scoreFn(getLikes(a), getCreatedAt(a)));
}

// ── Pagination — the "limit" half of the ask. None of the three comment
// sections capped how many comments rendered at once before this; each
// now loads a bounded first page with a manual "load more" step for the
// rest (client-side reveal over the already-ranked list, same pattern
// already used for the Fast Tap shorts row's FAST_TAP_COLLAPSED_COUNT). ──
export const COMMENT_PAGE_SIZE = {
  katube: 20, // YouTube batches roughly this many before "Show more"
  kcircle: 50, // Instagram's expanded view has no explicit page size in-app;
  // this is a sane upper bound so an expanded thread never renders
  // unbounded — increases by the same amount on further "Load more" taps
  webmangal: 15, // Webnovel-style review/comment pages load in small pages
} as const;

// §139-A8/A10 — fetch page sizes for the two *review* lists (KaTube accuracy
// reviews, WebMangal written reviews). These were unbounded fetches like the
// comment sections above; they now use the same §82 `.range()` + "Load more"
// pattern as the browse/songs lists, so they get their own size constants.
export const REVIEW_PAGE_SIZE = {
  katube: 20,
  webmangal: 10,
} as const;

