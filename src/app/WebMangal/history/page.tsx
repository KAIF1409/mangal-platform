'use client';

import { useState, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { supabase } from '../../lib/supabase';
import Link from 'next/link';
import ThemeToggle from '../../components/shared/ThemeToggle';

import { setPostLoginRedirect } from '../../lib/auth/authRedirect';
import {
  Flame, Clock, Trash2, ScrollText, BookText, BookOpen, Heart, Play, X,
} from 'lucide-react';
// Reading History — pulls from reading_progress table.
// One row per reader+series (UNIQUE constraint), holds the last-read chapter + page.
// Ordered by updated_at DESC so most recently read appears first.

type ContentType = 'mangal' | 'novel' | null;
type FilterType = 'all' | 'mangal' | 'novel';

interface HistoryEntry {
  series_id: string;
  chapter_id: string;
  page_number: number;
  updated_at: string;
  series_title: string;
  series_cover: string | null;
  series_genre: string | null;
  chapter_number: number | null;
  chapter_title: string | null;
  total_chapters: number;
  content_type: ContentType;
}

const STORAGE_KEY = 'mangal_content_type';

interface ProgressSeriesRow {
  title: string;
  cover_url: string | null;
  genre: string | null;
  content_type: ContentType;
}
interface ProgressChapterRow {
  chapter_number: number | null;
  title: string | null;
}
interface ProgressRow {
  series_id: string;
  chapter_id: string;
  page_number: number;
  updated_at: string;
  series: ProgressSeriesRow | ProgressSeriesRow[] | null;
  chapter: ProgressChapterRow | ProgressChapterRow[] | null;
}
interface ChapterCountRow {
  series_id: string;
}

export default function HistoryPage() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [activeContentType, setActiveContentType] = useState<FilterType>('all');

  // Load persisted filter on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'mangal' || stored === 'novel') {
        setActiveContentType(stored); // eslint-disable-line react-hooks/set-state-in-effect
      }
    } catch {}
  }, []);

  useEffect(() => {
    const load = async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { setPostLoginRedirect(window.location.pathname); window.location.href = '/login'; return; }
      setUserId(u.user.id);

      // Fetch all reading progress rows, join series (incl. content_type) + chapter
      const { data: progress } = await supabase
        .from('reading_progress')
        .select(`
          series_id,
          chapter_id,
          page_number,
          updated_at,
          series:series_id ( title, cover_url, genre, content_type ),
          chapter:chapter_id ( chapter_number, title )
        `)
        .eq('reader_id', u.user.id)
        .order('updated_at', { ascending: false });

      if (!progress || progress.length === 0) { setLoading(false); return; }

      // Batch fetch chapter counts for all series in history
      const seriesIds = progress.map((p: ProgressRow) => p.series_id);
      const { data: allChapters } = await supabase
        .from('chapters')
        .select('series_id')
        .in('series_id', seriesIds);

      const countMap: Record<string, number> = {};
      (allChapters ?? []).forEach((ch: ChapterCountRow) => {
        countMap[ch.series_id] = (countMap[ch.series_id] ?? 0) + 1;
      });

      const entries: HistoryEntry[] = progress.map((p: ProgressRow) => {
        const s = Array.isArray(p.series) ? p.series[0] : p.series;
        const ch = Array.isArray(p.chapter) ? p.chapter[0] : p.chapter;
        return {
          series_id: p.series_id,
          chapter_id: p.chapter_id,
          page_number: p.page_number,
          updated_at: p.updated_at,
          series_title: s?.title ?? 'Unknown Series',
          series_cover: s?.cover_url ?? null,
          series_genre: s?.genre ?? null,
          chapter_number: ch?.chapter_number ?? null,
          chapter_title: ch?.title ?? null,
          total_chapters: countMap[p.series_id] ?? 0,
          content_type: s?.content_type ?? null,
        };
      });

      setHistory(entries);
      setLoading(false);
    };
    load();
  }, []);

  // Filter logic — clicking active pill resets to 'all'
  const handleContentTypeToggle = (type: FilterType) => {
    const next = activeContentType === type && type !== 'all' ? 'all' : type;
    setActiveContentType(next);
    try {
      if (next === 'all') {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, next);
      }
    } catch {}
  };

  const filteredHistory = useMemo(() => {
    if (activeContentType === 'all') return history;
    return history.filter(h => h.content_type === activeContentType);
  }, [history, activeContentType]);

  const removeEntry = async (seriesId: string) => {
    if (!userId) return;
    await supabase
      .from('reading_progress')
      .delete()
      .eq('reader_id', userId)
      .eq('series_id', seriesId);
    setHistory(prev => prev.filter(h => h.series_id !== seriesId));
  };

  const clearAll = async () => {
    if (!userId) return;
    setClearing(true);
    await supabase
      .from('reading_progress')
      .delete()
      .eq('reader_id', userId);
    setHistory([]);
    setClearing(false);
    setConfirmClear(false);
  };

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  // Pill style helper
  const pillStyle = (type: FilterType): React.CSSProperties => {
    const isActive = activeContentType === type;
    const colors: Record<FilterType, { bg: string; border: string; color: string }> = {
      all:    { bg: isActive ? '#d97706' : 'transparent',           border: isActive ? '#d97706' : 'var(--border-color)',          color: isActive ? '#fff' : 'var(--text-tertiary)' },
      mangal: { bg: isActive ? 'rgba(127,29,29,0.9)' : 'transparent', border: isActive ? '#7f1d1d' : 'var(--border-color)',        color: isActive ? '#fff' : 'var(--text-tertiary)' },
      novel:  { bg: isActive ? 'rgba(76,29,149,0.9)' : 'transparent', border: isActive ? '#4c1d95' : 'var(--border-color)',        color: isActive ? '#fff' : 'var(--text-tertiary)' },
    };
    const c = colors[type];
    return {
      padding: '6px 16px', borderRadius: '20px', fontSize: '12px', fontWeight: 700,
      cursor: 'pointer', background: c.bg, border: `1px solid ${c.border}`,
      color: c.color, transition: 'all 0.15s', userSelect: 'none',
    };
  };

  // Counter text
  const counterText = () => {
    if (loading) return '';
    if (history.length === 0) return 'No reading history yet.';
    if (activeContentType === 'all') return `${history.length} series read`;
    return `${filteredHistory.length} of ${history.length} series`;
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)', }}>
      {/* Mobile pass — page had 0 @media rules (custom nav, not the shared
          Navbar component, so it didn't inherit that fix either). Nav
          breadcrumb hides on narrow phones since the left side has no
          wrap/ellipsis and would otherwise silently push past the viewport;
          header/content padding tightens; history row cover shrinks and its
          actions column stays compact at 480px, matching the /library row
          pattern. */}
      <style>{`
        @media (max-width: 640px) {
          .mangal-hist-nav { padding: 0 16px !important; }
          .mangal-hist-crumb { display: none; }
          .mangal-hist-header { padding: 28px 16px 16px !important; }
          .mangal-hist-pills-wrap { padding: 0 16px 20px !important; }
          .mangal-hist-content { padding: 0 16px 60px !important; }
        }
        @media (max-width: 480px) {
          .mangal-hist-title { font-size: 22px !important; }
          .mangal-hist-row { padding: 12px !important; gap: 10px !important; }
          .mangal-hist-cover { width: 44px !important; height: 60px !important; }
        }
      `}</style>

      {/* NAV */}
      <nav className="mangal-hist-nav" style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'var(--nav-bg)', backdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--border-color)',
        padding: '0 24px', height: '60px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', minWidth: 0 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none', flexShrink: 0 }}>
            <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: 'linear-gradient(135deg, #7f1d1d, #d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}><Flame size={15} /></div>
            <span style={{ fontWeight: 900, fontSize: '17px', color: 'var(--text-primary)' }}>MANGAL</span>
          </Link>
          <span className="mangal-hist-crumb" style={{ color: 'var(--text-faint)' }}>›</span>
          <span className="mangal-hist-crumb" style={{ fontSize: '13px', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>Reading History</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <ThemeToggle size={30} />
          <Link href="/" style={{ padding: '7px 14px', borderRadius: '8px', fontSize: '12px', color: 'var(--text-tertiary)', textDecoration: 'none', border: '1px solid var(--border-color)' }}>Browse</Link>
        </div>
      </nav>

      {/* HEADER */}
      <div className="mangal-hist-header" style={{ maxWidth: '900px', margin: '0 auto', padding: '40px 24px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="mangal-hist-title" style={{ fontSize: '28px', fontWeight: 900, margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: '8px' }}><Clock size={26} /> Reading History</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>{counterText()}</p>
        </div>
        {!loading && history.length > 0 && (
          confirmClear ? (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={clearAll}
                disabled={clearing}
                style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444' }}
              >
                {clearing ? 'Clearing...' : 'Yes, clear all'}
              </button>
              <button
                onClick={() => setConfirmClear(false)}
                style={{ padding: '8px 14px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-tertiary)' }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmClear(true)}
              style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-muted)' }}
            >
              <Trash2 size={13} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Clear History
            </button>
          )
        )}
      </div>

      {/* CONTENT TYPE FILTER PILLS */}
      {!loading && history.length > 0 && (
        <div className="mangal-hist-pills-wrap" style={{ maxWidth: '900px', margin: '0 auto', padding: '0 24px 20px' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={() => handleContentTypeToggle('all')}    style={pillStyle('all')}>All</button>
            <button onClick={() => handleContentTypeToggle('mangal')} style={pillStyle('mangal')}><ScrollText size={13} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Mangal</button>
            <button onClick={() => handleContentTypeToggle('novel')}  style={pillStyle('novel')}><BookText size={13} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Novel</button>
          </div>
        </div>
      )}

      {/* CONTENT */}
      <div className="mangal-hist-content" style={{ maxWidth: '900px', margin: '0 auto', padding: '0 24px 80px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px', color: 'var(--text-muted)' }}>
            <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'center' }}><Clock size={36} /></div>
            <div>Loading history...</div>
          </div>
        ) : history.length === 0 ? (
          /* Empty — no history at all */
          <div style={{ textAlign: 'center', padding: '80px 40px', background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
            <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'center' }}><BookOpen size={48} /></div>
            <p style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>Nothing read yet</p>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 24px' }}>
              Start reading a series and it&apos;ll appear here automatically.
            </p>
            <Link href="/" style={{
              padding: '10px 24px', borderRadius: '10px',
              background: 'linear-gradient(135deg, #7f1d1d, #991b1b)',
              color: '#fff', textDecoration: 'none', fontSize: '13px', fontWeight: 700,
            }}>
              Browse Series
            </Link>
          </div>
        ) : filteredHistory.length === 0 ? (
          /* Empty — filter returned zero results */
          <div style={{ textAlign: 'center', padding: '60px 40px', background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '40px', marginBottom: '14px' }}>
              {activeContentType === 'novel' ? <BookText size={13} /> : <ScrollText size={13} />}
            </div>
            <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>
              No {activeContentType === 'novel' ? 'novels' : 'mangal'} in history
            </p>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 20px' }}>
              You haven&apos;t read any {activeContentType === 'novel' ? 'novels' : 'mangal'} yet.
            </p>
            <button
              onClick={() => handleContentTypeToggle('all')}
              style={{
                padding: '9px 22px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                cursor: 'pointer', background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)',
              }}
            >
              Show All
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filteredHistory.map(h => (
              <HistoryRow
                key={h.series_id}
                entry={h}
                timeAgo={timeAgo}
                onRemove={() => removeEntry(h.series_id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* FOOTER */}
      <footer style={{ borderTop: '1px solid var(--footer-border)', background: 'var(--footer-bg)', padding: '32px 24px', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center', marginBottom: '10px' }}>
          <div style={{ width: '26px', height: '26px', borderRadius: '7px', background: 'linear-gradient(135deg, #7f1d1d, #d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}><Flame size={13} /></div>
          <span style={{ fontWeight: 900, fontSize: '15px', color: 'var(--footer-text)' }}>MANGAL</span>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--footer-text-muted)', margin: '0 0 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>Made with <Heart size={12} fill="currentColor" /> in India · Free to read, forever.</p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', flexWrap: 'wrap' }}>
          {['/privacy', '/terms', '/grievance'].map(href => (
            <a key={href} href={href} style={{ fontSize: '11px', color: 'var(--footer-link)', textDecoration: 'none' }}>
              {href === '/privacy' ? 'Privacy Policy' : href === '/terms' ? 'Terms of Service' : 'Grievance Officer'}
            </a>
          ))}
        </div>
      </footer>
    </div>
  );
}

function HistoryRow({
  entry,
  timeAgo,
  onRemove,
}: {
  entry: HistoryEntry;
  timeAgo: (iso: string) => string;
  onRemove: () => void;
}) {
  const [confirmRemove, setConfirmRemove] = useState(false);

  const isNovel = entry.content_type === 'novel';

  // Progress bar: (chapter_number / total_chapters) * 100
  const progressPct = entry.total_chapters > 0 && entry.chapter_number
    ? Math.min(100, Math.round((entry.chapter_number / entry.total_chapters) * 100))
    : 0;

  // Accent colours
  const accentGradient = isNovel
    ? 'linear-gradient(135deg, #4c1d95, #6d28d9)'
    : 'linear-gradient(135deg, #7f1d1d, #991b1b)';

  const progressGradient = isNovel
    ? 'linear-gradient(90deg, #4c1d95, #6d28d9)'
    : 'linear-gradient(90deg, #7f1d1d, #d97706)';

  const coverFallbackIcon = isNovel ? <BookText size={20} /> : <ScrollText size={20} />;
  const coverBg = isNovel ? '#1a0a2e' : '#1a0a0a';

  // Content type badge
  const badgeLabel = isNovel ? 'NOVEL' : 'MANGAL';
  const badgeBg = isNovel ? 'rgba(109,40,217,0.85)' : 'rgba(153,27,27,0.85)';

  return (
    <div className="mangal-hist-row" style={{
      display: 'flex', gap: '14px', alignItems: 'center',
      background: 'var(--bg-card)', border: `1px solid ${isNovel ? 'rgba(76,29,149,0.25)' : 'var(--border-color)'}`,
      borderRadius: '12px', padding: '14px 16px',
    }}>
      {/* Cover thumbnail */}
      <a href={`/WebMangal/series/${entry.series_id}`} style={{ flexShrink: 0, textDecoration: 'none', position: 'relative' }}>
        <div className="mangal-hist-cover" style={{ width: '52px', height: '70px', borderRadius: '7px', overflow: 'hidden', background: coverBg, border: '1px solid var(--border-color)', position: 'relative' }}>
          {entry.series_cover ? (
            <Image src={entry.series_cover} alt={entry.series_title} fill sizes="52px" style={{ objectFit: 'cover' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>{coverFallbackIcon}</div>
          )}
          {/* Badge overlay */}
          <div style={{
            position: 'absolute', bottom: '3px', left: '50%', transform: 'translateX(-50%)',
            background: badgeBg, borderRadius: '3px',
            padding: '1px 4px', fontSize: '7px', fontWeight: 900, color: '#fff',
            letterSpacing: '0.5px', whiteSpace: 'nowrap',
          }}>
            {badgeLabel}
          </div>
        </div>
      </a>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <a href={`/WebMangal/series/${entry.series_id}`} style={{ textDecoration: 'none' }}>
          <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {entry.series_title}
          </div>
        </a>
        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '8px' }}>
          {entry.chapter_number != null && (
            <span>Ch.{entry.chapter_number}{entry.chapter_title ? ` — ${entry.chapter_title}` : ''}{!isNovel && ` · p.${entry.page_number}`} · </span>
          )}
          <span>{timeAgo(entry.updated_at)}</span>
        </div>
        {/* Progress bar */}
        {progressPct > 0 && (
          <div style={{ marginBottom: '2px' }}>
            <div style={{ height: '3px', background: 'var(--border-color)', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progressPct}%`, background: progressGradient, borderRadius: '2px' }} />
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-faint)', marginTop: '3px' }}>
              {progressPct}% · Ch.{entry.chapter_number} of {entry.total_chapters}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', flexShrink: 0, alignItems: 'flex-end' }}>
        <a
          href={`/WebMangal/read/${entry.chapter_id}`}
          style={{
            padding: '7px 14px', borderRadius: '8px', fontSize: '11px', fontWeight: 700,
            background: accentGradient,
            color: '#fff', textDecoration: 'none', whiteSpace: 'nowrap',
          }}
        >
          <Play size={11} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Continue
        </a>
        {confirmRemove ? (
          <div style={{ display: 'flex', gap: '5px' }}>
            <button
              onClick={onRemove}
              style={{ padding: '5px 9px', borderRadius: '6px', fontSize: '10px', fontWeight: 700, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', cursor: 'pointer' }}
            >
              Remove
            </button>
            <button
              onClick={() => setConfirmRemove(false)}
              style={{ padding: '5px 9px', borderRadius: '6px', fontSize: '10px', background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-tertiary)', cursor: 'pointer' }}
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmRemove(true)}
            style={{ padding: '5px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: 600, background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-faint)', cursor: 'pointer' }}
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </div>
  );
}