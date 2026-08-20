// KaTube Fast Tap (Shorts) — feed ranking algorithm
//
// Before this file existed, the Fast Tap feed
// (app/katube/shorts/[shortId]/page.tsx) had NO ranking at all — it was a
// plain `.order('created_at', { ascending: false }).limit(50)` query, i.e.
// pure reverse-chronological. That's the root "no algorithm function or
// anything" gap: every viewer saw the exact same 50 clips in the exact
// same order regardless of who they were or how those clips were actually
// performing.
//
// This module builds a real short-form ranking pass out of signals that
// already exist in this app's schema (no fabricated engagement data, no
// new tables required), mirroring the same signal categories real
// short-form feeds (YouTube Shorts / Instagram Reels) are publicly known
// to use:
//
//   1. Freshness-decayed engagement ("hot") score — reuses the exact same
//      formula already shipped on the Trending page
//      (`trendingScore` in app/katube/trending/page.tsx) for consistency
//      across the app: recent clips with real engagement outrank older
//      ones, but a strong older clip doesn't fall off a cliff either.
//   2. Engagement RATE (likes per view), not just raw counts — a short
//      with 10 likes on 50 views is a much stronger "people who saw this
//      liked it" signal than 10 likes on 5,000 views, so a pure
//      views-weighted score would systematically favor already-big
//      creators and never let a small creator's genuinely well-received
//      clip surface. This is the same principle behind YouTube's own
//      publicly-stated shift toward watch-through/engagement signals
//      over raw view count.
//   3. Followed-creator boost — if the viewer follows the short's
//      creator, it ranks higher, the same "you're more likely to be shown
//      channels you already subscribe to" behavior real Shorts feeds use.
//      Falls away entirely for a signed-out viewer (no personalization
//      signal available), which is the correct, honest fallback rather
//      than pretending to personalize with no data.
//   4. Session-level "already seen" de-prioritization — a short the
//      current browser session has already scrolled past drops toward the
//      bottom of the pool instead of being served again on every reload,
//      the same "don't keep re-showing what was just watched" behavior
//      real Shorts/Reels feeds have. Tracked in sessionStorage only (no
//      new table) — resets naturally each new session, which is fine
//      since a small/medium content pool needs to resurface eventually.
//   5. Creator diversity pass — real short-form feeds essentially never
//      play two clips from the same creator back-to-back. After scoring,
//      a greedy re-ordering pass pulls the list apart so the same
//      creator never appears twice within a configurable window, without
//      a second query or re-fetch.

export interface RankableShort {
  id: string;
  creator_id: string;
  views: number;
  likes: number;
  created_at: string;
}

const SEEN_KEY = 'katube-shorts-seen';
const SEEN_MAX = 300; // cap so sessionStorage never grows unbounded across a long session

/** Same "hot" formula as app/katube/trending/page.tsx's trendingScore —
 *  kept in sync deliberately so KaTube's various ranked surfaces (Fast
 *  Tap, Trending, Rankings pill) all agree on what "performing well"
 *  means instead of each inventing its own definition. */
function freshnessDecayedScore(views: number, likes: number, createdAt: string): number {
  const ageHours = Math.max(1, (Date.now() - new Date(createdAt).getTime()) / 3600000);
  return (views + likes * 3) / Math.pow(ageHours + 2, 1.3);
}

/** Likes-per-view, the "did people who saw it actually like it" signal —
 *  deliberately capped so a brand-new short with 1 view + 1 like (a
 *  100% rate on a sample size of one) can't out-rank an established
 *  short with thousands of real engagements purely on a statistical
 *  fluke. Confidence scales in with view count up to a floor. */
function engagementRate(views: number, likes: number): number {
  const rate = likes / Math.max(views, 1);
  const confidence = Math.min(1, views / 25); // ramps to full trust by ~25 views
  return rate * confidence;
}

function readSeenSet(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.sessionStorage.getItem(SEEN_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr) : new Set();
  } catch {
    return new Set();
  }
}

/** Marks a short as seen this session — called as the viewer scrolls past
 *  it, so a reload of the feed deprioritizes what was already shown
 *  rather than replaying the identical order. Fire-and-forget, never
 *  throws (sessionStorage can be unavailable in some embedded contexts —
 *  private tabs, etc. — and this is a ranking nicety, not a feature
 *  anything else depends on). */
export function markShortSeen(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    const seen = readSeenSet();
    seen.add(id);
    const trimmed = seen.size > SEEN_MAX
      ? new Set(Array.from(seen).slice(-SEEN_MAX))
      : seen;
    window.sessionStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(trimmed)));
  } catch {
    // sessionStorage unavailable — ranking just skips the "already seen"
    // de-prioritization for this session, nothing else is affected.
  }
}

export interface RankShortsOptions {
  /** creator_id set the viewer follows — empty for a signed-out viewer. */
  followedCreatorIds?: Set<string>;
  /** How far apart (in final position) two clips from the same creator
   *  must be kept, e.g. 3 = at least 2 other creators between repeats. */
  diversityWindow?: number;
}

/** Scores + re-orders a pool of shorts into a real "For You"-style feed
 *  order. Pure function of its inputs (no network calls) so it can run
 *  entirely client-side against whatever pool was already fetched. */
export function rankShorts<T extends RankableShort>(
  pool: T[],
  { followedCreatorIds, diversityWindow = 3 }: RankShortsOptions = {}
): T[] {
  if (pool.length <= 1) return pool;

  const seen = readSeenSet();

  const scored = pool.map(short => {
    const hot = freshnessDecayedScore(short.views, short.likes, short.created_at);
    const engagement = engagementRate(short.views, short.likes);
    // Normalize the "hot" score's much larger range down before combining
    // with the 0..1-ish engagement rate so one signal can't silently
    // swamp the other regardless of a pool's actual view-count scale.
    let score = Math.log1p(hot) + engagement * 4;

    if (followedCreatorIds?.has(short.creator_id)) {
      score *= 1.6; // followed-creator boost
    }
    if (seen.has(short.id)) {
      score *= 0.35; // already scrolled past this session — deprioritize, don't hard-exclude
    }

    return { short, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // Greedy creator-diversity pass: walk the score-sorted list, and for
  // each open slot pick the highest-scored remaining short whose creator
  // hasn't appeared in the last `diversityWindow` picks. Falls back to
  // the best remaining short regardless of creator if every remaining
  // candidate would violate the window (e.g. the pool is dominated by a
  // single creator) — diversity is a soft preference, never a reason to
  // produce a shorter feed than the pool actually has.
  const result: T[] = [];
  const remaining = scored.slice();
  while (remaining.length > 0) {
    const recentCreators = result.slice(-diversityWindow + 1).map(s => s.creator_id);
    let pickIdx = remaining.findIndex(entry => !recentCreators.includes(entry.short.creator_id));
    if (pickIdx === -1) pickIdx = 0;
    result.push(remaining[pickIdx].short);
    remaining.splice(pickIdx, 1);
  }

  return result;
}
