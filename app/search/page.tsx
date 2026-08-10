'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';
import ProfileMenu from '../components/ProfileMenu';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { hasCreatorAccess, isDeveloperRole } from '../lib/roles';

interface Series {
  id: string;
  creator_id: string;
  title: string;
  synopsis: string;
  genre: string | null;
  language: string | null;
  cover_url: string | null;
  reading_mode: 'scroll' | 'page';
  status: 'draft' | 'published';
  created_at: string;
  views: number;
  // Not migrated yet (Phase 2 / Step 12) — optional so this page works before and after that ships
  completion_status?: 'ongoing' | 'completed' | 'hiatus';
  // Step 21 — Dual Content Mode: mangal (comic) or novel
  content_type: 'mangal' | 'novel';
  // Rating aggregate — optional so this page still works if not selected/present
  avg_rating?: number | null;
  rating_count?: number | null;
}

const GENRE_OPTIONS = ['All', 'Action', 'Romance', 'Fantasy', 'Comedy', 'Drama', 'Horror', 'Slice of Life', 'Sci-Fi', 'Thriller', 'Mythology'];
const LANGUAGE_OPTIONS = ['All', 'Hindi', 'English'];
const STATUS_OPTIONS: { value: NonNullable<Series['completion_status']>; label: string }[] = [
  { value: 'ongoing', label: 'Ongoing' },
  { value: 'completed', label: 'Completed' },
  { value: 'hiatus', label: 'Hiatus' },
];

// ── SORTING ──
type SortOption = 'newest' | 'views' | 'rating' | 'az';
const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'newest', label: 'Latest Update' },
  { value: 'views', label: 'Most Viewed' },
  { value: 'rating', label: 'Top Rated' },
  { value: 'az', label: 'A–Z' },
];

// Step 21 — Dual Content Mode: All/Manga/Novel filter pill, same localStorage
// key + persistence pattern used on the homepage so the choice carries over.
type ContentTypeFilter = 'all' | 'mangal' | 'novel';
const CONTENT_TYPE_STORAGE_KEY = 'mangal_content_type';

// ── FUZZY MATCH (trigram-style client-side) ──
// Splits query into 3-char trigrams and checks how many appear in the target.
// Falls back to simple includes() for short queries (< 3 chars).
function fuzzyMatch(target: string, query: string, threshold = 0.3): boolean {
  if (!query) return true;
  const t = target.toLowerCase();
  const q = query.toLowerCase().trim();
  if (q.length < 3) return t.includes(q);
  // exact substring first (fast path)
  if (t.includes(q)) return true;
  // trigram similarity
  const trigramsOf = (s: string) => {
    const tg = new Set<string>();
    for (let i = 0; i <= s.length - 3; i++) tg.add(s.slice(i, i + 3));
    return tg;
  };
  const tT = trigramsOf(t);
  const tQ = trigramsOf(q);
  if (tQ.size === 0) return false;
  let matches = 0;
  tQ.forEach(tg => { if (tT.has(tg)) matches++; });
  return matches / tQ.size >= threshold;
}

