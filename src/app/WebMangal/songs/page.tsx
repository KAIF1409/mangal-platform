'use client';

// §85 — Songs browse/discovery page. Standalone entry point for the new
// "Songs" content type rather than rewiring the home page's content_type
// toggle (that's hardwired to the `series` table today — see CONTEXT.md
// §85 "Not done yet" note). Same grid/search/genre pattern as the home
// page's "All Series" section and /WebMangal/library, but reading from
// `songs` directly.

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import type { User } from '@supabase/supabase-js';
import ProfileMenu from '../../components/shared/ProfileMenu';
import Navbar from '../../components/shared/Navbar';
import Footer from '../../components/shared/Footer';
import SongCard, { type SongCardData } from '../../components/webmangal/SongCard';
import { hasCreatorAccess, isDeveloperRole } from '../../lib/auth/roles';
import { Music, Search, Wrench, Trophy, Bell, Bookmark } from 'lucide-react';

interface SongRow {
  id: string;
  title: string;
  genre: string | null;
  cover_url: string | null;
  views: number;
  blocks: unknown[];
  creator_id: string;
  linked_series_id: string | null;
}

const GENRES = ['All', 'Action', 'Romance', 'Fantasy', 'Comedy', 'Drama', 'Horror', 'Slice of Life', 'Sci-Fi', 'Thriller', 'Mythology', 'Folk Tale', 'Desi Horror', 'Street Life', 'School Life', 'Independence Era'];

const PAGE_SIZE = 24;

