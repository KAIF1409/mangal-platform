// @vitest-environment node
// API route-handler tests for the WebMangal data plane. All Supabase/R2/auth
// dependencies are mocked at module boundary — no real network or DB access.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const createClientMock = vi.hoisted(() => vi.fn());
vi.mock('@supabase/supabase-js', () => ({ createClient: createClientMock }));

type Row = Record<string, unknown>;
interface AdminOpts {
  pool?: Row[] | null;
  poolErr?: Row | null;
  user?: Row | null;
  progress?: Row[];
  follows?: Row[];
}

/** Builds a chainable PostgREST-style mock resolving per-table results. */
function makeAdmin({ pool = [], poolErr = null, user = null, progress = [], follows = [] }: AdminOpts) {
  const tableData: Record<string, () => { data: unknown; error: unknown }> = {
    series: () => ({ data: pool, error: poolErr }),
    reading_progress: () => ({ data: progress, error: null }),
    follows: () => ({ data: follows, error: null }),
  };
  const chain = (table: string) => {
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = () => b;
    b.order = () => b;
    b.limit = () => b;
    // Real PostgREST builders RESOLVE with { data, error } — errors come back
    // as values, not rejections (only network-level throws reject).
    b.then = (resolve: (v: unknown) => void) => {
      resolve(tableData[table]());
    };
    return b;
  };
  return {
    from: (t: string) => chain(t),
    auth: { getUser: vi.fn(async () => ({ data: { user } })) },
  };
}

const admin = makeAdmin({});
createClientMock.mockImplementation(() => admin);

const importRoute = async () => (await import('@/app/api/recommendations/route')).GET;

const req = (token?: string) =>
  new NextRequest('http://localhost:3000/api/recommendations', {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

beforeEach(() => {
  createClientMock.mockClear();
  createClientMock.mockImplementation(() => admin);
});

describe('GET /api/recommendations — §135 zero-cost recommendation engine', () => {
  it('anonymous caller gets a cold-start trending rail (not personalized)', async () => {
    const adminLocal = makeAdmin({
      pool: [
        { id: 's1', title: 'A', genre: 'Action', language: 'en', creator_id: 'c1', views: 500 },
        { id: 's2', title: 'B', genre: 'Romance', language: 'hi', creator_id: 'c2', views: 300 },
      ],
    });
    createClientMock.mockImplementation(() => adminLocal);
    const GET = await importRoute();
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.personalized).toBe(false);
    expect(body.forYou).toHaveLength(2);
    // topGenre falls back to the first pool row's genre for anonymous readers.
    expect(body.topGenre).toBe('Action');
    // §139-C — personalized responses must never land in a shared cache.
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=300');
  });

  it('a Bearer token with reading history personalizes and EXCLUDES read/followed series', async () => {
    const adminLocal = makeAdmin({
      user: { id: 'user-1' },
      pool: [
        { id: 's1', title: 'Read already', genre: 'Action', language: 'en', creator_id: 'c1', views: 900 },
        { id: 's2', title: 'Same genre seed', genre: 'Action', language: 'en', creator_id: 'c9', views: 100 },
        { id: 's3', title: 'Other genre', genre: 'Horror', language: 'en', creator_id: 'c9', views: 100 },
      ],
      progress: [{ series_id: 's1', updated_at: '2026-08-01T00:00:00Z' }],
      follows: [],
    });
    createClientMock.mockImplementation(() => adminLocal);
    const GET = await importRoute();
    const res = await GET(req('valid-token'));
    const body = await res.json();
    expect(body.personalized).toBe(true);
    const ids = body.forYou.map((s: Row) => s.id);
    expect(ids).not.toContain('s1'); // recently read → excluded
    // 'Same genre seed' shares the taste genre with the seed → ranked first.
    expect(ids[0]).toBe('s2');
    // "Because you read" seeds from the most recent read.
    expect(body.becauseYouRead.seed.id).toBe('s1');
  });

  it('500s with a stable message when the series pool query fails', async () => {
    const adminLocal = makeAdmin({ poolErr: { message: 'rls denied' } });
    createClientMock.mockImplementation(() => adminLocal);
    const GET = await importRoute();
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('Could not load series.');
  });

  it('500s (engine failure) when Supabase env vars are missing', async () => {
    createClientMock.mockImplementation(() => {
      throw new Error('supabaseUrl is required.');
    });
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    const GET = await importRoute();
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('Recommendation engine failure.');
    vi.unstubAllEnvs();
  });
});
