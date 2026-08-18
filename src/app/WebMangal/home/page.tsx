'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { supabase } from '../../lib/supabase';
import type { User } from '@supabase/supabase-js';
import ProfileMenu from '../../components/shared/ProfileMenu';
import ThemeToggle from '../../components/shared/ThemeToggle';
import SeriesCard from '../../components/webmangal/SeriesCard';
import { formatViews } from '../../lib/format';
import { hasCreatorAccess, isDeveloperRole } from '../../lib/auth/roles';
import { Search, BookOpen, Sparkles, Eye, ScrollText, BookText, ArrowRight, Music } from 'lucide-react';
import { useUiLanguage, LANGUAGES } from '../../lib/i18n';
import Link from 'next/link';

interface Series {
  id: string;
  title: string;
  synopsis: string;
  genre: string | null;
  language: string | null;
  cover_url: string | null;
  reading_mode: 'scroll' | 'page';
  content_type: 'mangal' | 'novel';
  status: 'draft' | 'published';
  created_at: string;
  views: number;
  chapter_count?: number;
  creator_id?: string;
}

type SortOption = 'latest' | 'views' | 'az';

// Step 82 — Real pagination: shared helper to attach published-chapter
// counts to a batch of series rows. One batched `.in('series_id', ids)`
// query per call (bounded to whatever rows were passed in — never the
// whole catalog), same pattern used everywhere else this count is needed
// (series/library/bookmarks pages).
async function attachChapterCounts(rows: Series[]): Promise<Series[]> {
  if (rows.length === 0) return rows;
  const ids = rows.map(r => r.id);
  const { data: publishedChapters } = await supabase
    .from('chapters')
    .select('series_id')
    .in('series_id', ids)
    .eq('is_draft', false)
    .or(`scheduled_at.is.null,scheduled_at.lte.${new Date().toISOString()}`);
  const countMap: Record<string, number> = {};
  (publishedChapters ?? []).forEach((ch: { series_id: string }) => {
    countMap[ch.series_id] = (countMap[ch.series_id] ?? 0) + 1;
  });
  return rows.map(r => ({ ...r, chapter_count: countMap[r.id] ?? 0 }));
}

const BROWSE_PAGE_SIZE = 24;

// Step 2 — Reading Progress: one resumable series for the "Continue Reading" row
interface ContinueItem {
  seriesId: string;
  seriesTitle: string;
  coverUrl: string | null;
  chapterId: string;
  chapterNumber: number;
}

// Step 23 — Genre Expansion (Desi Categories): added Folk Tale, Desi Horror,
// Street Life, School Life, Independence Era. Mythology already existed.
const GENRES = ['All', 'Action', 'Romance', 'Fantasy', 'Comedy', 'Drama', 'Horror', 'Slice of Life', 'Sci-Fi', 'Thriller', 'Mythology', 'Folk Tale', 'Desi Horror', 'Street Life', 'School Life', 'Independence Era'];

// Step 22 — maps each GENRES value to its i18n key. GENRES itself stays in
// English since it's also the filter value matched against series.genre in
// the DB — only the displayed label changes with language, never the value.
const GENRE_KEYS: Record<string, string> = {
  All: 'genreAll', Action: 'genreAction', Romance: 'genreRomance', Fantasy: 'genreFantasy',
  Comedy: 'genreComedy', Drama: 'genreDrama', Horror: 'genreHorror', 'Slice of Life': 'genreSliceOfLife',
  'Sci-Fi': 'genreSciFi', Thriller: 'genreThriller', Mythology: 'genreMythology',
  'Folk Tale': 'genreFolkTale', 'Desi Horror': 'genreDesiHorror', 'Street Life': 'genreStreetLife',
  'School Life': 'genreSchoolLife', 'Independence Era': 'genreIndependenceEra',
};

// Step 23 — "Desi Comics" featured category groups the new India-specific
// genres added this step. Not a separate DB column — just a derived filter
// over existing series.genre values, so no migration needed.
const DESI_GENRES = ['Mythology', 'Folk Tale', 'Desi Horror', 'Street Life', 'School Life', 'Independence Era'];

