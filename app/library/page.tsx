'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface FollowedSeries {
  id: string;
  title: string;
  synopsis: string;
  genre: string | null;
  language: string | null;
  cover_url: string | null;
  reading_mode: 'scroll' | 'page';
  status: string;
  followed_at: string;
  latest_chapter_number: number | null;
  latest_chapter_id: string | null;
  chapter_count: number;
}

export default function LibraryPage() {
  const [series, setSeries] = useState<FollowedSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const load = async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { window.location.href = '/login'; return; }
      setUser(u.user);

      // Get all series this reader follows, with series details
      const { data: follows } = await supabase
        .from('follows')
        .select('created_at, series(id, title, synopsis, genre, language, cover_url, reading_mode, status)')
        .eq('reader_id', u.user.id)
        .order('created_at', { ascending: false });

      if (!follows || follows.length === 0) { setLoading(false); return; }

      // For each followed series, fetch chapter count + latest chapter
      const enriched = await Promise.all(
        follows.map(async (f: any) => {
          const s = Array.isArray(f.series) ? f.series[0] : f.series;
          if (!s) return null;

          const { data: chapters } = await supabase
            .from('chapters')
            .select('id, chapter_number')
            .eq('series_id', s.id)
            .order('chapter_number', { ascending: false })
            .limit(1);

          const latest = chapters?.[0] ?? null;

          const { count } = await supabase
            .from('chapters')
            .select('id', { count: 'exact', head: true })
            .eq('series_id', s.id);

          return {
            ...s,
            followed_at: f.created_at,
            latest_chapter_number: latest?.chapter_number ?? null,
            latest_chapter_id: latest?.id ?? null,
            chapter_count: count ?? 0,
          } as FollowedSeries;
        })
      );

      setSeries(enriched.filter(Boolean) as FollowedSeries[]);
      setLoading(false);
    };
    load();
  }, []);

  const unfollow = async (seriesId: string) => {
    if (!user) return;
    await supabase.from('follows').delete().eq('reader_id', user.id).eq('series_id', seriesId);
    setSeries(prev => prev.filter(s => s.id !== seriesId));
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#07070a', color: '#f9fafb', fontFamily: "'Segoe UI', Arial, sans-serif" }}>

      {/* ── NAV ── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(7,7,10,0.97)', backdropFilter: 'blur(16px)',
        borderBottom: '1px solid #1a1a26',
        padding: '0 24px', height: '60px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
            <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: 'linear-gradient(135deg, #7f1d1d, #d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px' }}>🔥</div>
            <span style={{ fontWeight: 900, fontSize: '17px', color: '#fff' }}>MANGAL</span>
          </a>
          <span style={{ color: '#374151' }}>›</span>
          <span style={{ fontSize: '13px', color: '#6b7280' }}>My Library</span>
        </div>
        <a href="/" style={{ padding: '7px 14px', borderRadius: '8px', fontSize: '12px', color: '#6b7280', textDecoration: 'none', border: '1px solid #1a1a26' }}>Browse</a>
      </nav>

      {/* ── HEADER ── */}
      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '40px 24px 24px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 900, margin: '0 0 6px' }}>🔔 My Library</h1>
        <p style={{ fontSize: '13px', color: '#4b5563', margin: 0 }}>
          {loading ? '' : series.length === 0 ? 'No series followed yet.' : `${series.length} series followed`}
        </p>
      </div>

      {/* ── CONTENT ── */}
      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '0 24px 60px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px', color: '#4b5563' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>📚</div>
            <div>Loading your library...</div>
          </div>
        ) : series.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px', background: '#0d0d14', borderRadius: '16px', border: '1px solid #1a1a26' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📭</div>
            <p style={{ fontSize: '16px', fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>Your library is empty</p>
            <p style={{ fontSize: '13px', color: '#4b5563', margin: '0 0 24px' }}>Follow a series to get notified when new chapters drop</p>
            <a href="/" style={{ padding: '10px 24px', borderRadius: '10px', background: 'linear-gradient(135deg, #7f1d1d, #991b1b)', color: '#fff', textDecoration: 'none', fontSize: '13px', fontWeight: 700 }}>
              Browse Series
            </a>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {series.map(s => (
              <LibraryCard key={s.id} series={s} onUnfollow={() => unfollow(s.id)} />
            ))}
          </div>
        )}
      </div>

      {/* ── FOOTER ── */}
      <footer style={{ borderTop: '1px solid #1a1a26', padding: '32px 24px', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center', marginBottom: '12px' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'linear-gradient(135deg, #7f1d1d, #d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>🔥</div>
          <span style={{ fontWeight: 900, fontSize: '16px', color: '#fff' }}>MANGAL</span>
        </div>
        <p style={{ fontSize: '12px', color: '#374151', margin: '0 0 14px' }}>Made with ❤️ in India · Free to read, forever.</p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', flexWrap: 'wrap' }}>
          {[
            { label: 'Privacy Policy', href: '/privacy' },
            { label: 'Terms of Service', href: '/terms' },
            { label: 'Grievance Officer', href: '/grievance' },
          ].map(link => (
            <a key={link.href} href={link.href} style={{ fontSize: '11px', color: '#4b5563', textDecoration: 'none' }}>
              {link.label}
            </a>
          ))}
        </div>
      </footer>
    </div>
  );
}

function LibraryCard({ series, onUnfollow }: { series: FollowedSeries; onUnfollow: () => void }) {
  const [confirmUnfollow, setConfirmUnfollow] = useState(false);

  return (
    <div style={{
      display: 'flex', gap: '16px', alignItems: 'center',
      background: '#0d0d14', border: '1px solid #1a1a26',
      borderRadius: '12px', padding: '16px', transition: 'border-color 0.15s',
    }}>
      {/* Cover */}
      <a href={`/series/${series.id}`} style={{ flexShrink: 0, textDecoration: 'none' }}>
        <div style={{ width: '64px', height: '86px', borderRadius: '8px', overflow: 'hidden', background: '#1a0a0a', border: '1px solid #1a1a26' }}>
          {series.cover_url ? (
            <img src={series.cover_url} alt={series.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>📜</div>
          )}
        </div>
      </a>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <a href={`/series/${series.id}`} style={{ textDecoration: 'none' }}>
          <div style={{ fontSize: '15px', fontWeight: 800, color: '#fff', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {series.title}
          </div>
        </a>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
          {series.genre && (
            <span style={{ fontSize: '9px', fontWeight: 700, color: '#d97706', background: 'rgba(120,53,15,0.25)', border: '1px solid rgba(180,83,9,0.4)', padding: '2px 8px', borderRadius: '20px', textTransform: 'uppercase' }}>
              {series.genre}
            </span>
          )}
          <span style={{ fontSize: '9px', fontWeight: 700, color: '#6b7280', background: '#08080c', border: '1px solid #1a1a26', padding: '2px 8px', borderRadius: '20px' }}>
            {series.chapter_count} ch
          </span>
        </div>
        <p style={{ fontSize: '12px', color: '#4b5563', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {series.synopsis}
        </p>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0, alignItems: 'flex-end' }}>
        {series.latest_chapter_id && (
          <a href={`/read/${series.latest_chapter_id}`} style={{
            padding: '8px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
            background: 'linear-gradient(135deg, #7f1d1d, #991b1b)',
            color: '#fff', textDecoration: 'none', whiteSpace: 'nowrap',
          }}>
            ▶ Ch.{series.latest_chapter_number}
          </a>
        )}
        {confirmUnfollow ? (
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={onUnfollow}
              style={{ padding: '6px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444', cursor: 'pointer' }}
            >
              Unfollow
            </button>
            <button
              onClick={() => setConfirmUnfollow(false)}
              style={{ padding: '6px 10px', borderRadius: '6px', fontSize: '11px', background: '#08080c', border: '1px solid #1a1a26', color: '#6b7280', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmUnfollow(true)}
            style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, background: 'transparent', border: '1px solid #1a1a26', color: '#4b5563', cursor: 'pointer' }}
          >
            🔕 Unfollow
          </button>
        )}
      </div>
    </div>
  );
}