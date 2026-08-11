'use client';

import { useState, useEffect, type CSSProperties } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import ThemeToggle from '../components/ThemeToggle';
import { supabase } from '../lib/supabase';

// ── KaTube — Step 3 (video grid + watch page) + Step 4 (upload flow,
// including Shorts) ──
// The main grid and Shorts row both read from the `videos` table (see
// supabase/migrations/20260810_katube_videos.sql), split on `is_short`.
// Clicking a card opens /katube/watch/[videoId], which embeds the real
// YouTube player. Shorts row falls back to demo placeholder cards only when
// there are zero real is_short=true rows yet.
// Upload flow lives at /katube/upload — paste a YouTube link, mark it as a
// Short or not, optionally pick a series you own, submit.
//
// Brand: white + blue (per founder request), distinct from Kalpana Circle's
// purple identity — the two doors should read as related but visually
// distinguishable products.

interface RealVideo {
  id: string;
  title: string;
  youtube_id: string;
  views: number;
  likes: number;
  created_at: string;
  category: string;
  ai_tool: string;
  creator: string;
  basedOn: string | null;
}

interface RealShort {
  id: string;
  title: string;
  youtube_id: string;
  views: number;
}

// Matches DramaBox's Popular/New/Rankings/Categories tab set (founder
// reference screenshot), plus a Tools chip for filtering by which AI
// video-generation tool made the clip. Categories and Tools each reveal
// their own pill sub-row (GENRE_PILLS / TOOL_PILLS) instead of navigating
// away — Genre is folded into Categories (one merged genre list, per
// founder), Tools is its own separate axis since it's a different
// question (what made it) from Categories (what it's about).
const FILTER_PILLS = ['Popular', 'New', 'Rankings', 'Categories', 'Tools'];
const GENRE_PILLS = ['All', 'Action', 'Mythology', 'Horror', 'Slice of Life', 'Fantasy', 'Dark Fantasy', 'Supernatural', 'Science Fiction', 'Trailers'];
const TOOL_PILLS = ['All', 'Sora', 'Kling', 'Runway', 'Pika', 'Hailuo', 'Veo', 'Other'];

// Fast tap "collapsed" state now caps by item count, not a fixed pixel
// maxHeight — a pixel cap clips whatever card happens to sit at that height
// (worse at wider screens, where auto-fill columns stretch and cards get
// taller), cutting off rounded corners mid-card. Capping the item count
// means we simply never render the extra cards, so there's nothing to crop.
const FAST_TAP_COLLAPSED_COUNT = 6;

interface DemoShort {
  id: string;
  title: string;
  views: string;
  gradient: string;
  emoji: string;
}

const DEMO_SHORTS: DemoShort[] = [
  { id: 's1', title: 'Aryavarta in 30 seconds', views: '12K', gradient: 'linear-gradient(160deg, #2563eb, #0ea5e9)', emoji: '⚡' },
  { id: 's2', title: 'That plot twist though 😱', views: '8.7K', gradient: 'linear-gradient(160deg, #1e3a8a, #1d4ed8)', emoji: '😱' },
  { id: 's3', title: 'Banyan Spirit — best frame', views: '15K', gradient: 'linear-gradient(160deg, #0891b2, #2563eb)', emoji: '🌳' },
  { id: 's4', title: 'Street Life Mumbai vibes', views: '6.1K', gradient: 'linear-gradient(160deg, #0369a1, #38bdf8)', emoji: '🌆' },
  { id: 's5', title: 'POV: exam week hits different', views: '21K', gradient: 'linear-gradient(160deg, #2563eb, #7dd3fc)', emoji: '🎒' },
  { id: 's6', title: 'Horror anthology jumpscare', views: '9.4K', gradient: 'linear-gradient(160deg, #1e3a8a, #0ea5e9)', emoji: '👻' },
];

