'use client';

import { useState, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { supabase } from '../../lib/supabase';
import type { User } from '@supabase/supabase-js';
import ProfileMenu from '../../components/shared/ProfileMenu';
import Navbar from '../../components/shared/Navbar';
import Footer from '../../components/shared/Footer';
import { hasCreatorAccess, isDeveloperRole } from '../../lib/auth/roles';
import Link from 'next/link';

import { setPostLoginRedirect } from '../../lib/auth/authRedirect';
import { Trophy, Search, Bookmark, Wrench, Bell, BookOpenText, Inbox, ScrollText, BellOff, Music, type LucideIcon } from 'lucide-react';
import SongCard, { type SongCardData } from '../../components/webmangal/SongCard';
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

interface FollowSeriesRow {
  id: string;
  title: string;
  synopsis: string;
  genre: string | null;
  language: string | null;
  cover_url: string | null;
  reading_mode: 'scroll' | 'page';
  status: string;
}
interface FollowRow {
  created_at: string;
  series: FollowSeriesRow | FollowSeriesRow[] | null;
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
  // §85 continued — followed songs, separate from the series list above
  // (song_follows is its own table, not part of `follows`/series content
  // type). Own loading flag so a slow songs query never blocks the
  // existing series library from rendering.
  const [followedSongs, setFollowedSongs] = useState<(SongCardData & { creator_id: string })[]>([]);
  const [songUsernames, setSongUsernames] = useState<Record<string, string>>({});
  const [songsLoading, setSongsLoading] = useState(true);

  useEffect(() => {
    const loadSongs = async (readerId: string) => {
      const { data: followRows } = await supabase
        .from('song_follows')
        .select('created_at, songs(id, title, genre, cover_url, views, blocks, creator_id, linked_series_id)')
        .eq('reader_id', readerId)
        .order('created_at', { ascending: false });
      const songs = (followRows ?? [])
        .map(r => (Array.isArray(r.songs) ? r.songs[0] : r.songs))
        .filter((s): s is NonNullable<typeof s> => !!s);
      if (songs.length === 0) { setSongsLoading(false); return; }

      const creatorIds = Array.from(new Set(songs.map(s => s.creator_id)));
      const linkedSeriesIds = Array.from(new Set(songs.map(s => s.linked_series_id).filter(Boolean))) as string[];
      const [usernameRes, seriesRes] = await Promise.all([
        supabase.from('creator_profiles').select('user_id, username').in('user_id', creatorIds),
        linkedSeriesIds.length > 0
          ? supabase.from('series').select('id, title').in('id', linkedSeriesIds)
          : Promise.resolve({ data: [] as { id: string; title: string }[] }),
      ]);
      setSongUsernames(Object.fromEntries((usernameRes.data ?? []).map(u => [u.user_id, u.username])));
      const seriesTitleMap = Object.fromEntries((seriesRes.data ?? []).map(s => [s.id, s.title]));

      setFollowedSongs(songs.map(s => ({
        id: s.id, title: s.title, genre: s.genre, cover_url: s.cover_url, views: s.views,
        block_count: Array.isArray(s.blocks) ? s.blocks.length : 0,
        linked_series_title: s.linked_series_id ? seriesTitleMap[s.linked_series_id] ?? null : null,
        creator_id: s.creator_id,
      })));
      setSongsLoading(false);
    };
    supabase.auth.getUser().then(({ data }) => { if (data.user) loadSongs(data.user.id); else setSongsLoading(false); });
  }, []);

  useEffect(() => {
    const load = async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { setPostLoginRedirect(window.location.pathname); window.location.href = '/login'; return; }
      setUser(u.user);

      // Perf fix — profile role and the follows list only depend on
      // u.user.id, not on each other, so fetch them together.
      const [profileRes, followsRes] = await Promise.all([
        supabase.from('profiles').select('role').eq('id', u.user.id).single(),
        supabase
          .from('follows')
          .select('created_at, series(id, title, synopsis, genre, language, cover_url, reading_mode, status)')
          .eq('reader_id', u.user.id)
          .order('created_at', { ascending: false }),
      ]);
      if (hasCreatorAccess(profileRes.data?.role)) setIsCreator(true);
      setIsDeveloper(isDeveloperRole(profileRes.data?.role));

      const follows = followsRes.data;
      if (!follows || follows.length === 0) { setLoading(false); return; }

      const seriesIds = follows
        .map((f: FollowRow) => (Array.isArray(f.series) ? f.series[0] : f.series)?.id)
        .filter(Boolean) as string[];

      // Perf fix — this used to fire 2 queries (latest chapter + count) per
      // followed series, i.e. N+1: a library of 30 followed series meant 60
      // round trips. One batched query for every series' published chapters
      // at once, then compute latest/count client-side — same pattern
      // already used on /WebMangal/bookmarks.
      const { data: allChapters } = await supabase
        .from('chapters')
        .select('id, series_id, chapter_number, created_at')
        .in('series_id', seriesIds)
        .eq('is_draft', false)
        .or(`scheduled_at.is.null,scheduled_at.lte.${new Date().toISOString()}`)
        .order('chapter_number', { ascending: false });

      const latestMap: Record<string, { id: string; chapter_number: number; created_at: string }> = {};
      const countMap: Record<string, number> = {};
      (allChapters ?? []).forEach((ch: { id: string; series_id: string; chapter_number: number; created_at: string }) => {
        if (!latestMap[ch.series_id]) latestMap[ch.series_id] = ch;
        countMap[ch.series_id] = (countMap[ch.series_id] ?? 0) + 1;
      });

      const enriched = follows.map((f: FollowRow) => {
        const s = Array.isArray(f.series) ? f.series[0] : f.series;
        if (!s) return null;
        const latest = latestMap[s.id] ?? null;
        return {
          ...s,
          followed_at: f.created_at,
          latest_chapter_number: latest?.chapter_number ?? null,
          latest_chapter_id: latest?.id ?? null,
          latest_chapter_at: latest?.created_at ?? null,
          chapter_count: countMap[s.id] ?? 0,
        } as FollowedSeries;
      });

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
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', }}>

      {/* Mobile pass (§13 sweep): nav itself is already handled globally by
          the shared Navbar (.mangal-shared-nav-center scroll-strip). What's
          left here is page-local — the header's sort dropdown wrapping onto
          its own line under the title on narrow phones (flexWrap already
          did this, just tightening padding), and the LibraryCard row, which
          was a fixed-width flex row (cover + info + actions all side by
          side) that got too tight under ~480px: genre/chapter-count pills
          and the synopsis line started colliding with the action buttons.
          Under 480px the card switches to a 2-row layout — cover+info on
          top, actions (read button + unfollow) full-width below — via
          .mangal-lib-card-actions switching flex-direction and width. */}
      <style>{`
        @media (max-width: 640px) {
          .mangal-lib-header { padding: 28px 16px 16px !important; }
          .mangal-lib-content { padding: 0 16px 48px !important; }
        }
        @media (max-width: 480px) {
          .mangal-lib-card { flex-wrap: wrap; padding: 12px !important; }
          .mangal-lib-card-info { flex: 1 1 100%; order: 2; min-width: 0; }
          .mangal-lib-card-cover { order: 1; }
          .mangal-lib-card-actions {
            order: 3; flex-direction: row !important; width: 100%;
            align-items: center !important; justify-content: space-between !important;
            margin-top: 4px;
          }
        }
      `}</style>

      {/* ── NAV (shared component) ── */}
      <Navbar
        variant="custom"
        platformName="WebMangal"
        logoSrc="/webmangal-logo.png"
        href="/WebMangal"
        centerSlot={
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            {[
              { label: 'Browse', href: '/WebMangal', icon: null as LucideIcon | null },
              { label: 'Rankings', href: '/WebMangal/rankings', icon: Trophy },
              { label: 'Search', href: '/WebMangal/search', icon: Search },
              { label: 'Bookmarks', href: '/WebMangal/bookmarks', icon: Bookmark },
            ].map(link => (
              <a key={link.label} href={link.href} style={{
                padding: '8px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                color: 'var(--text-secondary)', textDecoration: 'none',
                transition: 'color 0.15s, background 0.15s',
                display: 'inline-flex', alignItems: 'center', gap: '6px',
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
            {user && <ProfileMenu user={user} isCreator={isCreator} isDeveloper={isDeveloper} />}
          </div>
        }
      />

      {/* ── HEADER ── */}
      <div className="mangal-lib-header" style={{ maxWidth: '1000px', margin: '0 auto', padding: '40px 24px 20px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: 900, margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: '10px' }}><Bell size={24} strokeWidth={2} /> My Library</h1>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
              {loading ? '' : series.length === 0 ? 'No series followed yet.' : `${series.length} series followed`}
            </p>
          </div>

          {!loading && series.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 600 }}>Sort:</span>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as LibrarySortOption)}
                style={{
                  padding: '9px 12px', borderRadius: '8px', background: 'var(--bg-card)',
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
      <div className="mangal-lib-content" style={{ maxWidth: '1000px', margin: '0 auto', padding: '0 24px 60px' }}>
        {/* §85 continued — Followed Songs. Independent section above the
            series list; hidden entirely while loading/empty so it never
            pushes the series list down with blank space. */}
        {!songsLoading && followedSongs.length > 0 && (
          <div style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 800, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: '7px', color: 'var(--text-primary)' }}>
              <Music size={15} strokeWidth={2} color="#a78bfa" /> Followed Songs
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 170px))', gap: '14px' }}>
              {followedSongs.map(s => (
                <SongCard key={s.id} song={s} creatorUsername={songUsernames[s.creator_id]} />
              ))}
            </div>
          </div>
        )}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px', color: 'var(--text-muted)' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}><BookOpenText size={32} strokeWidth={1.5} color="var(--text-muted)" /></div>
            <div>Loading your library...</div>
          </div>
        ) : series.length === 0 ? (
          !songsLoading && followedSongs.length > 0 ? null : (
          <div style={{ textAlign: 'center', padding: '80px', background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}><Inbox size={48} strokeWidth={1.5} color="var(--text-tertiary)" /></div>
            <p style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>Your library is empty</p>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 24px' }}>Follow a series to get notified when new chapters drop</p>
            <Link href="/" style={{ padding: '10px 24px', borderRadius: '10px', background: 'linear-gradient(135deg, #f97316, #22c55e)', color: '#fff', textDecoration: 'none', fontSize: '13px', fontWeight: 700 }}>
              Browse Series
            </Link>
          </div>
          )
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
    <div className="mangal-lib-card" style={{
      display: 'flex', gap: '16px', alignItems: 'center',
      background: 'var(--bg-card)', border: '1px solid var(--border-color)',
      borderRadius: '12px', padding: '16px', transition: 'border-color 0.15s',
    }}>
      {/* Cover */}
      <a href={`/WebMangal/series/${series.id}`} className="mangal-lib-card-cover" style={{ flexShrink: 0, textDecoration: 'none' }}>
        <div style={{ width: '64px', height: '86px', borderRadius: '8px', overflow: 'hidden', background: '#1a0a0a', border: '1px solid var(--border-color)', position: 'relative' }}>
          {series.cover_url ? (
            <Image src={series.cover_url} alt={series.title} fill sizes="64px" style={{ objectFit: 'cover' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ScrollText size={24} strokeWidth={1.5} color="var(--text-tertiary)" /></div>
          )}
        </div>
      </a>

      {/* Info */}
      <div className="mangal-lib-card-info" style={{ flex: 1, minWidth: 0 }}>
        <a href={`/WebMangal/series/${series.id}`} style={{ textDecoration: 'none' }}>
          <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {series.title}
          </div>
        </a>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
          {series.genre && (
            <span style={{ fontSize: '9px', fontWeight: 700, color: '#d97706', background: 'rgba(120,53,15,0.25)', border: '1px solid rgba(180,83,9,0.4)', padding: '2px 8px', borderRadius: '20px', textTransform: 'uppercase' }}>
              {series.genre}
            </span>
          )}
          <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-tertiary)', background: 'var(--bg-input)', border: '1px solid var(--border-color)', padding: '2px 8px', borderRadius: '20px' }}>
            {series.chapter_count} ch
          </span>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {series.synopsis}
        </p>
      </div>

      {/* Actions */}
      <div className="mangal-lib-card-actions" style={{ display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0, alignItems: 'flex-end' }}>
        {series.latest_chapter_id && (
          <a href={`/WebMangal/read/${series.latest_chapter_id}`} style={{
            padding: '8px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
            background: 'linear-gradient(135deg, #f97316, #22c55e)',
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
              style={{ padding: '6px 10px', borderRadius: '6px', fontSize: '11px', background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-tertiary)', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmUnfollow(true)}
            style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-muted)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
          >
            <BellOff size={12} strokeWidth={2} /> Unfollow
          </button>
        )}
      </div>
    </div>
  );
}