// app/api/recommendations/route.ts
//
// §135 — In-house zero-cost recommendation engine (CONTEXT.md roadmap:
// "no ranking/relevance beyond ilike" was a known gap).
//
// ALGORITHM (deliberately NOT pgvector):
//   Stock Supabase Postgres + a tiny JS scorer beat a vector extension here
//   — series metadata is one-hot-able (genre) and co-read signals are
//   already in relational tables. Cosine similarity over sparse binary
//   feature vectors IS array-intersection math; pgvector would buy nothing
//   at this cardinality while adding an extension dependency.
//
//   taste vector  := genres of recently-read ∪ followed series.
//   candidate score = 0.55·cosine(candidateGenreVec, tasteVec)
//                   + 0.20·authorOverlap + 0.15·languageMatch
//                   + 0.10·popularityPrior (log-scaled views)
//   Rails: "For You" (excludes read/followed), "Because you read <latest>",
//   "Trending in <top genre>". Anonymous callers get trending fallbacks.
//
// AUTH: optional Bearer token personalises rails; no writes, no paid APIs.

import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

interface SeriesRow {
  id: string;
  title: string;
  synopsis: string | null;
  genre: string | null;
  language: string | null;
  cover_url: string | null;
  content_type: string | null;
  creator_id: string;
  views: number | null;
}

function cosine(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let dot = 0;
  for (const g of a) if (b.has(g)) dot += 1;
  // Binary vectors: magnitude product = sqrt(|a|²·|b|²) = sqrt(|a|·|b|).
  return dot / Math.sqrt(a.size * b.size);
}

export async function GET(req: NextRequest) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // ── Optional identity ────────────────────────────────────────────────
    let userId: string | null = null;
    const authHeader = req.headers.get('authorization');
    const accessToken = authHeader?.replace('Bearer ', '').trim();
    if (accessToken) {
      const { data } = await admin.auth.getUser(accessToken);
      userId = data?.user?.id ?? null;
    }

    // ── Candidate pool (published only) ──────────────────────────────────
    const { data: poolData, error: poolErr } = await admin
      .from('series')
      .select('id,title,synopsis,genre,language,cover_url,content_type,creator_id,views')
      .eq('status', 'published')
      .order('views', { ascending: false })
      .limit(300);
    if (poolErr) {
      return NextResponse.json({ error: 'Could not load series.' }, { status: 500 });
    }
    const pool = (poolData ?? []) as SeriesRow[];

    let recentSeriesIds: string[] = [];
    let followedSeriesIds: string[] = [];

    if (userId) {
      const [progRes, followRes] = await Promise.all([
        admin
          .from('reading_progress')
          .select('series_id, updated_at')
          .eq('reader_id', userId)
          .order('updated_at', { ascending: false })
          .limit(40),
        admin.from('follows').select('series_id').eq('reader_id', userId),
      ]);
      recentSeriesIds = [...new Set((progRes.data ?? []).map((r) => r.series_id))];
      followedSeriesIds = [...new Set((followRes.data ?? []).map((r) => r.series_id))];
    }

    const byId = new Map(pool.map((s) => [s.id, s]));
    const liked = [...new Set([...recentSeriesIds, ...followedSeriesIds])]
      .map((id) => byId.get(id))
      .filter((s): s is SeriesRow => Boolean(s));

    // ── Taste vector + scorer ────────────────────────────────────────────
    const tasteGenres = new Set<string>();
    for (const s of liked) if (s.genre) tasteGenres.add(s.genre);

    const popularityPrior = (views: number | null): number =>
      Math.log10(Math.max(0, views ?? 0) + 1) / Math.log10(100_000);

    const scoreCandidate = (
      cand: SeriesRow,
      seedGenres: Set<string>,
      seedCreators: Set<string>,
      seedLanguages: Set<string>,
    ): number =>
      0.55 * cosine(new Set(cand.genre ? [cand.genre] : []), seedGenres) +
      0.2 * (seedCreators.has(cand.creator_id) ? 1 : 0) +
      0.15 * (cand.language && seedLanguages.has(cand.language) ? 1 : 0) +
      0.1 * popularityPrior(cand.views);

    const seedCreators = new Set(liked.map((s) => s.creator_id));
    const seedLanguages = new Set(liked.map((s) => s.language ?? '').filter(Boolean));

    // ── Rail 1: Recommended For You ──────────────────────────────────────
    const excluded = new Set<string>([...recentSeriesIds, ...followedSeriesIds]);
    const personalized = Boolean(userId && liked.length > 0);
    let forYou: SeriesRow[];
    if (personalized) {
      forYou = pool
        .filter((c) => !excluded.has(c.id))
        .map((cand) => ({
          cand,
          score: scoreCandidate(cand, tasteGenres, seedCreators, seedLanguages),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 12)
        .map((x) => x.cand);
    } else {
      forYou = pool.slice(0, 12); // cold-start: popularity stand-in
    }

    // ── Rail 2: Because You Read <latest read> ───────────────────────────
    const seedSeries = recentSeriesIds[0] ? byId.get(recentSeriesIds[0]) ?? null : null;
    let becauseYouReadItems: SeriesRow[] = [];
    if (seedSeries) {
      becauseYouReadItems = pool
        .filter((c) => c.id !== seedSeries.id)
        .map((cand) => ({
          cand,
          score: scoreCandidate(
            cand,
            new Set(seedSeries.genre ? [seedSeries.genre] : []),
            new Set([seedSeries.creator_id]),
            new Set([seedSeries.language ?? '']),
          ),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
        .map((x) => x.cand);
    }

    // ── Rail 3: Trending in <top taste genre> ────────────────────────────
    const genreCount = new Map<string, number>();
    for (const s of liked) if (s.genre) genreCount.set(s.genre, (genreCount.get(s.genre) ?? 0) + 1);
    const topGenre =
      [...genreCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ??
      pool.find((s) => s.genre)?.genre ??
      null;
    const trendingInGenre = (
      topGenre ? pool.filter((s) => s.genre === topGenre) : pool
    ).slice(0, 8);

    return NextResponse.json(
      {
        personalized,
        topGenre,
        forYou,
        becauseYouRead: { seed: seedSeries, items: becauseYouReadItems },
        trendingInGenre,
      },
      // §139-C — responses are personalized per Bearer token, so they must
      // never land in a SHARED cache; a short browser-private window is safe
      // (the underlying pool is the stable published top-300). Combined with
      // the §139-B SWR catalog tier on the client, repeat home visits skip
      // re-scoring entirely.
      { headers: { 'Cache-Control': 'private, max-age=300' } },
    );
  } catch (err) {
    console.error('[recommendations] failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Recommendation engine failure.' }, { status: 500 });
  }
}