// ── KaTube redesign Step 2 (11 Aug 2026) — sidebar now actually filters ──
// 'home' shows both sections, 'fast' shows only the 9:16 grid (renamed from
// "Shorts"), 'slow' shows only the 16:9 grid (renamed from "Videos").
// 'saved' has no backing data yet, so it shows a placeholder message.
type SidebarItem = 'home' | 'fast' | 'slow' | 'saved';

const SIDEBAR_ITEMS: { id: SidebarItem; label: string; icon: string }[] = [
  { id: 'home', label: 'Home', icon: '🏠' },
  { id: 'fast', label: 'Fast tap', icon: '▷' },
  { id: 'slow', label: 'Slow tap', icon: '▷' },
  { id: 'saved', label: 'Saved', icon: '🔖' },
];

function SidebarNav({
  open,
  active,
  onSelect,
}: {
  open: boolean;
  active: SidebarItem;
  onSelect: (id: SidebarItem) => void;
}) {
  return (
    <aside style={{
      width: open ? '240px' : '0px',
      flexShrink: 0,
      overflow: 'hidden',
      borderRight: open ? '1px solid var(--border-color)' : 'none',
      transition: 'width 0.2s ease, border-color 0.2s ease',
      position: 'sticky',
      top: '64px',
      alignSelf: 'flex-start',
      height: 'calc(100vh - 64px)',
    }}>
      <nav style={{ width: '240px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {SIDEBAR_ITEMS.map(item => (
          <button
            key={item.id}
            onClick={() => onSelect(item.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: '20px',
              padding: '12px 20px', borderRadius: '10px', border: 'none',
              background: active === item.id ? 'rgba(37,99,235,0.12)' : 'transparent',
              color: active === item.id ? '#2563eb' : 'var(--text-secondary)',
              fontSize: '15px', fontWeight: active === item.id ? 800 : 600,
              cursor: 'pointer', textAlign: 'left', whiteSpace: 'nowrap',
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            <span style={{ fontSize: '22px', width: '24px', textAlign: 'center' }}>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-color)' }}>
        <Link href="/" style={{
          display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none',
          fontSize: '12.5px', fontWeight: 700, color: 'var(--text-tertiary)', whiteSpace: 'nowrap',
        }}>← Back to MANGAL</Link>
      </div>

    </aside>
  );
}

function HamburgerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  );
}

function DemoShortCard({ short }: { short: DemoShort }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: '100%', borderRadius: '16px', overflow: 'hidden', clipPath: 'inset(0 round 16px)', cursor: 'pointer',
        position: 'relative', aspectRatio: '2/3', background: short.gradient,
        display: 'flex', alignItems: 'flex-end',
        transform: hover ? 'translateY(-4px) scale(1.02)' : 'none',
        boxShadow: hover ? '0 12px 24px rgba(37,99,235,0.28)' : '0 2px 8px rgba(0,0,0,0.12)',
        transition: 'transform 0.15s, box-shadow 0.2s',
      }}
    >
      <span style={{ position: 'absolute', top: '44%', left: '50%', transform: 'translate(-50%, -50%)', fontSize: '44px', opacity: 0.9 }}>{short.emoji}</span>
      <span style={{
        position: 'absolute', top: '10px', left: '10px', fontSize: '11px', fontWeight: 800, color: '#fff',
        background: 'rgba(0,0,0,0.5)', padding: '3px 9px', borderRadius: '20px', letterSpacing: '0.02em',
      }}>⚡ SHORTS</span>
      <div style={{
        position: 'relative', width: '100%', padding: '24px 14px 14px',
        background: 'linear-gradient(to top, rgba(0,0,0,0.75), transparent)',
        borderRadius: '0 0 16px 16px',
      }}>
        <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff', lineHeight: 1.3, marginBottom: '4px' }}>{short.title}</div>
        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.75)' }}>{short.views} views</div>
      </div>
    </div>
  );
}

