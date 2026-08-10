'use client';

import { useState, useEffect, use } from 'react';
import Image from 'next/image';
import { supabase } from '../../lib/supabase';
import Link from 'next/link';

interface Series {
  id: string;
  title: string;
  genre: string | null;
  cover_url: string | null;
  content_type: 'mangal' | 'novel';
  reading_mode: 'scroll' | 'page';
  views: number;
}
interface SeriesTagRow extends Series {
  status: string;
}

function formatViews(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

function TagCard({ series }: { series: Series }) {
  const [hovered, setHovered] = useState(false);
  return (
    <a href={`/series/${series.id}`} style={{ textDecoration: 'none' }}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <div style={{
        borderRadius: '12px', overflow: 'hidden',
        background: 'var(--bg-card)', border: `1px solid ${hovered ? '#d97706' : 'var(--border-color)'}`,
        transition: 'border-color 0.2s, transform 0.2s',
        transform: hovered ? 'translateY(-3px)' : 'none',
      }}>
        <div style={{ position: 'relative', aspectRatio: '3/4', background: '#1a0a0a' }}>
          {series.cover_url ? (
            <Image src={series.cover_url} alt={series.title} fill sizes="(max-width: 768px) 45vw, 200px" style={{ objectFit: 'cover' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '36px' }}>📜</div>
          )}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%)',
            padding: '20px 8px 6px',
          }}>
            <span style={{
              fontSize: '9px', fontWeight: 700, color: '#fff',
              background: series.content_type === 'novel' ? 'rgba(109,40,217,0.9)' : 'rgba(127,29,29,0.9)',
              padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase',
            }}>
              {series.content_type === 'novel' ? '📕 Novel' : '📖 Mangal'}
            </span>
          </div>
        </div>
        <div style={{ padding: '10px 10px 12px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3, marginBottom: '4px',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {series.title}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {series.genre ? <div style={{ fontSize: '10px', color: '#d97706' }}>{series.genre}</div> : <span />}
            <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>👁 {formatViews(series.views ?? 0)}</span>
          </div>
        </div>
      </div>
    </a>
  );
}

export default function TagPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [tagName, setTagName] = useState<string | null>(null);
  const [series, setSeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: tag } = await supabase.from('tags').select('id, name').eq('slug', slug).single();
      if (!tag) { setNotFound(true); setLoading(false); return; }
      setTagName(tag.name);

      const { data: rows } = await supabase
        .from('series_tags')
        .select('series(id, title, genre, cover_url, content_type, reading_mode, views, status)')
        .eq('tag_id', tag.id);

      if (rows) {
        const list = rows
          .map((r: { series: SeriesTagRow[] | SeriesTagRow | null }) => (Array.isArray(r.series) ? r.series[0] : r.series))
          .filter((s): s is SeriesTagRow => !!s && s.status === 'published');
        setSeries(list);
      }
      setLoading(false);
    };
    load();
  }, [slug]);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '48px 24px' }}>
        <Link href="/tags" style={{ fontSize: '12px', color: 'var(--text-tertiary)', textDecoration: 'none' }}>← All Tags</Link>

        {loading ? (
          <div style={{ padding: '80px 0', textAlign: 'center', color: 'var(--text-faint)' }}>Loading...</div>
        ) : notFound ? (
          <div style={{ padding: '80px 0', textAlign: 'center', color: 'var(--text-faint)' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔍</div>
            <div style={{ fontSize: '14px' }}>Tag not found.</div>
          </div>
        ) : (
          <>
            <h1 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 900, margin: '12px 0 8px', letterSpacing: '-0.02em' }}>
              #{tagName}
            </h1>
            <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', margin: '0 0 32px' }}>
              {series.length} {series.length === 1 ? 'series' : 'series'} tagged #{tagName}
            </p>

            {series.length === 0 ? (
              <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-faint)' }}>
                <div style={{ fontSize: '32px', marginBottom: '12px' }}>📖</div>
                <div style={{ fontSize: '14px' }}>No series with this tag yet.</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 200px))', gap: '16px' }}>
                {series.map(s => <TagCard key={s.id} series={s} />)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
