// app/api/chat/discovery/route.ts
//
// §150 — MANGAL Assistant, Discovery mode catalog matcher.
//
// STATELESS BY DESIGN (Cloudflare Workers concurrency):
//   The client sends the CURRENT message + its own session context
//   (genres gathered from earlier turns — "shorter", "less romance").
//   Nothing about the conversation is stored server-side: no per-user
//   state in memory (each Worker isolate would see a different slice of
//   traffic anyway), no DB rows, no caches keyed by user. Two requests
//   from the same user may land on different isolates and still behave
//   identically.
//
// NO LLM, NO PAID API (§150 stop-and-wait case NOT triggered):
//   Matching is a keyword/genre-overlap scorer over the SAME indexed
//   catalog-query pattern /api/recommendations uses (published rows,
//   `order views desc`, small `limit`) — one cheap Postgres read per
//   request, no vector extension, no model call. This is why Guide mode
//   is fully client-side (guideKnowledge.ts) and Discovery is the ONLY
//   server round-trip in the whole widget.
//
// RATE LIMITING: reuses the repo's Postgres-backed checkRateLimit
// (rate_limiting_infrastructure migration + lib/rateLimit.ts) —
// 20 requests / 60 s per caller IP, consistent with every other API
// route in this codebase. Fails open, same as the shared helper.
//
// REUSE vs. /api/recommendations: that engine scores a per-USER taste
// vector (reading history + follows) over the series pool. Discovery
// scores a per-QUERY intent vector (freeform text) across series+books+
// songs / videos+channels. Different input source and feature space, so
// the taste-vector scorer is NOT duplicated — only the pool-query shape
// (status=published, order views desc, capped limit) and the log-scaled
// popularity prior are reused.

import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

import { checkRateLimit, getClientIp } from '../../../lib/rateLimit';
import {
  extractDiscoveryQuery,
  type DiscoveryIntent,
  type DiscoverySessionContext,
} from '../../../lib/ai/chatDiscovery';

export interface DiscoveryCard {
  type: 'series' | 'book' | 'song' | 'video' | 'channel';
  id: string;
  title: string;
  /** One-line context under the title (genre / category / handle). */
  subtitle: string | null;
  /** Why it matches the user's ask — rendered on the chat card. */
  why: string;
  cover: string | null;
  href: string;
  badge: string | null;
}

interface PoolItem {
  card: Omit<DiscoveryCard, 'why'>;
  /** Lowercase genre labels from the real columns (see §150 audit). */
  genreLabels: string[];
  desc: string;
  views: number;
}

/** Genre-key variants so "sci-fi" also matches "scifi"/"Sci-Fi" labels. */
function genreVariants(g: string): string[] {
  const base = g.toLowerCase();
  return [base, base.replace(/-/g, ''), base.split(' ')[0]].filter((v) => v.length >= 3);
}

function matchesGenre(item: PoolItem, genre: string): boolean {
  const variants = genreVariants(genre);
  return item.genreLabels.some((label) =>
    variants.some((v) => label.includes(v) || v.includes(label)),
  );
}

function keywordHits(haystack: string, keyword: string): boolean {
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u');
  return re.test(haystack.toLowerCase());
}

function scorePool(
  items: PoolItem[],
  intent: DiscoveryIntent,
): { card: DiscoveryCard; sortScore: number }[] {
  const scored: { card: DiscoveryCard; sortScore: number }[] = [];
  for (const item of items) {
    if (intent.excludeGenres.some((g) => matchesGenre(item, g))) continue;

    const matchedGenres = intent.genres.filter((g) => matchesGenre(item, g));
    let keywordScore = 0;
    let firstKeyword: string | null = null;
    for (const kw of intent.keywords) {
      if (keywordHits(`${item.card.title} ${item.desc}`, kw)) {
        keywordScore += 0.5;
        if (!firstKeyword) firstKeyword = kw;
      }
    }
    keywordScore = Math.min(keywordScore, 1.5);

    // Zero relevance without a shared genre AND no keyword overlap → skip.
    if (matchedGenres.length === 0 && keywordScore === 0) continue;

    const popularity =
      (Math.log10(Math.max(0, item.views) + 1) / Math.log10(100_000)) * 0.3;

    const whyParts: string[] = [];
    if (matchedGenres.length > 0) whyParts.push(`matches ${matchedGenres.join(' + ')}`);
    if (firstKeyword) whyParts.push(`"${firstKeyword}" in the title/description`);
    if (whyParts.length === 0) whyParts.push('trending on MANGAL right now');

    scored.push({
      card: { ...item.card, why: whyParts.join(' · ') },
      sortScore: matchedGenres.length * 1.2 + keywordScore + popularity,
    });
  }
  scored.sort((a, b) => b.sortScore - a.sortScore);
  // Diversify: at most 4 of one content type in a single answer.
  const perType = new Map<string, number>();
  const out: { card: DiscoveryCard; sortScore: number }[] = [];
  for (const s of scored) {
    const n = perType.get(s.card.type) ?? 0;
    if (n >= 4) continue;
    perType.set(s.card.type, n + 1);
    out.push(s);
    if (out.length >= 6) break;
  }
  return out;
}

