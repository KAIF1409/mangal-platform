'use client';

import { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { supabase } from '../lib/supabase';
import { useCachedQuery } from '../lib/swrCache';
import type { BookRow } from '../lib/database.types';
import type { User } from '@supabase/supabase-js';
import ProfileMenu from '../components/shared/ProfileMenu';
import Navbar from '../components/shared/Navbar';
import Footer from '../components/shared/Footer';
import CrossProductLinks from '../components/shared/CrossProductLinks';
import SharedSeriesCard from '../components/webmangal/SeriesCard';
import SongCard from '../components/webmangal/SongCard';
import { hasCreatorAccess, isDeveloperRole } from '../lib/auth/roles';
import {
  Trophy, Bell, Bookmark, Wrench, X, Menu, Search, Sparkles, BookOpen,
  BookText, Circle, ArrowLeft, Music, FileText,
} from 'lucide-react';

// Same links shown in the desktop nav's centerSlot — reused by the mobile
// hamburger menu below so there's one source of truth for the nav items.
const NAV_LINKS = [
  { label: 'Browse', href: '/' },
  { label: 'Rankings', icon: <Trophy size={13} />, href: '/WebMangal/rankings' },
  { label: 'Genres', href: '/#genres' },
  { label: 'New Releases', href: '/#new' },
  { label: 'Library', icon: <Bell size={13} />, href: '/WebMangal/library' },
  { label: 'Bookmarks', icon: <Bookmark size={13} />, href: '/WebMangal/bookmarks' },
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

// Step 21 — Dual Content Mode: All/Manga/Novel/Books/Songs filter pill,
// same localStorage key + persistence pattern used on the homepage so the
// choice carries over. Books/Songs added per founder's explicit ask: they
// should behave exactly like Mangal/Novel (switch what's shown on THIS
// page) rather than navigating away to their own page.
type ContentTypeFilter = 'all' | 'mangal' | 'novel' | 'books' | 'songs';
const CONTENT_TYPE_STORAGE_KEY = 'mangal_content_type';

// BookRow comes from lib/database.types.ts (shared books-module row shape).

function formatPaise(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

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

function BrowseSearchViewInner({ mode }: { mode: 'browse' | 'search' }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const loginNext = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;

  // Browse (/WebMangal) never has a keyword — typing only matters on the
  // dedicated search route. Reading it here too would make the browse page
  // filter by a leftover ?keyword= from before a route rename/back-nav.
  const [query, setQuery] = useState(mode === 'search' ? (searchParams.get('keyword') ?? '') : '');
  // §139-B — the browse/search catalog is read-mostly published data, so all
  // three fetches below moved from mount-effects to the SWR layer ('catalog'
  // tier): a repeat visit to /WebMangal or /WebMangal/search paints instantly
  // from cache and revalidates in the background instead of re-shipping the
  // entire published-series list + all creator profiles + songs + books on
  // every navigation. Keys are shared across browse/search since both routes
  // render the same data through this one component.
  const { data: catalogData, isLoading: catalogLoading } = useCachedQuery(
    ['wm-browse-catalog'],
    async () => {
      // Fetch published series + creator usernames in parallel.
      // Username search is done client-side via this map since `series` has no username column itself.
      const [seriesRes, creatorsRes] = await Promise.all([
        supabase
          .from('series')
          .select('*')
          .eq('status', 'published')
          .order('created_at', { ascending: false }),
        supabase.from('creator_profiles').select('user_id, username'),
      ]);
      const map: Record<string, string> = {};
      ((creatorsRes.data ?? []) as { user_id: string; username: string }[]).forEach(c => {
        map[c.user_id] = c.username;
      });
      return { series: (seriesRes.data ?? []) as Series[], creatorUsernames: map };
    },
    'catalog',
  );
  // Derived via useMemo so downstream useMemo deps see a stable identity
  // (the SWR data object only changes on actual (re)validation).
  const series = useMemo(() => catalogData?.series ?? [], [catalogData]);
  const creatorUsernames = useMemo(() => catalogData?.creatorUsernames ?? {}, [catalogData]);
  const loading = catalogLoading;
  // §85 continued (4) — Songs. Own cache entry, entirely independent of the
  // series catalog above so a slow or failed songs fetch can never affect
  // the existing series search (historical note: this was search-route-only
  // once — now both routes, see the Books comment below).
  const { data: songsData, isLoading: songsLoading } = useCachedQuery(
    ['wm-songs'],
    async () => {
      const { data } = await supabase
        .from('songs')
        .select('id, title, genre, cover_url, views, blocks, creator_id, linked_series_id')
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .limit(200);
      const rows = (data ?? []) as { id: string; title: string; genre: string | null; cover_url: string | null; views: number; blocks: unknown[]; creator_id: string; linked_series_id: string | null }[];
      if (rows.length === 0) return { songs: [], songUsernames: {} };
      const creatorIds = Array.from(new Set(rows.map(r => r.creator_id)));
      const linkedSeriesIds = Array.from(new Set(rows.map(r => r.linked_series_id).filter(Boolean))) as string[];
      const [usernameRes, seriesRes] = await Promise.all([
        supabase.from('creator_profiles').select('user_id, username').in('user_id', creatorIds),
        linkedSeriesIds.length > 0
          ? supabase.from('series').select('id, title').in('id', linkedSeriesIds)
          : Promise.resolve({ data: [] as { id: string; title: string }[] }),
      ]);
      const usernameMap = Object.fromEntries((usernameRes.data ?? []).map(u => [u.user_id, u.username]));
      const seriesTitleMap = Object.fromEntries((seriesRes.data ?? []).map(s => [s.id, s.title]));
      return {
        songs: rows.map(r => ({
          id: r.id, title: r.title, genre: r.genre, cover_url: r.cover_url, views: r.views,
          block_count: Array.isArray(r.blocks) ? r.blocks.length : 0,
          linked_series_title: r.linked_series_id ? seriesTitleMap[r.linked_series_id] ?? null : null,
          creator_id: r.creator_id,
        })),
        songUsernames: usernameMap,
      };
    },
    'catalog',
  );
  const songs = useMemo(() => songsData?.songs ?? [], [songsData]);
  const songUsernames = useMemo(() => songsData?.songUsernames ?? {}, [songsData]);

  // Books — same shape as Songs above. Fetched unconditionally (both browse
  // and search) since, per founder's ask, the Books pill now behaves exactly
  // like Mangal/Novel: it switches what this page shows rather than
  // navigating to /WebMangal/books.
  const { data: booksData, isLoading: booksLoading } = useCachedQuery(
    ['wm-books'],
    async () => {
      const { data } = await supabase
        .from('books')
        .select('id, title, cover_image_url, file_type, pricing_type, price_paise, category, author_id, views, created_at')
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .limit(200);
      const rows = (data ?? []) as BookRow[];
      if (rows.length === 0) return { books: [] as BookRow[], bookAuthors: {} };
      const authorIds = Array.from(new Set(rows.map(b => b.author_id)));
      const { data: profiles } = await supabase.from('creator_profiles').select('user_id, username').in('user_id', authorIds);
      return {
        books: rows,
        bookAuthors: Object.fromEntries((profiles ?? []).map(p => [p.user_id, p.username])),
      };
    },
    'catalog',
  );
  const books = useMemo(() => booksData?.books ?? [], [booksData]);
  const bookAuthors = useMemo(() => booksData?.bookAuthors ?? {}, [booksData]);

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
      if (saved === 'all' || saved === 'mangal' || saved === 'novel' || saved === 'books' || saved === 'songs') setActiveContentType(saved); // eslint-disable-line react-hooks/set-state-in-effect
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
  }, []);

  // Keep the URL in sync (shareable/bookmarkable search), without a full page reload
  useEffect(() => {
    const params = new URLSearchParams();
    // Browse never carries a keyword in its URL — typing there only drives
    // the overlay's live preview, it doesn't filter the browse listing.
    if (mode === 'search' && query.trim()) params.set('keyword', query.trim());
    if (genreFilter !== 'All') params.set('genre', genreFilter);
    if (languageFilter !== 'All') params.set('language', languageFilter);
    if (statusFilter !== 'All') params.set('status', statusFilter);
    if (sortBy !== 'newest') params.set('sort', sortBy);
    const qs = params.toString();
    const base = mode === 'search' ? '/WebMangal/search' : '/WebMangal';
    router.replace(qs ? `${base}?${qs}` : base, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, query, genreFilter, languageFilter, statusFilter, sortBy]);

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

  // Filters that apply on both routes (genre/language/status/content type),
  // independent of any typed keyword.
  const baseFiltered = useMemo(() => {
    let r = series;
    if (activeContentType !== 'all') r = r.filter(s => s.content_type === activeContentType);
    if (genreFilter !== 'All') r = r.filter(s => s.genre === genreFilter);
    if (languageFilter !== 'All') r = r.filter(s => s.language === languageFilter);
    if (hasCompletionStatus && statusFilter !== 'All') r = r.filter(s => s.completion_status === statusFilter);
    return r;
  }, [series, activeContentType, genreFilter, languageFilter, statusFilter, hasCompletionStatus]);

  // Same as baseFiltered but without the content-type tab filter — used only
  // to compute the per-tab counts (e.g. "Mangal 8"/"Novel 4") on the search
  // route, since a tab's count shouldn't be affected by which tab is active.
  const baseFilteredNoType = useMemo(() => {
    let r = series;
    if (genreFilter !== 'All') r = r.filter(s => s.genre === genreFilter);
    if (languageFilter !== 'All') r = r.filter(s => s.language === languageFilter);
    if (hasCompletionStatus && statusFilter !== 'All') r = r.filter(s => s.completion_status === statusFilter);
    return r;
  }, [series, genreFilter, languageFilter, statusFilter, hasCompletionStatus]);

  const matchesQuery = (r: Series[], q: string) => {
    if (!q) return [];
    return r.filter(s => {
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
  };

  const sortResults = (r: Series[]) => {
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
  };

  const q = query.trim().toLowerCase();

  // §85 continued (4) — Songs matching, search route only. Same fuzzyMatch
  // helper as series, checked against title/genre/songwriter username.
  // Not wired into overlayResults/results/tabCounts above — those are all
  // series-typed and threading songs through them would mean widening
  // Series-shaped code paths to a union type across this whole file.
  // Kept as its own parallel result set instead, rendered as an
  // additional section (see RESULTS below).
  const songResults = useMemo(() => {
    if (mode !== 'search' || !q) return [];
    return songs.filter(s => {
      const username = (songUsernames[s.creator_id] ?? '').toLowerCase();
      return fuzzyMatch(s.title, q) || fuzzyMatch(s.genre ?? '', q) || username.includes(q);
    });
  }, [mode, q, songs, songUsernames]);

  // Same idea as songResults, for the Books tab — checked against
  // title/category/author username.
  const bookMatches = useMemo(() => {
    if (mode !== 'search' || !q) return [];
    return books.filter(b => {
      const username = (bookAuthors[b.author_id] ?? '').toLowerCase();
      return fuzzyMatch(b.title, q) || fuzzyMatch(b.category ?? '', q) || username.includes(q);
    });
  }, [mode, q, books, bookAuthors]);

  // Sort helper for Books/Songs — smaller than sortResults() above since
  // neither has a rating field; 'rating' falls back to newest (their
  // fetch is already ordered newest-first, so no re-sort needed for it).
  const sortSimple = <T extends { title: string; views?: number }>(r: T[]): T[] => {
    if (sortBy === 'views') return [...r].sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
    if (sortBy === 'az') return [...r].sort((a, b) => a.title.localeCompare(b.title));
    return r;
  };

  // What the Books/Songs tabs actually render: browse shows the full
  // published listing, search shows only keyword matches (same
  // "haven't searched yet" rule as the series results below).
  const activeBooks = useMemo(
    () => sortSimple(mode === 'search' ? bookMatches : books),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, bookMatches, books, sortBy]
  );
  const activeSongs = useMemo(
    () => sortSimple(mode === 'search' ? songResults : songs),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, songResults, songs, sortBy]
  );

  // The overlay's live "as you type" preview — always keyword-driven,
  // regardless of which route it was opened from.
  const overlayResults = useMemo(
    () => sortResults(matchesQuery(baseFiltered, q)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseFiltered, q, sortBy]
  );

  // The page's main results: browse always shows the (non-keyword) filtered
  // listing; search only shows results once a keyword has actually been
  // typed/submitted — an empty keyword means "haven't searched yet", not
  // "show everything".
  const results = useMemo(() => {
    if (mode === 'search') return q ? overlayResults : [];
    return sortResults(baseFiltered);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, q, overlayResults, baseFiltered, sortBy]);

  // Per-tab counts shown on the search route, e.g. Webnovel's "Novels 575".
  const tabCounts = useMemo(() => {
    if (mode !== 'search' || !q) return null;
    const matches = matchesQuery(baseFilteredNoType, q);
    return {
      all: matches.length,
      mangal: matches.filter(s => s.content_type === 'mangal').length,
      novel: matches.filter(s => s.content_type === 'novel').length,
      books: bookMatches.length,
      songs: songResults.length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, q, baseFilteredNoType, bookMatches, songResults]);

  const filtersActive = activeContentType !== 'all' || genreFilter !== 'All' || languageFilter !== 'All' || statusFilter !== 'All' || sortBy !== 'newest';
  const createHref = isCreator ? '/dashboard' : user ? '/become-creator' : '/login';
  const createLabel = isCreator ? 'Go to Studio' : user ? 'Become a Creator' : 'Log In to Create';

  // ── Webnovel-homepage-style "discovery" card + Hot Tags, browse route only ──
  // A series counts as having "new chapters" if it was created/updated in
  // the last 3 days — same idea as Webnovel's green "NEW CHAPTERS" tag.
  // Date.now() can't be called during render (impure), so it's captured
  // once via effect instead.
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => { setNowMs(Date.now()); }, []); // eslint-disable-line react-hooks/set-state-in-effect
  const recentlyUpdatedIds = useMemo(() => {
    if (nowMs === null) return new Set<string>();
    const cutoff = nowMs - 3 * 86_400_000;
    return new Set(series.filter(s => new Date(s.created_at).getTime() >= cutoff).map(s => s.id));
  }, [series, nowMs]);
  const recentCount = recentlyUpdatedIds.size;
  // Top of the discovery list: newest first, capped at 5 like the reference.
  const featuredList = useMemo(
    () => [...series].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5),
    [series]
  );
  // Hot Tags — genre distribution across all published series, most common first.
  const genreCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    series.forEach(s => { if (s.genre) counts[s.genre] = (counts[s.genre] ?? 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [series]);

  // Committing a search (Search button / Enter / keyboard "Go") always lands
  // on the dedicated /WebMangal/search route with ?keyword=..., matching
  // Webnovel's m.webnovel.com/search?keyword=solo pattern — browsing and
  // searching are two different pages, not one page that silently reuses
  // itself. If we're already on the search route, the URL-sync effect above
  // already keeps ?keyword= current, so this just needs to close the overlay.
  const submitSearch = () => {
    setMobileSearchOpen(false);
    if (mode === 'search') return;
    const trimmed = query.trim();
    if (trimmed) router.push(`/WebMangal/search?keyword=${encodeURIComponent(trimmed)}`);
  };

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
        href={`/WebMangal/series/${s.id}`}
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
              flexShrink: 0, fontSize: '11px', fontWeight: 800, color: '#fff',
              background: 'linear-gradient(135deg, #f97316, #22c55e)',
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

        .books-catalog-card:hover { transform: translateY(-3px); border-color: var(--accent) !important; }

        .mangal-search-toggle-row,
        .mangal-search-filters-row { flex-wrap: wrap; }

        .mangal-search-grid { grid-template-columns: repeat(auto-fit, minmax(160px, 200px)); }

        /* Hide the "powered by MANGAL" subtitle on most phones so the
           centered WebMangal wordmark never gets squeezed against the
           hamburger/search icons on the left or login/avatar on the right.
           Raised from 380px -> 460px: the subtitle was still showing (and
           overlapping the LOG IN button) on common phone widths above the
           old threshold — the wordmark+subtitle block also now clips with
           an ellipsis as a fallback for anything still tight below this. */
        @media (max-width: 460px) {
          .mangal-webmangal-mobile-subtitle { display: none; }
        }

        /* Extra-narrow phones: tighten the icon cluster and LOG IN button
           padding too, so there's more room for the wordmark itself. */
        @media (max-width: 340px) {
          .mangal-webmangal-mobile-iconbtn { width: 32px !important; height: 32px !important; }
          .mangal-webmangal-mobile-cta { padding: 7px 12px !important; font-size: 11px !important; }
        }

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

          /* Bounded card width so a single result stays a normal-sized tile
             instead of stretching to fill the whole screen. */
          .mangal-search-grid { grid-template-columns: repeat(auto-fit, minmax(105px, 130px)); gap: 10px; justify-content: start; }
        }

        @media (max-width: 340px) {
          .mangal-search-grid { grid-template-columns: repeat(2, 1fr); }
        }
      `}</style>

      {/* ── DESKTOP/LAPTOP NAV — identical to before, just hidden on phones ── */}
      <div className="mangal-search-navbar-desktop">
        <Navbar
          variant="custom"
          platformName="WebMangal"
          logoSrc="/webmangal-logo.png"
          href="/WebMangal"
          subtitle="powered by MANGAL"
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
                >{link.icon} {link.label}</a>
              ))}
            </div>
          }
          rightSlot={
            user ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <CrossProductLinks current="webmangal" />
                {isCreator && (
                  <a href="/dashboard" style={{
                    padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
                    background: 'rgba(217,119,6,0.15)', border: '1px solid rgba(217,119,6,0.3)',
                    color: '#d97706', textDecoration: 'none',
                  }}><Wrench size={13} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Studio</a>
                )}
                <ProfileMenu user={user} isCreator={isCreator} isDeveloper={isDeveloper} />
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <CrossProductLinks current="webmangal" />
                <a href={`/login?next=${encodeURIComponent(loginNext)}`} style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', textDecoration: 'none' }}>Log in</a>
                <a href={`/login?next=${encodeURIComponent(loginNext)}`} style={{
                  padding: '8px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
                  background: 'linear-gradient(135deg, #f97316, #22c55e)',
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
              className="mangal-webmangal-mobile-iconbtn"
              style={{
                width: '36px', height: '36px', borderRadius: '8px', border: 'none',
                background: 'transparent', color: '#f9fafb', fontSize: '18px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <button
              onClick={() => setMobileSearchOpen(true)}
              aria-label="Search"
              className="mangal-webmangal-mobile-iconbtn"
              style={{
                width: '36px', height: '36px', borderRadius: '8px', border: 'none',
                background: 'transparent', color: '#f9fafb', fontSize: '16px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <Search size={16} />
            </button>
          </div>

          <Link href="/WebMangal" style={{ display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none', minWidth: 0, flex: 1, overflow: 'hidden', justifyContent: 'center' }}>
            <Image src="/webmangal-logo.png" alt="WebMangal" width={200} height={200} style={{ display: 'block', height: '28px', width: '28px', objectFit: 'contain', flexShrink: 0 }} priority />
            {/* Wordmark + subtitle wrapped together and clipped as a unit
                (minWidth:0 + overflow:hidden + ellipsis) instead of being
                left to overflow — on a narrow phone this used to bleed out
                of its flex:1 center slot and visually overlap the
                hamburger/search icons on the left and the LOG IN button on
                the right (the bug in the screenshot). Now it truncates
                cleanly instead of colliding with its neighbors. */}
            <span style={{ display: 'flex', alignItems: 'baseline', gap: '4px', minWidth: 0, overflow: 'hidden' }}>
              <span style={{
                fontWeight: 900, fontSize: '15px', color: '#f9fafb', letterSpacing: '0.02em',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>WebMangal</span>
              <span
                className="mangal-webmangal-mobile-subtitle"
                style={{ fontSize: '9px', fontWeight: 700, color: '#9ca3af', letterSpacing: '0.01em', whiteSpace: 'nowrap', flexShrink: 0 }}
              >powered by MANGAL</span>
            </span>
          </Link>

          {user ? (
            <div style={{ flexShrink: 0 }}><ProfileMenu user={user} isCreator={isCreator} isDeveloper={isDeveloper} /></div>
          ) : (
            <a href={`/login?next=${encodeURIComponent(loginNext)}`} className="mangal-webmangal-mobile-cta" style={{
              flexShrink: 0, padding: '8px 16px', borderRadius: '20px', fontSize: '12px', fontWeight: 800,
              background: 'linear-gradient(135deg, #f97316, #22c55e)', color: '#fff', textDecoration: 'none',
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
                >{link.icon} {link.label}</a>
              ))}

              <div style={{ height: '1px', background: '#1f1f2a', margin: '6px 4px' }} />

              <div style={{ padding: '6px 14px 4px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>More MANGAL</span>
                <CrossProductLinks current="webmangal" size={24} />
              </div>

              <div style={{ height: '1px', background: '#1f1f2a', margin: '6px 4px' }} />

              {isCreator && (
                <a
                  href="/dashboard"
                  onClick={() => setMobileMenuOpen(false)}
                  style={{ padding: '12px 14px', borderRadius: '8px', fontSize: '14px', fontWeight: 700, color: '#d97706', textDecoration: 'none' }}
                ><Wrench size={13} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Studio</a>
              )}

              {!user && (
                <a
                  href={`/login?next=${encodeURIComponent(loginNext)}`}
                  onClick={() => setMobileMenuOpen(false)}
                  style={{
                    marginTop: '4px', padding: '12px 14px', borderRadius: '20px', fontSize: '14px', fontWeight: 800,
                    textAlign: 'center', background: 'linear-gradient(135deg, #f97316, #22c55e)',
                    color: '#fff', textDecoration: 'none', letterSpacing: '0.03em',
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
            ><ArrowLeft size={16} /></button>
            <input
              autoFocus
              type="text"
              placeholder="Search series, genres, creators..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); submitSearch(); }
              }}
              style={{
                flex: 1, padding: '11px 14px', borderRadius: '10px',
                background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                color: 'var(--text-primary)', fontSize: '14px', outline: 'none', boxSizing: 'border-box',
              }}
            />
            <button
              type="button"
              onClick={submitSearch}
              style={{
                flexShrink: 0, padding: '11px 18px', borderRadius: '10px', border: 'none',
                background: 'linear-gradient(135deg, #f97316, #22c55e)', color: '#fff',
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
            ) : overlayResults.length === 0 ? (
              <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text-faint)', fontSize: '13px' }}>
                No results found for &ldquo;<span style={{ color: '#d97706' }}>{query.trim()}</span>&rdquo;.
              </div>
            ) : (
              overlayResults.slice(0, 30).map(s => renderResultCard(s, () => setMobileSearchOpen(false)))
            )}
          </div>
        </div>
      )}

      <div className="mangal-search-container" style={{ maxWidth: '1100px', margin: '0 auto', flex: 1, width: '100%', boxSizing: 'border-box' }}>

        {/* ── SEARCH BAR (desktop/tablet only — phones use the header's
             full-screen overlay above instead, see .mangal-search-bar-inline) ── */}
        <div className="mangal-search-bar-inline" style={{ position: 'relative', marginBottom: '20px' }}>
          <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex' }}><Search size={16} /></span>
          <input
            ref={searchInputRef}
            type="text"
            autoFocus={mode === 'search'}
            placeholder="Search series, genres, creators..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submitSearch(); } }}
            style={{
              width: '100%', padding: '14px 16px 14px 44px', borderRadius: '12px',
              background: 'var(--bg-card)', border: '1px solid var(--border-color)',
              color: 'var(--text-primary)', fontSize: '14px', outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

        {/* ── CONTENT TYPE TOGGLE (Step 21) — on the search route each tab
             also shows a Webnovel-style count (e.g. "Mangal 8") once a
             keyword has been typed. Books/Songs behave exactly like
             Mangal/Novel (switch what this page shows) per founder's
             explicit ask — no navigation, same toggle mechanism. ── */}
        <div className="mangal-search-toggle-row" style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
          {([
            { value: 'all' as ContentTypeFilter, emoji: <Sparkles size={13} />, label: 'All' },
            { value: 'mangal' as ContentTypeFilter, emoji: <BookOpen size={13} />, label: 'Mangal' },
            { value: 'novel' as ContentTypeFilter, emoji: <BookText size={13} />, label: 'Novel' },
            { value: 'books' as ContentTypeFilter, emoji: <FileText size={13} />, label: 'Books' },
            { value: 'songs' as ContentTypeFilter, emoji: <Music size={13} />, label: 'Songs' },
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
              {tabCounts && <span style={{ opacity: 0.6, fontWeight: 600, marginLeft: '4px' }}>{tabCounts[opt.value]}</span>}
            </button>
          ))}
        </div>

        {/* ── DISCOVERY CARD (Webnovel homepage style) — browse route only.
             Dark hero card: horizontal-scroll genre hashtags, a series/new
             count line, then a short list of the newest series (cover left,
             "NEW CHAPTERS" tag if updated in the last 3 days, title, author). ── */}
        {mode === 'browse' && !loading && series.length > 0 && (
          <div style={{
            borderRadius: '16px', overflow: 'hidden', marginBottom: '20px',
            background: 'linear-gradient(180deg, rgba(127,29,29,0.55), rgba(10,10,15,0.94))',
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <div style={{ padding: '16px 16px 6px' }}>
              <div style={{ display: 'flex', gap: '16px', overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: '4px' }}>
                {GENRE_OPTIONS.filter(g => g !== 'All').map(g => (
                  <button
                    key={g}
                    onClick={() => setGenreFilter(g === genreFilter ? 'All' : g)}
                    style={{
                      flexShrink: 0, background: 'transparent', border: 'none', cursor: 'pointer',
                      fontSize: '13px', fontWeight: 800, letterSpacing: '0.02em', padding: 0,
                      color: genreFilter === g ? '#6ee7b7' : '#e5e7eb',
                    }}
                  >#{g.toUpperCase()}</button>
                ))}
              </div>
              <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '6px', marginBottom: '10px' }}>
                {series.length} {series.length === 1 ? 'series' : 'series'} on MANGAL
                {recentCount > 0 && <span style={{ color: '#6ee7b7' }}> · +{recentCount} new</span>}
              </div>
            </div>
            <div style={{ padding: '0 16px 14px' }}>
              {featuredList.map(s => (
                <Link
                  key={s.id}
                  href={`/WebMangal/series/${s.id}`}
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '9px 0', textDecoration: 'none' }}
                >
                  <div style={{ width: '46px', height: '62px', borderRadius: '6px', overflow: 'hidden', flexShrink: 0, background: '#1f1f2a', position: 'relative' }}>
                    {s.cover_url && <Image src={s.cover_url} alt={s.title} fill sizes="46px" style={{ objectFit: 'cover' }} />}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    {recentlyUpdatedIds.has(s.id) && (
                      <div style={{ fontSize: '10px', fontWeight: 800, color: '#6ee7b7', marginBottom: '2px', letterSpacing: '0.03em' }}>NEW CHAPTERS</div>
                    )}
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#f9fafb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.title}
                    </div>
                    <div style={{ fontSize: '12px', color: '#9ca3af' }}>by {creatorUsernames[s.creator_id] ?? 'Unknown'}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ── HOT TAGS — genre breakdown, browse route only ── */}
        {mode === 'browse' && !loading && genreCounts.length > 0 && (
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px',
            padding: '16px', marginBottom: '20px',
          }}>
            <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '6px' }}>Hot Tags</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
              <Circle size={9} fill="#22c55e" stroke="none" style={{ verticalAlign: 'middle' }} /> {series.length} series across {genreCounts.length} genres
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 16px' }}>
              {genreCounts.map(([genre, count]) => (
                <a
                  key={genre}
                  href={`/WebMangal?genre=${encodeURIComponent(genre)}`}
                  style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', textDecoration: 'none' }}
                >
                  #{genre.toUpperCase()}<span style={{ color: 'var(--text-faint)', fontWeight: 600 }}> ({count})</span>
                </a>
              ))}
            </div>
          </div>
        )}


        {/* ── FILTERS + SORT ── */}
        <div className="mangal-search-filters-row" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '10px', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {/* Genre/Language/Status are series-specific vocab (mangal/novel
                content_type) — Books use a different category list, Songs
                have neither, so these only make sense for All/Mangal/Novel. */}
            {(activeContentType === 'all' || activeContentType === 'mangal' || activeContentType === 'novel') && (
              <>
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
              </>
            )}

            {filtersActive && (
              <button
                onClick={() => { handleContentTypeToggle('all'); setGenreFilter('All'); setLanguageFilter('All'); setStatusFilter('All'); setSortBy('newest'); }}
                style={{
                  padding: '9px 14px', borderRadius: '8px', background: 'transparent',
                  border: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                }}
              >
                Clear filters <X size={12} style={{ verticalAlign: 'middle' }} />
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
              {(activeContentType === 'books' || activeContentType === 'songs'
                ? SORT_OPTIONS.filter(s => s.value !== 'rating')
                : SORT_OPTIONS
              ).map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>

        <div style={{ marginBottom: '18px' }} />

        {/* ── SONGS RESULTS (§85 continued (4), search route only) ──
            Rendered independently of the series RESULTS block below —
            shows whenever there's a keyword and matching songs, even if
            series matched nothing (or the reverse), so a song-only or
            series-only search both work correctly. Hidden while the
            Songs tab itself is active — the main RESULTS grid below
            already shows the full list then, so this preview would just
            be a smaller, redundant duplicate. */}
        {mode === 'search' && q && songResults.length > 0 && activeContentType !== 'songs' && (
          <div style={{ marginBottom: '28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Music size={14} strokeWidth={2} color="#a78bfa" /> Songs ({songResults.length})
              </h3>
              <button onClick={() => handleContentTypeToggle('songs')} style={{ fontSize: '12px', fontWeight: 700, color: '#a78bfa', background: 'none', border: 'none', cursor: 'pointer' }}>
                See all songs →
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 170px))', gap: '14px' }}>
              {songResults.slice(0, 8).map(s => (
                <SongCard key={s.id} song={s} creatorUsername={songUsernames[s.creator_id]} />
              ))}
            </div>
          </div>
        )}

        {/* ── RESULTS ── */}
        {activeContentType === 'books' ? (
          /* Books tab — same toggle mechanism as Mangal/Novel now (founder's
             ask), rendered with the book-catalog card design from
             /WebMangal/books/page.tsx (price badge, cover, file type). */
          booksLoading ? (
            <div style={{ padding: '80px 0', textAlign: 'center', color: 'var(--text-faint)' }}>
              <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'center' }}><FileText size={32} /></div>
              <div style={{ fontSize: '14px' }}>Loading books...</div>
            </div>
          ) : mode === 'search' && !q ? (
            <div style={{ padding: '80px 0', textAlign: 'center', color: 'var(--text-faint)' }}>
              <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'center' }}><Search size={32} /></div>
              <div style={{ fontSize: '14px', color: 'var(--text-tertiary)' }}>Search for a title, category, or creator to get started.</div>
            </div>
          ) : activeBooks.length === 0 ? (
            <div style={{ padding: '80px 0', textAlign: 'center', color: 'var(--text-faint)' }}>
              <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'center' }}><FileText size={32} /></div>
              <div style={{ fontSize: '14px', color: 'var(--text-tertiary)' }}>
                {query.trim() ? <>No books found for &ldquo;<span style={{ color: '#d97706' }}>{query.trim()}</span>&rdquo;.</> : 'No books published yet.'}
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>{activeBooks.length} books found</div>
              <div className="mangal-search-grid" style={{ display: 'grid', gap: '16px' }}>
                {activeBooks.map(book => (
                  <Link key={book.id} href={`/WebMangal/books/${book.id}`} style={{ textDecoration: 'none', display: 'block' }}>
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden', height: '100%', transition: 'transform 0.15s, border-color 0.15s' }} className="books-catalog-card">
                      <div style={{ position: 'relative', width: '100%', aspectRatio: '2 / 3', background: 'linear-gradient(135deg, rgba(var(--accent-rgb), 0.15), var(--bg-input))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {book.cover_image_url ? (
                          <Image src={book.cover_image_url} alt={book.title} fill unoptimized style={{ objectFit: 'cover' }} />
                        ) : (
                          <BookOpen size={30} style={{ color: 'var(--text-faint)' }} />
                        )}
                        <span style={{
                          position: 'absolute', top: '8px', left: '8px', padding: '3px 9px', borderRadius: '999px',
                          fontSize: '10.5px', fontWeight: 800,
                          background: book.pricing_type === 'PAID' ? 'rgba(var(--accent-rgb), 0.92)' : 'rgba(16,185,129,0.92)',
                          color: '#fff',
                        }}>
                          {book.pricing_type === 'PAID' && book.price_paise ? formatPaise(book.price_paise) : 'FREE'}
                        </span>
                      </div>
                      <div style={{ padding: '10px 12px 12px' }}>
                        <div style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.35, marginBottom: '4px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{book.title}</div>
                        <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginBottom: '6px' }}>@{bookAuthors[book.author_id] ?? 'unknown'}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10.5px', color: 'var(--text-tertiary)' }}>
                          <FileText size={11} /> {book.file_type.toUpperCase()}
                          {book.category ? <span>· {book.category}</span> : null}
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )
        ) : activeContentType === 'songs' ? (
          songsLoading ? (
            <div style={{ padding: '80px 0', textAlign: 'center', color: 'var(--text-faint)' }}>
              <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'center' }}><Music size={32} /></div>
              <div style={{ fontSize: '14px' }}>Loading songs...</div>
            </div>
          ) : mode === 'search' && !q ? (
            <div style={{ padding: '80px 0', textAlign: 'center', color: 'var(--text-faint)' }}>
              <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'center' }}><Search size={32} /></div>
              <div style={{ fontSize: '14px', color: 'var(--text-tertiary)' }}>Search for a title, genre, or creator to get started.</div>
            </div>
          ) : activeSongs.length === 0 ? (
            <div style={{ padding: '80px 0', textAlign: 'center', color: 'var(--text-faint)' }}>
              <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'center' }}><Music size={32} /></div>
              <div style={{ fontSize: '14px', color: 'var(--text-tertiary)' }}>
                {query.trim() ? <>No songs found for &ldquo;<span style={{ color: '#d97706' }}>{query.trim()}</span>&rdquo;.</> : 'No songs published yet.'}
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>{activeSongs.length} songs found</div>
              <div className="mangal-search-grid" style={{ display: 'grid', gap: '16px' }}>
                {activeSongs.map(s => (
                  <SongCard key={s.id} song={s} creatorUsername={songUsernames[s.creator_id]} />
                ))}
              </div>
            </>
          )
        ) : loading ? (
          <div style={{ padding: '80px 0', textAlign: 'center', color: 'var(--text-faint)' }}>
            <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'center' }}><BookOpen size={32} /></div>
            <div style={{ fontSize: '14px' }}>Loading stories...</div>
          </div>
        ) : mode === 'search' && !q ? (
          /* Nothing searched yet — dedicated search route shouldn't dump the
             entire catalog like the old combined page did. */
          <div style={{ padding: '80px 0', textAlign: 'center', color: 'var(--text-faint)' }}>
            <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'center' }}><Search size={32} /></div>
            <div style={{ fontSize: '14px', color: 'var(--text-tertiary)' }}>
              Search for a title, genre, or creator to get started.
            </div>
          </div>
        ) : results.length === 0 ? (
          /* §85 continued (4) — if songs matched even though series didn't,
             skip the series "no results" CTA entirely rather than showing
             a misleading "Be the first to create it!" beneath a Songs
             section that already has results. */
          mode === 'search' && songResults.length > 0 ? null :
          <div style={{ padding: '80px 0', textAlign: 'center', color: 'var(--text-faint)' }}>
            <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'center' }}><Search size={32} /></div>
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
                  background: 'linear-gradient(135deg, #f97316, #22c55e)',
                  color: '#fff', fontSize: '13px', fontWeight: 700, textDecoration: 'none',
                }}>{createLabel}</a>
              </>
            )}
          </div>
        ) : mode === 'search' ? (
          /* Search route always uses the Webnovel-style list — cover left,
             tags/synopsis/author/ADD right — same design on desktop and
             mobile, matching m.webnovel.com/search?keyword=... exactly. */
          <>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              {results.length} series found
            </div>
            <div>{results.map(s => renderResultCard(s))}</div>
          </>
        ) : (
          /* Browse route keeps the grid of tiles — this is regular
             catalog-browsing, not a search-results view. */
          <>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              {results.length} series found
            </div>
            <div className="mangal-search-grid" style={{ display: 'grid', gap: '16px' }}>
              {results.map((s, i) => (
                <SharedSeriesCard key={s.id} series={s} creatorUsername={creatorUsernames[s.creator_id]} rank={sortBy === 'views' ? i + 1 : undefined} />
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

export default function BrowseSearchView({ mode }: { mode: 'browse' | 'search' }) {
  return (
    <Suspense fallback={null}>
      <BrowseSearchViewInner mode={mode} />
    </Suspense>
  );
}
