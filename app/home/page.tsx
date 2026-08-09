'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { supabase } from '../lib/supabase';
import ProfileMenu from '../components/ProfileMenu';
import { hasCreatorAccess, isDeveloperRole } from '../lib/roles';
import { useUiLanguage, LANGUAGES } from '../lib/i18n';

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
}

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
function formatViews(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

export default function HomePage() {
  const router = useRouter();
  const { lang, setLang, t } = useUiLanguage();
  const [series, setSeries] = useState<Series[]>([]);
  const [filtered, setFiltered] = useState<Series[]>([]);
  const [search, setSearch] = useState('');
  const [activeGenre, setActiveGenre] = useState('All');
  const [activeContentType, setActiveContentType] = useState<'all' | 'mangal' | 'novel'>('all');
  // Step 23 — Desi Comics: a standalone toggle (not part of the genre-pill
  // row), styled as its own badge beside the content-type toggle per
  // founder's request. Independent of activeGenre/activeContentType so it
  // can layer on top of either filter state.
  const [showDesiComics, setShowDesiComics] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [isCreator, setIsCreator] = useState(false);
  const [isDeveloper, setIsDeveloper] = useState(false);
  const [continueReading, setContinueReading] = useState<ContinueItem[]>([]);

  // Step 9 — Homepage Discovery Sections
  const [trending, setTrending] = useState<Series[]>([]);
  const STAFF_PICK_TITLES: string[] = []; // developer-curated list — add exact series titles here

  // Step 21 — content type toggle: persist across sessions
  useEffect(() => {
    try {
      const saved = localStorage.getItem('mangal_content_type') as 'all' | 'mangal' | 'novel' | null;
      if (saved && ['all', 'mangal', 'novel'].includes(saved)) setActiveContentType(saved);
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
      }
    });

    supabase
      .from('series')
      .select('*')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) { setSeries(data); setFiltered(data); }
        setLoading(false);
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
  }, []);

  useEffect(() => {
    let result = series;
    if (activeGenre !== 'All') result = result.filter(s => s.genre === activeGenre);
    if (activeContentType !== 'all') result = result.filter(s => s.content_type === activeContentType);
    if (showDesiComics) result = result.filter(s => s.genre && DESI_GENRES.includes(s.genre));
    setFiltered(result);
  }, [activeGenre, activeContentType, showDesiComics, series]);

  const featured = filtered.slice(0, 3);
  const rest = filtered.slice(3);

  // Step 9 — New Arrivals: latest 6 published series (filtered by content type)
  const newArrivals = (activeContentType === 'all' ? series : series.filter(s => s.content_type === activeContentType)).slice(0, 6);

  // Step 9 — Staff Picks: developer-curated, matched by exact title. Empty list = section hidden.
  const staffPicks = series.filter(s => STAFF_PICK_TITLES.includes(s.title) && (activeContentType === 'all' || s.content_type === activeContentType)).slice(0, 6);

  const setContentType = (ct: 'all' | 'mangal' | 'novel') => {
    setActiveContentType(ct);
    try { localStorage.setItem('mangal_content_type', ct); } catch { /* ignore */ }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#07070a', color: '#f9fafb', fontFamily: "'Segoe UI', Arial, sans-serif", overflowX: 'hidden', maxWidth: '100vw' }}>

      {/* ── NAV ── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(7,7,10,0.97)', backdropFilter: 'blur(16px)',
        borderBottom: '1px solid #1a1a26',
        padding: '0 16px', height: '64px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        {/* Logo */}
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none', flexShrink: 0 }}>
          <Image
            src="/icon.png"
            alt="MANGAL"
            width={36}
            height={36}
            style={{ display: 'block', filter: 'drop-shadow(0 0 8px rgba(217,119,6,0.5))' }}
            priority
          />
          <span style={{ fontWeight: 900, fontSize: '20px', color: '#fff', letterSpacing: '-0.03em' }}>MANGAL</span>
        </a>

        {/* Center Nav Links */}
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center', overflow: 'hidden', flexShrink: 1 }}>
          {[
            { label: t('browse'), href: '/' },
            { label: t('genres'), href: '/#genres' },
            { label: t('newReleases'), href: '/#new' },
            { label: t('library'), href: '/library' },
          ].map(link => (
            <a key={link.label} href={link.href} style={{
              padding: '6px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
              color: '#9ca3af', textDecoration: 'none', whiteSpace: 'nowrap',
              transition: 'color 0.15s, background 0.15s',
            }}
              onMouseEnter={e => { (e.target as HTMLElement).style.color = '#fff'; (e.target as HTMLElement).style.background = '#1a1a26'; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.color = '#9ca3af'; (e.target as HTMLElement).style.background = 'transparent'; }}
            >{link.label}</a>
          ))}
        </div>

        {/* Right side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Step 22 — Hindi UI Toggle. Sits left of ProfileMenu/auth buttons so
              the profile chip always stays the rightmost element on every page. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px', background: '#0d0d14', border: '1px solid #1a1a26', borderRadius: '8px', padding: '3px' }}>
            {LANGUAGES.map(({ code, label }) => (
              <button
                key={code}
                onClick={() => setLang(code)}
                style={{
                  padding: '5px 10px', borderRadius: '6px', border: 'none',
                  background: lang === code ? '#1a1a26' : 'transparent',
                  color: lang === code ? '#fff' : '#6b7280',
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
                  color: '#d97706', textDecoration: 'none',
                }}>{t('studio')}</a>
              )}
              {/* Profile click → sliding dropdown. Reader accounts see Become a Creator
                  here instead of any creator tools — this is the only upgrade path. */}
              <ProfileMenu user={user} isCreator={isCreator} isDeveloper={isDeveloper} />
            </>
          ) : (
            <>
              <a href="/login" style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: '#9ca3af', textDecoration: 'none' }}>{t('logIn')}</a>
              <a href="/login" style={{
                padding: '8px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
                background: 'linear-gradient(135deg, #7f1d1d, #991b1b)',
                color: '#fff', textDecoration: 'none',
              }}>{t('getStarted')}</a>
            </>
          )}
        </div>
      </nav>


      {/* ── HERO BANNER ── */}
      <div style={{
        position: 'relative', overflow: 'hidden',
        padding: '64px 24px 56px',
        borderBottom: '1px solid #1a1a26',
        minHeight: '420px',
        display: 'flex', alignItems: 'center',
      }}>
        {/* BG IMAGE — comics.png */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 0,
          backgroundImage: 'url(/comics.png)',
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
          <p style={{ fontSize: '16px', color: '#e5e7eb', maxWidth: '480px', margin: '0 auto 32px', lineHeight: 1.6, textShadow: '0 1px 12px rgba(0,0,0,0.9)' }}>
            {t('heroSubtitle')}
          </p>

          {/* Search — Step 10: navigates to the dedicated /search page on Enter
              instead of filtering this grid in place */}
          <form
            onSubmit={e => { e.preventDefault(); if (search.trim()) router.push(`/search?q=${encodeURIComponent(search.trim())}`); }}
            style={{ maxWidth: '480px', margin: '0 auto', position: 'relative' }}
          >
            <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', fontSize: '16px', pointerEvents: 'none' }}>🔍</span>
            <input
              type="text"
              placeholder={t('searchPlaceholder')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%', padding: '14px 16px 14px 44px', borderRadius: '12px',
                background: '#0d0d14', border: '1px solid #2a2a3a',
                color: '#fff', fontSize: '14px', outline: 'none', boxSizing: 'border-box',
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
            <h2 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 16px', color: '#fff' }}>
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
                  : '#0d0d14',
                color: activeContentType === value ? '#fff' : '#6b7280',
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
              border: showDesiComics ? '1px solid #16a34a' : '1px solid #1a1a26',
              background: showDesiComics ? 'rgba(22,163,74,0.15)' : '#0d0d14',
              color: showDesiComics ? '#4ade80' : '#6b7280',
              transition: 'all 0.15s',
            }}
          >
            🇮🇳 {t('desiComics')}
          </button>
        </div>

        {/* ── GENRE TABS ── */}
        <div id="genres" style={{
          display: 'flex', gap: '6px', overflowX: 'auto', padding: '20px 0',
          scrollbarWidth: 'none', borderBottom: '1px solid #1a1a26',
        }}>
          {GENRES.map(g => (
            <button key={g} onClick={() => setActiveGenre(g)} style={{
              padding: '7px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer',
              fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0,
              background: activeGenre === g ? 'linear-gradient(135deg, #7f1d1d, #d97706)' : '#0d0d14',
              color: activeGenre === g ? '#fff' : '#6b7280',
              transition: 'all 0.15s',
            }}>
              {t(GENRE_KEYS[g] as any)}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: '80px 0', textAlign: 'center', color: '#374151' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>📖</div>
            <div style={{ fontSize: '14px' }}>{t('loadingStories')}</div>
          </div>
        ) : filtered.length === 0 && (activeGenre !== 'All' || showDesiComics) ? (
          <div style={{ padding: '80px 0', textAlign: 'center', color: '#374151' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔍</div>
            <div style={{ fontSize: '14px' }}>{t('noSeriesInFilter')}</div>
          </div>
        ) : (
          <>
            {/* Step 9 — Trending This Week (top 6 by views in last 7 days) */}
            {trending.filter(s => activeContentType === 'all' || s.content_type === activeContentType).length > 0 && activeGenre === 'All' && !showDesiComics && (
              <section style={{ padding: '32px 0 0' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 16px', color: '#fff' }}>
                  {t('trendingThisWeek')}
                </h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '16px', marginBottom: '40px' }}>
                  {trending.filter(s => activeContentType === 'all' || s.content_type === activeContentType).map(s => (
                    <SeriesCard key={s.id} series={s} />
                  ))}
                </div>
              </section>
            )}

            {/* Step 9 — New Arrivals (latest 6 published) */}
            {newArrivals.length > 0 && activeGenre === 'All' && !showDesiComics && (
              <section style={{ padding: '8px 0 0' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 16px', color: '#fff' }}>
                  {t('newArrivals')}
                </h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '16px', marginBottom: '40px' }}>
                  {newArrivals.map(s => (
                    <SeriesCard key={s.id} series={s} />
                  ))}
                </div>
              </section>
            )}

            {/* Step 9 — Staff Picks (developer-curated, hidden until STAFF_PICK_TITLES is populated) */}
            {staffPicks.length > 0 && activeGenre === 'All' && !showDesiComics && (
              <section style={{ padding: '8px 0 0' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 16px', color: '#fff' }}>
                  {t('staffPicks')}
                </h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '16px', marginBottom: '40px' }}>
                  {staffPicks.map(s => (
                    <SeriesCard key={s.id} series={s} />
                  ))}
                </div>
              </section>
            )}

            {/* ── FEATURED (first 3) ── */}
            {featured.length > 0 && activeGenre === 'All' && !showDesiComics && (
              <section style={{ padding: '32px 0 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: '#fff' }}>
                    {t('featured')}
                  </h2>
                  <span style={{ fontSize: '12px', color: '#4b5563' }}>{series.length} {t('seriesTotal')}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px', marginBottom: '40px' }}>
                  {featured.map(s => (
                    <FeaturedCard key={s.id} series={s} />
                  ))}
                </div>
              </section>
            )}

            {/* ── ALL SERIES GRID ── */}
            <section id="new" style={{ padding: '8px 0 40px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 16px', color: '#fff' }}>
                {showDesiComics
                  ? `🇮🇳 ${t('desiComics')}`
                  : activeGenre !== 'All'
                  ? `${t(GENRE_KEYS[activeGenre] as any)} ${t('genreSeriesSuffix')}`
                  : t('allSeries')}
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '16px' }}>
                {(activeGenre !== 'All' || showDesiComics ? filtered : rest).map(s => (
                  <SeriesCard key={s.id} series={s} />
                ))}
              </div>
            </section>
          </>
        )}
      </div>

      {/* ── FOOTER ── */}
      <footer style={{ borderTop: '1px solid #1a1a26', padding: '32px 24px', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center', marginBottom: '12px' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'linear-gradient(135deg, #7f1d1d, #d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>🔥</div>
          <span style={{ fontWeight: 900, fontSize: '16px', color: '#fff' }}>MANGAL</span>
        </div>
        <p style={{ fontSize: '12px', color: '#374151', margin: 0 }}>Made with ❤️ in India · Free to read, forever.</p>
      </footer>
    </div>
  );
}

/* ── CONTINUE READING CARD (Step 2) ── */
function ContinueCard({ item }: { item: ContinueItem }) {
  const [hovered, setHovered] = useState(false);
  return (
    <a href={`/read/${item.chapterId}`} style={{ textDecoration: 'none', flexShrink: 0, width: '150px' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}>
      <div style={{
        borderRadius: '12px', overflow: 'hidden',
        background: '#0d0d14', border: `1px solid ${hovered ? '#d97706' : '#1a1a26'}`,
        transition: 'border-color 0.2s, transform 0.2s',
        transform: hovered ? 'translateY(-3px)' : 'none',
      }}>
        {/* Cover */}
        <div style={{ position: 'relative', aspectRatio: '3/4', background: '#1a0a0a' }}>
          {item.coverUrl ? (
            <Image src={item.coverUrl} alt={item.seriesTitle} fill sizes="(max-width: 768px) 45vw, 200px" style={{ objectFit: 'cover' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px' }}>📜</div>
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
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#fff', lineHeight: 1.3,
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
    <a href={`/series/${series.id}`} style={{ textDecoration: 'none' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}>
      <div style={{
        display: 'flex', gap: '0', borderRadius: '14px', overflow: 'hidden',
        background: '#0d0d14', border: `1px solid ${hovered ? '#d97706' : '#1a1a26'}`,
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
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px' }}>📜</div>
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
              {series.content_type === 'novel' ? '📕 NOVEL' : '📖 MANGAL'}
            </span>
            {series.content_type !== 'novel' && (
              <span style={{
                background: 'rgba(0,0,0,0.7)', borderRadius: '4px', padding: '2px 6px',
                fontSize: '9px', fontWeight: 700, color: '#9ca3af',
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
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#fff', marginTop: '4px', lineHeight: 1.3 }}>{series.title}</div>
            <p style={{
              fontSize: '11px', color: '#6b7280', marginTop: '6px', lineHeight: 1.5,
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
            }}>{series.synopsis}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {series.language && <span style={{ fontSize: '9px', color: '#4b5563', background: '#08080c', padding: '2px 7px', borderRadius: '4px' }}>{series.language}</span>}
            <span style={{ fontSize: '9px', color: '#4b5563' }}>👁 {formatViews(series.views ?? 0)}</span>
            <span style={{ fontSize: '11px', color: '#d97706', fontWeight: 700, marginLeft: 'auto' }}>Read →</span>
          </div>
        </div>
      </div>
    </a>
  );
}

/* ── SERIES CARD (portrait/grid) ── */
function SeriesCard({ series }: { series: Series }) {
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
        {/* Cover */}
        <div style={{ position: 'relative', aspectRatio: '3/4', background: '#1a0a0a' }}>
          {series.cover_url ? (
            <Image src={series.cover_url} alt={series.title} fill sizes="(max-width: 768px) 45vw, 200px" style={{ objectFit: 'cover' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '36px' }}>📜</div>
          )}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%)',
            padding: '20px 8px 6px',
            display: 'flex', alignItems: 'center', gap: '4px',
          }}>
            <span style={{
              fontSize: '9px', fontWeight: 700, color: '#fff',
              background: series.content_type === 'novel' ? 'rgba(109,40,217,0.9)' : 'rgba(127,29,29,0.9)',
              padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase',
            }}>
              {series.content_type === 'novel' ? '📕 Novel' : '📖 Mangal'}
            </span>
            {series.content_type !== 'novel' && (
              <span style={{
                fontSize: '9px', fontWeight: 700, color: '#d1d5db',
                background: 'rgba(0,0,0,0.6)', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase',
              }}>
                {series.reading_mode === 'scroll' ? 'Scroll' : 'Page'}
              </span>
            )}
          </div>
        </div>
        {/* Title + genre */}
        <div style={{ padding: '10px 10px 12px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#fff', lineHeight: 1.3, marginBottom: '4px',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {series.title}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {series.genre ? <div style={{ fontSize: '10px', color: '#d97706' }}>{series.genre}</div> : <span />}
            <span style={{ fontSize: '9px', color: '#4b5563' }}>👁 {formatViews(series.views ?? 0)}</span>
          </div>
        </div>
      </div>
    </a>
  );
}