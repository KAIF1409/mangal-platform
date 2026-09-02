'use client';

// app/components/feed/RecommendedForYou.tsx
//
// §135 — Reader-discovery rails for the WebMangal home feed, powered by the
// in-house cosine scorer in /api/recommendations:
//   • "Recommended For You"          (personalised / cold-start trending)
//   • "Because You Read <title>"     (nearest neighbours of latest read)
//   • "Trending in <genre>"          (top-viewed in top taste genre)
//
// Zero new dependencies: horizontal scroll-snap carousels + next/image.
// Auth is best-effort — anonymous readers simply get the trending rails.

import Link from 'next/link';
import Image from 'next/image';
import { Sparkles, TrendingUp, BookOpen } from 'lucide-react';

import { supabase } from '../../lib/supabase';
import { useCachedQuery } from '../../lib/swrCache';

interface SeriesCard {
  id: string;
  title: string;
  synopsis: string | null;
  genre: string | null;
  cover_url: string | null;
  content_type: string | null;
}

interface ApiShape {
  personalized: boolean;
  topGenre: string | null;
  forYou: SeriesCard[];
  becauseYouRead: { seed: SeriesCard | null; items: SeriesCard[] };
  trendingInGenre: SeriesCard[];
}

function Rail({
  title,
  icon,
  items,
}: {
  title: string;
  icon: React.ReactNode;
  items: SeriesCard[];
}) {
  if (items.length === 0) return null;
  return (
    <section style={{ marginBottom: '30px' }}>
      <h2
        style={{
          display: 'flex', alignItems: 'center', gap: '7px',
          fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)',
          margin: '0 0 12px', padding: '0 4px',
        }}
      >
        {icon}
        {title}
      </h2>
      <div
        className="wm-rec-rail"
        style={{
          display: 'flex', gap: '12px', overflowX: 'auto',
          scrollSnapType: 'x mandatory', paddingBottom: '6px',
        }}
      >
        {items.map((s) => (
          <Link
            key={s.id}
            href={`/WebMangal/series/${s.id}`}
            style={{
              flex: '0 0 150px', scrollSnapAlign: 'start',
              textDecoration: 'none', color: 'var(--text-primary)',
            }}
          >
            <div
              style={{
                position: 'relative', width: '150px', height: '210px',
                borderRadius: '10px', overflow: 'hidden',
                background: 'var(--bg-card)', border: '1px solid var(--border-color)',
              }}
            >
              {s.cover_url ? (
                <Image src={s.cover_url} alt={s.title} fill sizes="150px" style={{ objectFit: 'cover' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)' }}>
                  <BookOpen size={26} />
                </div>
              )}
              {s.content_type === 'novel' && (
                <span style={{ position: 'absolute', top: '6px', left: '6px', fontSize: '9px', fontWeight: 800, letterSpacing: '0.04em', color: '#fff', background: 'rgba(217,119,6,0.9)', borderRadius: '999px', padding: '2px 8px' }}>
                  NOVEL
                </span>
              )}
            </div>
            <div style={{ marginTop: '8px', fontSize: '12.5px', fontWeight: 700, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {s.title}
            </div>
            {s.genre && (
              <div style={{ marginTop: '3px', fontSize: '10.5px', fontWeight: 700, color: '#d97706' }}>
                #{s.genre}
              </div>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function RecommendedForYou() {
  // §139-B — cached at the catalog tier (personalised recs barely change
  // between visits): repeat home visits paint the rails instantly from cache
  // and revalidate in the background instead of re-scoring on every mount.
  const { data, error } = useCachedQuery<ApiShape>(
    ['wm-recommendations'],
    async () => {
      const headers: Record<string, string> = {};
      try {
        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token;
        if (token) headers.Authorization = `Bearer ${token}`;
      } catch {
        /* anonymous is fine */
      }
      const res = await fetch('/api/recommendations', { headers });
      if (!res.ok) throw new Error(`status ${res.status}`);
      return (await res.json()) as ApiShape;
    },
    'catalog',
  );

  if (error || !data) return null;

  const showBecause = data.becauseYouRead.seed && data.becauseYouRead.items.length > 0;

  return (
    <div style={{ maxWidth: '1080px', margin: '0 auto', padding: '8px 4px 24px' }}>
      <Rail
        title={data.personalized ? 'Recommended For You' : 'Popular This Week'}
        icon={<Sparkles size={15} color="#d97706" />}
        items={data.forYou}
      />
      {showBecause && (
        <Rail
          title={`Because you read “${data.becauseYouRead.seed!.title}”`}
          icon={<BookOpen size={15} color="var(--accent)" />}
          items={data.becauseYouRead.items}
        />
      )}
      {data.topGenre && (
        <Rail
          title={`Trending in ${data.topGenre}`}
          icon={<TrendingUp size={15} color="#22c55e" />}
          items={data.trendingInGenre}
        />
      )}
    </div>
  );
}
