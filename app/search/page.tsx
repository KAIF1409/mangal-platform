'use client';

import { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';
import ProfileMenu from '../components/ProfileMenu';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import SharedSeriesCard from '../components/SeriesCard';
import { hasCreatorAccess, isDeveloperRole } from '../lib/roles';

// Same links shown in the desktop nav's centerSlot — reused by the mobile
// hamburger menu below so there's one source of truth for the nav items.
const NAV_LINKS = [
  { label: 'Browse', href: '/' },
  { label: '🏆 Rankings', href: '/rankings' },
  { label: 'Genres', href: '/#genres' },
  { label: 'New Releases', href: '/#new' },
  { label: '🔔 Library', href: '/library' },
  { label: '🔖 Bookmarks', href: '/bookmarks' },
];

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

function SearchPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const loginNext = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;

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

  // Mobile hamburger menu — phones only, see .mangal-search-navbar-mobile below.
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Webnovel-style full-screen search overlay — the ONLY search input shown
  // on phones. The inline search bar further down the page is hidden on
  // mobile (see .mangal-search-bar-inline) so there's never a duplicate.
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

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
        // Synopsis is long prose — for 1–2 char queries almost every series'
        // synopsis contains that letter somewhere, which made searches like
        // "H" match series that have nothing to do with the query. Only
        // check synopsis once the query is specific enough (3+ chars).
        const synopsisMatch = q.length >= 3 && fuzzyMatch(s.synopsis ?? '', q);
        return (
          fuzzyMatch(s.title, q) ||
          synopsisMatch ||
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

  // Webnovel-style result row (cover left, tags/synopsis/author/ADD on the
  // right) — shared by the mobile search overlay's live suggestions AND the
  // main mobile results list below, so results look identical whether the
  // person is still typing or has already hit Search.
  const renderResultCard = (s: Series, onNavigate?: () => void) => {
    const username = creatorUsernames[s.creator_id];
    const categoryLabel = s.content_type === 'novel' ? 'NOVEL' : 'MANGAL';
    return (
      <Link
        key={s.id}
        href={`/series/${s.id}`}
        onClick={onNavigate}
        style={{
          display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '14px',
          textDecoration: 'none', color: 'var(--text-primary)',
          borderBottom: '1px solid var(--border-color)',
        }}
      >
        <div style={{ width: '68px', height: '92px', borderRadius: '8px', overflow: 'hidden', flexShrink: 0, background: 'var(--bg-card)', position: 'relative' }}>
          {s.cover_url && (
            <Image src={s.cover_url} alt={s.title} fill sizes="68px" style={{ objectFit: 'cover' }} />
          )}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          {s.genre && (
            <div style={{ marginBottom: '4px' }}>
              <span style={{
                fontSize: '11px', fontWeight: 700, color: '#d97706',
                background: 'rgba(217,119,6,0.12)', border: '1px solid rgba(217,119,6,0.25)',
                borderRadius: '4px', padding: '2px 6px',
              }}>#{s.genre}</span>
            </div>
          )}
          <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '3px', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' }}>
            {s.title}
          </div>
          {s.synopsis && (
            <div style={{
              fontSize: '12.5px', color: 'var(--text-muted)', lineHeight: 1.4, marginBottom: '5px',
              overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            }}>{s.synopsis}</div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <span style={{ fontSize: '11.5px', color: 'var(--text-faint)' }}>
              {username ? `@${username}` : 'MANGAL'} · {categoryLabel}
            </span>
            <span style={{
              flexShrink: 0, fontSize: '11px', fontWeight: 800, color: '#052e21',
              background: 'linear-gradient(135deg, #a7f3d0, #6ee7b7)',
              padding: '4px 10px', borderRadius: '20px', letterSpacing: '0.02em',
            }}>+ ADD</span>
          </div>
        </div>
      </Link>
    );
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', display: 'flex', flexDirection: 'column' }}>

      {/* Responsive rules (plain <style> tag: media queries can't be
          expressed via inline styles).
          Desktop/laptop nav is 100% UNCHANGED — it just gets hidden below
          640px and swapped for a compact hamburger header instead of trying
          to squeeze the same links into a phone-width row (that was the
          overlapping mess in the earlier attempt). Search bar, toggle row,
          filters row, and results grid still get their own phone tune-up. */}
      <style>{`
        .mangal-search-navbar-mobile { display: none; }

        .mangal-search-nav-links { display: flex; gap: 4px; align-items: center; }

        .mangal-search-container { padding: 32px 24px 60px; }

        .mangal-search-toggle-row,
        .mangal-search-filters-row { flex-wrap: wrap; }

        .mangal-search-grid { grid-template-columns: repeat(auto-fit, minmax(160px, 200px)); }
        .mangal-search-list-mobile { display: none; }

        /* ── Tablet & small laptop ───────────────────────────────────── */
        @media (max-width: 768px) {
          .mangal-search-container { padding: 20px 16px 48px; }
        }

        /* ── Phones — swap the full desktop nav for the compact header ── */
        @media (max-width: 640px) {
          .mangal-search-navbar-desktop { display: none !important; }
          .mangal-search-navbar-mobile { display: block; }

          .mangal-search-container { padding: 16px 12px 40px; }

          /* Only one search UI on phones — the header icon opens the
             full-screen overlay instead, so the inline bar is hidden here. */
          .mangal-search-bar-inline { display: none; }

          /* Webnovel-style plain text tabs instead of pill/chip buttons —
             underline on the active tab, no background/border, emoji hidden
             so it reads as clean text tabs like Fanfic/Novel/New Novel.
             Pulled out to the full screen width edge-to-edge (negative
             margin cancels the page container's 12px side padding) instead
             of sitting inset inside the container like before. */
          .mangal-search-toggle-row {
            gap: 0 !important; overflow-x: visible; -webkit-overflow-scrolling: touch; flex-wrap: nowrap;
            border-bottom: 1px solid #1f1f2a; padding-bottom: 0;
            margin-left: -12px; margin-right: -12px; width: calc(100% + 24px);
            padding-left: 0; padding-right: 0; box-sizing: border-box;
          }
          .mangal-search-toggle-btn {
            flex: 1 1 0; background: transparent !important; border: none !important;
            border-radius: 0 !important; padding: 13px 4px !important; font-size: 15px !important;
            color: #9ca3af !important; font-weight: 700 !important; text-align: center !important;
            border-bottom: 2px solid transparent !important; margin-bottom: -1px;
          }
          .mangal-search-toggle-btn.is-active { color: var(--text-primary) !important; border-bottom: 2px solid #6ee7b7 !important; }
          .mangal-search-toggle-emoji { display: none; }

          .mangal-search-filters-row { justify-content: flex-start !important; }
          .mangal-search-filters-row select,
          .mangal-search-filters-row button { padding: 8px 10px !important; font-size: 12px !important; }

          /* Phones show the Webnovel-style list (cover left, tags/synopsis/
             author/ADD right) instead of the small grid tiles — matches the
             search overlay's live results exactly.
             !important is required here: the grid div also carries an
             inline style={{ display: 'grid' }}, and inline styles always
             beat plain CSS rules regardless of media query — without
             !important the grid kept rendering underneath the list, which
             is why both an old-style card AND the new list card were
             showing at once. */
          .mangal-search-grid { display: none !important; }
          .mangal-search-list-mobile { display: flex; flex-direction: column; margin: 0 -12px; }
        }

        @media (max-width: 340px) {
          .mangal-search-grid { grid-template-columns: repeat(2, 1fr); }
        }
      `}</style>

      {/* ── DESKTOP/LAPTOP NAV — identical to before, just hidden on phones ── */}
      <div className="mangal-search-navbar-desktop">
        <Navbar
          variant="custom"
          centerSlot={
            <div className="mangal-search-nav-links">
              {NAV_LINKS.map(link => (
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
                <a href={`/login?next=${encodeURIComponent(loginNext)}`} style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', textDecoration: 'none' }}>Log in</a>
                <a href={`/login?next=${encodeURIComponent(loginNext)}`} style={{
                  padding: '8px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
                  background: 'linear-gradient(135deg, #7f1d1d, #991b1b)',
                  color: '#fff', textDecoration: 'none',
                }}>Get Started</a>
              </div>
            )
          }
        />
      </div>

      {/* ── PHONE-ONLY NAV — cloned to match Webnovel's mobile header exactly:
          always-dark bar (not tied to the site's light/dark toggle, same as
          Webnovel's header never goes light), hamburger + search icon
          cluster on the left, centered bold wordmark, mint pill button on
          the right. Fully independent of the desktop <Navbar/> above so
          nothing here can ever touch laptop/desktop rendering. ── */}
      <div className="mangal-search-navbar-mobile" style={{ position: 'sticky', top: 0, zIndex: 50 }}>
        <nav style={{
          background: '#0b0b10', backdropFilter: 'blur(12px)',
          borderBottom: '1px solid #1f1f2a',
          padding: '0 10px', height: '54px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            <button
              onClick={() => setMobileMenuOpen(o => !o)}
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileMenuOpen}
              style={{
                width: '36px', height: '36px', borderRadius: '8px', border: 'none',
                background: 'transparent', color: '#f9fafb', fontSize: '18px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              }}
            >
              {mobileMenuOpen ? '✕' : '☰'}
            </button>
            <button
              onClick={() => setMobileSearchOpen(true)}
              aria-label="Search"
              style={{
                width: '36px', height: '36px', borderRadius: '8px', border: 'none',
                background: 'transparent', color: '#f9fafb', fontSize: '16px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              }}
            >
              🔍
            </button>
          </div>

          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none', minWidth: 0, flex: 1, justifyContent: 'center' }}>
            <Image src="/icon.png" alt="MANGAL" width={22} height={22} style={{ display: 'block', flexShrink: 0 }} />
            <span style={{ fontWeight: 900, fontSize: '16px', color: '#f9fafb', letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>MANGAL</span>
          </Link>

          {user ? (
            <div style={{ flexShrink: 0 }}><ProfileMenu user={user} isCreator={isCreator} isDeveloper={isDeveloper} /></div>
          ) : (
            <a href={`/login?next=${encodeURIComponent(loginNext)}`} style={{
              flexShrink: 0, padding: '8px 16px', borderRadius: '20px', fontSize: '12px', fontWeight: 800,
              background: 'linear-gradient(135deg, #a7f3d0, #6ee7b7)', color: '#052e21', textDecoration: 'none',
              whiteSpace: 'nowrap', letterSpacing: '0.03em',
            }}>LOG IN</a>
          )}
        </nav>

        {mobileMenuOpen && (
          <>
            {/* Tap-outside-to-close backdrop */}
            <div
              onClick={() => setMobileMenuOpen(false)}
              style={{ position: 'fixed', inset: 0, top: '54px', zIndex: 48, background: 'rgba(0,0,0,0.5)' }}
            />
            <div style={{
              position: 'absolute', top: '54px', left: 0, right: 0, zIndex: 49,
              background: '#0b0b10', borderBottom: '1px solid #1f1f2a',
              padding: '10px', display: 'flex', flexDirection: 'column', gap: '2px',
              boxShadow: '0 12px 24px rgba(0,0,0,0.4)',
            }}>
              {NAV_LINKS.map(link => (
                <a
                  key={link.label}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  style={{ padding: '12px 14px', borderRadius: '8px', fontSize: '14px', fontWeight: 600, color: '#f9fafb', textDecoration: 'none' }}
                >{link.label}</a>
              ))}

              <div style={{ height: '1px', background: '#1f1f2a', margin: '6px 4px' }} />

              {isCreator && (
                <a
                  href="/dashboard"
                  onClick={() => setMobileMenuOpen(false)}
                  style={{ padding: '12px 14px', borderRadius: '8px', fontSize: '14px', fontWeight: 700, color: '#d97706', textDecoration: 'none' }}
                >🛠 Studio</a>
              )}

              {!user && (
                <a
                  href={`/login?next=${encodeURIComponent(loginNext)}`}
                  onClick={() => setMobileMenuOpen(false)}
                  style={{
                    marginTop: '4px', padding: '12px 14px', borderRadius: '20px', fontSize: '14px', fontWeight: 800,
                    textAlign: 'center', background: 'linear-gradient(135deg, #a7f3d0, #6ee7b7)',
                    color: '#052e21', textDecoration: 'none', letterSpacing: '0.03em',
                  }}
                >SIGN UP</a>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── PHONE-ONLY full-screen search overlay (Webnovel-style) ──
          Opened by the header search icon above. This is the ONLY search
          UI shown on phones — the inline bar below is hidden on mobile via
          .mangal-search-bar-inline so there's never a duplicate. */}
      {mobileSearchOpen && (
        <div
          className="mangal-search-mobile-overlay"
          role="dialog"
          aria-modal="true"
          style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column' }}
        >
          {/* Plain div, not a <form> — a native form submit (e.g. triggered
              by the Android keyboard's own "Go"/search action key) was
              causing this to occasionally fall through to a full page
              navigation on some mobile browsers instead of just closing the
              overlay. Explicit click/Enter handlers avoid that path entirely. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', borderBottom: '1px solid var(--border-color)' }}>
            <button
              type="button"
              onClick={() => setMobileSearchOpen(false)}
              aria-label="Close search"
              style={{
                width: '36px', height: '36px', borderRadius: '8px', border: 'none', flexShrink: 0,
                background: 'transparent', color: 'var(--text-primary)', fontSize: '18px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              }}
            >←</button>
            <input
              autoFocus
              type="text"
              placeholder="Search series, genres, creators..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); setMobileSearchOpen(false); }
              }}
              style={{
                flex: 1, padding: '11px 14px', borderRadius: '10px',
                background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                color: 'var(--text-primary)', fontSize: '14px', outline: 'none', boxSizing: 'border-box',
              }}
            />
            <button
              type="button"
              onClick={() => setMobileSearchOpen(false)}
              style={{
                flexShrink: 0, padding: '11px 18px', borderRadius: '10px', border: 'none',
                background: 'linear-gradient(135deg, #a7f3d0, #6ee7b7)', color: '#052e21',
                fontSize: '13px', fontWeight: 800, cursor: 'pointer',
              }}
            >Search</button>
          </div>

          {/* Live results list — the overlay was previously a dead end because
              the full-screen background hid the results grid underneath it,
              so nothing visibly happened while typing. This shows matches as
              you type; tapping one goes straight to that series. */}
          <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
            {query.trim() === '' ? (
              <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text-faint)', fontSize: '13px' }}>
                Start typing to search series, genres, or creators…
              </div>
            ) : results.length === 0 ? (
              <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text-faint)', fontSize: '13px' }}>
                No results found for &ldquo;<span style={{ color: '#d97706' }}>{query.trim()}</span>&rdquo;.
              </div>
            ) : (
              results.slice(0, 30).map(s => renderResultCard(s, () => setMobileSearchOpen(false)))
            )}
          </div>
        </div>
      )}

      <div className="mangal-search-container" style={{ maxWidth: '1100px', margin: '0 auto', flex: 1, width: '100%', boxSizing: 'border-box' }}>

        {/* ── SEARCH BAR (desktop/tablet only — phones use the header's
             full-screen overlay above instead, see .mangal-search-bar-inline) ── */}
        <div className="mangal-search-bar-inline" style={{ position: 'relative', marginBottom: '20px' }}>
          <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', fontSize: '16px', pointerEvents: 'none' }}>🔍</span>
          <input
            ref={searchInputRef}
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
        <div className="mangal-search-toggle-row" style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
          {([
            { value: 'all' as ContentTypeFilter, emoji: '✨', label: 'All' },
            { value: 'mangal' as ContentTypeFilter, emoji: '📖', label: 'Mangal' },
            { value: 'novel' as ContentTypeFilter, emoji: '📕', label: 'Novel' },
          ]).map(opt => (
            <button
              key={opt.value}
              onClick={() => handleContentTypeToggle(opt.value)}
              className={`mangal-search-toggle-btn${activeContentType === opt.value ? ' is-active' : ''}`}
              style={{
                padding: '8px 16px', borderRadius: '20px', fontSize: '13px', fontWeight: 700,
                cursor: 'pointer', transition: 'all 0.15s',
                border: activeContentType === opt.value ? '1px solid rgba(217,119,6,0.5)' : '1px solid var(--border-color)',
                background: activeContentType === opt.value ? 'rgba(217,119,6,0.15)' : 'var(--bg-card)',
                color: activeContentType === opt.value ? '#d97706' : 'var(--text-secondary)',
              }}
            >
              <span className="mangal-search-toggle-emoji">{opt.emoji} </span>{opt.label}
            </button>
          ))}
        </div>

        {/* ── FILTERS + SORT ── */}
        <div className="mangal-search-filters-row" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '10px', alignItems: 'center', justifyContent: 'space-between' }}>
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
            <div className="mangal-search-grid" style={{ display: 'grid', gap: '16px' }}>
              {results.map((s, i) => (
                <SharedSeriesCard key={s.id} series={s} creatorUsername={creatorUsernames[s.creator_id]} rank={sortBy === 'views' ? i + 1 : undefined} />
              ))}
            </div>
            {/* Phone-only list view — same Webnovel-style card (cover left,
                tags/synopsis/author/ADD right) as the search overlay, so the
                results look identical whether you're still typing or already
                hit Search. Desktop/tablet keep the grid above unchanged. */}
            <div className="mangal-search-list-mobile">
              {results.map(s => renderResultCard(s))}
            </div>
          </>
        )}
      </div>

      {/* ── FOOTER (shared component) ── */}
      <Footer />
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchPageInner />
    </Suspense>
  );
}