// Step 7 — format large view numbers nicely (e.g. 12000 -> "12.0K")
export default function HomePage() {
  const router = useRouter();
  const { lang, setLang, t } = useUiLanguage();
  // Step 82 — Real pagination: `browseSeries` is the incrementally-loaded,
  // server-filtered/sorted "All Series" grid — genre/content-type/desi/sort
  // are now applied in the query itself (`.eq()`/`.in()`/`.order()`), not
  // client-side over a capped/unbounded local copy of the catalog. Resets
  // and refetches page 1 whenever a filter changes; "Load More" fetches
  // subsequent pages.
  const [browseSeries, setBrowseSeries] = useState<Series[]>([]);
  const [browseLoading, setBrowseLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [activeGenre, setActiveGenre] = useState('All');
  const [activeContentType, setActiveContentType] = useState<'all' | 'mangal' | 'novel'>('all');
  // Step 23 — Desi Comics: a standalone toggle (not part of the genre-pill
  // row), styled as its own badge beside the content-type toggle per
  // founder's request. Independent of activeGenre/activeContentType so it
  // can layer on top of either filter state.
  const [showDesiComics, setShowDesiComics] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('latest');
  const [user, setUser] = useState<User | null>(null);
  const [isCreator, setIsCreator] = useState(false);
  const [isDeveloper, setIsDeveloper] = useState(false);
  const [continueReading, setContinueReading] = useState<ContinueItem[]>([]);

  // Step 9 — Homepage Discovery Sections
  const [trending, setTrending] = useState<Series[]>([]);
  // §27 item 6 — New Voices: ordered list of recently-joined creator user_ids
  const [newVoiceOrder, setNewVoiceOrder] = useState<string[]>([]);
  const [newVoices, setNewVoices] = useState<Series[]>([]);
  const [newArrivals, setNewArrivals] = useState<Series[]>([]);
  const [staffPicks, setStaffPicks] = useState<Series[]>([]);
  const STAFF_PICK_TITLES: string[] = []; // developer-curated list — add exact series titles here

  // Step 27 — For You: personalized feed for logged-in readers based on
  // genres of series they already follow. Empty for readers who follow
  // nothing yet — the section just doesn't render in that case.
  const [forYou, setForYou] = useState<Series[]>([]);

  // Step 21 — content type toggle: persist across sessions
  useEffect(() => {
    try {
      const saved = localStorage.getItem('mangal_content_type') as 'all' | 'mangal' | 'novel' | null;
      if (saved && ['all', 'mangal', 'novel'].includes(saved)) setActiveContentType(saved); // eslint-disable-line react-hooks/set-state-in-effect
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
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

        // Step 2 — Reading Progress: most-recently-read series first, capped at 10
        const { data: progressRows } = await supabase
          .from('reading_progress')
          .select('series_id, chapter_id, updated_at, series(id, title, cover_url), chapters(id, chapter_number)')
          .eq('reader_id', data.user.id)
          .order('updated_at', { ascending: false })
          .limit(10);

        if (progressRows) {
          const items = progressRows
            .map(row => {
              // Supabase nested-relation typings sometimes return an array of one — normalize both shapes
              const s = Array.isArray(row.series) ? row.series[0] : row.series;
              const c = Array.isArray(row.chapters) ? row.chapters[0] : row.chapters;
              if (!s || !c) return null;
              return { seriesId: s.id, seriesTitle: s.title, coverUrl: s.cover_url, chapterId: c.id, chapterNumber: c.chapter_number };
            })
            .filter((item): item is ContinueItem => item !== null);
          setContinueReading(items);
        }

        // Step 27 — For You feed
        const { data: recs } = await supabase.rpc('for_you_series', { target_reader_id: data.user.id, result_limit: 6 });
        if (recs) setForYou(recs as Series[]);
      }
    });

    // Step 9 — Trending This Week: top 6 series by view_events in the last 7 days,
    // then hydrate with full series rows (RPC only returns id + count)
    supabase.rpc('trending_series', { days_back: 7, result_limit: 6 }).then(async ({ data: trendingRows }) => {
      if (!trendingRows || trendingRows.length === 0) return;
      const ids = trendingRows.map((r: { series_id: string }) => r.series_id);
      const { data: trendingSeries } = await supabase
        .from('series')
        .select('*')
        .in('id', ids)
        .eq('status', 'published');
      if (trendingSeries) {
        // Preserve the RPC's recent-views ranking order, not the DB's default order
        const order = new Map<string, number>(ids.map((id: string, i: number) => [id, i]));
        const sorted = [...trendingSeries].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
        setTrending(sorted);
      }
    });

    // §27 item 6 — New Voices: most recently-joined creators, by
    // creator_profiles.joined_at desc. Public-read (no RLS issue, same as
    // any other creator_profiles lookup used for display elsewhere).
    // Capped at 20 candidates — the newVoices effect below trims to the
    // first 6 that actually have a published series.
    supabase.from('creator_profiles').select('user_id, joined_at').order('joined_at', { ascending: false }).limit(20)
      .then(({ data }) => { if (data) setNewVoiceOrder(data.map(c => c.user_id)); });
  }, []);

  // Step 9 — New Arrivals: latest 6 published series, filtered by content
  // type server-side. Its own small dedicated query (not derived from the
  // paginated browse list below) so it always shows the true latest 6
  // regardless of what page/filter the browse grid is on.
  useEffect(() => {
    let cancelled = false;
    let q = supabase.from('series').select('*').eq('status', 'published').order('created_at', { ascending: false }).limit(6);
    if (activeContentType !== 'all') q = q.eq('content_type', activeContentType);
    q.then(async ({ data }) => {
      if (cancelled || !data) return;
      setNewArrivals(await attachChapterCounts(data as Series[]));
    });
    return () => { cancelled = true; };
  }, [activeContentType]);

  // Step 9 — Staff Picks: developer-curated, matched by exact title. Empty
  // list = section hidden (skips the query entirely rather than firing one
  // that can only ever return nothing).
  useEffect(() => {
    if (STAFF_PICK_TITLES.length === 0) { setStaffPicks([]); return; } // eslint-disable-line react-hooks/set-state-in-effect
    let cancelled = false;
    let q = supabase.from('series').select('*').eq('status', 'published').in('title', STAFF_PICK_TITLES).limit(6);
    if (activeContentType !== 'all') q = q.eq('content_type', activeContentType);
    q.then(async ({ data }) => {
      if (cancelled || !data) return;
      setStaffPicks(await attachChapterCounts(data as Series[]));
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- STAFF_PICK_TITLES is a local const, not state
  }, [activeContentType]);

  // §27 item 6 — "New Voices": recently-joined creators, ordered by join
  // date rather than views/popularity, so a brand-new creator gets
  // guaranteed visibility instead of always losing to whoever's already
  // biggest. Bounded to the ≤20 creator ids in newVoiceOrder via `.in()` —
  // never scans the full catalog — then reduced to one (latest) series per
  // creator, up to 6.
  useEffect(() => {
    if (newVoiceOrder.length === 0) { setNewVoices([]); return; } // eslint-disable-line react-hooks/set-state-in-effect
    let cancelled = false;
    let q = supabase.from('series').select('*').eq('status', 'published').in('creator_id', newVoiceOrder).order('created_at', { ascending: false });
    if (activeContentType !== 'all') q = q.eq('content_type', activeContentType);
    q.then(async ({ data }) => {
      if (cancelled || !data) return;
      const byCreator = new Map<string, Series>();
      for (const s of data as Series[]) {
        if (!s.creator_id || byCreator.has(s.creator_id)) continue; // query is created_at desc, so first hit per creator = their latest
        byCreator.set(s.creator_id, s);
      }
      const ordered = newVoiceOrder.map(id => byCreator.get(id)).filter((s): s is Series => !!s).slice(0, 6);
      setNewVoices(await attachChapterCounts(ordered));
    });
    return () => { cancelled = true; };
  }, [newVoiceOrder, activeContentType]);

  // Step 82 — Real pagination for the "All Series" browse grid. Genre,
  // content type, the Desi Comics toggle, and sort are all applied
  // server-side (`.eq()`/`.in()`/`.order()`), so — unlike the old client-side
  // filter over a capped local copy — every matching series is reachable
  // via "Load More", not just whatever happened to fall inside a fixed cap.
  const fetchBrowsePage = async (page: number, reset: boolean) => {
    if (reset) setBrowseLoading(true); else setLoadingMore(true);

    let q = supabase.from('series').select('*', page === 0 ? { count: 'exact' } : undefined).eq('status', 'published');
    if (activeGenre !== 'All') q = q.eq('genre', activeGenre);
    if (activeContentType !== 'all') q = q.eq('content_type', activeContentType);
    if (showDesiComics) q = q.in('genre', DESI_GENRES);
    if (sortBy === 'views') q = q.order('views', { ascending: false });
    else if (sortBy === 'az') q = q.order('title', { ascending: true });
    else q = q.order('created_at', { ascending: false });
    q = q.range(page * BROWSE_PAGE_SIZE, page * BROWSE_PAGE_SIZE + BROWSE_PAGE_SIZE - 1);

    const { data, count } = await q;
    const rows = await attachChapterCounts((data ?? []) as Series[]);

    setBrowseSeries(prev => (reset ? rows : [...prev, ...rows]));
    setHasMore(rows.length === BROWSE_PAGE_SIZE);
    if (page === 0 && typeof count === 'number') setTotalCount(count);
    setBrowseLoading(false);
    setLoadingMore(false);
  };

  const [browsePage, setBrowsePage] = useState(0);
  useEffect(() => {
    setBrowsePage(0); // eslint-disable-line react-hooks/set-state-in-effect
    fetchBrowsePage(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchBrowsePage closes over the filter state below, re-created every render on purpose
  }, [activeGenre, activeContentType, showDesiComics, sortBy]);

  const handleLoadMore = () => {
    const next = browsePage + 1;
    setBrowsePage(next);
    fetchBrowsePage(next, false);
  };

  // Only carved into a separate "Featured" hero when browsing the
  // unfiltered "All" view — a specific genre/desi filter shows every match
  // directly in the grid instead, same behavior as before.
  const isDefaultBrowse = activeGenre === 'All' && !showDesiComics;
  const featured = isDefaultBrowse ? browseSeries.slice(0, 3) : [];
  const gridItems = isDefaultBrowse ? browseSeries.slice(3) : browseSeries;

  const setContentType = (ct: 'all' | 'mangal' | 'novel') => {
    setActiveContentType(ct);
    try { localStorage.setItem('mangal_content_type', ct); } catch { /* ignore */ }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', overflowX: 'hidden', maxWidth: '100vw' }}>

      {/* Responsive rules for the /home nav — same .mangal-* + <style> tag
          pattern as app/dashboard/page.tsx and app/page.tsx. The center
          links div used to be `overflow: hidden` with no scroll, which
          silently CLIPPED nav items (Rankings/Genres/Tags/New
          Releases/Library/KaTube/K Circle) on any viewport too narrow to
          fit all 8 — worse than the landing page's version of this bug,
          since there's no footer here to re-surface those links. Fixed by
          making it horizontally scrollable at every width (invisible on
          desktop where everything already fits, a real scroll strip on
          phones) instead of hiding content with no way to reach it. */}
      <style>{`
        .mangal-home-nav-center {
          display: flex; gap: 4px; align-items: center;
          overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none;
          min-width: 0;
        }
        .mangal-home-nav-center::-webkit-scrollbar { display: none; }

        @media (max-width: 860px) {
          .mangal-home-nav { padding: 0 12px !important; }
          .mangal-home-nav-center a { padding: 6px 8px !important; font-size: 11px !important; }
          .mangal-home-lang-toggle { display: none; }
        }

        @media (max-width: 560px) {
          .mangal-home-nav { height: 56px !important; gap: 6px; }
          .mangal-home-brand-text { display: none; }
          .mangal-home-login-link { display: none; }
          .mangal-home-nav-right { gap: 6px !important; }
        }
      `}</style>

      {/* ── NAV ── */}
      <nav className="mangal-home-nav" style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'var(--nav-bg)', backdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--border-color)',
        padding: '0 16px', height: '64px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: '8px',
      }}>
        {/* Logo */}
        <Link href="/WebMangal" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none', flexShrink: 0 }}>
          <Image
            src="/webmangal-logo.png"
            alt="WebMangal"
            width={120}
            height={120}
            style={{ display: 'block', height: '36px', width: '36px', objectFit: 'contain' }}
            priority
          />
          <span className="mangal-home-brand-text" style={{ fontWeight: 900, fontSize: '20px', color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>WebMangal</span>
        </Link>

        {/* Center Nav Links */}
        <div className="mangal-home-nav-center">
          {[
            { label: t('browse'), href: '/' },
            { label: 'Rankings', href: '/WebMangal/rankings' },
            { label: t('genres'), href: '/#genres' },
            { label: 'Tags', href: '/WebMangal/tags' },
            { label: t('newReleases'), href: '/#new' },
            { label: t('library'), href: '/WebMangal/library' },
          ].map(link => (
            <a key={link.label} href={link.href} style={{
              padding: '6px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
              color: 'var(--text-secondary)', textDecoration: 'none', whiteSpace: 'nowrap',
              transition: 'color 0.15s, background 0.15s',
            }}
              onMouseEnter={e => { (e.target as HTMLElement).style.color = 'var(--text-primary)'; (e.target as HTMLElement).style.background = 'var(--border-color)'; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.color = 'var(--text-secondary)'; (e.target as HTMLElement).style.background = 'transparent'; }}
            >{link.label}</a>
          ))}
          <a href="/katube" style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            padding: '6px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
            color: '#2563eb', textDecoration: 'none', whiteSpace: 'nowrap',
            transition: 'color 0.15s, background 0.15s',
          }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(37,99,235,0.10)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          ><Image src="/katube-logo.png" alt="KaTube" width={70} height={70} style={{ height: '18px', width: '18px', objectFit: 'contain' }} /></a>
          {/* §85 — Songs discovery entry point. Small nav pill, same shape as
              Tube/Circle, purple accent to match SongCard's palette. Points
              at the standalone /WebMangal/songs browse page rather than
              rewiring the content-type toggle above (that's hardwired to
              the series table — see CONTEXT.md §85). */}
          <Link href="/WebMangal/songs" style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            padding: '6px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
            color: '#a78bfa', textDecoration: 'none', whiteSpace: 'nowrap',
            transition: 'color 0.15s, background 0.15s',
          }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(124,58,237,0.12)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          ><Music size={14} strokeWidth={2} />Songs</Link>
          <a href="/kalpana-circle" style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            padding: '6px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
            color: '#c4b5fd', textDecoration: 'none', whiteSpace: 'nowrap',
            transition: 'color 0.15s, background 0.15s',
          }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(124,58,237,0.12)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          ><Image src="/kcircle-logo.png" alt="K Circle" width={70} height={70} style={{ height: '18px', width: '18px', objectFit: 'contain' }} /></a>
        </div>

        {/* Right side */}
        <div className="mangal-home-nav-right" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <ThemeToggle size={30} />

          {/* Step 22 — Hindi UI Toggle. Sits left of ProfileMenu/auth buttons so
              the profile chip always stays the rightmost element on every page.
              Hidden under 860px (mangal-home-lang-toggle) — low-priority control
              that was crowding out the auth/profile controls on tablets/phones. */}
          <div className="mangal-home-lang-toggle" style={{ display: 'flex', alignItems: 'center', gap: '2px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '3px' }}>
            {LANGUAGES.map(({ code, label }) => (
              <button
                key={code}
                onClick={() => setLang(code)}
                style={{
                  padding: '5px 10px', borderRadius: '6px', border: 'none',
                  background: lang === code ? 'var(--border-color)' : 'transparent',
                  color: lang === code ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  fontSize: '11px', fontWeight: 700, cursor: 'pointer',
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {user ? (
            <>
              {isCreator && (
                <a href="/dashboard" style={{
                  padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
                  background: 'rgba(217,119,6,0.15)', border: '1px solid rgba(217,119,6,0.3)',
                  color: '#d97706', textDecoration: 'none', whiteSpace: 'nowrap',
                }}>{t('studio')}</a>
              )}
              {/* Profile click → sliding dropdown. Reader accounts see Become a Creator
                  here instead of any creator tools — this is the only upgrade path. */}
              <ProfileMenu user={user} isCreator={isCreator} isDeveloper={isDeveloper} />
            </>
          ) : (
            <>
              <a href="/login" className="mangal-home-login-link" style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', textDecoration: 'none', whiteSpace: 'nowrap' }}>{t('logIn')}</a>
              <a href="/login" style={{
                padding: '8px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
                background: 'linear-gradient(135deg, #f97316, #22c55e)',
                color: '#fff', textDecoration: 'none', whiteSpace: 'nowrap',
              }}>{t('getStarted')}</a>
            </>
          )}
        </div>
      </nav>


      {/* ── HERO BANNER ── */}
      <div style={{
        position: 'relative', overflow: 'hidden',
        padding: '64px 24px 56px',
        borderBottom: '1px solid var(--border-color)',
        minHeight: '420px',
        display: 'flex', alignItems: 'center',
      }}>
        {/* BG IMAGE — comics.jpg */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 0,
          backgroundImage: 'url(/comics.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center center',
          backgroundRepeat: 'no-repeat',
        }} />
        {/* Dark overlay — heavier at edges, lighter in center so text pops */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 1,
          background: 'linear-gradient(to bottom, rgba(7,7,10,0.78) 0%, rgba(7,7,10,0.52) 40%, rgba(7,7,10,0.52) 65%, rgba(7,7,10,0.88) 100%)',
          pointerEvents: 'none',
        }} />
        {/* Amber center glow to match palette */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 2,
          background: 'radial-gradient(ellipse 70% 60% at 50% 50%, rgba(127,29,29,0.18) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{ maxWidth: '1100px', margin: '0 auto', position: 'relative', zIndex: 3, textAlign: 'center', width: '100%' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            fontSize: '11px', fontWeight: 700, letterSpacing: '0.2em', color: '#d97706',
            background: 'rgba(120,53,15,0.2)', border: '1px solid rgba(180,83,9,0.3)',
            padding: '5px 14px', borderRadius: '20px', marginBottom: '20px', textTransform: 'uppercase',
          }}>
            🇮🇳 {t('heroTag')}
          </div>
          <h1 style={{
            fontSize: 'clamp(36px, 6vw, 72px)', fontWeight: 900,
            letterSpacing: '-0.04em', lineHeight: 1.05, margin: '0 0 16px',
            filter: 'drop-shadow(0 2px 20px rgba(0,0,0,0.9))',
          }}>
            <span style={{ color: '#fff' }}>{t('heroTitleWhite')}</span>{' '}
            <span style={{ background: 'linear-gradient(90deg, #d97706, #ef4444)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{t('heroTitleOrange')}</span>
          </h1>
          <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.82)', maxWidth: '480px', margin: '0 auto 32px', lineHeight: 1.6, textShadow: '0 1px 12px rgba(0,0,0,0.9)' }}>
            {t('heroSubtitle')}
          </p>

          {/* Search — Step 10: navigates to the dedicated /search page on Enter
              instead of filtering this grid in place */}
          <form
            onSubmit={e => { e.preventDefault(); if (search.trim()) router.push(`/WebMangal/search?keyword=${encodeURIComponent(search.trim())}`); }}
            style={{ maxWidth: '480px', margin: '0 auto', position: 'relative' }}
          >
            <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex', color: 'rgba(255,255,255,0.7)' }}><Search size={16} strokeWidth={2} /></span>
            <input
              type="text"
              placeholder={t('searchPlaceholder')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%', padding: '14px 16px 14px 44px', borderRadius: '12px',
                background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                color: 'var(--text-primary)', fontSize: '14px', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </form>
        </div>
      </div>

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 24px' }}>

        {/* ── CONTINUE READING (Step 2) — logged-in readers with progress only,
            shown regardless of search/genre filter since it's a personal shelf ── */}
        {user && continueReading.length > 0 && (
          <section style={{ padding: '28px 0 0' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 16px', color: 'var(--text-primary)' }}>
              {t('continueReading')}
            </h2>
            <div style={{ display: 'flex', gap: '14px', overflowX: 'auto', paddingBottom: '4px', scrollbarWidth: 'none' }}>
              {continueReading.map(item => (
                <ContinueCard key={item.seriesId} item={item} />
              ))}
            </div>
          </section>
        )}

        {/* ── CONTENT TYPE TOGGLE (Step 21) ── */}
        <div style={{ display: 'flex', gap: '6px', padding: '20px 0 0', alignItems: 'center', flexWrap: 'wrap' as const }}>
          {([
            { value: 'all',   label: t('ctAll') },
            { value: 'mangal', label: t('ctMangal') },
            { value: 'novel', label: t('ctNovel') },
          ] as const).map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setContentType(value)}
              style={{
                padding: '7px 18px', borderRadius: '20px', border: 'none', cursor: 'pointer',
                fontSize: '13px', fontWeight: 700, whiteSpace: 'nowrap',
                background: activeContentType === value
                  ? 'linear-gradient(135deg, #7f1d1d, #d97706)'
                  : 'var(--bg-card)',
                color: activeContentType === value ? '#fff' : 'var(--text-tertiary)',
                transition: 'all 0.15s',
              }}
            >{label}</button>
          ))}

          {/* Step 23 — Desi Comics: distinct from the content-type pills above
              (different shape + flag accent), since this is a curated
              cross-genre spotlight, not a content-type filter. */}
          <button
            onClick={() => setShowDesiComics(v => !v)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '7px 16px 7px 14px', borderRadius: '10px', cursor: 'pointer',
              fontSize: '13px', fontWeight: 700, whiteSpace: 'nowrap',
              border: showDesiComics ? '1px solid #16a34a' : '1px solid var(--border-color)',
              background: showDesiComics ? 'rgba(22,163,74,0.15)' : 'var(--bg-card)',
              color: showDesiComics ? '#4ade80' : 'var(--text-tertiary)',
              transition: 'all 0.15s',
            }}
          >
            🇮🇳 {t('desiComics')}
          </button>
        </div>

        {/* ── GENRE TABS ── */}
        <div id="genres" style={{
          display: 'flex', gap: '6px', overflowX: 'auto', padding: '20px 0',
          scrollbarWidth: 'none', borderBottom: '1px solid var(--border-color)',
        }}>
          {GENRES.map(g => (
            <button key={g} onClick={() => setActiveGenre(g)} style={{
              padding: '7px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer',
              fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0,
              background: activeGenre === g ? 'linear-gradient(135deg, #7f1d1d, #d97706)' : 'var(--bg-card)',
              color: activeGenre === g ? '#fff' : 'var(--text-tertiary)',
              transition: 'all 0.15s',
            }}>
              {t(GENRE_KEYS[g])}
            </button>
          ))}
        </div>

        {browseLoading ? (
          <div style={{ padding: '80px 0', textAlign: 'center', color: 'var(--text-faint)' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}><BookOpen size={32} strokeWidth={1.5} /></div>
            <div style={{ fontSize: '14px' }}>{t('loadingStories')}</div>
          </div>
        ) : browseSeries.length === 0 && (activeGenre !== 'All' || showDesiComics) ? (
          <div style={{ padding: '80px 0', textAlign: 'center', color: 'var(--text-faint)' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}><Search size={32} strokeWidth={1.5} /></div>
            <div style={{ fontSize: '14px' }}>{t('noSeriesInFilter')}</div>
          </div>
        ) : (
          <>
            {/* Step 27 — For You (personalized, logged-in readers only) */}
            {forYou.filter(s => activeContentType === 'all' || s.content_type === activeContentType).length > 0 && activeGenre === 'All' && !showDesiComics && (
              <section style={{ padding: '32px 0 0' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 16px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '7px' }}>
                  <Sparkles size={17} strokeWidth={2} /> For You
                </h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 200px))', gap: '16px', marginBottom: '40px' }}>
                  {forYou.filter(s => activeContentType === 'all' || s.content_type === activeContentType).map(s => (
                    <SeriesCard key={s.id} series={s} />
                  ))}
                </div>
              </section>
            )}

            {/* Step 9 — Trending This Week (top 6 by views in last 7 days) */}
            {trending.filter(s => activeContentType === 'all' || s.content_type === activeContentType).length > 0 && activeGenre === 'All' && !showDesiComics && (
              <section style={{ padding: '32px 0 0' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 16px', color: 'var(--text-primary)' }}>
                  {t('trendingThisWeek')}
                </h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 200px))', gap: '16px', marginBottom: '40px' }}>
                  {trending.filter(s => activeContentType === 'all' || s.content_type === activeContentType).map((s, i) => (
                    <SeriesCard key={s.id} series={s} rank={i + 1} />
                  ))}
                </div>
              </section>
            )}

            {/* Step 9 — New Arrivals (latest 6 published) */}
            {newArrivals.length > 0 && activeGenre === 'All' && !showDesiComics && (
              <section style={{ padding: '8px 0 0' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 16px', color: 'var(--text-primary)' }}>
                  {t('newArrivals')}
                </h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 200px))', gap: '16px', marginBottom: '40px' }}>
                  {newArrivals.map(s => (
                    <SeriesCard key={s.id} series={s} />
                  ))}
                </div>
              </section>
            )}

            {/* Step 9 — Staff Picks (developer-curated, hidden until STAFF_PICK_TITLES is populated) */}
            {staffPicks.length > 0 && activeGenre === 'All' && !showDesiComics && (
              <section style={{ padding: '8px 0 0' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 16px', color: 'var(--text-primary)' }}>
                  {t('staffPicks')}
                </h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 200px))', gap: '16px', marginBottom: '40px' }}>
                  {staffPicks.map(s => (
                    <SeriesCard key={s.id} series={s} />
                  ))}
                </div>
              </section>
            )}

            {/* §27 item 6 — New Voices: recently-joined creators, ordered
                by join date not popularity, so a brand-new creator gets a
                guaranteed discovery slot instead of always losing to
                whoever already has the most views. */}
            {newVoices.length > 0 && activeGenre === 'All' && !showDesiComics && (
              <section style={{ padding: '8px 0 0' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 16px', color: 'var(--text-primary)' }}>
                  {t('newVoices')}
                </h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 200px))', gap: '16px', marginBottom: '40px' }}>
                  {newVoices.map(s => (
                    <SeriesCard key={s.id} series={s} />
                  ))}
                </div>
              </section>
            )}

            {/* ── FEATURED (first 3) ── */}
            {featured.length > 0 && activeGenre === 'All' && !showDesiComics && (
              <section style={{ padding: '32px 0 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                    {t('featured')}
                  </h2>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{totalCount ?? browseSeries.length} {t('seriesTotal')}</span>
                </div>
                {/* minmax(min(340px, 100%), 1fr) instead of minmax(340px, 1fr) —
                    plain minmax(340px, ...) can't shrink columns below 340px, so
                    on any phone narrower than ~370px content width (nearly all of
                    them) the grid forced horizontal overflow on the whole page.
                    min(340px, 100%) lets a single column fall back to the
                    container's real width instead. */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))', gap: '16px', marginBottom: '40px' }}>
                  {featured.map(s => (
                    <FeaturedCard key={s.id} series={s} />
                  ))}
                </div>
              </section>
            )}

            {/* ── ALL SERIES GRID ── */}
            <section id="new" style={{ padding: '8px 0 40px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' as const, gap: '10px', marginBottom: '16px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                  {showDesiComics
                    ? `🇮🇳 ${t('desiComics')}`
                    : activeGenre !== 'All'
                    ? `${t(GENRE_KEYS[activeGenre])} ${t('genreSeriesSuffix')}`
                    : t('allSeries')}
                </h2>

                {/* Step 24 — Sort control */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>Sort:</span>
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
                          transition: 'background 0.15s, color 0.15s',
                        }}
                      >{label}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 200px))', gap: '16px' }}>
                {gridItems.map(s => (
                  <SeriesCard key={s.id} series={s} />
                ))}
              </div>
              {/* Step 82 — Load More: server-side pagination, one page
                  (BROWSE_PAGE_SIZE) at a time, for the currently active
                  genre/content-type/desi/sort filter. */}
              {hasMore && (
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '28px' }}>
                  <button
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    style={{
                      padding: '10px 28px', borderRadius: '10px', border: '1px solid var(--border-color)',
                      background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '13px', fontWeight: 700,
                      cursor: loadingMore ? 'default' : 'pointer', opacity: loadingMore ? 0.6 : 1,
                      transition: 'opacity 0.15s',
                    }}
                  >
                    {loadingMore ? t('loadingStories') : 'Load More'}
                  </button>
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {/* ── FOOTER ── */}
      <footer style={{ borderTop: '1px solid var(--footer-border)', background: 'var(--footer-bg)', padding: '32px 24px', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center', marginBottom: '12px' }}>
          <Image src="/webmangal-logo.png" alt="WebMangal" width={100} height={100} style={{ display: 'block', height: '28px', width: '28px', objectFit: 'contain' }} />
          <span style={{ fontWeight: 900, fontSize: '16px', color: 'var(--footer-text)' }}>WebMangal</span>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--footer-text-muted)', margin: 0 }}>Made with love in India · Free to read, forever.</p>
      </footer>
    </div>
  );
}

/* ── CONTINUE READING CARD (Step 2) ── */
function ContinueCard({ item }: { item: ContinueItem }) {
  const [hovered, setHovered] = useState(false);
  return (
    <a href={`/WebMangal/read/${item.chapterId}`} style={{ textDecoration: 'none', flexShrink: 0, width: '150px' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}>
      <div style={{
        borderRadius: '12px', overflow: 'hidden',
        background: 'var(--bg-card)', border: `1px solid ${hovered ? '#d97706' : 'var(--border-color)'}`,
        transition: 'border-color 0.2s, transform 0.2s',
        transform: hovered ? 'translateY(-3px)' : 'none',
      }}>
        {/* Cover */}
        <div style={{ position: 'relative', aspectRatio: '3/4', background: '#1a0a0a' }}>
          {item.coverUrl ? (
            <Image src={item.coverUrl} alt={item.seriesTitle} fill sizes="(max-width: 768px) 45vw, 200px" style={{ objectFit: 'cover' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)' }}><ScrollText size={32} strokeWidth={1.5} /></div>
          )}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)',
            padding: '20px 8px 6px',
          }}>
            <span style={{ fontSize: '10px', fontWeight: 800, color: '#d97706' }}>
              ▶ Ch.{item.chapterNumber}
            </span>
          </div>
        </div>
        {/* Title */}
        <div style={{ padding: '8px 9px 10px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.seriesTitle}
          </div>
        </div>
      </div>
    </a>
  );
}

/* ── FEATURED CARD (landscape) ── */
function FeaturedCard({ series }: { series: Series }) {
  const [hovered, setHovered] = useState(false);
  return (
    <a href={`/WebMangal/series/${series.id}`} style={{ textDecoration: 'none' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}>
      <div style={{
        display: 'flex', gap: '0', borderRadius: '14px', overflow: 'hidden',
        background: 'var(--bg-card)', border: `1px solid ${hovered ? '#d97706' : 'var(--border-color)'}`,
        transition: 'border-color 0.2s, transform 0.2s, box-shadow 0.2s',
        transform: hovered ? 'translateY(-2px)' : 'none',
        boxShadow: hovered ? '0 8px 32px rgba(217,119,6,0.15)' : '0 2px 8px rgba(0,0,0,0.3)',
        height: '140px',
      }}>
        {/* Cover */}
        <div style={{ width: '100px', flexShrink: 0, background: '#1a0a0a', position: 'relative' }}>
          {series.cover_url ? (
            <Image src={series.cover_url} alt={series.title} fill sizes="100px" style={{ objectFit: 'cover' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)' }}><ScrollText size={28} strokeWidth={1.5} /></div>
          )}
          <div style={{
            position: 'absolute', top: '6px', left: '6px',
            display: 'flex', alignItems: 'center', gap: '4px',
          }}>
            <span style={{
              background: series.content_type === 'novel' ? 'rgba(109,40,217,0.85)' : 'rgba(127,29,29,0.85)',
              borderRadius: '4px', padding: '2px 6px',
              fontSize: '9px', fontWeight: 700,
              color: '#fff',
            }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>{series.content_type === 'novel' ? <BookText size={10} strokeWidth={2} /> : <BookOpen size={10} strokeWidth={2} />} {series.content_type === 'novel' ? 'NOVEL' : 'MANGAL'}</span>
            </span>
            {series.content_type !== 'novel' && (
              <span style={{
                background: 'rgba(0,0,0,0.7)', borderRadius: '4px', padding: '2px 6px',
                fontSize: '9px', fontWeight: 700, color: 'var(--text-secondary)',
              }}>
                {series.reading_mode === 'scroll' ? 'SCROLL' : 'PAGE'}
              </span>
            )}
          </div>
        </div>

        {/* Info */}
        <div style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0 }}>
          <div>
            {series.genre && (
              <span style={{ fontSize: '9px', fontWeight: 700, color: '#d97706', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{series.genre}</span>
            )}
            <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '4px', lineHeight: 1.3 }}>{series.title}</div>
            <p style={{
              fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '6px', lineHeight: 1.5,
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
            }}>{series.synopsis}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {series.language && <span style={{ fontSize: '9px', color: 'var(--text-muted)', background: 'var(--bg-input)', padding: '2px 7px', borderRadius: '4px' }}>{series.language}</span>}
            <span style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '2px' }}><Eye size={10} strokeWidth={2} /> {formatViews(series.views ?? 0)}</span>
            <span style={{ fontSize: '11px', color: '#d97706', fontWeight: 700, marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>Read <ArrowRight size={11} strokeWidth={2} /></span>
          </div>
        </div>
      </div>
    </a>
  );
}
