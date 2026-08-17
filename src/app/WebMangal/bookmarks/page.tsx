'use client';

import { useState, useEffect, useMemo, type ReactNode } from 'react';
import Image from 'next/image';
import { supabase } from '../../lib/supabase';
import type { User } from '@supabase/supabase-js';
import ProfileMenu from '../../components/shared/ProfileMenu';
import Navbar from '../../components/shared/Navbar';
import Footer from '../../components/shared/Footer';
import { hasCreatorAccess, isDeveloperRole } from '../../lib/auth/roles';
import Link from 'next/link';

import { setPostLoginRedirect } from '../../lib/auth/authRedirect';
import {
  BookOpen, BookText, Trophy, Search, Bell, Wrench, Bookmark, Inbox,
  ScrollText, Play, BellOff,
} from 'lucide-react';
// NOTE: "bookmarks" on MANGAL = followed series (follows table).
// This page is an alias/friendlier entry point to the same data as /library.
// No separate bookmarks table needed — follows IS the bookmark system.

interface BookmarkedSeries {
  id: string;
  title: string;
  synopsis: string;
  genre: string | null;
  cover_url: string | null;
  completion_status: string | null;
  content_type: 'mangal' | 'novel' | null;
  followed_at: string;
  chapter_count: number;
  latest_chapter_id: string | null;
  latest_chapter_number: number | null;
}

interface FollowSeriesRow {
  id: string;
  title: string;
  synopsis: string;
  genre: string | null;
  cover_url: string | null;
  completion_status: string | null;
  content_type: 'mangal' | 'novel' | null;
}
interface FollowRow {
  created_at: string;
  series: FollowSeriesRow | FollowSeriesRow[] | null;
}
interface ChapterRow {
  id: string;
  series_id: string;
  chapter_number: number;
}

const CONTENT_TYPE_OPTIONS: { value: 'all' | 'mangal' | 'novel'; label: ReactNode }[] = [
  { value: 'all', label: 'All' },
  { value: 'mangal', label: <><BookOpen size={13} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Manga</> },
  { value: 'novel', label: <><BookText size={13} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Novel</> },
];
const CONTENT_TYPE_STORAGE_KEY = 'mangal_content_type';

// Step 28 — sort control, matching /search and /library
type BookmarkSortOption = 'added' | 'az' | 'chapters';
const BOOKMARK_SORT_OPTIONS: { value: BookmarkSortOption; label: string }[] = [
  { value: 'added', label: 'Recently Bookmarked' },
  { value: 'az', label: 'A–Z' },
  { value: 'chapters', label: 'Most Chapters' },
];

