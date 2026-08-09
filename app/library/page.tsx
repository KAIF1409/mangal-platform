'use client';

import { useState, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';
import ProfileMenu from '../components/ProfileMenu';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { hasCreatorAccess, isDeveloperRole } from '../lib/roles';
import Link from 'next/link';

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
  latest_chapter_at: string | null;
  chapter_count: number;
}

// Step 28 — sort control, matching the pattern already used on /search
type LibrarySortOption = 'recent' | 'added' | 'az' | 'chapters';
const LIBRARY_SORT_OPTIONS: { value: LibrarySortOption; label: string }[] = [
  { value: 'recent', label: 'Recently Updated' },
  { value: 'added', label: 'Recently Added' },
  { value: 'az', label: 'A–Z' },
  { value: 'chapters', label: 'Most Chapters' },
];

export default function LibraryPage() {
  const [series, setSeries] = useState<FollowedSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [isCreator, setIsCreator] = useState(false);
  const [isDeveloper, setIsDeveloper] = useState(false);
  const [sortBy, setSortBy] = useState<LibrarySortOption>('recent');

  useEffect(() => {
    const load = async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { window.location.href = '/login'; return; }
      setUser(u.user);

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', u.user.id)
        .single();
      if (hasCreatorAccess(profile?.role)) setIsCreator(true);
      setIsDeveloper(isDeveloperRole(profile?.role));

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
            .select('id, chapter_number, created_at')
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
            latest_chapter_at: latest?.created_at ?? null,
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

  // Step 28 — sort control
  const sortedSeries = useMemo(() => {
    const arr = [...series];
    switch (sortBy) {
      case 'added':
        arr.sort((a, b) => new Date(b.followed_at).getTime() - new Date(a.followed_at).getTime());
        break;
      case 'az':
        arr.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'chapters':
        arr.sort((a, b) => b.chapter_count - a.chapter_count);
        break;
      case 'recent':
      default:
        arr.sort((a, b) => {
          const at = a.latest_chapter_at ? new Date(a.latest_chapter_at).getTime() : 0;
          const bt = b.latest_chapter_at ? new Date(b.latest_chapter_at).getTime() : 0;
          return bt - at;
        });
        break;
    }
    return arr;
  }, [series, sortBy]);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#07070a', color: '#f9fafb', }}>

      {/* ── NAV (shared component) ── */}
      <Navbar
        variant="custom"
        centerSlot={
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            {[
              { label: 'Browse', href: '/' },
              { label: '🏆 Rankings', href: '/rankings' },
              { label: '🔍 Search', href: '/search' },
              { label: '🔖 Bookmarks', href: '/bookmarks' },
            ].map(link => (
              <a key={link.label} href={link.href} style={{
                padding: '8px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                color: '#9ca3af', textDecoration: 'none',
                transition: 'color 0.15s, background 0.15s',
              }}
                onMouseEnter={e => { (e.target as HTMLElement).style.color = '#fff'; (e.target as HTMLElement).style.background = '#1a1a26'; }}
                onMouseLeave={e => { (e.target as HTMLElement).style.color = '#9ca3af'; (e.target as HTMLElement).style.background = 'transparent'; }}
              >{link.label}</a>
            ))}
          </div>
        }
        rightSlot={
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {isCreator && (
              <a href="/dashboard" style={{
                padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
                background: 'rgba(217,119,6,0.15)', border: '1px solid rgba(217,119,6,0.3)',
                color: '#d97706', textDecoration: 'none',
              }}>🛠 Studio</a>
            )}
            {user && <ProfileMenu user={user} isCreator={isCreator} isDeveloper={isDeveloper} />}
          </div>
        }
      />

      {/* ── HEADER ── */}
      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '40px 24px 20px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: 900, margin: '0 0 6px' }}>🔔 My Library</h1>
            <p style={{ fontSize: '13px', color: '#4b5563', margin: 0 }}>
              {loading ? '' : series.length === 0 ? 'No series followed yet.' : `${series.length} series followed`}
            </p>
          </div>

          {!loading && series.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11px', color: '#6b7280', fontWeight: 600 }}>Sort:</span>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as LibrarySortOption)}
                style={{
                  padding: '9px 12px', borderRadius: '8px', background: '#0d0d14',
                  border: '1px solid #2a2a3a', color: '#d97706', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                }}
              >
                {LIBRARY_SORT_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          )}
        </div>
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
            <Link href="/" style={{ padding: '10px 24px', borderRadius: '10px', background: 'linear-gradient(135deg, #7f1d1d, #991b1b)', color: '#fff', textDecoration: 'none', fontSize: '13px', fontWeight: 700 }}>
              Browse Series
            </Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {sortedSeries.map(s => (
              <LibraryCard key={s.id} series={s} onUnfollow={() => unfollow(s.id)} />
            ))}
          </div>
        )}
      </div>

      {/* ── FOOTER (shared component) ── */}
      <Footer />
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
        <div style={{ width: '64px', height: '86px', borderRadius: '8px', overflow: 'hidden', background: '#1a0a0a', border: '1px solid #1a1a26', position: 'relative' }}>
          {series.cover_url ? (
            <Image src={series.cover_url} alt={series.title} fill sizes="64px" style={{ objectFit: 'cover' }} />
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