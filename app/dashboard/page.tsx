'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';
import ProfileMenu from '../components/ProfileMenu';
import EditSeriesModal from '../components/EditSeriesModal';
import ManagePagesModal from '../components/ManagePagesModal';
import { hasCreatorAccess, isDeveloperRole } from '../lib/roles';
import { useUiLanguage, LANGUAGES } from '../lib/i18n';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import Link from 'next/link';

interface Story {
  id: string;
  title: string;
  synopsis: string;
  genre: string | null;
  language: string | null;
  cover_url: string | null;
  reading_mode: 'scroll' | 'page';
  status: 'draft' | 'published';
  created_at: string;
  chapterCount?: number;
  views: number;
  // Step 12 — Series Status & Completion Badge
  completion_status: 'ongoing' | 'completed' | 'hiatus';
  // Step 21 — Dual Content Mode: mangal (comic) or novel
  content_type: 'mangal' | 'novel';
  // Step 24 — RTL Reader: reading direction set per series by creator
  reading_direction: 'ltr' | 'rtl' | null;
}

// Step 16 — chapter summary stored per-series for the expandable list
interface ChapterSummary {
  id: string;
  chapter_number: number;
  title: string;
}

// Step 14 — Creator Analytics
interface SeriesViewStat {
  id: string;
  title: string;
  views: number;
}

interface AnalyticsData {
  totalViews: number;
  totalFollowers: number;
  newFollowersThisWeek: number;
  totalComments: number;
  totalChapters: number;
  totalWords: number;
  viewsPerSeries: SeriesViewStat[];
  wordsBySeriesId: Record<string, number>;
  // Real data, sourced from view_events / reading_progress / pages / profiles.
  // Empty/zeroed when there simply isn't enough data yet — never estimated.
  dailyViews: { date: string; count: number }[]; // last 7 days, oldest first
  hourlyViews: number[]; // 24 buckets, local time, index 0 = 00:00
  countryCounts: Record<string, number>; // ISO country code -> view count
  genderCounts: { male: number; female: number; unspecified: number; unknown: number };
  completion: { started: number; completed: number }; // reading_progress vs last page per chapter
}

// Step 28 — mirrors formatViews used on homepage/search cards for consistent display
// Small inline stat used inside the per-series detail card (Views / Chapters / Words / Status)
function SeriesMiniStat({ label, value, dotColor }: { label: string; value: string; dotColor?: string }) {
  return (
    <div>
      <div style={{ fontSize: '9px', color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: '3px', display: 'flex', alignItems: 'center', gap: '5px' }}>
        {dotColor && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: dotColor, display: 'inline-block' }} />}
        {label}
      </div>
      <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>{value}</div>
    </div>
  );
}

function formatViews(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return `${n}`;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return `${n}`;
}

// Step 12 — Series Status & Completion Badge: click-to-cycle order.
// Ongoing -> Completed -> Hiatus -> back to Ongoing. One click, no dropdown.
const STATUS_CYCLE: Story['completion_status'][] = ['ongoing', 'completed', 'hiatus'];

