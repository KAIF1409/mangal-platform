'use client';

// §139-B — the single client-side caching layer (SWR) for read-mostly data
// fetching. Before this, every client page did raw useEffect +
// supabase.from(...) with no cache at all: navigating back to an
// already-visited page re-ran identical queries seconds later and blocked
// on the network before painting. With SWR, a repeat visit paints instantly
// from cache and revalidates in the background.
//
// One layer, one convention:
//   - SWR keys are arrays that uniquely describe the query, e.g.
//     ['wm-recommendations'], ['katube-home-grid', userId ?? 'anon'].
//   - Freshness is expressed as a TIER (below) instead of ad-hoc flags per
//     call site. A tier maps onto SWR's dedupingInterval (how long identical
//     requests are collapsed) plus whether a tab refocus triggers a
//     background revalidate — analytics can be staler than a feed, and a
//     live chat feed staler than nothing.
//   - Mutation-heavy interactive flows (comments, likes, polls, chat
//     threads) deliberately stay on their bespoke optimistic-update state
//     models: SWR caching there would add invalidation complexity with no
//     read-path benefit. The cached surfaces are read-mostly lists.

import useSWR, { type SWRConfiguration } from 'swr';

export const CACHE_TIER = {
  /** Live-ish data (notifications, anything user expects to be hot). */
  realtime: { dedupingInterval: 2_000, revalidateOnFocus: true },
  /** Home rails / grids / feeds — brief dedupe, revalidate on tab focus. */
  feed: { dedupingInterval: 30_000, revalidateOnFocus: true },
  /** Published catalog data (series/chapters/reviews) — changes rarely. */
  catalog: { dedupingInterval: 5 * 60_000, revalidateOnFocus: false },
  /** Dashboard/analytics aggregates — staler than everything above. */
  analytics: { dedupingInterval: 10 * 60_000, revalidateOnFocus: false },
} as const;

export type CacheTier = keyof typeof CACHE_TIER;

const BASE_CONFIG: SWRConfiguration = {
  revalidateOnReconnect: true,
  shouldRetryOnError: true,
  errorRetryCount: 1,
};

/**
 * §139-B — the one data-fetching hook for read-mostly surfaces.
 * Returning a falsy key means "not ready to fetch yet" (standard SWR
 * conditional fetching). The fetcher closes over its parameters; the key
 * must capture everything that would change the result.
 */
export function useCachedQuery<T>(
  key: string | (string | number | null | undefined)[] | null,
  fetcher: () => Promise<T>,
  tier: CacheTier = 'feed',
) {
  return useSWR<T>(key, fetcher, { ...BASE_CONFIG, ...CACHE_TIER[tier] });
}