function formatViews(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

function SearchPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [series, setSeries] = useState<Series[]>([]);
  const [creatorUsernames, setCreatorUsernames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const [genreFilter, setGenreFilter] = useState(searchParams.get('genre') ?? 'All');
  const [languageFilter, setLanguageFilter] = useState(searchParams.get('language') ?? 'All');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') ?? 'All');
  const [sortBy, setSortBy] = useState<SortOption>((searchParams.get('sort') as SortOption) ?? 'newest');
  // Step 21 — Dual Content Mode toggle, persisted via localStorage (same key as homepage)
  const [activeContentType, setActiveContentType] = useState<ContentTypeFilter>('all');

  const [user, setUser] = useState<User | null>(null);
  const [isCreator, setIsCreator] = useState(false);
  const [isDeveloper, setIsDeveloper] = useState(false);

  useEffect(() => {
    // Step 21 — Dual Content Mode: restore the reader's last toggle choice
    try {
      const saved = localStorage.getItem(CONTENT_TYPE_STORAGE_KEY);
      if (saved === 'all' || saved === 'mangal' || saved === 'novel') setActiveContentType(saved);
    } catch {
      // localStorage unavailable — default 'all' is fine
    }

    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) {
        setUser(data.user);
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', data.user.id)
          .single();
        if (hasCreatorAccess(profile?.role)) setIsCreator(true);
        setIsDeveloper(isDeveloperRole(profile?.role));
      }
    });

    // Fetch published series + creator usernames in parallel.
    // Username search is done client-side via this map since `series` has no username column itself.
    Promise.all([
      supabase
        .from('series')
        .select('*')
        .eq('status', 'published')
        .order('created_at', { ascending: false }),
      supabase.from('creator_profiles').select('user_id, username'),
    ]).then(([seriesRes, creatorsRes]) => {
      if (seriesRes.data) setSeries(seriesRes.data as Series[]);
      if (creatorsRes.data) {
        const map: Record<string, string> = {};
        (creatorsRes.data as { user_id: string; username: string }[]).forEach(c => {
          map[c.user_id] = c.username;
        });
        setCreatorUsernames(map);
      }
      setLoading(false);
    });
  }, []);

  // Keep the URL in sync (shareable/bookmarkable search), without a full page reload
  useEffect(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    if (genreFilter !== 'All') params.set('genre', genreFilter);
    if (languageFilter !== 'All') params.set('language', languageFilter);
    if (statusFilter !== 'All') params.set('status', statusFilter);
    if (sortBy !== 'newest') params.set('sort', sortBy);
    const qs = params.toString();
    router.replace(qs ? `/search?${qs}` : '/search', { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, genreFilter, languageFilter, statusFilter, sortBy]);

  // completion_status isn't migrated yet (Step 12) — hide that filter until real data has it,
  // so this page doesn't show a dead dropdown in the meantime
  const hasCompletionStatus = useMemo(() => series.some(s => !!s.completion_status), [series]);

  // Step 21 — Dual Content Mode: toggle handler, saves choice to localStorage
  const handleContentTypeToggle = (next: ContentTypeFilter) => {
    setActiveContentType(next);
    try {
      localStorage.setItem(CONTENT_TYPE_STORAGE_KEY, next);
    } catch {
      // localStorage unavailable — selection still works for this session
    }
  };

  const results = useMemo(() => {
    let r = series;
    if (activeContentType !== 'all') r = r.filter(s => s.content_type === activeContentType);
    if (genreFilter !== 'All') r = r.filter(s => s.genre === genreFilter);
    if (languageFilter !== 'All') r = r.filter(s => s.language === languageFilter);
    if (hasCompletionStatus && statusFilter !== 'All') {
      r = r.filter(s => s.completion_status === statusFilter);
    }
    const q = query.trim().toLowerCase();
    if (q) {
      r = r.filter(s => {
        const username = (creatorUsernames[s.creator_id] ?? '').toLowerCase();
        return (
          fuzzyMatch(s.title, q) ||
          fuzzyMatch(s.synopsis ?? '', q) ||
          fuzzyMatch(s.genre ?? '', q) ||
          username.includes(q)
        );
      });
    }

    // ── SORT ──
    const sorted = [...r];
    switch (sortBy) {
      case 'views':
        sorted.sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
        break;
      case 'rating':
        sorted.sort((a, b) => (b.avg_rating ?? 0) - (a.avg_rating ?? 0));
        break;
      case 'az':
        sorted.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'newest':
      default:
        sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
    }
    return sorted;
  }, [series, genreFilter, languageFilter, statusFilter, query, creatorUsernames, hasCompletionStatus, activeContentType, sortBy]);

  const filtersActive = activeContentType !== 'all' || genreFilter !== 'All' || languageFilter !== 'All' || statusFilter !== 'All' || sortBy !== 'newest';
  const createHref = isCreator ? '/dashboard' : user ? '/become-creator' : '/login';
  const createLabel = isCreator ? 'Go to Studio' : user ? 'Become a Creator' : 'Log In to Create';

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', display: 'flex', flexDirection: 'column' }}>

      {/* ── NAV (shared component — same header as Home/Dashboard) ── */}
      <Navbar
        variant="custom"
        centerSlot={
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            {[
              { label: 'Browse', href: '/' },
              { label: '🏆 Rankings', href: '/rankings' },
              { label: 'Genres', href: '/#genres' },
              { label: 'New Releases', href: '/#new' },
              { label: '🔔 Library', href: '/library' },
              { label: '🔖 Bookmarks', href: '/bookmarks' },
            ].map(link => (
              <a key={link.label} href={link.href} style={{
                padding: '8px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                color: 'var(--text-secondary)', textDecoration: 'none',
                transition: 'color 0.15s, background 0.15s',
              }}
                onMouseEnter={e => { (e.target as HTMLElement).style.color = 'var(--text-primary)'; (e.target as HTMLElement).style.background = 'var(--border-color)'; }}
                onMouseLeave={e => { (e.target as HTMLElement).style.color = 'var(--text-secondary)'; (e.target as HTMLElement).style.background = 'transparent'; }}
              >{link.label}</a>
            ))}
          </div>
        }
        rightSlot={
          user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {isCreator && (
                <a href="/dashboard" style={{
                  padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
                  background: 'rgba(217,119,6,0.15)', border: '1px solid rgba(217,119,6,0.3)',
                  color: '#d97706', textDecoration: 'none',
                }}>🛠 Studio</a>
              )}
              <ProfileMenu user={user} isCreator={isCreator} isDeveloper={isDeveloper} />
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <a href="/login" style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', textDecoration: 'none' }}>Log in</a>
              <a href="/login" style={{
                padding: '8px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
                background: 'linear-gradient(135deg, #7f1d1d, #991b1b)',
                color: '#fff', textDecoration: 'none',
              }}>Get Started</a>
            </div>
          )
        }
      />

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 24px 60px', flex: 1, width: '100%', boxSizing: 'border-box' }}>

        {/* ── SEARCH BAR ── */}
        <div style={{ position: 'relative', marginBottom: '20px' }}>
          <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', fontSize: '16px', pointerEvents: 'none' }}>🔍</span>
          <input
            type="text"
            autoFocus
            placeholder="Search series, genres, creators..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{
              width: '100%', padding: '14px 16px 14px 44px', borderRadius: '12px',
              background: 'var(--bg-card)', border: '1px solid var(--border-color)',
              color: 'var(--text-primary)', fontSize: '14px', outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

        {/* ── CONTENT TYPE TOGGLE (Step 21) ── */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
          {([
            { value: 'all' as ContentTypeFilter, label: '✨ All' },
            { value: 'mangal' as ContentTypeFilter, label: '📖 Mangal' },
            { value: 'novel' as ContentTypeFilter, label: '📕 Novel' },
          ]).map(opt => (
            <button
              key={opt.value}
              onClick={() => handleContentTypeToggle(opt.value)}
              style={{
                padding: '8px 16px', borderRadius: '20px', fontSize: '13px', fontWeight: 700,
                cursor: 'pointer', transition: 'all 0.15s',
                border: activeContentType === opt.value ? '1px solid rgba(217,119,6,0.5)' : '1px solid var(--border-color)',
                background: activeContentType === opt.value ? 'rgba(217,119,6,0.15)' : 'var(--bg-card)',
                color: activeContentType === opt.value ? '#d97706' : 'var(--text-secondary)',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* ── FILTERS + SORT ── */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '10px', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <select
              value={genreFilter}
              onChange={e => setGenreFilter(e.target.value)}
              style={{
                padding: '9px 12px', borderRadius: '8px', background: 'var(--bg-card)',
                border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              }}
            >
              {GENRE_OPTIONS.map(g => <option key={g} value={g}>{g === 'All' ? 'All Genres' : g}</option>)}
            </select>

            <select
              value={languageFilter}
              onChange={e => setLanguageFilter(e.target.value)}
              style={{
                padding: '9px 12px', borderRadius: '8px', background: 'var(--bg-card)',
                border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              }}
            >
              {LANGUAGE_OPTIONS.map(l => <option key={l} value={l}>{l === 'All' ? 'All Languages' : l}</option>)}
            </select>

            {hasCompletionStatus && (
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                style={{
                  padding: '9px 12px', borderRadius: '8px', background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                }}
              >
                <option value="All">All Statuses</option>
                {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            )}

            {filtersActive && (
              <button
                onClick={() => { handleContentTypeToggle('all'); setGenreFilter('All'); setLanguageFilter('All'); setStatusFilter('All'); setSortBy('newest'); }}
                style={{
                  padding: '9px 14px', borderRadius: '8px', background: 'transparent',
                  border: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                }}
              >
                Clear filters ✕
              </button>
            )}
          </div>

          {/* Sort dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 600 }}>Sort:</span>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as SortOption)}
              style={{
                padding: '9px 12px', borderRadius: '8px', background: 'var(--bg-card)',
                border: '1px solid var(--border-color)', color: '#d97706', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
              }}
            >
              {SORT_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>

        <div style={{ marginBottom: '18px' }} />

        {/* ── RESULTS ── */}
        {loading ? (
          <div style={{ padding: '80px 0', textAlign: 'center', color: 'var(--text-faint)' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>📖</div>
            <div style={{ fontSize: '14px' }}>Loading stories...</div>
          </div>
        ) : results.length === 0 ? (
          <div style={{ padding: '80px 0', textAlign: 'center', color: 'var(--text-faint)' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔍</div>
            <div style={{ fontSize: '14px', color: 'var(--text-tertiary)', marginBottom: '6px' }}>
              {query.trim()
                ? <>No results found for &ldquo;<span style={{ color: '#d97706' }}>{query.trim()}</span>&rdquo;.</>
                : 'No series match these filters.'}
            </div>
            {query.trim() && (
              <>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>Be the first to create it!</div>
                <a href={createHref} style={{
                  display: 'inline-block', padding: '10px 20px', borderRadius: '8px',
                  background: 'linear-gradient(135deg, #7f1d1d, #d97706)',
                  color: '#fff', fontSize: '13px', fontWeight: 700, textDecoration: 'none',
                }}>{createLabel}</a>
              </>
            )}
          </div>
        ) : (
          <>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              {results.length} series found
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '16px' }}>
              {results.map((s, i) => (
                <ResultCard key={s.id} series={s} creatorUsername={creatorUsernames[s.creator_id]} rank={sortBy === 'views' ? i + 1 : undefined} />
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── FOOTER (shared component) ── */}
      <Footer />
    </div>
  );
}

/* ── RESULT CARD (portrait, shows creator username, rank badge, rating) ── */
function ResultCard({ series, creatorUsername, rank }: { series: Series; creatorUsername?: string; rank?: number }) {
  const router = useRouter();
  const [hovered, setHovered] = useState(false);
  return (
    <a href={`/series/${series.id}`} style={{ textDecoration: 'none' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}>
      <div style={{
        borderRadius: '12px', overflow: 'hidden', position: 'relative',
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

          {/* Rank badge — only shown when sorting by Most Viewed */}
          {rank && rank <= 3 && (
            <div style={{
              position: 'absolute', top: '6px', left: '6px',
              width: '22px', height: '22px', borderRadius: '6px',
              background: rank === 1 ? '#d97706' : rank === 2 ? 'var(--text-secondary)' : '#92400e',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '11px', fontWeight: 900, color: '#0d0d14',
            }}>#{rank}</div>
          )}

          {/* Rating badge, top-right, only if data present */}
          {typeof series.avg_rating === 'number' && series.avg_rating > 0 && (
            <div style={{
              position: 'absolute', top: '6px', right: '6px',
              display: 'flex', alignItems: 'center', gap: '3px',
              background: 'rgba(0,0,0,0.65)', borderRadius: '5px', padding: '2px 6px',
              fontSize: '10px', fontWeight: 700, color: '#fbbf24',
            }}>
              ★ {series.avg_rating.toFixed(1)}
            </div>
          )}

          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%)',
            padding: '20px 8px 6px',
          }}>
            <span style={{
              fontSize: '9px', fontWeight: 700, color: '#fff',
              background: series.content_type === 'novel' ? 'rgba(124,58,237,0.9)' : 'rgba(127,29,29,0.9)',
              padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase',
            }}>
              {series.content_type === 'novel' ? 'NOVEL' : (series.reading_mode === 'scroll' ? 'SCROLL' : 'PAGE')}
            </span>
          </div>
        </div>
        <div style={{ padding: '10px 10px 12px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3, marginBottom: '4px',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {series.title}
          </div>
          {creatorUsername && (
            <div
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(`/creator/${creatorUsername}`); }}
              style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
              onMouseEnter={e => { (e.target as HTMLElement).style.color = '#d97706'; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.color = 'var(--text-tertiary)'; }}
            >
              by @{creatorUsername}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {series.genre ? <div style={{ fontSize: '10px', color: '#d97706' }}>{series.genre}</div> : <span />}
            <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>👁 {formatViews(series.views ?? 0)}</span>
          </div>
        </div>
      </div>
    </a>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchPageInner />
    </Suspense>
  );
}
