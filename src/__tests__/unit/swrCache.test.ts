import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { CACHE_TIER, useCachedQuery } from '@/app/lib/swrCache';

describe('CACHE_TIER — §139-B freshness tiers', () => {
  it('realtime tier dedupes briefly and revalidates on focus', () => {
    expect(CACHE_TIER.realtime).toEqual({ dedupingInterval: 2_000, revalidateOnFocus: true });
  });

  it('feed tier dedupes for 30s', () => {
    expect(CACHE_TIER.feed.dedupingInterval).toBe(30_000);
    expect(CACHE_TIER.feed.revalidateOnFocus).toBe(true);
  });

  it('catalog tier is staler and does NOT revalidate on focus', () => {
    expect(CACHE_TIER.catalog.dedupingInterval).toBe(5 * 60_000);
    expect(CACHE_TIER.catalog.revalidateOnFocus).toBe(false);
  });

  it('analytics tier is the stalest', () => {
    expect(CACHE_TIER.analytics.dedupingInterval).toBe(10 * 60_000);
    expect(CACHE_TIER.analytics.revalidateOnFocus).toBe(false);
  });
});

describe('useCachedQuery — the one read-mostly fetch hook', () => {
  it('fetches when a key is given and exposes the data', async () => {
    const { result } = renderHook(() =>
      useCachedQuery(['wm-test'], async () => ({ ok: true }), 'catalog'),
    );
    await waitFor(() => expect(result.current.data).toEqual({ ok: true }));
    expect(result.current.error).toBeUndefined();
  });

  it('a falsy key means "not ready to fetch yet" (conditional fetching)', () => {
    const fetcher = vi.fn(async () => 42);
    renderHook(() => useCachedQuery(null, fetcher));
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('surfaces fetcher errors as SWR error state', async () => {
    const { result } = renderHook(() =>
      useCachedQuery(['wm-fail'], async () => {
        throw new Error('boom');
      }),
    );
    await waitFor(() => expect(result.current.error).toBeDefined());
  });
});