export default function BookmarksPage() {
  const [series, setSeries] = useState<BookmarkedSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isCreator, setIsCreator] = useState(false);
  const [isDeveloper, setIsDeveloper] = useState(false);
  const [activeContentType, setActiveContentType] = useState<'all' | 'mangal' | 'novel'>('all');
  const [sortBy, setSortBy] = useState<BookmarkSortOption>('added');

  useEffect(() => {
    const stored = localStorage.getItem(CONTENT_TYPE_STORAGE_KEY);
    if (stored === 'mangal' || stored === 'novel' || stored === 'all') {
      setActiveContentType(stored); // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, []);

  const handleContentTypeToggle = (value: 'all' | 'mangal' | 'novel') => {
    const next = activeContentType === value ? 'all' : value;
    setActiveContentType(next);
    localStorage.setItem(CONTENT_TYPE_STORAGE_KEY, next);
  };

  useEffect(() => {
    const load = async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { setPostLoginRedirect(window.location.pathname); window.location.href = '/login'; return; }
      setUserId(u.user.id);
      setUser(u.user);

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', u.user.id)
        .single();
      if (hasCreatorAccess(profile?.role)) setIsCreator(true);
      setIsDeveloper(isDeveloperRole(profile?.role));

      const { data: follows } = await supabase
        .from('follows')
        .select('created_at, series(id, title, synopsis, genre, cover_url, completion_status, content_type)')
        .eq('reader_id', u.user.id)
        .order('created_at', { ascending: false });

      if (!follows || follows.length === 0) { setLoading(false); return; }

      const seriesIds = follows.map((f: FollowRow) => {
        const s = Array.isArray(f.series) ? f.series[0] : f.series;
        return s?.id;
      }).filter(Boolean);

      // Batch fetch latest chapters for all followed series
      // Bug fix — same gap as library/series pages: no is_draft/scheduled_at
      // filter, so a bookmarked series' "latest chapter" link/count could
      // point at content that isn't actually published yet.
      const { data: allChapters } = await supabase
        .from('chapters')
        .select('id, series_id, chapter_number')
        .in('series_id', seriesIds)
        .eq('is_draft', false)
        .or(`scheduled_at.is.null,scheduled_at.lte.${new Date().toISOString()}`)
        .order('chapter_number', { ascending: false });

      // Build a map: series_id → latest chapter
      const latestMap: Record<string, { id: string; chapter_number: number }> = {};
      const countMap: Record<string, number> = {};
      (allChapters ?? []).forEach((ch: ChapterRow) => {
        if (!latestMap[ch.series_id]) latestMap[ch.series_id] = { id: ch.id, chapter_number: ch.chapter_number };
        countMap[ch.series_id] = (countMap[ch.series_id] ?? 0) + 1;
      });

      const enriched: BookmarkedSeries[] = follows.map((f: FollowRow) => {
        const s = Array.isArray(f.series) ? f.series[0] : f.series;
        if (!s) return null;
        const latest = latestMap[s.id] ?? null;
        return {
          id: s.id,
          title: s.title,
          synopsis: s.synopsis,
          genre: s.genre,
          cover_url: s.cover_url,
          completion_status: s.completion_status,
          content_type: s.content_type ?? null,
          followed_at: f.created_at,
          chapter_count: countMap[s.id] ?? 0,
          latest_chapter_id: latest?.id ?? null,
          latest_chapter_number: latest?.chapter_number ?? null,
        };
      }).filter(Boolean) as BookmarkedSeries[];

      setSeries(enriched);
      setLoading(false);
    };
    load();
  }, []);

  const unfollow = async (seriesId: string) => {
    if (!userId) return;
    await supabase.from('follows').delete().eq('reader_id', userId).eq('series_id', seriesId);
    setSeries(prev => prev.filter(s => s.id !== seriesId));
  };

  const statusColor = (s: string | null) => {
    if (s === 'completed') return { color: '#10b981', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)' };
    if (s === 'hiatus') return { color: 'var(--text-tertiary)', bg: 'var(--bg-input)', border: 'var(--border-color)' };
    return { color: '#d97706', bg: 'rgba(120,53,15,0.25)', border: 'rgba(180,83,9,0.4)' };
  };

  const filteredSeries = useMemo(() => {
    let r = activeContentType === 'all' ? series : series.filter(s => s.content_type === activeContentType);
    r = [...r];
    switch (sortBy) {
      case 'az':
        r.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'chapters':
        r.sort((a, b) => b.chapter_count - a.chapter_count);
        break;
      case 'added':
      default:
        r.sort((a, b) => new Date(b.followed_at).getTime() - new Date(a.followed_at).getTime());
        break;
    }
    return r;
  }, [series, activeContentType, sortBy]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)', }}>
      {/* Mobile pass — same pattern as /library, /dashboard: page had 0 @media
          rules. Header padding/title, the content-type pill row (needs its own
          wrap — it didn't have one, could overflow on a ~320px phone), and the
          sort label all tighten at the standard breakpoints. The card grid
          itself (`repeat(auto-fill, minmax(280px, 1fr))`) already reflows fine
          on its own, no change needed there. */}
      <style>{`
        @media (max-width: 768px) {
          .mangal-bm-header { padding: 28px 16px 16px !important; }
          .mangal-bm-content { padding: 0 16px 60px !important; }
        }
        @media (max-width: 560px) {
          .mangal-bm-title { font-size: 22px !important; }
          .mangal-bm-pills { flex-wrap: wrap !important; }
          .mangal-bm-sort-label { display: none; }
        }
      `}</style>

      {/* NAV (shared component) */}
      <Navbar
        variant="custom"
        platformName="WebMangal"
        logoSrc="/webmangal-logo.png"
        href="/WebMangal"
        centerSlot={
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            {[
              { label: 'Browse', href: '/WebMangal', icon: null as ReactNode },
              { label: 'Rankings', href: '/WebMangal/rankings', icon: <Trophy size={13} /> },
              { label: 'Search', href: '/WebMangal/search', icon: <Search size={13} /> },
              { label: 'Library', href: '/WebMangal/library', icon: <Bell size={13} /> },
            ].map(link => (
              <a key={link.label} href={link.href} style={{
                padding: '8px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                color: 'var(--text-secondary)', textDecoration: 'none',
                transition: 'color 0.15s, background 0.15s',
                display: 'inline-flex', alignItems: 'center', gap: '4px',
              }}
                onMouseEnter={e => { (e.target as HTMLElement).style.color = 'var(--text-primary)'; (e.target as HTMLElement).style.background = 'var(--border-color)'; }}
                onMouseLeave={e => { (e.target as HTMLElement).style.color = 'var(--text-secondary)'; (e.target as HTMLElement).style.background = 'transparent'; }}
              >{link.icon}{link.label}</a>
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
              }}><Wrench size={13} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Studio</a>
            )}
            {user && <ProfileMenu user={user} isCreator={isCreator} isDeveloper={isDeveloper} />}
          </div>
        }
      />

      {/* HEADER */}
      <div className="mangal-bm-header" style={{ maxWidth: '900px', margin: '0 auto', padding: '40px 24px 20px' }}>
        <h1 className="mangal-bm-title" style={{ fontSize: '28px', fontWeight: 900, margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: '8px' }}><Bookmark size={26} /> Bookmarks</h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 16px' }}>
          {loading ? '' : series.length === 0
            ? 'No bookmarks yet.'
            : activeContentType === 'all'
              ? `${series.length} series saved`
              : `${filteredSeries.length} of ${series.length} series`}
        </p>

        {!loading && series.length > 0 && (
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="mangal-bm-pills" style={{ display: 'flex', gap: '8px' }}>
            {CONTENT_TYPE_OPTIONS.map(opt => {
              const isActive = activeContentType === opt.value;
              const activeStyle = opt.value === 'novel'
                ? { background: 'rgba(109,40,217,0.18)', border: '1px solid rgba(124,58,237,0.5)', color: '#a78bfa' }
                : opt.value === 'mangal'
                  ? { background: 'rgba(127,29,29,0.25)', border: '1px solid rgba(153,27,27,0.5)', color: '#f87171' }
                  : { background: 'rgba(120,53,15,0.25)', border: '1px solid rgba(180,83,9,0.4)', color: '#d97706' };
              return (
                <button
                  key={opt.value}
                  onClick={() => handleContentTypeToggle(opt.value)}
                  style={{
                    padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 700,
                    cursor: 'pointer', transition: 'all 0.15s',
                    ...(isActive ? activeStyle : { background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-tertiary)' }),
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="mangal-bm-sort-label" style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 600 }}>Sort:</span>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as BookmarkSortOption)}
              style={{
                padding: '8px 12px', borderRadius: '8px', background: 'var(--bg-card)',
                border: '1px solid #2a2a3a', color: '#d97706', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
              }}
            >
              {BOOKMARK_SORT_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          </div>
        )}
      </div>

      {/* CONTENT */}
      <div className="mangal-bm-content" style={{ maxWidth: '900px', margin: '0 auto', padding: '0 24px 80px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px', color: 'var(--text-muted)' }}>
            <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'center' }}><Bookmark size={36} /></div>
            <div>Loading bookmarks...</div>
          </div>
        ) : series.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 40px', background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
            <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'center' }}><Inbox size={48} /></div>
            <p style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>No bookmarks yet</p>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 24px' }}>
              Follow a series to bookmark it — you&apos;ll find them all here.
            </p>
            <Link href="/" style={{
              padding: '10px 24px', borderRadius: '10px',
              background: 'linear-gradient(135deg, #7f1d1d, #991b1b)',
              color: '#fff', textDecoration: 'none', fontSize: '13px', fontWeight: 700,
            }}>
              Browse Series
            </Link>
          </div>
        ) : filteredSeries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 40px', background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
            <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'center' }}>{activeContentType === 'novel' ? <BookText size={48} /> : <BookOpen size={48} />}</div>
            <p style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>
              No {activeContentType === 'novel' ? 'novels' : 'manga'} bookmarked
            </p>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 24px' }}>
              Try switching the filter to see your other bookmarks.
            </p>
            <button
              onClick={() => handleContentTypeToggle(activeContentType)}
              style={{
                padding: '10px 24px', borderRadius: '10px',
                background: 'linear-gradient(135deg, #7f1d1d, #991b1b)',
                color: '#fff', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 700,
              }}
            >
              Show All
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
            {filteredSeries.map(s => {
              const sc = statusColor(s.completion_status);
              return (
                <BookmarkCard
                  key={s.id}
                  series={s}
                  statusColor={sc}
                  onUnfollow={() => unfollow(s.id)}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* FOOTER (shared component) */}
      <Footer />
    </div>
  );
}

function BookmarkCard({
  series,
  statusColor,
  onUnfollow,
}: {
  series: BookmarkedSeries;
  statusColor: { color: string; bg: string; border: string };
  onUnfollow: () => void;
}) {
  const [confirmUnfollow, setConfirmUnfollow] = useState(false);

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-color)',
      borderRadius: '14px', overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
      transition: 'border-color 0.15s',
    }}>
      {/* Cover */}
      <a href={`/WebMangal/series/${series.id}`} style={{ textDecoration: 'none', display: 'block', position: 'relative' }}>
        <div style={{ width: '100%', aspectRatio: '3/4', background: '#1a0a0a', overflow: 'hidden', maxHeight: '220px', position: 'relative' }}>
          {series.cover_url ? (
            <Image
              src={series.cover_url}
              alt={series.title}
              fill
              sizes="(max-width: 768px) 45vw, 220px"
              style={{ objectFit: 'cover' }}
            />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '40px', color: 'var(--text-faint)' }}>
              {series.content_type === 'novel' ? <BookText size={16} /> : <ScrollText size={16} />}
            </div>
          )}
        </div>
        {/* Content type badge (novel only — manga keeps the status badge slot clean) */}
        {series.content_type === 'novel' && (
          <span style={{
            position: 'absolute', top: '8px', left: '8px',
            fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
            padding: '3px 8px', borderRadius: '20px',
            color: '#a78bfa', background: 'rgba(109,40,217,0.25)', border: '1px solid rgba(124,58,237,0.5)',
          }}>
            Novel
          </span>
        )}
        {/* Status badge on cover */}
        {series.completion_status && series.completion_status !== 'ongoing' && (
          <span style={{
            position: 'absolute', top: '8px', right: '8px',
            fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
            padding: '3px 8px', borderRadius: '20px',
            color: statusColor.color, background: statusColor.bg, border: `1px solid ${statusColor.border}`,
          }}>
            {series.completion_status}
          </span>
        )}
      </a>

      {/* Info */}
      <div style={{ padding: '14px', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <a href={`/WebMangal/series/${series.id}`} style={{ textDecoration: 'none' }}>
          <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {series.title}
          </div>
        </a>

        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {series.genre && (
            <span style={{ fontSize: '9px', fontWeight: 700, color: '#d97706', background: 'rgba(120,53,15,0.25)', border: '1px solid rgba(180,83,9,0.4)', padding: '2px 8px', borderRadius: '20px', textTransform: 'uppercase' }}>
              {series.genre}
            </span>
          )}
          <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-tertiary)', background: 'var(--bg-input)', border: '1px solid var(--border-color)', padding: '2px 8px', borderRadius: '20px' }}>
            {series.chapter_count} ch
          </span>
        </div>

        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          {series.synopsis}
        </p>

        {/* Actions */}
        <div style={{ marginTop: 'auto', paddingTop: '10px', display: 'flex', gap: '8px', flexDirection: 'column' }}>
          {series.latest_chapter_id && (
            <a href={`/WebMangal/read/${series.latest_chapter_id}`} style={{
              padding: '9px', borderRadius: '9px', fontSize: '12px', fontWeight: 700,
              background: series.content_type === 'novel'
                ? 'linear-gradient(135deg, #4c1d95, #6d28d9)'
                : 'linear-gradient(135deg, #7f1d1d, #991b1b)',
              color: '#fff', textDecoration: 'none', textAlign: 'center',
            }}>
              <Play size={11} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Read Ch.{series.latest_chapter_number}
            </a>
          )}
          {confirmUnfollow ? (
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={onUnfollow}
                style={{ flex: 1, padding: '7px', borderRadius: '7px', fontSize: '11px', fontWeight: 700, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', cursor: 'pointer' }}
              >
                Remove
              </button>
              <button
                onClick={() => setConfirmUnfollow(false)}
                style={{ flex: 1, padding: '7px', borderRadius: '7px', fontSize: '11px', background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-tertiary)', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmUnfollow(true)}
              style={{ padding: '7px', borderRadius: '7px', fontSize: '11px', fontWeight: 600, background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              <BellOff size={13} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Remove Bookmark
            </button>
          )}
        </div>
      </div>
    </div>
  );
}