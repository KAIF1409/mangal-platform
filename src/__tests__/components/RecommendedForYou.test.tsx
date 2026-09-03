import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SWRConfig } from 'swr';
import RecommendedForYou from '@/app/components/feed/RecommendedForYou';
import { supabase } from '@/app/lib/supabase';

// RecommendedForYou feeds the WebMangal home rails from /api/recommendations.
// The Supabase client is mocked so auth is anonymous (no network), and global
// fetch is stubbed to return a deterministic ApiShape.
vi.mock('@/app/lib/supabase', () => ({
  supabase: {
    auth: { getSession: vi.fn(async () => ({ data: { session: null } })) },
  },
}));

const series = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  title: `Series ${id}`,
  synopsis: null,
  genre: 'Mythology',
  cover_url: null,
  content_type: 'mangal',
  ...over,
});

function renderRails(api: object, fetchImpl: typeof fetch) {
  vi.stubGlobal('fetch', vi.fn(fetchImpl));
  return render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <RecommendedForYou />
    </SWRConfig>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('RecommendedForYou — WebMangal home discovery rails', () => {
  it('renders the personalized rail with series links', async () => {
    const api = {
      personalized: true,
      topGenre: 'Mythology',
      forYou: [series('a1'), series('a2', { content_type: 'novel' })],
      becauseYouRead: { seed: null, items: [] },
      trendingInGenre: [series('a3')],
    };
    renderRails(api, async () => new Response(JSON.stringify(api), { status: 200 }));

    expect(await screen.findByText('Recommended For You')).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: /Series a1/ });
    expect(links[0]).toHaveAttribute('href', '/WebMangal/series/a1');
    expect(screen.getByText('NOVEL')).toBeInTheDocument();
    expect(screen.getByText('Trending in Mythology')).toBeInTheDocument();
  });

  it('falls back to "Popular This Week" for anonymous/cold-start readers', async () => {
    const api = {
      personalized: false,
      topGenre: null,
      forYou: [series('b1')],
      becauseYouRead: { seed: null, items: [] },
      trendingInGenre: [],
    };
    renderRails(api, async () => new Response(JSON.stringify(api), { status: 200 }));
    expect(await screen.findByText('Popular This Week')).toBeInTheDocument();
    expect(screen.queryByText(/Trending in/)).not.toBeInTheDocument();
  });

  it('renders the "Because you read" rail when a seed read exists', async () => {
    const api = {
      personalized: true,
      topGenre: 'Mythology',
      forYou: [series('c1')],
      becauseYouRead: { seed: series('seed'), items: [series('c2')] },
      trendingInGenre: [],
    };
    renderRails(api, async () => new Response(JSON.stringify(api), { status: 200 }));
    expect(await screen.findByText('Because you read “Series seed”')).toBeInTheDocument();
  });

  it('renders nothing when the API fails (graceful degradation)', async () => {
    const { container } = renderRails({}, async () => new Response('{}', { status: 500 }));
    await waitFor(() => expect(container.querySelector('h2')).toBeNull());
  });

  it('hides empty rails (a rail with zero items renders no heading)', async () => {
    const api = {
      personalized: false,
      topGenre: 'Mythology',
      forYou: [series('d1')],
      becauseYouRead: { seed: null, items: [] },
      trendingInGenre: [],
    };
    renderRails(api, async () => new Response(JSON.stringify(api), { status: 200 }));
    await screen.findByText('Popular This Week');
    expect(screen.queryByText(/Trending in/)).not.toBeInTheDocument();
  });
});