interface ChatDiscoveryBody {
  platform?: string;
  message?: string;
  context?: {
    genres?: unknown;
    excludeGenres?: unknown;
  };
}

function sanitizeContext(raw: ChatDiscoveryBody['context']): DiscoverySessionContext {
  const clean = (v: unknown): string[] =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === 'string').slice(0, 8).map((s) => s.slice(0, 40).toLowerCase())
      : [];
  return { genres: clean(raw?.genres), excludeGenres: clean(raw?.excludeGenres) };
}

export async function POST(req: NextRequest) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Rate limit BEFORE any catalog read — chat is chatty by nature.
    const ip = getClientIp(req);
    const withinLimit = await checkRateLimit(admin, `chat-discovery:${ip}`, 20, 60);
    if (!withinLimit) {
      return NextResponse.json(
        { error: 'Too many recommendations in a row. Please slow down.' },
        { status: 429 },
      );
    }

    const body = (await req.json().catch(() => null)) as ChatDiscoveryBody | null;
    const platform = body?.platform;
    const message = typeof body?.message === 'string' ? body.message.trim().slice(0, 300) : '';
    if ((platform !== 'webmangal' && platform !== 'katube') || message.length === 0) {
      return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
    }

    const context = sanitizeContext(body?.context);
    const intent = extractDiscoveryQuery(message, context);
    if (!intent) {
      // Not a Discovery ask after all — the client falls back to Guide mode.
      return NextResponse.json({ results: [], noIntent: true }, { headers: { 'Cache-Control': 'no-store' } });
    }

    // ── WebMangal: series + books + songs (same pool pattern as §135) ──
    if (platform === 'webmangal') {
      const wantSeries = intent.typeHint === 'any' || intent.typeHint === 'novel' || intent.typeHint === 'manga';
      const wantBooks = intent.typeHint === 'any' || intent.typeHint === 'book';
      const wantSongs = intent.typeHint === 'any' || intent.typeHint === 'song';

      const [seriesRes, booksRes, songsRes] = await Promise.all([
        wantSeries
          ? admin
              .from('series')
              .select('id,title,synopsis,genre,language,cover_url,content_type,views')
              .eq('status', 'published')
              .order('views', { ascending: false })
              .limit(300)
          : Promise.resolve({ data: [], error: null }),
        wantBooks
          ? admin
              .from('books')
              .select('id,title,description,cover_image_url,category,genre_tags,pricing_type,views')
              .eq('status', 'published')
              .order('views', { ascending: false })
              .limit(200)
          : Promise.resolve({ data: [], error: null }),
        wantSongs
          ? admin
              .from('songs')
              .select('id,title,genre,language,cover_url,views')
              .eq('status', 'published')
              .order('views', { ascending: false })
              .limit(200)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (seriesRes.error || booksRes.error || songsRes.error) {
        return NextResponse.json({ error: 'Could not load the catalog.' }, { status: 500 });
      }

      const items: PoolItem[] = [];
      for (const s of (seriesRes.data ?? []) as Record<string, unknown>[]) {
        if (intent.typeHint === 'novel' && s.content_type !== 'novel') continue;
        if (intent.typeHint === 'manga' && s.content_type !== 'mangal') continue;
        items.push({
          card: {
            type: 'series', id: String(s.id), title: String(s.title ?? 'Untitled'),
            subtitle: s.genre ? `${s.genre}${s.content_type === 'novel' ? ' · Novel' : ''}` : (s.content_type === 'novel' ? 'Novel' : 'Manga'),
            cover: (s.cover_url as string) ?? null,
            href: `/WebMangal/series/${s.id}`,
            badge: s.content_type === 'novel' ? 'NOVEL' : null,
          },
          genreLabels: [String(s.genre ?? '').toLowerCase()],
          desc: String(s.synopsis ?? ''),
          views: Number(s.views ?? 0),
        });
      }
      for (const b of (booksRes.data ?? []) as Record<string, unknown>[]) {
        items.push({
          card: {
            type: 'book', id: String(b.id), title: String(b.title ?? 'Untitled'),
            subtitle: b.category ? `Book · ${b.category}` : 'Book',
            cover: (b.cover_image_url as string) ?? null,
            href: `/WebMangal/books/${b.id}`,
            badge: b.pricing_type === 'PAID' ? 'PAID' : null,
          },
          genreLabels: (Array.isArray(b.genre_tags) ? (b.genre_tags as string[]) : []).map((t) => String(t).toLowerCase()),
          desc: String(b.description ?? ''),
          views: Number(b.views ?? 0),
        });
      }
      for (const s of (songsRes.data ?? []) as Record<string, unknown>[]) {
        items.push({
          card: {
            type: 'song', id: String(s.id), title: String(s.title ?? 'Untitled'),
            subtitle: s.genre ? `Song · ${s.genre}` : 'Song',
            cover: (s.cover_url as string) ?? null,
            href: `/WebMangal/songs/${s.id}`,
            badge: null,
          },
          genreLabels: [String(s.genre ?? '').toLowerCase()],
          desc: '',
          views: Number(s.views ?? 0),
        });
      }

      const results = scorePool(items, intent).map((x) => x.card);
      return NextResponse.json({ results }, { headers: { 'Cache-Control': 'no-store' } });
    }

    // ── KaTube: videos (Shorts split on the real is_short column) +
    // channels (creator_profiles). When shortOnly is unspecified, both
    // Shorts and full videos compete in one pool. ──
    let videosQuery = admin
      .from('videos')
      .select('id,title,is_short,views,likes,category');
    if (intent.shortOnly !== null) videosQuery = videosQuery.eq('is_short', intent.shortOnly);
    const videosPromise =
      intent.typeHint === 'channel'
        ? Promise.resolve({ data: [], error: null })
        : videosQuery.order('views', { ascending: false }).limit(intent.shortOnly === true ? 400 : 300);
    const channelsPromise =
      intent.typeHint === 'short' || intent.typeHint === 'video'
        ? Promise.resolve({ data: [], error: null })
        : admin
            .from('creator_profiles')
            .select('user_id,username,avatar_url')
            .limit(200);

    const [videosRes, channelsRes] = await Promise.all([videosPromise, channelsPromise]);
    if (videosRes.error || channelsRes.error) {
      return NextResponse.json({ error: 'Could not load the catalog.' }, { status: 500 });
    }

    const items: PoolItem[] = [];
    for (const v of (videosRes.data ?? []) as Record<string, unknown>[]) {
      items.push({
        card: {
          type: 'video', id: String(v.id), title: String(v.title ?? 'Untitled'),
          subtitle: v.is_short ? (v.category ? `Short · ${v.category}` : 'Short') : (v.category ? `Video · ${v.category}` : 'Video'),
          cover: null,
          href: v.is_short ? `/katube/shorts/${v.id}` : `/katube/watch/${v.id}`,
          badge: v.is_short ? 'SHORT' : null,
        },
        genreLabels: [String(v.category ?? '').toLowerCase()],
        desc: '',
        views: Number(v.views ?? 0),
      });
    }
    for (const c of (channelsRes.data ?? []) as Record<string, unknown>[]) {
      items.push({
        card: {
          type: 'channel', id: String(c.user_id), title: String(c.username ?? 'creator'),
          subtitle: 'KaTube channel', cover: (c.avatar_url as string) ?? null,
          href: `/katube/channel/${c.username}`, badge: null,
        },
        genreLabels: [],
        desc: `channel by ${String(c.username ?? '')}`,
        views: 0,
      });
    }

    const results = scorePool(items, intent).map((x) => x.card);
    return NextResponse.json({ results }, { headers: { 'Cache-Control': 'no-store' } });

  } catch (err) {
    console.error('[chat-discovery] failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Discovery matcher failure.' }, { status: 500 });
  }
}