export default function SongsBrowsePage() {
  const [user, setUser] = useState<User | null>(null);
  const [isCreator, setIsCreator] = useState(false);
  const [isDeveloper, setIsDeveloper] = useState(false);

  const [songs, setSongs] = useState<(SongCardData & { creator_id: string })[]>([]);
  const [usernames, setUsernames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState<number | null>(null);

  const [search, setSearch] = useState('');
  const [activeGenre, setActiveGenre] = useState('All');
  const [sortBy, setSortBy] = useState<'latest' | 'views' | 'az'>('latest');

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      setUser(data.user);
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).single();
      if (hasCreatorAccess(profile?.role)) setIsCreator(true);
      setIsDeveloper(isDeveloperRole(profile?.role));
    });
  }, []);

  const fetchPage = useCallback(async (pageNum: number, reset: boolean) => {
    if (reset) setLoading(true); else setLoadingMore(true);

    let q = supabase.from('songs').select('id, title, genre, cover_url, views, blocks, creator_id, linked_series_id', pageNum === 0 ? { count: 'exact' } : undefined).eq('status', 'published');
    if (activeGenre !== 'All') q = q.eq('genre', activeGenre);
    if (search.trim()) q = q.ilike('title', `%${search.trim()}%`);
    if (sortBy === 'views') q = q.order('views', { ascending: false });
    else if (sortBy === 'az') q = q.order('title', { ascending: true });
    else q = q.order('created_at', { ascending: false });
    q = q.range(pageNum * PAGE_SIZE, pageNum * PAGE_SIZE + PAGE_SIZE - 1);

    const { data, count } = await q;
    const rows = (data ?? []) as SongRow[];

    // Batch-resolve songwriter usernames + linked series titles (no N+1 —
    // same pattern as the homepage's attachChapterCounts helper).
    const creatorIds = Array.from(new Set(rows.map(r => r.creator_id)));
    const linkedSeriesIds = Array.from(new Set(rows.map(r => r.linked_series_id).filter(Boolean))) as string[];
    const [usernameRes, seriesRes] = await Promise.all([
      creatorIds.length > 0
        ? supabase.from('creator_profiles').select('user_id, username').in('user_id', creatorIds)
        : Promise.resolve({ data: [] }),
      linkedSeriesIds.length > 0
        ? supabase.from('series').select('id, title').in('id', linkedSeriesIds)
        : Promise.resolve({ data: [] }),
    ]);
    setUsernames(prev => ({ ...prev, ...Object.fromEntries((usernameRes.data ?? []).map((u: { user_id: string; username: string }) => [u.user_id, u.username])) }));
    const seriesTitleMap = Object.fromEntries((seriesRes.data ?? []).map((s: { id: string; title: string }) => [s.id, s.title]));

    const mapped = rows.map(r => ({
      id: r.id,
      title: r.title,
      genre: r.genre,
      cover_url: r.cover_url,
      views: r.views,
      block_count: Array.isArray(r.blocks) ? r.blocks.length : 0,
      linked_series_title: r.linked_series_id ? seriesTitleMap[r.linked_series_id] ?? null : null,
      creator_id: r.creator_id,
    }));

    setSongs(prev => (reset ? mapped : [...prev, ...mapped]));
    setHasMore(rows.length === PAGE_SIZE);
    if (pageNum === 0 && typeof count === 'number') setTotalCount(count);
    setLoading(false);
    setLoadingMore(false);
  }, [activeGenre, search, sortBy]);

  // Debounced re-fetch on filter change. Page index only drives which slice
  // to fetch next (handleLoadMore) — it isn't rendered, so a plain ref is
  // enough and avoids an extra state update inside this effect.
  const pageRef = useRef(0);
  useEffect(() => {
    const t = setTimeout(() => {
      pageRef.current = 0;
      fetchPage(0, true);
    }, search ? 300 : 0); // debounce search only
    return () => clearTimeout(t);
  }, [activeGenre, search, sortBy, fetchPage]);

  const handleLoadMore = () => {
    const next = pageRef.current + 1;
    pageRef.current = next;
    fetchPage(next, false);
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <Navbar
        variant="custom"
        platformName="WebMangal"
        logoSrc="/webmangal-logo.png"
        href="/"
        centerSlot={
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            {[
              { label: 'Browse', href: '/', icon: undefined },
              { label: 'Rankings', href: '/WebMangal/rankings', icon: Trophy },
              { label: 'Library', href: '/WebMangal/library', icon: Bell },
              { label: 'Bookmarks', href: '/WebMangal/bookmarks', icon: Bookmark },
            ].map(link => (
              <a key={link.label} href={link.href} style={{
                padding: '8px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                color: 'var(--text-secondary)', textDecoration: 'none',
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                transition: 'color 0.15s, background 0.15s',
              }}
                onMouseEnter={e => { (e.target as HTMLElement).style.color = 'var(--text-primary)'; (e.target as HTMLElement).style.background = 'var(--border-color)'; }}
                onMouseLeave={e => { (e.target as HTMLElement).style.color = 'var(--text-secondary)'; (e.target as HTMLElement).style.background = 'transparent'; }}
              >{link.icon && <link.icon size={13} strokeWidth={2} />}{link.label}</a>
            ))}
          </div>
        }
        rightSlot={
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {isCreator && (
              <a href="/dashboard" style={{
                padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
                background: 'rgba(217,119,6,0.15)', border: '1px solid rgba(217,119,6,0.3)',
                color: '#d97706', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '5px',
              }}><Wrench size={12} strokeWidth={2} /> Studio</a>
            )}
            <Link href="/WebMangal/songs/upload" style={{
              padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
              background: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
              color: '#fff', textDecoration: 'none', whiteSpace: 'nowrap',
            }}>+ Write a Song</Link>
            {user && <ProfileMenu user={user} isCreator={isCreator} isDeveloper={isDeveloper} />}
          </div>
        }
      />

      {/* ── HEADER ── */}
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '40px 24px 20px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 900, margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Music size={24} strokeWidth={2} color="#a78bfa" /> Songs
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 24px' }}>
          {loading ? '' : `${totalCount ?? songs.length} songs published by the community`}
        </p>

        {/* Search */}
        <div style={{ position: 'relative', maxWidth: '420px', marginBottom: '20px' }}>
          <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex', color: 'var(--text-tertiary)' }}><Search size={15} strokeWidth={2} /></span>
          <input
            type="text"
            placeholder="Search songs..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', padding: '11px 14px 11px 40px', borderRadius: '10px',
              background: 'var(--bg-card)', border: '1px solid var(--border-color)',
              color: 'var(--text-primary)', fontSize: '13px', outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Genre filter */}
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '8px', scrollbarWidth: 'none' }}>
          {GENRES.map(g => (
            <button key={g} onClick={() => setActiveGenre(g)} style={{
              padding: '7px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer',
              fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0,
              background: activeGenre === g ? 'linear-gradient(135deg, #7c3aed, #a78bfa)' : 'var(--bg-card)',
              color: activeGenre === g ? '#fff' : 'var(--text-tertiary)',
              transition: 'all 0.15s',
            }}>{g}</button>
          ))}
        </div>

        {/* Sort */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
          <div style={{ display: 'flex', gap: '2px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '3px' }}>
            {([
              { value: 'latest', label: 'Latest' },
              { value: 'views', label: 'Most Viewed' },
              { value: 'az', label: 'A–Z' },
            ] as const).map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setSortBy(value)}
                style={{
                  padding: '5px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                  background: sortBy === value ? 'var(--border-color)' : 'transparent',
                  color: sortBy === value ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap',
                }}
              >{label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ── GRID ── */}
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 24px 60px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px', color: 'var(--text-muted)' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}><Music size={32} strokeWidth={1.5} /></div>
            <div>Loading songs...</div>
          </div>
        ) : songs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px', background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}><Music size={48} strokeWidth={1.5} color="var(--text-tertiary)" /></div>
            <p style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>No songs yet</p>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 24px' }}>Be the first to write a song inspired by a series.</p>
            <Link href="/WebMangal/songs/upload" style={{ padding: '10px 24px', borderRadius: '10px', background: 'linear-gradient(135deg, #7c3aed, #a78bfa)', color: '#fff', textDecoration: 'none', fontSize: '13px', fontWeight: 700 }}>
              Write a Song
            </Link>
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 200px))', gap: '16px' }}>
              {songs.map(s => (
                <SongCard key={s.id} song={s} creatorUsername={usernames[s.creator_id]} />
              ))}
            </div>
            {hasMore && (
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '28px' }}>
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  style={{
                    padding: '10px 28px', borderRadius: '10px', border: '1px solid var(--border-color)',
                    background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '13px', fontWeight: 700,
                    cursor: loadingMore ? 'default' : 'pointer', opacity: loadingMore ? 0.6 : 1,
                  }}
                >{loadingMore ? 'Loading...' : 'Load More'}</button>
              </div>
            )}
          </>
        )}
      </div>

      <Footer />
    </div>
  );
}
