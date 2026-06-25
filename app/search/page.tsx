'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '../lib/supabase';
import ProfileMenu from '../components/ProfileMenu';
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
}

const GENRE_OPTIONS = ['All', 'Action', 'Romance', 'Fantasy', 'Comedy', 'Drama', 'Horror', 'Slice of Life', 'Sci-Fi', 'Thriller', 'Mythology'];
const LANGUAGE_OPTIONS = ['All', 'Hindi', 'English'];
const STATUS_OPTIONS: { value: NonNullable<Series['completion_status']>; label: string }[] = [
  { value: 'ongoing', label: 'Ongoing' },
  { value: 'completed', label: 'Completed' },
  { value: 'hiatus', label: 'Hiatus' },
];

// Step 21 — Dual Content Mode: All/Manga/Novel filter pill, same localStorage
// key + persistence pattern used on the homepage so the choice carries over.
type ContentTypeFilter = 'all' | 'mangal' | 'novel';
const CONTENT_TYPE_STORAGE_KEY = 'mangal_content_type';

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
  // Step 21 — Dual Content Mode toggle, persisted via localStorage (same key as homepage)
  const [activeContentType, setActiveContentType] = useState<ContentTypeFilter>('all');

  const [user, setUser] = useState<any>(null);
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
    const qs = params.toString();
    router.replace(qs ? `/search?${qs}` : '/search', { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, genreFilter, languageFilter, statusFilter]);

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
          s.title.toLowerCase().includes(q) ||
          (s.synopsis ?? '').toLowerCase().includes(q) ||
          (s.genre ?? '').toLowerCase().includes(q) ||
          username.includes(q)
        );
      });
    }
    return r;
  }, [series, genreFilter, languageFilter, statusFilter, query, creatorUsernames, hasCompletionStatus, activeContentType]);

  const filtersActive = activeContentType !== 'all' || genreFilter !== 'All' || languageFilter !== 'All' || statusFilter !== 'All';
  const createHref = isCreator ? '/dashboard' : user ? '/become-creator' : '/login';
  const createLabel = isCreator ? 'Go to Studio' : user ? 'Become a Creator' : 'Log In to Create';

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#07070a', color: '#f9fafb', fontFamily: "'Segoe UI', Arial, sans-serif", display: 'flex', flexDirection: 'column' }}>

      {/* ── NAV ── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(7,7,10,0.97)', backdropFilter: 'blur(16px)',
        borderBottom: '1px solid #1a1a26',
        padding: '0 24px', height: '64px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none', flexShrink: 0 }}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '10px',
            background: 'linear-gradient(135deg, #7f1d1d, #d97706)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px',
          }}>🔥</div>
          <span style={{ fontWeight: 900, fontSize: '20px', color: '#fff', letterSpacing: '-0.03em' }}>MANGAL</span>
        </a>

        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          {[
            { label: 'Browse', href: '/' },
            { label: 'Genres', href: '/#genres' },
            { label: 'New Releases', href: '/#new' },
            { label: '🔔 Library', href: '/library' },
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {user ? (
            <>
              {isCreator && (
                <a href="/dashboard" style={{
                  padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
                  background: 'rgba(217,119,6,0.15)', border: '1px solid rgba(217,119,6,0.3)',
                  color: '#d97706', textDecoration: 'none',
                }}>🛠 Studio</a>
              )}
              <ProfileMenu user={user} isCreator={isCreator} isDeveloper={isDeveloper} />
            </>
          ) : (
            <>
              <a href="/login" style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: '#9ca3af', textDecoration: 'none' }}>Log in</a>
              <a href="/login" style={{
                padding: '8px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
                background: 'linear-gradient(135deg, #7f1d1d, #991b1b)',
                color: '#fff', textDecoration: 'none',
              }}>Get Started</a>
            </>
          )}
        </div>
      </nav>

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
              background: '#0d0d14', border: '1px solid #2a2a3a',
              color: '#fff', fontSize: '14px', outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

        {/* ── CONTENT TYPE TOGGLE (Step 21) ── */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
          {([
            { value: 'all' as ContentTypeFilter, label: '✨ All' },
            { value: 'mangal' as ContentTypeFilter, label: '📖 Manga' },
            { value: 'novel' as ContentTypeFilter, label: '📕 Novel' },
          ]).map(opt => (
            <button
              key={opt.value}
              onClick={() => handleContentTypeToggle(opt.value)}
              style={{
                padding: '8px 16px', borderRadius: '20px', fontSize: '13px', fontWeight: 700,
                cursor: 'pointer', transition: 'all 0.15s',
                border: activeContentType === opt.value ? '1px solid rgba(217,119,6,0.5)' : '1px solid #2a2a3a',
                background: activeContentType === opt.value ? 'rgba(217,119,6,0.15)' : '#0d0d14',
                color: activeContentType === opt.value ? '#d97706' : '#9ca3af',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* ── FILTERS ── */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '28px' }}>
          <select
            value={genreFilter}
            onChange={e => setGenreFilter(e.target.value)}
            style={{
              padding: '9px 12px', borderRadius: '8px', background: '#0d0d14',
              border: '1px solid #2a2a3a', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
            }}
          >
            {GENRE_OPTIONS.map(g => <option key={g} value={g}>{g === 'All' ? 'All Genres' : g}</option>)}
          </select>

          <select
            value={languageFilter}
            onChange={e => setLanguageFilter(e.target.value)}
            style={{
              padding: '9px 12px', borderRadius: '8px', background: '#0d0d14',
              border: '1px solid #2a2a3a', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
            }}
          >
            {LANGUAGE_OPTIONS.map(l => <option key={l} value={l}>{l === 'All' ? 'All Languages' : l}</option>)}
          </select>

          {hasCompletionStatus && (
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              style={{
                padding: '9px 12px', borderRadius: '8px', background: '#0d0d14',
                border: '1px solid #2a2a3a', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              }}
            >
              <option value="All">All Statuses</option>
              {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          )}

          {filtersActive && (
            <button
              onClick={() => { handleContentTypeToggle('all'); setGenreFilter('All'); setLanguageFilter('All'); setStatusFilter('All'); }}
              style={{
                padding: '9px 14px', borderRadius: '8px', background: 'transparent',
                border: '1px solid #2a2a3a', color: '#9ca3af', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              }}
            >
              Clear filters ✕
            </button>
          )}
        </div>

        {/* ── RESULTS ── */}
        {loading ? (
          <div style={{ padding: '80px 0', textAlign: 'center', color: '#374151' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>📖</div>
            <div style={{ fontSize: '14px' }}>Loading stories...</div>
          </div>
        ) : results.length === 0 ? (
          <div style={{ padding: '80px 0', textAlign: 'center', color: '#374151' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔍</div>
            <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '6px' }}>
              {query.trim()
                ? <>No results found for &ldquo;<span style={{ color: '#d97706' }}>{query.trim()}</span>&rdquo;.</>
                : 'No series match these filters.'}
            </div>
            {query.trim() && (
              <>
                <div style={{ fontSize: '13px', color: '#4b5563', marginBottom: '20px' }}>Be the first to create it!</div>
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
            <div style={{ fontSize: '12px', color: '#4b5563', marginBottom: '16px' }}>
              {results.length} series found
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '16px' }}>
              {results.map(s => (
                <ResultCard key={s.id} series={s} creatorUsername={creatorUsernames[s.creator_id]} />
              ))}
            </div>
          </>
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

/* ── RESULT CARD (portrait, shows creator username) ── */
function ResultCard({ series, creatorUsername }: { series: Series; creatorUsername?: string }) {
  const router = useRouter();
  const [hovered, setHovered] = useState(false);
  return (
    <a href={`/series/${series.id}`} style={{ textDecoration: 'none' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}>
      <div style={{
        borderRadius: '12px', overflow: 'hidden',
        background: '#0d0d14', border: `1px solid ${hovered ? '#d97706' : '#1a1a26'}`,
        transition: 'border-color 0.2s, transform 0.2s',
        transform: hovered ? 'translateY(-3px)' : 'none',
      }}>
        <div style={{ position: 'relative', aspectRatio: '3/4', background: '#1a0a0a' }}>
          {series.cover_url ? (
            <img src={series.cover_url} alt={series.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
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
              background: series.content_type === 'novel' ? 'rgba(124,58,237,0.9)' : 'rgba(127,29,29,0.9)',
              padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase',
            }}>
              {series.content_type === 'novel' ? 'NOVEL' : (series.reading_mode === 'scroll' ? 'SCROLL' : 'PAGE')}
            </span>
          </div>
        </div>
        <div style={{ padding: '10px 10px 12px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#fff', lineHeight: 1.3, marginBottom: '4px',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {series.title}
          </div>
          {creatorUsername && (
            <div
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(`/creator/${creatorUsername}`); }}
              style={{ fontSize: '10px', color: '#6b7280', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
              onMouseEnter={e => { (e.target as HTMLElement).style.color = '#d97706'; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.color = '#6b7280'; }}
            >
              by @{creatorUsername}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {series.genre ? <div style={{ fontSize: '10px', color: '#d97706' }}>{series.genre}</div> : <span />}
            <span style={{ fontSize: '9px', color: '#4b5563' }}>👁 {formatViews(series.views ?? 0)}</span>
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