function RealShortCard({ short }: { short: RealShort }) {
  const [hover, setHover] = useState(false);
  const router = useRouter();
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => router.push(`/katube/shorts/${short.id}`)}
      style={{
        width: '100%', borderRadius: '16px', overflow: 'hidden', clipPath: 'inset(0 round 16px)', cursor: 'pointer',
        position: 'relative', aspectRatio: '2/3', background: '#000',
        display: 'flex', alignItems: 'flex-end',
        transform: hover ? 'translateY(-4px) scale(1.02)' : 'none',
        boxShadow: hover ? '0 12px 24px rgba(37,99,235,0.28)' : '0 2px 8px rgba(0,0,0,0.12)',
        transition: 'transform 0.15s, box-shadow 0.2s',
      }}
    >
      <img
        src={`https://img.youtube.com/vi/${short.youtube_id}/hqdefault.jpg`}
        alt={short.title}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
      />
      <span style={{
        position: 'absolute', top: '10px', left: '10px', fontSize: '11px', fontWeight: 800, color: '#fff',
        background: 'rgba(0,0,0,0.5)', padding: '3px 9px', borderRadius: '20px', letterSpacing: '0.02em',
      }}>⚡ SHORTS</span>
      <div style={{
        position: 'relative', width: '100%', padding: '24px 14px 14px',
        background: 'linear-gradient(to top, rgba(0,0,0,0.75), transparent)',
        borderRadius: '0 0 16px 16px',
      }}>
        <div style={{
          fontSize: '14px', fontWeight: 700, color: '#fff', lineHeight: 1.3, marginBottom: '4px',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>{short.title}</div>
        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.75)' }}>{short.views.toLocaleString()} views</div>
      </div>
    </div>
  );
}

function RealVideoCard({ video }: { video: RealVideo }) {
  const [hover, setHover] = useState(false);
  const router = useRouter();
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => router.push(`/katube/watch/${video.id}`)}
      style={{
        borderRadius: '14px', overflow: 'hidden', cursor: 'pointer',
        background: 'var(--bg-card)', border: '1px solid var(--border-color)',
        transition: 'transform 0.15s, box-shadow 0.2s',
        transform: hover ? 'translateY(-4px)' : 'none',
        boxShadow: hover ? '0 12px 28px rgba(37,99,235,0.20)' : 'none',
      }}
    >
      <div style={{ position: 'relative', aspectRatio: '16/9', background: '#000' }}>
        <img
          src={`https://img.youtube.com/vi/${video.youtube_id}/hqdefault.jpg`}
          alt={video.title}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
        {hover && (
          <div style={{
            position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              width: '46px', height: '46px', borderRadius: '50%',
              background: 'rgba(255,255,255,0.92)', display: 'flex',
              alignItems: 'center', justifyContent: 'center', fontSize: '18px',
            }}>▶️</div>
          </div>
        )}
      </div>
      <div style={{ padding: '12px 14px' }}>
        <div style={{
          fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary)',
          lineHeight: 1.35, marginBottom: '6px',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>{video.title}</div>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>{video.creator}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
          {video.basedOn && (
            <Link
              href="#"
              onClick={(e) => e.stopPropagation()}
              style={{
                fontSize: '10.5px', fontWeight: 700, color: '#2563eb', textDecoration: 'none',
                background: 'rgba(37,99,235,0.10)', border: '1px solid rgba(37,99,235,0.28)',
                padding: '3px 9px', borderRadius: '20px', whiteSpace: 'nowrap',
              }}>
              📖 {video.basedOn}
            </Link>
          )}
          <span style={{ fontSize: '11.5px', color: 'var(--text-tertiary)' }}>{video.views} views</span>
        </div>
      </div>
    </div>
  );
}

