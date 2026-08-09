'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { supabase } from '../lib/supabase';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

interface Series {
  id: string;
  title: string;
  genre: string | null;
  cover_url: string | null;
  content_type: 'mangal' | 'novel';
  views: number;
  avg_rating?: number | null;
  rating_count?: number | null;
}

type Tab = 'trending' | 'views' | 'rating';
type ContentTypeFilter = 'all' | 'mangal' | 'novel';

const TABS: { value: Tab; label: string; stat: string }[] = [
  { value: 'trending', label: '🔥 Trending', stat: 'views this week' },
  { value: 'views', label: '👁 Most Read', stat: 'all-time views' },
  { value: 'rating', label: '⭐ Top Rated', stat: 'avg rating' },
];

const CONTENT_TABS: { value: ContentTypeFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'mangal', label: 'Comics' },
  { value: 'novel', label: 'Novels' },
];

export default function RankingsPage() {
  const [tab, setTab] = useState<Tab>('trending');
  const [contentType, setContentType] = useState<ContentTypeFilter>('all');
  const [trending, setTrending] = useState<Series[]>([]);
  const [mostViewed, setMostViewed] = useState<Series[]>([]);
  const [topRated, setTopRated] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      // Trending — reuse the same RPC the homepage uses, wider window + higher
      // limit since this page's whole job is depth, not a homepage teaser.
      const trendingPromise = supabase
        .rpc('trending_series', { days_back: 7, result_limit: 30 })
        .then(async ({ data: rows }) => {
          if (!rows || rows.length === 0) return [];
          const ids = rows.map((r: { series_id: string }) => r.series_id);
          const { data } = await supabase.from('series').select('*').in('id', ids).eq('status', 'published');
          if (!data) return [];
          const order = new Map<string, number>(ids.map((id: string, i: number) => [id, i]));
          return [...data].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)) as Series[];
        });

      const viewsPromise = supabase
        .from('series')
        .select('*')
        .eq('status', 'published')
        .order('views', { ascending: false })
        .limit(30)
        .then(({ data }) => (data ?? []) as Series[]);

      const ratingPromise = supabase
        .from('series')
        .select('*')
        .eq('status', 'published')
        .gt('rating_count', 0)
        .order('avg_rating', { ascending: false })
        .limit(30)
        .then(({ data }) => (data ?? []) as Series[]);

      const [t, v, r] = await Promise.all([trendingPromise, viewsPromise, ratingPromise]);
      setTrending(t);
      setMostViewed(v);
      setTopRated(r);
      setLoading(false);
    };
    load();
  }, []);

  const listFor = (t: Tab) => (t === 'trending' ? trending : t === 'views' ? mostViewed : topRated);
  const filtered = listFor(tab).filter(s => contentType === 'all' || s.content_type === contentType);
  const activeMeta = TABS.find(t => t.value === tab)!;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <Navbar
        variant="custom"
        centerSlot={
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            {[
              { label: 'Browse', href: '/' },
              { label: '🏆 Rankings', href: '/rankings' },
              { label: '🔍 Search', href: '/search' },
              { label: 'Tags', href: '/tags' },
            ].map(link => (
              <a key={link.label} href={link.href} style={{
                padding: '8px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                color: link.href === '/rankings' ? '#d97706' : 'var(--text-secondary)', textDecoration: 'none',
              }}>{link.label}</a>
            ))}
          </div>
        }
      />

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '40px 24px 80px' }}>
        <h1 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 900, margin: '0 0 6px', letterSpacing: '-0.02em' }}>
          Rankings
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--text-tertiary)', margin: '0 0 28px' }}>
          The most read, most talked-about, and highest-rated stories on MANGAL right now.
        </p>

        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              style={{
                padding: '10px 18px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                cursor: 'pointer', border: `1px solid ${tab === t.value ? '#d97706' : 'var(--border-color)'}`,
                background: tab === t.value ? 'rgba(217,119,6,0.12)' : 'var(--bg-card)',
                color: tab === t.value ? '#d97706' : 'var(--text-secondary)',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content type filter */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '28px' }}>
          {CONTENT_TABS.map(c => (
            <button
              key={c.value}
              onClick={() => setContentType(c.value)}
              style={{
                padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                cursor: 'pointer', border: `1px solid ${contentType === c.value ? 'var(--text-muted)' : 'var(--border-color)'}`,
                background: contentType === c.value ? 'var(--border-color)' : 'transparent',
                color: contentType === c.value ? 'var(--text-primary)' : 'var(--text-tertiary)',
              }}
            >
              {c.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-faint)' }}>Loading rankings...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-faint)' }}>
            Not enough data yet for this ranking.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {filtered.map((s, i) => (
              <RankRow key={s.id} series={s} rank={i + 1} statLabel={activeMeta.stat} tab={tab} />
            ))}
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}

function RankRow({ series, rank, statLabel, tab }: { series: Series; rank: number; statLabel: string; tab: Tab }) {
  const [hovered, setHovered] = useState(false);
  const statValue =
    tab === 'rating'
      ? `★ ${(series.avg_rating ?? 0).toFixed(1)} (${series.rating_count ?? 0})`
      : (series.views ?? 0).toLocaleString('en-IN');

  const rankColor = rank === 1 ? '#d97706' : rank === 2 ? 'var(--text-secondary)' : rank === 3 ? '#92400e' : 'var(--text-faint)';

  return (
    <a
      href={`/series/${series.id}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: '16px', padding: '12px 10px',
        textDecoration: 'none', borderBottom: '1px solid #14141c',
        background: hovered ? 'var(--bg-card)' : 'transparent', borderRadius: '8px',
        transition: 'background 0.15s',
      }}
    >
      <div style={{
        width: '28px', flexShrink: 0, textAlign: 'center', fontSize: rank <= 3 ? '20px' : '15px',
        fontWeight: 900, fontStyle: 'italic', color: rankColor,
      }}>
        {rank}
      </div>

      <div style={{ width: '46px', height: '62px', flexShrink: 0, borderRadius: '6px', overflow: 'hidden', position: 'relative', background: '#1a0a0a' }}>
        {series.cover_url ? (
          <Image src={series.cover_url} alt={series.title} fill sizes="46px" style={{ objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>📜</div>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '14px', fontWeight: 700, color: hovered ? '#d97706' : 'var(--text-primary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '4px',
          transition: 'color 0.15s',
        }}>
          {series.title}
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <span style={{
            fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', color: '#fff',
            background: series.content_type === 'novel' ? 'rgba(124,58,237,0.9)' : 'rgba(127,29,29,0.9)',
            padding: '2px 6px', borderRadius: '4px',
          }}>
            {series.content_type === 'novel' ? 'Novel' : 'Comic'}
          </span>
          {series.genre && (
            <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{series.genre}</span>
          )}
        </div>
      </div>

      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-soft)' }}>{statValue}</div>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{statLabel}</div>
      </div>
    </a>
  );
}