const STATUS_CONFIG: Record<Story['completion_status'], { label: string; ring: string; dot: string; bg: string }> = {
  ongoing: { label: 'Ongoing', ring: '#d97706', dot: '#d97706', bg: 'rgba(217,119,6,0.12)' },
  completed: { label: 'Completed', ring: '#10b981', dot: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  hiatus: { label: 'Hiatus', ring: 'var(--text-tertiary)', dot: 'var(--text-tertiary)', bg: 'rgba(107,114,128,0.12)' },
};

export default function Dashboard() {
  const { lang, setLang, t } = useUiLanguage();
  const [user, setUser] = useState<User | null>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const [fetching, setFetching] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Step 12 — Series Status: which card's pill is mid-update (disables it briefly to prevent double-clicks)
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);

  // Step 15 — Edit Series Details: which story is open in the edit modal (null = closed)
  const [editingStory, setEditingStory] = useState<Story | null>(null);

  // Step 16 — Manage Pages: chapter list per series (populated alongside fetchStories),
  // which series card is expanded showing its chapter list, and which chapter
  // is open in the Manage Pages modal.
  const [chaptersBySeriesId, setChaptersBySeriesId] = useState<Record<string, ChapterSummary[]>>({});
  const [expandedSeriesId, setExpandedSeriesId] = useState<string | null>(null);
  const [managingChapter, setManagingChapter] = useState<{ id: string; title: string; seriesId: string } | null>(null);

  // Novel chapters have no pages, so "Manage Pages" doesn't apply — they get
  // their own direct delete action instead, same two-click confirm pattern
  // used everywhere else (series delete, bookmark remove, etc.)
  const [confirmDeleteChapterId, setConfirmDeleteChapterId] = useState<string | null>(null);
  const [deletingChapterId, setDeletingChapterId] = useState<string | null>(null);

  // Role gate state — dashboard is creator-only (creator OR developer)
  const [roleChecked, setRoleChecked] = useState(false);
  const [isCreator, setIsCreator] = useState(false);
  const [isDeveloper, setIsDeveloper] = useState(false);

  // Step 14 — Creator Analytics
  const [activeTab, setActiveTab] = useState<'series' | 'analytics'>('series');
  const [chapterIds, setChapterIds] = useState<string[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsLoaded, setAnalyticsLoaded] = useState(false);
  // Inkstone-style per-series detail selector — which series' own card is shown
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);

  const fetchStories = async (creatorId: string) => {
    try {
      const { data: seriesData, error } = await supabase
        .from('series')
        .select('*')
        .eq('creator_id', creatorId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (!seriesData || seriesData.length === 0) { setStories([]); setFetching(false); return; }

      const seriesIds = seriesData.map((s: Story) => s.id);
      const { data: chapterRows, error: chaptersError } = await supabase
        .from('chapters')
        .select('id, series_id, chapter_number, title')
        .in('series_id', seriesIds)
        .order('chapter_number', { ascending: true });

      if (chaptersError) throw chaptersError;

      const countBySeriesId: Record<string, number> = {};
      const bySeriesId: Record<string, ChapterSummary[]> = {};
      (chapterRows || []).forEach((row: { id: string; series_id: string; chapter_number: number; title: string }) => {
        countBySeriesId[row.series_id] = (countBySeriesId[row.series_id] || 0) + 1;
        if (!bySeriesId[row.series_id]) bySeriesId[row.series_id] = [];
        bySeriesId[row.series_id].push({ id: row.id, chapter_number: row.chapter_number, title: row.title });
      });
      setChapterIds((chapterRows || []).map((row: { id: string }) => row.id));
      setChaptersBySeriesId(bySeriesId);

      const withCounts = seriesData.map((s: Story) => ({
        ...s,
        chapterCount: countBySeriesId[s.id] || 0,
      }));

      setStories(withCounts);
    } catch (err) {
      console.error('Error fetching stories:', err instanceof Error ? err.message : err);
    } finally {
      setFetching(false);
    }
  };

  const fetchAnalytics = async () => {
    if (analyticsLoaded || analyticsLoading) return;
    setAnalyticsLoading(true);
    try {
      const seriesIds = stories.map((s) => s.id);

      if (seriesIds.length === 0) {
        setAnalytics({
          totalViews: 0, totalFollowers: 0, newFollowersThisWeek: 0, totalComments: 0,
          totalChapters: 0, totalWords: 0, viewsPerSeries: [], wordsBySeriesId: {},
          dailyViews: [], hourlyViews: new Array(24).fill(0), countryCounts: {},
          genderCounts: { male: 0, female: 0, unspecified: 0, unknown: 0 },
          completion: { started: 0, completed: 0 },
        });
        setAnalyticsLoaded(true);
        return;
      }

      const totalViews = stories.reduce((sum, s) => sum + (s.views || 0), 0);
      const viewsPerSeries: SeriesViewStat[] = stories
        .map((s) => ({ id: s.id, title: s.title, views: s.views || 0 }))
        .sort((a, b) => b.views - a.views);

      const weekAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const [followResult, commentsResult, wordsResult, viewEventsResult, progressResult, pagesResult] = await Promise.all([
        supabase.from('follows').select('created_at, reader_id').in('series_id', seriesIds),
        chapterIds.length > 0
          ? supabase.from('comments').select('id', { count: 'exact', head: true }).in('chapter_id', chapterIds)
          : Promise.resolve({ data: null, count: 0, error: null }),
        // Inkstone-style "Words" stat — sums chapters.word_count per series.
        // Manga chapters don't set word_count (novel-only field), so they
        // simply contribute 0 without needing a separate content-type branch.
        chapterIds.length > 0
          ? supabase.from('chapters').select('series_id, word_count').in('id', chapterIds)
          : Promise.resolve({ data: [], error: null }),
        // Real Reader Trends / Reading Time source — every row is an actual
        // view, logged server-side with an optional country code.
        supabase.from('view_events').select('created_at, country_code').in('series_id', seriesIds).gte('created_at', weekAgoIso),
        // Real Completion Rate source — how far each reader got.
        supabase.from('reading_progress').select('chapter_id, page_number').in('series_id', seriesIds),
        chapterIds.length > 0
          ? supabase.from('pages').select('chapter_id, page_number').in('chapter_id', chapterIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (followResult.error) throw followResult.error;
      if (commentsResult.error) throw commentsResult.error;
      if (wordsResult.error) throw wordsResult.error;
      if (viewEventsResult.error) throw viewEventsResult.error;
      if (progressResult.error) throw progressResult.error;
      if (pagesResult.error) throw pagesResult.error;

      const followRows = followResult.data || [];
      const totalFollowers = followRows.length;
      const newFollowersThisWeek = followRows.filter((f: { created_at: string }) => f.created_at >= weekAgoIso).length;

      const wordsBySeriesId: Record<string, number> = {};
      let totalWords = 0;
      (wordsResult.data || []).forEach((row: { series_id: string; word_count: number | null }) => {
        const words = row.word_count || 0;
        wordsBySeriesId[row.series_id] = (wordsBySeriesId[row.series_id] || 0) + words;
        totalWords += words;
      });

      // Real Reader Trends: bucket view_events into the last 7 calendar days
      // (local time, matching the studio sidebar clock) and 24 hourly buckets.
      const dailyMap: Record<string, number> = {};
      const hourlyViews = new Array(24).fill(0);
      const countryCounts: Record<string, number> = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        dailyMap[d.toISOString().slice(0, 10)] = 0;
      }
      (viewEventsResult.data || []).forEach((row: { created_at: string; country_code: string | null }) => {
        const d = new Date(row.created_at);
        const dayKey = row.created_at.slice(0, 10);
        if (dayKey in dailyMap) dailyMap[dayKey]++;
        hourlyViews[d.getHours()]++;
        if (row.country_code) {
          countryCounts[row.country_code] = (countryCounts[row.country_code] || 0) + 1;
        }
      });
      const dailyViews = Object.entries(dailyMap).map(([date, count]) => ({ date, count }));

      // Real Gender split: follower profiles' self-reported gender (Settings).
      // Unset (null) is counted as "unknown" rather than guessed.
      const genderCounts = { male: 0, female: 0, unspecified: 0, unknown: 0 };
      const readerIds = Array.from(new Set(followRows.map((f: { reader_id: string }) => f.reader_id).filter(Boolean)));
      if (readerIds.length > 0) {
        const { data: profileRows } = await supabase.from('profiles').select('id, gender').in('id', readerIds);
        (profileRows || []).forEach((p: { gender: string | null }) => {
          if (p.gender === 'male') genderCounts.male++;
          else if (p.gender === 'female') genderCounts.female++;
          else if (p.gender === 'unspecified') genderCounts.unspecified++;
          else genderCounts.unknown++;
        });
      }

      // Real Completion Rate: a reading_progress row counts as "completed"
      // once its page_number reaches the last page of that chapter. Only
      // covers chapters that have entries in `pages` (manga-style content) —
      // novels aren't measurable this way yet, so they're simply excluded
      // rather than guessed at.
      const lastPageByChapter: Record<string, number> = {};
      (pagesResult.data || []).forEach((p: { chapter_id: string; page_number: number }) => {
        lastPageByChapter[p.chapter_id] = Math.max(lastPageByChapter[p.chapter_id] || 0, p.page_number);
      });
      let started = 0;
      let completed = 0;
      (progressResult.data || []).forEach((row: { chapter_id: string; page_number: number }) => {
        const lastPage = lastPageByChapter[row.chapter_id];
        if (lastPage === undefined) return; // not a paged (manga) chapter — not measurable
        started++;
        if (row.page_number >= lastPage) completed++;
      });

      setAnalytics({
        totalViews,
        totalFollowers,
        newFollowersThisWeek,
        totalComments: commentsResult.count || 0,
        totalChapters: chapterIds.length,
        totalWords,
        viewsPerSeries,
        wordsBySeriesId,
        dailyViews,
        hourlyViews,
        countryCounts,
        genderCounts,
        completion: { started, completed },
      });
    } catch (err) {
      console.error('Error fetching analytics:', err instanceof Error ? err.message : err);
    } finally {
      setAnalyticsLoading(false);
      setAnalyticsLoaded(true);
    }
  };

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        // Not logged in at all — send to login
        window.location.href = '/login';
        return;
      }
      setUser(data.user);

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .single();

      if (hasCreatorAccess(profile?.role)) {
        setIsCreator(true);
        setIsDeveloper(isDeveloperRole(profile?.role));
        fetchStories(data.user.id);
      } else {
        // Logged in but NOT a creator/developer — readers never see this panel
        setIsCreator(false);
      }
      setRoleChecked(true);
    };
    init();
  }, []);

  // Step 14 — Creator Analytics: lazy-load once the Analytics tab is opened for
  // the first time, and only after the main series/chapter fetch has finished
  // (so it has seriesIds + chapterIds to work with). Cached after first load —
  // switching tabs back and forth doesn't refire the queries.
  useEffect(() => {
    if (activeTab === 'analytics' && !fetching) {
      fetchAnalytics();
    }
  }, [activeTab, fetching]);


  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const { error } = await supabase.from('series').delete().eq('id', id);
      if (error) throw error;
      setStories((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      alert(`Could not delete: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  const handleCycleStatus = async (story: Story) => {
    if (statusUpdatingId) return;
    const currentIndex = STATUS_CYCLE.indexOf(story.completion_status);
    const next = STATUS_CYCLE[(currentIndex + 1) % STATUS_CYCLE.length];

    setStatusUpdatingId(story.id);
    setStories((prev) => prev.map((s) => (s.id === story.id ? { ...s, completion_status: next } : s)));

    const { error } = await supabase.from('series').update({ completion_status: next }).eq('id', story.id);

    if (error) {
      setStories((prev) => prev.map((s) => (s.id === story.id ? { ...s, completion_status: story.completion_status } : s)));
      alert(`Could not update status: ${error.message}`);
    }
    setStatusUpdatingId(null);
  };

  const handleSeriesUpdated = (updated: Partial<Story> & { id: string }) => {
    setStories((prev) => prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)));
    setEditingStory(null);
  };

  const toggleChapterList = (seriesId: string) => {
    setExpandedSeriesId((prev) => (prev === seriesId ? null : seriesId));
    setConfirmDeleteId(null);
    setConfirmDeleteChapterId(null);
  };

  // Novel chapters store text directly in chapters.content — there's no
  // pages table involved, so deleting the chapter row is the whole operation.
  // Same .select() check elsewhere in this app isn't needed for delete()
  // specifically since RLS-blocked deletes DO surface via the error object.
  const handleDeleteChapter = async (seriesId: string, chapterId: string) => {
    setDeletingChapterId(chapterId);
    try {
      const { error } = await supabase.from('chapters').delete().eq('id', chapterId);
      if (error) throw error;

      setChaptersBySeriesId((prev) => ({
        ...prev,
        [seriesId]: (prev[seriesId] || []).filter((ch) => ch.id !== chapterId),
      }));
      setStories((prev) =>
        prev.map((s) => (s.id === seriesId ? { ...s, chapterCount: Math.max(0, (s.chapterCount || 1) - 1) } : s))
      );
    } catch (err) {
      alert(`Could not delete chapter: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setDeletingChapterId(null);
      setConfirmDeleteChapterId(null);
    }
  };

  const handlePagesChanged = (chapterId: string, newCount: number) => {
    // no-op for now — placeholder for future per-chapter page count display
  };

  const navLinkStyle = (active = false) => ({
    fontSize: '13px',
    color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
    fontWeight: active ? 700 : 500,
    textDecoration: 'none',
    borderBottom: active ? '2px solid #d97706' : '2px solid transparent',
    paddingBottom: '2px',
    whiteSpace: 'nowrap' as const,
  });

  const tabButtonStyle = (active: boolean) => ({
    padding: '8px 18px',
    borderRadius: '9px',
    border: active ? '1px solid rgba(217,119,6,0.4)' : '1px solid var(--border-color)',
    background: active ? 'rgba(217,119,6,0.12)' : 'var(--bg-card)',
    color: active ? '#d97706' : 'var(--text-tertiary)',
    fontSize: '12px',
    fontWeight: 700,
    cursor: 'pointer' as const,
    transition: 'all 0.15s',
    whiteSpace: 'nowrap' as const,
  });

  if (!roleChecked) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
        Loading...
      </div>
    );
  }

  if (!isCreator) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ width: '100%', maxWidth: '420px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '20px', padding: '40px 32px', textAlign: 'center' as const, boxShadow: '0 32px 80px rgba(0,0,0,0.6)' }}>
          <div style={{ fontSize: '36px', marginBottom: '14px' }}>📖</div>
          <h2 style={{ fontSize: '20px', fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 8px' }}>{t('forCreatorsTitle')}</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 28px' }}>
            {t('forCreatorsBody')}
          </p>
          <Link href="/" style={{
            display: 'inline-block', padding: '12px 28px', borderRadius: '10px',
            background: 'linear-gradient(135deg, #7f1d1d, #991b1b)',
            color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: '13px',
          }}>
            {t('backToReading')}
          </Link>
        </div>
      </div>
    );
  }

  const statCards = analytics ? [
    { label: t('totalViews'), value: formatCount(analytics.totalViews), icon: '👁️' },
    { label: t('totalFollowers'), value: formatCount(analytics.totalFollowers), icon: '⭐' },
    { label: t('newFollowers7d'), value: `+${analytics.newFollowersThisWeek}`, icon: '📈' },
    { label: t('totalComments'), value: formatCount(analytics.totalComments), icon: '💬' },
    { label: t('totalChapters'), value: formatCount(analytics.totalChapters), icon: '📑' },
    { label: t('totalWords'), value: formatCount(analytics.totalWords), icon: '✍️' },
  ] : [];

  const selectedStory = stories.find((s) => s.id === selectedSeriesId) || stories[0];

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', }}>

      {/* Global responsive rules. Plain <style> tag because: (a) @keyframes
          can't be expressed in React inline styles, and (b) media queries
          need real CSS — this is the cleanest way to add both without
          pulling in a CSS-in-JS library just for this page. */}
      <style>{`
        @keyframes mangalStatusPulse {
          0% { transform: scale(1); opacity: 0.9; }
          50% { transform: scale(2.1); opacity: 0; }
          100% { transform: scale(1); opacity: 0; }
        }

        .mangal-dash-nav-links { display: flex; gap: 20px; }
        .mangal-dash-nav-links a span.mg-label { display: inline; }

        .mangal-dash-container { padding: 40px 24px; }
        .mangal-dash-h1 { font-size: 32px; }

        .mangal-story-card { display: flex; }
        .mangal-story-cover { width: 70px; }
        .mangal-story-actions { display: flex; gap: 8px; }
        .mangal-story-actions a, .mangal-story-actions button { font-size: 11px; padding: 7px; }

        .mangal-stat-grid { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }

        /* ── Tablet & small laptop ───────────────────────────────────── */
        @media (max-width: 768px) {
          .mangal-dash-container { padding: 24px 16px; }
          .mangal-dash-h1 { font-size: 26px; }
          .mangal-stat-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
        }

        /* ── Phones ───────────────────────────────────────────────────── */
        @media (max-width: 560px) {
          .mangal-dash-nav { padding: 0 12px !important; height: auto !important; flex-wrap: wrap; row-gap: 8px; padding-top: 10px !important; padding-bottom: 10px !important; }
          .mangal-dash-nav-links { gap: 12px; overflow-x: auto; -webkit-overflow-scrolling: touch; max-width: 100%; }
          .mangal-dash-nav-links a { font-size: 11px !important; }
          .mangal-dash-nav-brand { gap: 16px !important; }

          .mangal-dash-container { padding: 16px 12px; }
          .mangal-dash-h1 { font-size: 22px; }

          /* Story card: stack cover on top, content below, instead of
             side-by-side — avoids the cramped horizontal squeeze. */
          .mangal-story-card { flex-direction: column; }
          .mangal-story-card > div:first-child { width: 100% !important; height: 3px !important; }
          .mangal-story-cover { width: 100% !important; height: 140px !important; }

          /* Action row: wrap into two lines of two instead of forcing
             four buttons into one cramped row. */
          .mangal-story-actions { flex-wrap: wrap; }
          .mangal-story-actions > a, .mangal-story-actions > button { flex: 1 1 calc(50% - 4px); min-width: 70px; }

          .mangal-stat-grid { grid-template-columns: 1fr 1fr; gap: 8px; }
        }

        @media (max-width: 380px) {
          .mangal-stat-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      {/* NAV */}
      <Navbar
        variant="custom"
        navClassName="mangal-dash-nav"
        brandWrapperClassName="mangal-dash-nav-brand"
        rightSlot={
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Step 22 — Hindi UI Toggle, left of ProfileMenu so the profile chip
                stays the rightmost element, same placement as the homepage. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '2px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '3px', flexShrink: 0 }}>
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

            {user && <ProfileMenu user={user} isCreator={isCreator} isDeveloper={isDeveloper} />}
          </div>
        }
        centerSlot={
          <div className="mangal-dash-nav-links">
            <Link href="/" style={navLinkStyle(false)}>{t('readerView')}</Link>
            <a href="/dashboard" style={navLinkStyle(true)}>{t('dashboard')}</a>
            <a href="/upload" style={navLinkStyle(false)}>{t('createNew')}</a>
          </div>
        }
      />


      <div className="mangal-dash-container" style={{ maxWidth: '1000px', margin: '0 auto' }}>

        <span style={{
          fontSize: '9px', fontWeight: 700, letterSpacing: '0.18em',
          color: '#d97706', background: 'rgba(120,53,15,0.25)',
          border: '1px solid rgba(180,83,9,0.3)',
          padding: '4px 10px', borderRadius: '6px', textTransform: 'uppercase' as const,
        }}>
          {t('engineVersion')}
        </span>

        <h1 className="mangal-dash-h1" style={{
          fontWeight: 900, letterSpacing: '-0.02em',
          marginTop: '16px', marginBottom: '4px',
        }}>
          {t('myCreatorDashboard')}
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', margin: 0 }}>
          {t('manageSeriesIntro')}{' '}
          <a href="/upload" style={{ color: '#d97706', fontWeight: 700, textDecoration: 'none' }}>{t('createNewArrow')}</a>
        </p>

        <div style={{ height: '1px', background: 'var(--border-color)', margin: '24px 0' }} />

        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
          <button onClick={() => setActiveTab('series')} style={tabButtonStyle(activeTab === 'series')}>
            {t('tabMySeries')}
          </button>
          <button onClick={() => setActiveTab('analytics')} style={tabButtonStyle(activeTab === 'analytics')}>
            {t('tabAnalytics')}
          </button>
        </div>

        {activeTab === 'series' ? (
          <>
            <h2 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '16px', color: 'var(--text-primary)' }}>
              {t('mySeriesCount')} ({stories.length})
            </h2>

            {fetching ? (
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{t('loadingSeries')}</p>
            ) : stories.length === 0 ? (
              <div style={{ textAlign: 'center' as const, padding: '60px 0', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px' }}>
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>📖</div>
                <p style={{ color: 'var(--text-tertiary)', fontSize: '14px', marginBottom: '16px' }}>{t('noSeriesYet')}</p>
                <a href="/upload" style={{
                  display: 'inline-block', padding: '12px 28px', borderRadius: '10px',
                  background: 'linear-gradient(135deg, #7f1d1d, #991b1b)',
                  color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: '13px',
                }}>{t('createFirstSeries')}</a>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                {stories.map((story) => (
                  <div key={story.id} className="mangal-story-card" style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '14px',
                    overflow: 'hidden' as const,
                    position: 'relative' as const,
                    boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
                  }}>
                    <div style={{
                      width: '3px', flexShrink: 0,
                      background: 'linear-gradient(to bottom, #7f1d1d, #d97706)',
                    }} />

                    <a href={`/series/${story.id}`} className="mangal-story-cover" style={{ flexShrink: 0, textDecoration: 'none' }}>
                      <div style={{
                        width: '100%', height: '100%', minHeight: '120px',
                        background: story.cover_url ? 'none' : 'linear-gradient(135deg, #1a0a0a, var(--bg-card))',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        position: 'relative',
                      }}>
                        {story.cover_url ? (
                          <Image src={story.cover_url} alt={story.title} fill sizes="120px" style={{ objectFit: 'cover' }} />
                        ) : (
                          <span style={{ fontSize: '20px' }}>📜</span>
                        )}
                      </div>
                    </a>

                    <div style={{ padding: '16px', flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' as const, alignItems: 'flex-start' as const, gap: '8px' }}>
                        <a href={`/series/${story.id}`} style={{ textDecoration: 'none' }}>
                          <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 4px 0', color: 'var(--text-primary)' }}>
                            {story.title}
                          </h3>
                        </a>
                        <span style={{
                          fontSize: '9px', fontWeight: 700, padding: '3px 7px', borderRadius: '6px',
                          textTransform: 'uppercase' as const, whiteSpace: 'nowrap' as const, flexShrink: 0,
                          background: story.status === 'published' ? 'rgba(16,185,129,0.15)' : 'rgba(217,119,6,0.15)',
                          color: story.status === 'published' ? '#10b981' : '#d97706',
                        }}>
                          {story.status}
                        </span>
                      </div>

                      <p style={{
                        fontSize: '11px', color: 'var(--text-secondary)', margin: '0 0 10px 0', lineHeight: '1.5',
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
                      }}>
                        {story.synopsis}
                      </p>

                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' as const, marginBottom: '12px', alignItems: 'center' }}>
                        {story.genre && (
                          <span style={{ fontSize: '9px', color: '#d97706', background: 'rgba(120,53,15,0.15)', padding: '2px 7px', borderRadius: '5px' }}>{story.genre}</span>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleChapterList(story.id); }}
                          title={expandedSeriesId === story.id ? 'Collapse chapters' : 'Expand chapters'}
                          style={{
                            fontSize: '9px', color: expandedSeriesId === story.id ? '#d97706' : 'var(--text-tertiary)',
                            background: expandedSeriesId === story.id ? 'rgba(120,53,15,0.18)' : 'var(--bg-input)',
                            border: expandedSeriesId === story.id ? '1px solid rgba(180,83,9,0.3)' : '1px solid transparent',
                            padding: '2px 7px', borderRadius: '5px', cursor: 'pointer',
                            transition: 'all 0.15s',
                          }}
                        >
                          {expandedSeriesId === story.id ? '▾' : '▸'} {story.chapterCount} chapter{story.chapterCount === 1 ? '' : 's'}
                        </button>
                        <span style={{
                          fontSize: '9px', fontWeight: 700, padding: '2px 7px', borderRadius: '5px',
                          background: story.content_type === 'novel' ? 'rgba(124,58,237,0.15)' : 'var(--bg-input)',
                          color: story.content_type === 'novel' ? '#a78bfa' : 'var(--text-tertiary)',
                        }}>
                          {story.content_type === 'novel' ? '📕 Novel' : (story.reading_mode === 'scroll' ? '📜 Scroll' : '📖 Page')}
                        </span>

                        {/* Step 28 — view count, previously only visible in the Analytics tab */}
                        <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', padding: '2px 7px' }}>
                          👁 {formatViews(story.views ?? 0)}
                        </span>

                        <button
                          onClick={() => handleCycleStatus(story)}
                          disabled={statusUpdatingId === story.id}
                          title="Click to change status"
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: '5px',
                            fontSize: '9px', fontWeight: 700, padding: '2px 8px 2px 6px', borderRadius: '20px',
                            border: `1px solid ${STATUS_CONFIG[story.completion_status].ring}33`,
                            background: STATUS_CONFIG[story.completion_status].bg,
                            color: STATUS_CONFIG[story.completion_status].ring,
                            cursor: statusUpdatingId === story.id ? 'wait' : 'pointer',
                            opacity: statusUpdatingId === story.id ? 0.6 : 1,
                            transition: 'opacity 0.15s',
                          }}
                        >
                          <span style={{ position: 'relative', width: '7px', height: '7px', flexShrink: 0, display: 'inline-flex' }}>
                            {story.completion_status === 'ongoing' && (
                              <span style={{
                                position: 'absolute', inset: 0, borderRadius: '50%',
                                background: STATUS_CONFIG.ongoing.dot,
                                animation: 'mangalStatusPulse 1.6s ease-in-out infinite',
                              }} />
                            )}
                            <span style={{
                              position: 'absolute', inset: 0, borderRadius: '50%',
                              background: STATUS_CONFIG[story.completion_status].dot,
                            }} />
                          </span>
                          {story.completion_status === 'completed' ? '✓ ' : ''}{STATUS_CONFIG[story.completion_status].label}
                        </button>
                      </div>

                      {expandedSeriesId === story.id && (
                        <div style={{
                          margin: '4px 0 10px',
                          border: '1px solid var(--border-color)',
                          borderRadius: '8px',
                          overflow: 'hidden',
                        }}>
                          {(chaptersBySeriesId[story.id] || []).length === 0 ? (
                            <div style={{ padding: '10px 12px', fontSize: '11px', color: 'var(--text-muted)' }}>
                              {t('noChaptersYet')}
                            </div>
                          ) : (
                            (chaptersBySeriesId[story.id] || []).map((ch, idx, arr) => (
                              <div
                                key={ch.id}
                                style={{
                                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                  padding: '8px 10px',
                                  borderBottom: idx < arr.length - 1 ? '1px solid var(--divider)' : 'none',
                                  background: 'var(--bg-input)',
                                  flexWrap: 'wrap' as const,
                                  gap: '6px',
                                }}
                              >
                                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  <span style={{ color: 'var(--text-muted)', fontWeight: 700, marginRight: '6px' }}>#{ch.chapter_number}</span>
                                  {ch.title || `Chapter ${ch.chapter_number}`}
                                </span>
                                {story.content_type === 'novel' ? (
                                  confirmDeleteChapterId === ch.id ? (
                                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                                      <button
                                        onClick={() => handleDeleteChapter(story.id, ch.id)}
                                        disabled={deletingChapterId === ch.id}
                                        style={{
                                          padding: '4px 9px', borderRadius: '5px',
                                          background: '#7f1d1d', border: '1px solid #991b1b', color: '#fff',
                                          fontSize: '10px', fontWeight: 700, cursor: 'pointer',
                                        }}
                                      >
                                        {deletingChapterId === ch.id ? '...' : t('confirmQ')}
                                      </button>
                                      <button
                                        onClick={() => setConfirmDeleteChapterId(null)}
                                        style={{
                                          padding: '4px 9px', borderRadius: '5px',
                                          background: 'transparent', border: '1px solid var(--border-light)', color: 'var(--text-tertiary)',
                                          fontSize: '10px', fontWeight: 600, cursor: 'pointer',
                                        }}
                                      >
                                        {t('cancel')}
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => setConfirmDeleteChapterId(ch.id)}
                                      style={{
                                        marginLeft: '8px', flexShrink: 0,
                                        padding: '4px 9px', borderRadius: '5px',
                                        background: 'transparent', border: '1px solid var(--border-light)',
                                        color: '#ef4444', fontSize: '10px', fontWeight: 600,
                                        cursor: 'pointer', transition: 'all 0.15s',
                                      }}
                                      onMouseEnter={(e) => {
                                        (e.currentTarget as HTMLButtonElement).style.borderColor = '#ef4444';
                                      }}
                                      onMouseLeave={(e) => {
                                        (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-light)';
                                      }}
                                    >
                                      {t('deleteChapter')}
                                    </button>
                                  )
                                ) : (
                                  <button
                                    onClick={() => setManagingChapter({ id: ch.id, title: ch.title || `Chapter ${ch.chapter_number}`, seriesId: story.id })}
                                    style={{
                                      marginLeft: '8px', flexShrink: 0,
                                      padding: '4px 9px', borderRadius: '5px',
                                      background: 'transparent', border: '1px solid var(--border-light)',
                                      color: 'var(--text-tertiary)', fontSize: '10px', fontWeight: 600,
                                      cursor: 'pointer', transition: 'all 0.15s',
                                    }}
                                    onMouseEnter={(e) => {
                                      (e.currentTarget as HTMLButtonElement).style.borderColor = '#d97706';
                                      (e.currentTarget as HTMLButtonElement).style.color = '#d97706';
                                    }}
                                    onMouseLeave={(e) => {
                                      (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-light)';
                                      (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-tertiary)';
                                    }}
                                  >
                                    {t('managePages')}
                                  </button>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      )}

                      <div className="mangal-story-actions">
                        <a href={`/series/${story.id}`} style={{
                          flex: 1, textAlign: 'center' as const, borderRadius: '7px',
                          background: 'var(--bg-input)', border: '1px solid var(--border-light)', color: 'var(--text-secondary)',
                          fontWeight: 600, textDecoration: 'none',
                        }}>
                          {t('view')}
                        </a>
                        <a href={`/upload?seriesId=${story.id}`} style={{
                          flex: 1, textAlign: 'center' as const, borderRadius: '7px',
                          background: 'var(--bg-input)', border: '1px solid var(--border-light)', color: 'var(--text-secondary)',
                          fontWeight: 600, textDecoration: 'none',
                        }}>
                          {t('addChapter')}
                        </a>

                        <button
                          onClick={() => setEditingStory(story)}
                          title="Edit series details"
                          style={{
                            borderRadius: '7px',
                            background: 'var(--bg-input)', border: '1px solid var(--border-light)', color: 'var(--text-secondary)',
                            fontWeight: 600, cursor: 'pointer',
                          }}
                        >
                          ✏️
                        </button>

                        {confirmDeleteId === story.id ? (
                          <button
                            onClick={() => handleDelete(story.id)}
                            disabled={deletingId === story.id}
                            style={{
                              flex: 1, borderRadius: '7px',
                              background: '#7f1d1d', border: '1px solid #991b1b', color: '#fff',
                              fontWeight: 700, cursor: 'pointer',
                            }}
                          >
                            {deletingId === story.id ? '...' : t('confirmQ')}
                          </button>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(story.id)}
                            style={{
                              borderRadius: '7px',
                              background: 'var(--bg-input)', border: '1px solid var(--border-light)', color: '#ef4444',
                              fontWeight: 600, cursor: 'pointer',
                            }}
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '16px', color: 'var(--text-primary)' }}>
              {t('analyticsTitle')}
            </h2>

            {analyticsLoading && !analytics ? (
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{t('crunchingNumbers')}</p>
            ) : !analytics ? (
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{t('noDataYet')}</p>
            ) : (
              <>
                {/* Per-series detail card — pick a series, see its own numbers,
                    same shape as inkstone.webnovel.com's book selector card */}
                {selectedStory && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' as const,
                    background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px',
                    padding: '18px', marginBottom: '20px',
                  }}>
                    <div style={{
                      width: '52px', height: '68px', borderRadius: '8px', flexShrink: 0, position: 'relative' as const,
                      background: selectedStory.cover_url ? 'none' : 'linear-gradient(135deg, #1a0a0a, var(--bg-card))',
                      overflow: 'hidden' as const,
                    }}>
                      {selectedStory.cover_url ? (
                        <Image src={selectedStory.cover_url} alt={selectedStory.title} fill sizes="52px" style={{ objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>📜</div>
                      )}
                    </div>

                    <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                      <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginBottom: '3px' }}>{t('selectedSeries')}</div>
                      <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {selectedStory.title}
                      </h3>
                    </div>

                    {stories.length > 1 && (
                      <select
                        value={selectedStory.id}
                        onChange={(e) => setSelectedSeriesId(e.target.value)}
                        style={{
                          background: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: '8px',
                          color: 'var(--text-soft)', fontSize: '12px', fontWeight: 700, padding: '9px 12px',
                          cursor: 'pointer',
                        }}
                      >
                        {stories.map((s) => (
                          <option key={s.id} value={s.id}>{s.title}</option>
                        ))}
                      </select>
                    )}

                    <div style={{ display: 'flex', gap: '22px', flexWrap: 'wrap' as const, width: '100%', paddingTop: '4px', borderTop: '1px solid var(--divider)', marginTop: '4px' }}>
                      <SeriesMiniStat label={t('views')} value={formatCount(selectedStory.views ?? 0)} />
                      <SeriesMiniStat label={t('tabMySeries') === 'My Series' ? 'Chapters' : 'चैप्टर्स'} value={String(selectedStory.chapterCount ?? 0)} />
                      <SeriesMiniStat label={t('totalWords')} value={formatCount(analytics.wordsBySeriesId[selectedStory.id] || 0)} />
                      <SeriesMiniStat label={STATUS_CONFIG[selectedStory.completion_status]?.label ?? ''} value={selectedStory.content_type === 'novel' ? '📕' : '📜'} dotColor={STATUS_CONFIG[selectedStory.completion_status]?.dot} />
                    </div>
                  </div>
                )}

                <div className="mangal-stat-grid" style={{ display: 'grid', gap: '14px', marginBottom: '28px' }}>
                  {statCards.map((card) => (
                    <div key={card.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '18px' }}>
                      <div style={{ fontSize: '20px', marginBottom: '8px' }}>{card.icon}</div>
                      <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--text-primary)', marginBottom: '2px' }}>{card.value}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{card.label}</div>
                    </div>
                  ))}
                </div>

                <h3 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '12px' }}>{t('viewsPerSeries')}</h3>
                {analytics.viewsPerSeries.length === 0 ? (
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '24px' }}>{t('noSeriesYetShort')}</p>
                ) : (
                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '6px', marginBottom: '24px' }}>
                    {analytics.viewsPerSeries.map((s, i) => {
                      const max = analytics.viewsPerSeries[0]?.views || 1;
                      const pct = max > 0 ? Math.max((s.views / max) * 100, 3) : 0;
                      return (
                        <div key={s.id} style={{ padding: '12px 14px', borderBottom: i === analytics.viewsPerSeries.length - 1 ? 'none' : '1px solid var(--divider)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' as const, fontSize: '12px', marginBottom: '6px', gap: '8px' }}>
                            <span style={{ color: 'var(--text-soft)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</span>
                            <span style={{ color: '#d97706', fontWeight: 700, flexShrink: 0 }}>{formatCount(s.views)}</span>
                          </div>
                          <div style={{ height: '4px', borderRadius: '2px', background: 'var(--bg-input)', overflow: 'hidden' as const }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, #7f1d1d, #d97706)', borderRadius: '2px' }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Reading Time Distribution — mirrors inkstone's hourly bar chart.
                    Real data: analytics.hourlyViews (24 buckets), sourced from
                    view_events.created_at in the browser's local time. */}
                <h3 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '12px' }}>
                  🕐 Reading Time Distribution
                </h3>
                <div style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px',
                  padding: '20px', marginBottom: '24px',
                }}>
                  {(() => {
                    const hours = analytics.hourlyViews;
                    const max = Math.max(1, ...hours);
                    const barW = 700 / 24;
                    return (
                      <svg viewBox="0 0 700 100" style={{ width: '100%', height: '100px', display: 'block' }}>
                        <line x1="0" y1="90" x2="700" y2="90" stroke="var(--divider)" strokeWidth="1" />
                        {hours.map((count, h) => {
                          const barH = (count / max) * 80;
                          return (
                            <rect
                              key={h}
                              x={h * barW + 2}
                              y={90 - barH}
                              width={barW - 4}
                              height={Math.max(barH, count > 0 ? 2 : 0)}
                              fill={count > 0 ? 'var(--accent)' : 'var(--border-light)'}
                              rx="1"
                            />
                          );
                        })}
                      </svg>
                    );
                  })()}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--text-faint)', marginTop: '4px' }}>
                    {['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'].map((t2) => <span key={t2}>{t2}</span>)}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: '10px' }}>
                    {analytics.hourlyViews.reduce((s, c) => s + c, 0) === 0
                      ? 'No reads logged in the last 7 days yet'
                      : `Peak hour: ${analytics.hourlyViews.indexOf(Math.max(...analytics.hourlyViews))}:00`}
                  </div>
                </div>

                {/* Audience Insights — mirrors inkstone's Geographical Distribution +
                    Gender donut. Real data: countryCounts from view_events.country_code,
                    genderCounts from followers' self-reported profiles.gender. */}
                <h3 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '12px' }}>
                  🌍 Audience Insights
                </h3>
                <div style={{
                  display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(160px, 1fr)', gap: '14px', marginBottom: '24px',
                }}>
                  <div style={{
                    background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px',
                    padding: '20px', minHeight: '160px',
                  }}>
                    <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '14px' }}>
                      Views by Country (7 days)
                    </div>
                    {(() => {
                      const entries = Object.entries(analytics.countryCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);
                      const max = Math.max(1, ...entries.map(([, c]) => c));
                      if (entries.length === 0) {
                        return (
                          <div style={{ textAlign: 'center', color: 'var(--text-faint)', fontSize: '12px', padding: '30px 0' }}>
                            🗺️ No geo data yet — shows up as readers view chapters
                          </div>
                        );
                      }
                      return (
                        <div style={{ display: 'grid', gap: '10px' }}>
                          {entries.map(([code, count]) => (
                            <div key={code} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <span style={{ fontSize: '11px', fontWeight: 700, width: '28px', color: 'var(--text-secondary)' }}>{code}</span>
                              <div style={{ flex: 1, height: '8px', background: 'var(--border-light)', borderRadius: '4px', overflow: 'hidden' }}>
                                <div style={{ width: `${(count / max) * 100}%`, height: '100%', background: 'var(--accent)' }} />
                              </div>
                              <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', width: '24px', textAlign: 'right' }}>{count}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                  <div style={{
                    background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px',
                    padding: '20px',
                  }}>
                    <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '14px' }}>
                      Gender (followers)
                    </div>
                    {(() => {
                      const { male, female, unspecified, unknown } = analytics.genderCounts;
                      const total = male + female + unspecified + unknown || 1;
                      const malePct = (male / total) * 100;
                      const femalePct = (female / total) * 100;
                      const circumference = 2 * Math.PI * 38;
                      const maleDash = (malePct / 100) * circumference;
                      const femaleDash = (femalePct / 100) * circumference;
                      const pct = (n: number) => `${((n / total) * 100).toFixed(2)}%`;
                      return (
                        <>
                          <svg viewBox="0 0 100 100" style={{ width: '80px', height: '80px', display: 'block', margin: '0 auto 14px', transform: 'rotate(-90deg)' }}>
                            <circle cx="50" cy="50" r="38" fill="none" stroke="var(--divider)" strokeWidth="14" />
                            {male > 0 && (
                              <circle cx="50" cy="50" r="38" fill="none" stroke="#3b82f6" strokeWidth="14"
                                strokeDasharray={`${maleDash} ${circumference - maleDash}`} strokeDashoffset="0" />
                            )}
                            {female > 0 && (
                              <circle cx="50" cy="50" r="38" fill="none" stroke="#ec4899" strokeWidth="14"
                                strokeDasharray={`${femaleDash} ${circumference - femaleDash}`} strokeDashoffset={-maleDash} />
                            )}
                          </svg>
                          <div style={{ display: 'grid', gap: '6px', fontSize: '11px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-tertiary)' }}><span>Male</span><span>{pct(male)}</span></div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-tertiary)' }}><span>Female</span><span>{pct(female)}</span></div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-tertiary)' }}><span>Unknown</span><span>{pct(unknown + unspecified)}</span></div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>

                {/* Reader Trends — mirrors inkstone's "Daily Key Metrics" line chart.
                    Plain inline SVG so we don't pull in a charting library.
                    Real data: analytics.dailyViews, sourced from view_events. */}
                <h3 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '12px' }}>
                  📉 Reader Trends (7 days)
                </h3>
                <div style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px',
                  padding: '20px', marginBottom: '24px',
                }}>
                  {(() => {
                    const days = analytics.dailyViews;
                    const max = Math.max(1, ...days.map((d) => d.count));
                    const points = days.map((d, i) => {
                      const x = days.length > 1 ? (i / (days.length - 1)) * 700 : 0;
                      const y = 110 - (d.count / max) * 90;
                      return `${x},${y}`;
                    }).join(' ');
                    return (
                      <svg viewBox="0 0 700 140" style={{ width: '100%', height: '140px', display: 'block' }}>
                        <line x1="0" y1="110" x2="700" y2="110" stroke="var(--divider)" strokeWidth="1" />
                        <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth="2" />
                        {days.map((d, i) => {
                          const x = days.length > 1 ? (i / (days.length - 1)) * 700 : 0;
                          const y = 110 - (d.count / max) * 90;
                          return <circle key={d.date} cx={x} cy={y} r="3" fill="var(--accent)" />;
                        })}
                      </svg>
                    );
                  })()}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-faint)', marginTop: '4px' }}>
                    {analytics.dailyViews.map((d) => (
                      <span key={d.date}>{new Date(d.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '16px', marginTop: '14px', fontSize: '11px', color: 'var(--text-tertiary)' }}>
                    <span><span style={{ color: 'var(--accent)' }}>●</span> Views ({analytics.dailyViews.reduce((s, d) => s + d.count, 0)} total this week)</span>
                  </div>
                </div>

                {/* News & Updates — mirrors inkstone's News/Inbox tabbed panel.
                    Static for now since there's no announcements table yet. */}
                <h3 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '12px' }}>
                  📰 News &amp; Updates
                </h3>
                <div style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px',
                  padding: '6px', marginBottom: '24px',
                }}>
                  {[
                    { title: 'Welcome to the Mangal Creator Studio', date: 'Aug 09, 2026' },
                    { title: 'Tips: how the Views counter works', date: 'Aug 05, 2026' },
                    { title: 'Please avoid uploading AI-generated chapters without disclosure', date: 'Jul 28, 2026' },
                  ].map((n, i, arr) => (
                    <div key={n.title} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px',
                      padding: '12px 14px', borderBottom: i === arr.length - 1 ? 'none' : '1px solid var(--divider)',
                    }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-soft)' }}>{n.title}</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-faint)', flexShrink: 0 }}>{n.date}</span>
                    </div>
                  ))}
                </div>

                {/* Release Statistics — mirrors inkstone's completion-rate + avg-words panel.
                    Avg words/chapter is real (totalWords / totalChapters); completion
                    rate isn't tracked yet, shown as a placeholder like the note below. */}
                <h3 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '12px' }}>
                  📈 Release Stats
                </h3>
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '24px',
                }}>
                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '18px' }}>
                    <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '10px' }}>
                      Chapter Completion Rate
                    </div>
                    <div style={{ fontSize: '26px', fontWeight: 900, color: 'var(--text-primary)' }}>
                      {analytics.completion.started > 0
                        ? `${Math.round((analytics.completion.completed / analytics.completion.started) * 100)}%`
                        : '—'}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: '4px' }}>
                      {analytics.completion.started > 0
                        ? `${analytics.completion.completed} of ${analytics.completion.started} readers reached the last page`
                        : 'No page-tracked reads yet (manga chapters only)'}
                    </div>
                  </div>
                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '18px' }}>
                    <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '10px' }}>
                      Average Words / Chapter
                    </div>
                    <div style={{ fontSize: '26px', fontWeight: 900, color: 'var(--text-primary)' }}>
                      {formatCount(analytics.totalChapters > 0 ? Math.round(analytics.totalWords / analytics.totalChapters) : 0)}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: '4px' }}>Across all published chapters</div>
                  </div>
                </div>

                <div style={{
                  border: '1px dashed #2a2a38', borderRadius: '14px', padding: '16px 18px',
                  color: 'var(--text-tertiary)', fontSize: '12px', lineHeight: 1.6,
                }}>
                  {t('viewsPerChapterNote')}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── FOOTER ── */}
      <Footer
        tagline={t('madeWithLove')}
        links={[
          { label: t('privacyPolicy'), href: '/privacy' },
          { label: t('termsOfService'), href: '/terms' },
          { label: t('grievanceOfficer'), href: '/grievance' },
        ]}
      />

      {editingStory && user && (
        <EditSeriesModal
          story={editingStory}
          userId={user.id}
          onClose={() => setEditingStory(null)}
          onSaved={handleSeriesUpdated}
        />
      )}

      {managingChapter && (
        <ManagePagesModal
          chapterId={managingChapter.id}
          chapterTitle={managingChapter.title}
          seriesId={managingChapter.seriesId}
          onClose={() => setManagingChapter(null)}
          onPagesChanged={handlePagesChanged}
        />
      )}
    </div>
  );
}