export default function KaTubePage() {
  const [videos, setVideos] = useState<RealVideo[]>([]);
  const [shorts, setShorts] = useState<RealShort[]>([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeSidebar, setActiveSidebar] = useState<SidebarItem>('home');
  const [showAllFastTap, setShowAllFastTap] = useState(false);
  const [activeFilter, setActiveFilter] = useState(0);
  const [activeGenre, setActiveGenre] = useState('All');
  const [activeTool, setActiveTool] = useState('All');
  const [isLight, setIsLight] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    (async () => {
      const [videosRes, shortsRes] = await Promise.all([
        supabase.from('videos').select('id, title, youtube_id, views, likes, created_at, category, ai_tool, creator_id, series_id')
          .eq('is_short', false).order('created_at', { ascending: false }),
        supabase.from('videos').select('id, title, youtube_id, views')
          .eq('is_short', true).order('created_at', { ascending: false }).limit(12),
      ]);

      setShorts(shortsRes.data || []);

      const rows = videosRes.data;
      if (!rows || rows.length === 0) { setLoading(false); return; }

      const creatorIds = [...new Set(rows.map(r => r.creator_id))];
      const seriesIds = [...new Set(rows.map(r => r.series_id).filter(Boolean))];

      const [creatorsRes, seriesRes] = await Promise.all([
        supabase.from('creator_profiles').select('user_id, username').in('user_id', creatorIds),
        seriesIds.length ? supabase.from('series').select('id, title').in('id', seriesIds) : Promise.resolve({ data: [] as { id: string; title: string }[] }),
      ]);
      const creatorMap = new Map((creatorsRes.data || []).map(c => [c.user_id, c.username]));
      const seriesMap = new Map((seriesRes.data || []).map(s => [s.id, s.title]));

      setVideos(rows.map(r => ({
        id: r.id,
        title: r.title,
        youtube_id: r.youtube_id,
        views: r.views,
        likes: r.likes,
        created_at: r.created_at,
        category: r.category,
        ai_tool: r.ai_tool,
        creator: creatorMap.get(r.creator_id) || 'MANGAL Creator',
        basedOn: r.series_id ? (seriesMap.get(r.series_id) || null) : null,
      })));
      setLoading(false);
    })();
  }, []);

  // Popular = views desc, New = created_at desc, Rankings = likes desc
  // (a distinct leaderboard metric from Popular, per the DramaBox reference
  // where Popular and Rankings are separate tabs). Categories filters by
  // the `category` column via the genre sub-row below; it doesn't re-sort.
  // Categories filters by `category` (genre — Genre chip merged into this
  // per founder), Tools filters by `ai_tool` (which AI video tool made the
  // clip) — separate axes, both applied together regardless of which
  // sort chip is active.
  const filteredVideos = videos
    .filter(v => activeGenre === 'All' || v.category === activeGenre)
    .filter(v => activeTool === 'All' || v.ai_tool === activeTool);
  const sortedVideos = (() => {
    if (activeFilter === 0) return [...filteredVideos].sort((a, b) => b.views - a.views); // Popular
    if (activeFilter === 1) return [...filteredVideos].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()); // New
    if (activeFilter === 2) return [...filteredVideos].sort((a, b) => b.likes - a.likes); // Rankings
    return filteredVideos; // Categories / Tools
  })();

  // Forced dark by default — founder confirmed dark is the right look for
  // KaTube specifically (screenshot reference), independent of the
  // site-wide light-default toggle. Same pattern as /login's intentional
  // dark-branded screen: override the CSS vars locally on the root div
  // instead of relying on the global data-theme attribute, so this page
  // KaTube defaults to dark (founder's call), but the ThemeToggle can flip
  // it to light — unlike before, this now actually re-themes the page
  // (previously the div's own hardcoded dark vars ignored the toggle
  // entirely). isLight is synced from ThemeToggle's onChange callback.
  const katubeDarkVars = {
    '--bg-primary': '#07070a', '--bg-card': '#0d0d14', '--bg-input': '#08080c',
    '--border-color': 'rgba(255, 255, 255, 0.18)', '--text-primary': '#f9fafb',
    '--text-secondary': '#9ca3af', '--text-tertiary': '#6b7280',
    '--nav-bg': 'rgba(7, 7, 10, 0.97)', '--nav-bg-transparent': 'rgba(7, 7, 10, 0.85)',
  } as CSSProperties;
  const katubeLightVars = {
    '--bg-primary': '#ffffff', '--bg-card': '#f7f7f9', '--bg-input': '#f0f0f3',
    '--border-color': '#e5e7eb', '--text-primary': '#14141c',
    '--text-secondary': '#4b5563', '--text-tertiary': '#6b7280',
    '--nav-bg': 'rgba(255, 255, 255, 0.97)', '--nav-bg-transparent': 'rgba(255, 255, 255, 0.88)',
  } as CSSProperties;
  const katubeVars = isLight ? katubeLightVars : katubeDarkVars;

  return (
    <div data-theme={isLight ? 'light' : 'dark'} style={{ ...katubeVars, minHeight: '100vh', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', overflowX: 'hidden' }}>

      {/* ── NAV — YouTube layout: hamburger + logo | search | create + avatar ── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'var(--nav-bg)', backdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--border-color)',
        padding: '0 20px', height: '64px',
        display: 'flex', alignItems: 'center', gap: '16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
          <button
            onClick={() => setSidebarOpen(v => !v)}
            aria-label="Toggle sidebar"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '34px', height: '34px', borderRadius: '8px', border: 'none',
              background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer',
              flexShrink: 0,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--border-color)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
          >
            <HamburgerIcon />
          </button>
          <Link href="/katube" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none', flexShrink: 0 }}>
            <Image src="/katube-logo.png" alt="KaTube" width={140} height={70} style={{ display: 'block', height: '32px', width: 'auto', objectFit: 'contain' }} priority />
            <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.01em', whiteSpace: 'nowrap' }}>
              powered by MANGAL
            </span>
          </Link>
        </div>

        {/* Search — visual only for now, no search backend/results page yet */}
        <form
          onSubmit={(e) => e.preventDefault()}
          style={{ flex: 1, display: 'flex', justifyContent: 'center', maxWidth: '640px', margin: '0 auto' }}
        >
          <div style={{ display: 'flex', width: '100%', maxWidth: '560px' }}>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search"
              style={{
                flex: 1, height: '38px', padding: '0 16px', borderRadius: '20px 0 0 20px',
                border: '1px solid var(--border-color)', borderRight: 'none',
                background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '13.5px', outline: 'none',
              }}
            />
            <button
              type="submit"
              aria-label="Search"
              title="Search isn't wired to real results yet"
              style={{
                width: '52px', height: '38px', borderRadius: '0 20px 20px 0',
                border: '1px solid var(--border-color)', borderLeft: 'none',
                background: 'var(--bg-card)', color: 'var(--text-secondary)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px',
              }}
            >🔍</button>
          </div>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <Link href="/katube/upload" style={{
            padding: '8px 14px', borderRadius: '18px', fontSize: '12.5px', fontWeight: 700,
            color: '#fff', textDecoration: 'none', background: '#2563eb',
            whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px',
          }}>+ Create</Link>
          <Link href="/kalpana-circle" style={{
            padding: '8px 14px', borderRadius: '8px', fontSize: '12.5px', fontWeight: 700,
            color: '#7c3aed', textDecoration: 'none', border: '1px solid rgba(124,58,237,0.35)',
            whiteSpace: 'nowrap',
          }}>💬 K Circle</Link>
          <ThemeToggle size={30} onChange={setIsLight} />
          {/* KaTube profile — channel verification + metrics live at
              /dashboard/katube (part of the main MANGAL dashboard, see
              CONTEXT.md §6). Swap for the founder's real logo image whenever
              it's ready; still just a "K" placeholder visually. */}
          <Link
            href="/dashboard/katube"
            aria-label="KaTube profile"
            title="KaTube profile"
            style={{
              width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
              background: 'var(--bg-card)', border: '1px solid var(--border-color)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '13px', color: 'var(--text-tertiary)', fontWeight: 700,
              textDecoration: 'none',
            }}
          >K</Link>
        </div>
      </nav>

      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        <SidebarNav open={sidebarOpen} active={activeSidebar} onSelect={setActiveSidebar} />

        <div style={{ flex: 1, minWidth: 0 }}>

      {/* ── HERO STRIP ── */}
      <div style={{
        padding: '36px 20px 24px', textAlign: 'center',
        background: 'radial-gradient(ellipse 70% 60% at 50% 0%, rgba(37,99,235,0.10) 0%, transparent 70%)',
      }}>
        <h1 style={{
          fontSize: 'clamp(24px, 4vw, 40px)', fontWeight: 900, margin: '0 0 8px', letterSpacing: '-0.03em',
        }}>AI-Anime, Made by MANGAL Creators</h1>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', maxWidth: '560px', margin: '0 auto' }}>
          Every video here is an original AI-generated adaptation of a MANGAL series. Click a video to watch it,
          or upload your own.
        </p>
      </div>

      {/* Filter row — Popular / New / Rankings / Categories / Tools,
          matching the founder's DramaBox/YouTube reference: sits right
          under the hero, above Fast tap — not buried between the two
          content sections. Popular = views desc, New = created_at desc,
          Rankings = likes desc. Categories/Tools each reveal their own
          pill sub-row (GENRE_PILLS / TOOL_PILLS) that filter Slow tap by
          `category` / `ai_tool` instead of re-sorting. */}
      <div style={{
        display: 'flex', gap: '8px', overflowX: 'auto', padding: '0 20px 8px',
        maxWidth: '1200px', margin: '0 auto',
      }}>
        {FILTER_PILLS.map((c, i) => (
          <span
            key={c}
            onClick={() => setActiveFilter(i)}
            style={{
              flexShrink: 0, fontSize: '12px', fontWeight: 700, padding: '7px 16px', borderRadius: '20px',
              background: i === activeFilter ? 'linear-gradient(135deg, #2563eb, #0ea5e9)' : 'var(--bg-card)',
              color: i === activeFilter ? '#fff' : 'var(--text-secondary)',
              border: i === activeFilter ? 'none' : '1px solid var(--border-color)',
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}>{c}</span>
        ))}
      </div>

      {activeFilter === 3 && (
        <div style={{
          display: 'flex', gap: '8px', overflowX: 'auto', padding: '0 20px 20px',
          maxWidth: '1200px', margin: '0 auto',
        }}>
          {GENRE_PILLS.map(g => (
            <span
              key={g}
              onClick={() => setActiveGenre(g)}
              style={{
                flexShrink: 0, fontSize: '11.5px', fontWeight: 600, padding: '6px 14px', borderRadius: '20px',
                background: g === activeGenre ? 'var(--text-primary)' : 'transparent',
                color: g === activeGenre ? 'var(--bg-primary)' : 'var(--text-tertiary)',
                border: '1px solid var(--border-color)',
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}>{g}</span>
          ))}
        </div>
      )}

      {activeFilter === 4 && (
        <div style={{
          display: 'flex', gap: '8px', overflowX: 'auto', padding: '0 20px 20px',
          maxWidth: '1200px', margin: '0 auto',
        }}>
          {TOOL_PILLS.map(t => (
            <span
              key={t}
              onClick={() => setActiveTool(t)}
              style={{
                flexShrink: 0, fontSize: '11.5px', fontWeight: 600, padding: '6px 14px', borderRadius: '20px',
                background: t === activeTool ? 'var(--text-primary)' : 'transparent',
                color: t === activeTool ? 'var(--bg-primary)' : 'var(--text-tertiary)',
                border: '1px solid var(--border-color)',
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}>{t}</span>
          ))}
        </div>
      )}

      {/* Fast tap — renamed from "Shorts" per the wireframe. Grid instead of
          a horizontal scroll strip so it can collapse/expand via "Show more",
          matching the wireframe's stacked-sections layout. */}
      {(activeSidebar === 'home' || activeSidebar === 'fast') && (
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 20px 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 900, margin: 0, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '6px' }}>
              ▷ Fast tap
            </h2>
            <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>9:16 · quick swipe-through</span>
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(168px, 1fr))', gap: '4px',
          }}>
            {shorts.length > 0
              ? (showAllFastTap ? shorts : shorts.slice(0, FAST_TAP_COLLAPSED_COUNT)).map(s => <RealShortCard key={s.id} short={s} />)
              : (showAllFastTap ? DEMO_SHORTS : DEMO_SHORTS.slice(0, FAST_TAP_COLLAPSED_COUNT)).map(s => <DemoShortCard key={s.id} short={s} />)}
          </div>
          {(shorts.length > 6 || (shorts.length === 0 && DEMO_SHORTS.length > 6)) && (
            <button
              onClick={() => setShowAllFastTap(v => !v)}
              style={{
                display: 'block', margin: '12px auto 0', padding: '8px 20px', borderRadius: '20px',
                fontSize: '12px', fontWeight: 700, color: '#2563eb', background: 'rgba(37,99,235,0.10)',
                border: '1px solid rgba(37,99,235,0.28)', cursor: 'pointer',
              }}
            >
              {showAllFastTap ? '▲ Show less' : '▼ Show more'}
            </button>
          )}
          {shorts.length === 0 && (
            <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', margin: '10px 0 0' }}>
              Demo placeholders — <Link href="/katube/upload" style={{ color: '#2563eb', fontWeight: 700 }}>upload a Short</Link> to replace these.
            </p>
          )}
        </div>
      )}

      {/* Slow tap — renamed from "Videos" per the wireframe. */}
      {(activeSidebar === 'home' || activeSidebar === 'slow') && (
        <>
          <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 20px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 900, margin: '0 0 14px', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '6px' }}>
              ▷ Slow tap
            </h2>
          </div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-tertiary)', fontSize: '13px' }}>Loading videos…</div>
          ) : videos.length === 0 ? (
            <div style={{ maxWidth: '600px', margin: '0 auto 60px', padding: '18px 22px', borderRadius: '12px', background: 'var(--bg-card)', border: '1px dashed var(--border-color)', textAlign: 'center' }}>
              <p style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', margin: 0, lineHeight: 1.6 }}>
                No videos yet — be the first! <Link href="/katube/upload" style={{ color: '#2563eb', fontWeight: 700 }}>Upload a video</Link> and
                it&apos;ll show up here automatically.
              </p>
            </div>
          ) : (
            <div style={{
              padding: '0 20px 60px', maxWidth: '1200px', margin: '0 auto',
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px',
            }}>
              {sortedVideos.map(v => <RealVideoCard key={v.id} video={v} />)}
            </div>
          )}
        </>
      )}

      {/* Saved — no backing data yet */}
      {activeSidebar === 'saved' && (
        <div style={{ maxWidth: '600px', margin: '40px auto 60px', padding: '18px 22px', borderRadius: '12px', background: 'var(--bg-card)', border: '1px dashed var(--border-color)', textAlign: 'center' }}>
          <p style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', margin: 0, lineHeight: 1.6 }}>
            🔖 Saved videos aren&apos;t wired up yet — this is a placeholder for the sidebar item. Coming in a later step.
          </p>
        </div>
      )}

      {/* Placeholder note (engagement actions still pending) */}
      <div style={{ maxWidth: '600px', margin: '0 auto 60px', padding: '18px 22px', borderRadius: '12px', background: 'var(--bg-card)', border: '1px dashed var(--border-color)', textAlign: 'center' }}>
        <p style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', margin: 0, lineHeight: 1.6 }}>
          The video grid and Shorts row above are live Supabase data with a working watch page and upload
          flow. Subscribe, like, and comment aren&apos;t built yet — that&apos;s the next step.
        </p>
      </div>

        </div>
      </div>
    </div>
  );
}
