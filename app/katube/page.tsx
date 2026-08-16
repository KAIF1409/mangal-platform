'use client';

import { useState, useEffect, type CSSProperties } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import ThemeToggle from '../components/ThemeToggle';
import NotificationBell from './components/NotificationBell';
import ContinueWatchingRow from './components/ContinueWatchingRow';
import MangalIdeasRow from './components/MangalIdeasRow';
import MangalOfTheWeekBanner from './components/MangalOfTheWeekBanner';
import WriterOfTheMonthBanner from './components/WriterOfTheMonthBanner';
import { MangalWeekBadge } from './components/VideoGridCard';
import { supabase } from '../lib/supabase';
import { Home, Zap, Play, Bookmark, ArrowUp, Search, BookOpen, Ghost, TreePine, Building2, Backpack, ArrowLeft, Users, Flame, ListVideo } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

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
// Brand: black + warm orange (matches the MANGAL wordmark gradient — see
// founder reference image), distinct from Kalpana Circle's purple identity —
// the two doors should read as related but visually distinguishable
// products. Previously white + blue; recolored to tie KaTube visually back
// to the core MANGAL logo palette.
//
// Mobile compatibility (Aug 2026): the left sidebar and top nav were built
// desktop-first with no responsive behavior — on narrow/mobile viewports the
// 240px sidebar ate most of the screen and the nav (hamburger + logo +
// search + Create + K Circle + theme toggle + avatar) had no room to fit,
// causing overflow/squeeze. First fixed via a JS `isMobile` flag read from
// `window.innerWidth`, then that fix itself was found to cause a real bug:
// `window` is undefined during server rendering, so the server always sent
// down full desktop markup, and a mobile browser painted that broken/
// overflowing layout before React hydrated and corrected it — a visible
// flash on every mobile load, and a genuine hydration mismatch. Reworked to
// pure CSS `@media (max-width: 768px)` rules (see the <style> block in the
// nav JSX) so the compact layout — sidebar as a fixed overlay drawer with a
// tap-to-close backdrop, search bar/"powered by MANGAL" subtitle/K Circle
// label text dropped — paints correctly on the very first frame, no JS
// required. See SidebarNav and the nav JSX below.

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
  creatorId: string;
  basedOn: string | null;
  durationSeconds: number | null;
}

// §28a — duration filter buckets. Short/Medium/Long roughly mirrors
// YouTube's own filter (Under 4 min / 4-20 min / Over 20 min); a video
// with no duration_seconds on file (uploaded before this column existed)
// is excluded from every bucket except "All", never guessed at.
const DURATION_BUCKETS = [
  { label: 'Any length', test: () => true },
  { label: 'Under 4 min', test: (s: number) => s < 240 },
  { label: '4–20 min', test: (s: number) => s >= 240 && s <= 1200 },
  { label: 'Over 20 min', test: (s: number) => s > 1200 },
];

// §28a — upload date filter buckets.
const UPLOAD_DATE_BUCKETS = [
  { label: 'Any time', days: null },
  { label: 'Today', days: 1 },
  { label: 'This week', days: 7 },
  { label: 'This month', days: 30 },
  { label: 'This year', days: 365 },
];

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

// Relative-time helper for the video card meta line ("creator · time ago"),
// matching the founder's YouTube-template reference. Falls back to a plain
// date once older than a week so it doesn't produce "52 weeks ago".
function timeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

interface DemoShort {
  id: string;
  title: string;
  views: string;
  gradient: string;
  icon: LucideIcon;
}

const DEMO_SHORTS: DemoShort[] = [
  { id: 's1', title: 'Aryavarta in 30 seconds', views: '12K', gradient: 'linear-gradient(160deg, #f97316, #fb923c)', icon: Zap },
  { id: 's2', title: 'That plot twist though', views: '8.7K', gradient: 'linear-gradient(160deg, #7c2d12, #c2410c)', icon: Ghost },
  { id: 's3', title: 'Banyan Spirit — best frame', views: '15K', gradient: 'linear-gradient(160deg, #ea580c, #f97316)', icon: TreePine },
  { id: 's4', title: 'Street Life Mumbai vibes', views: '6.1K', gradient: 'linear-gradient(160deg, #9a3412, #fdba74)', icon: Building2 },
  { id: 's5', title: 'POV: exam week hits different', views: '21K', gradient: 'linear-gradient(160deg, #f97316, #fde68a)', icon: Backpack },
  { id: 's6', title: 'Horror anthology jumpscare', views: '9.4K', gradient: 'linear-gradient(160deg, #7c2d12, #fb923c)', icon: Ghost },
];

// ── KaTube redesign Step 2 (11 Aug 2026) — sidebar now actually filters ──
// 'home' shows both sections, 'fast' shows only the 9:16 grid (renamed from
// "Shorts"), 'slow' shows only the 16:9 grid (renamed from "Videos").
// 'saved' has no backing data yet, so it shows a placeholder message.
type SidebarItem = 'home' | 'fast' | 'slow' | 'saved';

// Grouped into labeled sections (Menu / Library) to match the founder's
// YouTube-template reference — same four items and the same filtering
// behavior as before, just organized under section headers instead of one
// flat list, plus a pinned "+ Create" CTA at the bottom of the sidebar
// (see the JSX below) matching the template's pinned "Upload Video" button.
const SIDEBAR_GROUPS: { label: string; items: { id: SidebarItem; label: string; icon: LucideIcon }[] }[] = [
  {
    label: 'Menu',
    items: [
      { id: 'home', label: 'Home', icon: Home },
      { id: 'fast', label: 'Fast tap', icon: Zap },
      { id: 'slow', label: 'Slow tap', icon: Play },
    ],
  },
  {
    label: 'Library',
    items: [
      { id: 'saved', label: 'Saved', icon: Bookmark },
    ],
  },
];

// §28a — Trending/Subscriptions/Playlists are full separate routes (their
// own pages under app/katube/), not filters on this page's own grid state,
// so they're plain links rather than SidebarItem values. Kept in their own
// array/section instead of folding into SIDEBAR_GROUPS above, since that
// type is keyed to the in-page `active`/`onSelect` filtering model these
// don't participate in.
const SIDEBAR_LINKS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/katube/trending', label: 'Trending', icon: Flame },
  { href: '/katube/subscriptions', label: 'Subscriptions', icon: Users },
  { href: '/katube/playlists', label: 'Playlists', icon: ListVideo },
];

function SidebarNav({
  desktopOpen,
  mobileOpen,
  active,
  onSelect,
  onClose,
}: {
  desktopOpen: boolean;
  mobileOpen: boolean;
  active: SidebarItem;
  onSelect: (id: SidebarItem) => void;
  onClose: () => void;
}) {
  // ── Hydration-safe mobile handling (Aug 2026 fix) ──
  // Previously this branched on a JS `isMobile` boolean seeded from
  // `window.innerWidth`, which is undefined during SSR. That meant the
  // server always rendered the desktop version (sidebar pushing content,
  // full-width nav) and a mobile browser had to wait for React to hydrate
  // and recompute the real width before switching to the drawer layout —
  // a visible flash of broken/overflowing desktop chrome on every mobile
  // load, and a genuine hydration mismatch. Fixed by moving the
  // mobile-vs-desktop *visual* behavior entirely into CSS `@media` rules
  // (see the <style> block in KaTubePage), so the correct layout is
  // painted immediately with no JS required. `desktopOpen`/`mobileOpen`
  // are now two independent, breakpoint-agnostic booleans (both default
  // to the same value on server and client, so there's nothing to
  // mismatch) — CSS decides which one actually matters at a given width.
  return (
    <>
      {/* Tap-to-close backdrop — CSS-only hidden above 768px, so this is
          harmless to always render. */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`katube-backdrop${mobileOpen ? ' katube-backdrop--open' : ''}`}
      />
      <aside
        className={`katube-sidebar${!desktopOpen ? ' katube-sidebar--desktop-closed' : ''}${mobileOpen ? ' katube-sidebar--mobile-open' : ''}`}
      >
        <nav style={{ width: '240px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '18px', flex: 1, overflowY: 'auto' }}>
          {SIDEBAR_GROUPS.map((group, gi) => (
            <div key={group.label}>
              <div style={{
                padding: '0 20px 6px', fontSize: '11px', fontWeight: 800, letterSpacing: '0.06em',
                color: 'var(--text-tertiary)', textTransform: 'uppercase',
              }}>{group.label}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {group.items.map(item => (
                  <button
                    key={item.id}
                    onClick={() => { onSelect(item.id); onClose(); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '20px',
                      padding: '12px 20px', borderRadius: '10px', border: 'none',
                      background: active === item.id ? 'rgba(249,115,22,0.12)' : 'transparent',
                      color: active === item.id ? '#f97316' : 'var(--text-secondary)',
                      fontSize: '15px', fontWeight: active === item.id ? 800 : 600,
                      cursor: 'pointer', textAlign: 'left', whiteSpace: 'nowrap',
                      transition: 'background 0.15s, color 0.15s',
                    }}
                  >
                    <span style={{ display: 'flex', width: '24px', justifyContent: 'center' }}><item.icon size={20} /></span>
                    {item.label}
                  </button>
                ))}
              </div>
              {/* §28a links live right under Menu, above Library — matches
                  where YouTube itself places Trending/Subscriptions. */}
              {gi === 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '10px' }}>
                  {SIDEBAR_LINKS.map(link => (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={onClose}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '20px',
                        padding: '12px 20px', borderRadius: '10px',
                        color: 'var(--text-secondary)', textDecoration: 'none',
                        fontSize: '15px', fontWeight: 600, whiteSpace: 'nowrap',
                      }}
                    >
                      <span style={{ display: 'flex', width: '24px', justifyContent: 'center' }}><link.icon size={20} /></span>
                      {link.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        {/* Pinned bottom CTA — matches the template's pinned "Upload Video"
            button (recolored to KaTube's orange brand instead of YouTube red),
            sitting above the existing "Back to MANGAL" link. */}
        <div style={{ padding: '12px 20px 16px', borderTop: '1px solid var(--border-color)', flexShrink: 0 }}>
          <Link href="/katube/upload" onClick={onClose} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            width: '100%', padding: '11px 0', borderRadius: '10px', textDecoration: 'none',
            background: '#f97316', color: '#fff', fontSize: '13px', fontWeight: 800,
            letterSpacing: '0.01em', marginBottom: '12px',
          }}><ArrowUp size={15} strokeWidth={2.5} /> Upload video</Link>
          {/* Was href="/" (site-wide marketing landing page) — "Back to
              MANGAL" reads like it should stay inside the product family,
              but sent people to the public homepage instead of KaTube's
              own home tab. Point it at /katube. */}
          <Link href="/katube" style={{
            display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none',
            fontSize: '12.5px', fontWeight: 700, color: 'var(--text-tertiary)', whiteSpace: 'nowrap',
          }}><ArrowLeft size={13} strokeWidth={2} /> Back to KaTube</Link>
        </div>

      </aside>
    </>
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
        boxShadow: hover ? '0 12px 24px rgba(249,115,22,0.28)' : '0 2px 8px rgba(0,0,0,0.12)',
        transition: 'transform 0.15s, box-shadow 0.2s',
      }}
    >
      <span style={{ position: 'absolute', top: '44%', left: '50%', transform: 'translate(-50%, -50%)', opacity: 0.9 }}><short.icon size={40} strokeWidth={1.5} color="#fff" /></span>
      <span style={{
        position: 'absolute', top: '10px', left: '10px', fontSize: '11px', fontWeight: 800, color: '#fff',
        background: 'rgba(0,0,0,0.5)', padding: '3px 9px', borderRadius: '20px', letterSpacing: '0.02em',
        display: 'inline-flex', alignItems: 'center', gap: '3px',
      }}><Zap size={11} fill="#fff" /> SHORTS</span>
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
        boxShadow: hover ? '0 12px 24px rgba(249,115,22,0.28)' : '0 2px 8px rgba(0,0,0,0.12)',
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
        display: 'inline-flex', alignItems: 'center', gap: '3px',
      }}><Zap size={11} fill="#fff" /> SHORTS</span>
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

function RealVideoCard({ video, winnerRank }: { video: RealVideo; winnerRank?: number }) {
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
        boxShadow: hover ? '0 12px 28px rgba(249,115,22,0.20)' : 'none',
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
        {winnerRank && (
          <div style={{ position: 'absolute', bottom: '8px', right: '8px' }}>
            <MangalWeekBadge rank={winnerRank} />
          </div>
        )}
      </div>
      <div style={{ padding: '12px 14px' }}>
        <div style={{
          fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary)',
          lineHeight: 1.35, marginBottom: '6px',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>{video.title}</div>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
          {video.creator} · {timeAgo(video.created_at)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
          {video.basedOn && (
            <Link
              href="#"
              onClick={(e) => e.stopPropagation()}
              style={{
                fontSize: '10.5px', fontWeight: 700, color: '#f97316', textDecoration: 'none',
                background: 'rgba(249,115,22,0.10)', border: '1px solid rgba(249,115,22,0.28)',
                padding: '3px 9px', borderRadius: '20px', whiteSpace: 'nowrap',
                display: 'inline-flex', alignItems: 'center', gap: '4px',
              }}>
              <BookOpen size={11} /> {video.basedOn}
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
  // ── Sidebar open state (Aug 2026 mobile-compat fix) ──
  // Two independent booleans instead of one `isMobile`-branching value:
  // `desktopSidebarOpen` is the persistent collapse toggle desktop users
  // get from the hamburger; `mobileDrawerOpen` is the mobile overlay
  // drawer. Both default identically on server and client (no
  // `window.innerWidth` read during render), so there's no hydration
  // mismatch — CSS `@media` rules (see <style> below) decide which one
  // actually controls what's on screen at a given viewport width.
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const toggleSidebar = () => {
    if (typeof window !== 'undefined' && window.innerWidth <= 768) {
      setMobileDrawerOpen(v => !v);
    } else {
      setDesktopSidebarOpen(v => !v);
    }
  };
  const [activeSidebar, setActiveSidebar] = useState<SidebarItem>('home');
  const [showAllFastTap, setShowAllFastTap] = useState(false);
  const [activeFilter, setActiveFilter] = useState(0);
  const [activeGenre, setActiveGenre] = useState('All');
  const [activeTool, setActiveTool] = useState('All');
  const [activeDurationBucket, setActiveDurationBucket] = useState(0);
  const [activeUploadDateBucket, setActiveUploadDateBucket] = useState(0);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  // §27 item 6 — New Voices: ordered list of recently-joined creator user_ids
  const [newVoiceOrder, setNewVoiceOrder] = useState<string[]>([]);
  // §28a — snapshot "now" once per mount rather than calling Date.now()
  // inline in the filter chain below (that trips React's purity rule,
  // since it'd produce a different value on every render). Good enough for
  // a day-granularity upload-date filter; no need to keep it ticking live.
  const [nowMs] = useState(() => Date.now());
  const [isLight, setIsLight] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  // Lightweight display-name lookup for the nav avatar (template shows the
  // name next to the avatar). No redirect/gating like /dashboard does —
  // KaTube is a public discovery page, so a logged-out visitor just sees the
  // avatar with no name, same as before this change.
  const [userName, setUserName] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  // Phase 2 "Unique for Mangal" (CONTEXT.md §0c) — video_id -> rank map
  // for the most recently finalized week's Top 5, so RealVideoCard can
  // show a trophy badge on winning videos wherever they appear in the
  // grid (Home, New Voices row, etc). Same RPC the K Circle voting page
  // and the KaTube home banner both read, so all three stay in sync.
  const [weeklyWinnerRanks, setWeeklyWinnerRanks] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc('get_mangal_of_the_week');
      if (!data) return;
      setWeeklyWinnerRanks(new Map((data as { video_id: string; rank: number }[]).map(w => [w.video_id, w.rank])));
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const name = data.user?.user_metadata?.full_name || data.user?.email?.split('@')[0] || null;
      setUserName(name);
      setUserId(data.user?.id || null);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const [videosRes, shortsRes] = await Promise.all([
        supabase.from('videos').select('id, title, youtube_id, views, likes, created_at, category, ai_tool, creator_id, series_id, duration_seconds')
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
        creatorId: r.creator_id,
        basedOn: r.series_id ? (seriesMap.get(r.series_id) || null) : null,
        durationSeconds: r.duration_seconds ?? null,
      })));
      setLoading(false);
    })();

    // §27 item 6 — New Voices: most recently-joined creators, ordered by
    // creator_profiles.joined_at desc rather than by views/popularity —
    // gives a brand-new creator a guaranteed discovery slot instead of
    // always losing to whoever already has the most views. Same pattern
    // just shipped on WebMangal's home page.
    supabase.from('creator_profiles').select('user_id, joined_at').order('joined_at', { ascending: false }).limit(20)
      .then(({ data }) => { if (data) setNewVoiceOrder(data.map(c => c.user_id)); });
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
    .filter(v => activeTool === 'All' || v.ai_tool === activeTool)
    // §28a — duration filter: a video with no duration on file is excluded
    // from any bucket except "Any length" rather than assumed to match.
    .filter(v => {
      const bucket = DURATION_BUCKETS[activeDurationBucket];
      if (activeDurationBucket === 0) return true;
      return v.durationSeconds != null && bucket.test(v.durationSeconds);
    })
    // §28a — upload date filter. `nowMs` is computed once via useMemo
    // above render (see const nowMs), not Date.now() called inline here —
    // calling Date.now() directly inside the render-time filter chain
    // trips React's purity rule (unstable result across re-renders).
    .filter(v => {
      const bucket = UPLOAD_DATE_BUCKETS[activeUploadDateBucket];
      if (bucket.days == null) return true;
      const ageMs = nowMs - new Date(v.created_at).getTime();
      return ageMs <= bucket.days * 86400000;
    })
    // §28a — search bar, now actually wired to real results: matches
    // title or creator name, case-insensitive substring. Was visual-only
    // before this change (§22 follow-up).
    .filter(v => {
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;
      return v.title.toLowerCase().includes(q) || v.creator.toLowerCase().includes(q);
    });
  const sortedVideos = (() => {
    if (activeFilter === 0) return [...filteredVideos].sort((a, b) => b.views - a.views); // Popular
    if (activeFilter === 1) return [...filteredVideos].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()); // New
    if (activeFilter === 2) return [...filteredVideos].sort((a, b) => b.likes - a.likes); // Rankings
    return filteredVideos; // Categories / Tools
  })();

  // §27 item 6 — New Voices row: one (most recent) video per recently-
  // joined creator, in join-date order — not filtered/sorted by the
  // Popular/New/Rankings chips above, this is its own always-recency-
  // ordered row, same as WebMangal's version of this section.
  const newVoices = (() => {
    if (newVoiceOrder.length === 0) return [];
    const byCreator = new Map<string, RealVideo>();
    for (const v of videos) {
      if (!byCreator.has(v.creatorId)) byCreator.set(v.creatorId, v); // videos is created_at desc, so first = latest
    }
    return newVoiceOrder.map(id => byCreator.get(id)).filter((v): v is RealVideo => !!v).slice(0, 6);
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

      {/* ── Mobile compatibility (Aug 2026 fix) ──
          All of the responsive behavior below (nav padding/gap, hiding the
          search bar and "powered by MANGAL" subtitle, shrinking Create/K
          Circle to icon-only, the sidebar drawer) used to branch on a JS
          `isMobile` boolean seeded from `window.innerWidth`. That value is
          unknown during server rendering, so the server always emitted the
          full desktop markup; a mobile browser painted that (overflowing,
          squeezed) desktop nav first and only switched to the compact
          layout after React hydrated and measured the real viewport —
          a visible flash of a broken layout on every mobile page load,
          and technically a hydration mismatch. Replaced with pure CSS
          `@media (max-width: 768px)` rules below, so the browser paints
          the correct layout immediately with no JS round-trip needed. */}
      <style>{`
        .katube-nav {
          padding: 0 20px;
          gap: 16px;
          justify-content: flex-start;
        }
        .katube-nav-left { gap: 14px; }
        .katube-nav-right { gap: 10px; }
        .katube-subtitle { display: inline-block; }
        .katube-search-wrap { display: flex; }
        .katube-label-full { display: inline; }
        .katube-label-mobile { display: none; }
        .katube-theme-toggle { display: inline-flex; }

        .katube-backdrop { display: none; }

        .katube-sidebar {
          width: 240px;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          position: sticky;
          top: 64px;
          left: 0;
          align-self: flex-start;
          height: calc(100vh - 64px);
          border-right: 1px solid var(--border-color);
          background: transparent;
          transition: width 0.2s ease, border-color 0.2s ease;
        }
        .katube-sidebar.katube-sidebar--desktop-closed {
          width: 0px;
          border-right: none;
        }

        @media (max-width: 768px) {
          .katube-nav {
            padding: 0 12px;
            gap: 8px;
            justify-content: space-between;
          }
          .katube-nav-left { gap: 8px; }
          .katube-nav-right { gap: 6px; }
          .katube-subtitle { display: none; }
          .katube-search-wrap { display: none; }
          .katube-label-full { display: none; }
          .katube-label-mobile { display: inline; }
          .katube-theme-toggle { display: none; }

          .katube-backdrop.katube-backdrop--open {
            display: block;
            position: fixed;
            inset: 64px 0 0 0;
            background: rgba(0,0,0,0.5);
            z-index: 150;
          }

          .katube-sidebar {
            position: fixed;
            top: 64px;
            left: 0;
            height: calc(100vh - 64px);
            z-index: 200;
            background: var(--bg-primary);
            border-right: none;
            width: 240px;
            transform: translateX(-100%);
            transition: transform 0.2s ease;
            box-shadow: none;
          }
          .katube-sidebar.katube-sidebar--mobile-open {
            transform: translateX(0);
            box-shadow: 4px 0 24px rgba(0,0,0,0.35);
          }
        }
      `}</style>

      {/* ── NAV — YouTube layout: hamburger + logo | search | create + avatar ──
          Responsive: below 768px (via CSS, see <style> above) the search bar
          and "powered by MANGAL" subtitle are dropped and K Circle/Create
          collapse to icon-only, so the essential controls (menu, logo,
          Create, theme, profile) always fit without horizontal overflow. */}
      <nav className="katube-nav" style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'var(--nav-bg)', backdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--border-color)',
        height: '64px', display: 'flex', alignItems: 'center',
      }}>
        <div className="katube-nav-left" style={{ display: 'flex', alignItems: 'center', flexShrink: 0, minWidth: 0 }}>
          <button
            onClick={toggleSidebar}
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
          <Link href="/katube" style={{ display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none', flexShrink: 0, minWidth: 0 }}>
            <Image src="/katube-logo.png" alt="KaTube" width={140} height={140} style={{ display: 'block', height: '42px', width: '42px', objectFit: 'contain' }} priority />
            <span style={{ fontWeight: 900, fontSize: '16px', color: '#2563eb', letterSpacing: '-0.02em' }}>Tube</span>
            <span className="katube-subtitle" style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.01em', whiteSpace: 'nowrap', marginLeft: '4px' }}>
              powered by MANGAL
            </span>
          </Link>
        </div>

        {/* Search — wired to real results (§28a): filters the grid below by
            title/creator as you type. No separate results page yet — same
            page, filtered in place, consistent with how genre/tool filters
            already work here.
            Hidden below 768px via CSS: with the nav's other elements
            shrink-0, there's no room for a search bar on a phone-width
            screen. */}
        <form
          className="katube-search-wrap"
          onSubmit={(e) => e.preventDefault()}
          style={{ flex: 1, justifyContent: 'center', maxWidth: '640px', margin: '0 auto', minWidth: 0 }}
        >
          <div style={{ position: 'relative', width: '100%', maxWidth: '560px' }}>
            <span aria-hidden="true" style={{
              position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)',
              display: 'flex', color: 'var(--text-tertiary)', pointerEvents: 'none',
            }}><Search size={15} /></span>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search KaTube"
              style={{
                width: '100%', height: '40px', padding: '0 16px 0 40px', borderRadius: '20px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '13.5px', outline: 'none',
                minWidth: 0,
              }}
            />
          </div>
        </form>

        <div className="katube-nav-right" style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <Link href="/katube/upload" style={{
            padding: '8px 14px', borderRadius: '18px', fontSize: '12.5px', fontWeight: 700,
            color: '#fff', textDecoration: 'none', background: '#f97316',
            whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px',
          }}>
            <span className="katube-label-full">+ Create</span>
            <span className="katube-label-mobile">+</span>
          </Link>
          <Link href="/kalpana-circle" style={{
            padding: '6px 14px', borderRadius: '8px', fontSize: '12.5px', fontWeight: 700,
            color: '#7c3aed', textDecoration: 'none', border: '1px solid rgba(124,58,237,0.35)',
            whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px',
          }}>
            <Image src="/kcircle-logo.png" alt="" width={70} height={70} style={{ height: '22px', width: '22px', objectFit: 'contain' }} />
            <span className="katube-label-full">Circle</span>
          </Link>
          <span className="katube-theme-toggle">
            <ThemeToggle size={30} onChange={setIsLight} defaultLight={false} syncGlobal={false} />
          </span>
          {userId && <NotificationBell userId={userId} />}
          {/* KaTube profile — channel verification + metrics live at
              /katube/dashboard (part of the main MANGAL dashboard, see
              CONTEXT.md §6). Swap for the founder's real logo image whenever
              it's ready; still just a "K" placeholder visually. Name next to
              the avatar (template reference) only renders when a user is
              actually logged in — graceful fallback to avatar-only otherwise. */}
          <Link
            href="/katube/dashboard"
            aria-label="KaTube profile"
            title="KaTube profile"
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none',
              flexShrink: 0,
            }}
          >
            {userName && (
              <span className="katube-label-full" style={{
                fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap',
              }}>{userName}</span>
            )}
            <span style={{
              width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
              background: 'var(--bg-card)', border: '1px solid var(--border-color)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '13px', color: 'var(--text-tertiary)', fontWeight: 700,
            }}>K</span>
          </Link>
        </div>
      </nav>

      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        <SidebarNav
          desktopOpen={desktopSidebarOpen}
          mobileOpen={mobileDrawerOpen}
          active={activeSidebar}
          onSelect={setActiveSidebar}
          onClose={() => setMobileDrawerOpen(false)}
        />

        <div style={{ flex: 1, minWidth: 0 }}>

      {/* ── HERO STRIP ── */}
      <div style={{
        padding: '36px 20px 24px', textAlign: 'center',
        background: 'radial-gradient(ellipse 70% 60% at 50% 0%, rgba(249,115,22,0.10) 0%, transparent 70%)',
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
              background: i === activeFilter ? 'linear-gradient(135deg, #f97316, #fb923c)' : 'var(--bg-card)',
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

      {/* §28a — duration + upload date filters, "Better search + filters".
          Kept as a collapsible panel behind a toggle chip rather than
          always-visible pill rows (like Categories/Tools get), since these
          two axes apply on top of whichever tab is active and would
          otherwise add a permanent 2 extra rows to every view. */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 20px 8px' }}>
        <span
          onClick={() => setShowMoreFilters(v => !v)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', fontWeight: 700,
            padding: '6px 14px', borderRadius: '20px', cursor: 'pointer',
            background: showMoreFilters || activeDurationBucket > 0 || activeUploadDateBucket > 0 ? 'rgba(249,115,22,0.12)' : 'transparent',
            color: showMoreFilters || activeDurationBucket > 0 || activeUploadDateBucket > 0 ? '#f97316' : 'var(--text-tertiary)',
            border: '1px solid var(--border-color)',
          }}
        >
          Filters {(activeDurationBucket > 0 || activeUploadDateBucket > 0) && `(${[activeDurationBucket > 0, activeUploadDateBucket > 0].filter(Boolean).length})`}
        </span>
      </div>
      {showMoreFilters && (
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto' }}>
            {DURATION_BUCKETS.map((b, i) => (
              <span
                key={b.label}
                onClick={() => setActiveDurationBucket(i)}
                style={{
                  flexShrink: 0, fontSize: '11.5px', fontWeight: 600, padding: '6px 14px', borderRadius: '20px',
                  background: i === activeDurationBucket ? 'var(--text-primary)' : 'transparent',
                  color: i === activeDurationBucket ? 'var(--bg-primary)' : 'var(--text-tertiary)',
                  border: '1px solid var(--border-color)', cursor: 'pointer', whiteSpace: 'nowrap',
                }}>{b.label}</span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto' }}>
            {UPLOAD_DATE_BUCKETS.map((b, i) => (
              <span
                key={b.label}
                onClick={() => setActiveUploadDateBucket(i)}
                style={{
                  flexShrink: 0, fontSize: '11.5px', fontWeight: 600, padding: '6px 14px', borderRadius: '20px',
                  background: i === activeUploadDateBucket ? 'var(--text-primary)' : 'transparent',
                  color: i === activeUploadDateBucket ? 'var(--bg-primary)' : 'var(--text-tertiary)',
                  border: '1px solid var(--border-color)', cursor: 'pointer', whiteSpace: 'nowrap',
                }}>{b.label}</span>
            ))}
          </div>
        </div>
      )}

      {/* Mangal Ideas — §0/Phase 1 "Unique for Mangal" (CONTEXT.md §0c).
          Top section per the spec, public (no userId gate) since company/
          story-demand/audience cards are all public-read; the component
          itself returns null when the feed is empty. */}
      {/* Mangal of the Week — §0/Phase 2 "Unique for Mangal" (CONTEXT.md
          §0c). Spotlight banner for the most recently finalized week's #1
          video. Home-only, public (no userId gate), self-contained
          "returns null when empty" component like MangalIdeasRow. */}
      {activeSidebar === 'home' && <MangalOfTheWeekBanner />}

      {/* Writer of the Month — §0/Phase 3 "Unique for Mangal" (CONTEXT.md
          §0c). Same spotlight-banner pattern, one level down, for the most
          recently finalized month's top writer. */}
      {activeSidebar === 'home' && <WriterOfTheMonthBanner />}

      {activeSidebar === 'home' && <MangalIdeasRow userId={userId} />}

      {/* Continue Watching — §28a, only rendered on Home for a signed-in
          viewer with in-progress videos (component itself returns null
          otherwise, so no empty-state flash). */}
      {activeSidebar === 'home' && userId && <ContinueWatchingRow userId={userId} />}

      {/* §27 item 6 — New Voices: recently-joined creators, ordered by
          join date not popularity/views, so a brand-new KaTube creator
          gets a guaranteed discovery slot instead of always losing to
          whoever already has the most views. One (their latest) video
          per creator. Home-only, same as Continue Watching above — this
          is a discovery row, not something that belongs inside the
          Fast/Slow tap tab filters. Reuses RealVideoCard (same file,
          below) rather than the separate VideoGridCard used by the
          standalone Subscriptions/Trending pages, since this row lives
          inside this page's own grid styling. */}
      {activeSidebar === 'home' && newVoices.length > 0 && (
        <div style={{ maxWidth: '1200px', margin: '0 auto 28px', padding: '0 20px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 900, margin: '0 0 14px', letterSpacing: '-0.02em' }}>New Voices</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
            {newVoices.map(v => <RealVideoCard key={v.id} video={v} winnerRank={weeklyWinnerRanks.get(v.id)} />)}
          </div>
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
                fontSize: '12px', fontWeight: 700, color: '#f97316', background: 'rgba(249,115,22,0.10)',
                border: '1px solid rgba(249,115,22,0.28)', cursor: 'pointer',
              }}
            >
              {showAllFastTap ? '▲ Show less' : '▼ Show more'}
            </button>
          )}
          {shorts.length === 0 && (
            <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', margin: '10px 0 0' }}>
              Demo placeholders — <Link href="/katube/upload" style={{ color: '#f97316', fontWeight: 700 }}>upload a Short</Link> to replace these.
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
                No videos yet — be the first! <Link href="/katube/upload" style={{ color: '#f97316', fontWeight: 700 }}>Upload a video</Link> and
                it&apos;ll show up here automatically.
              </p>
            </div>
          ) : (
            <div style={{
              padding: '0 20px 60px', maxWidth: '1200px', margin: '0 auto',
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px',
            }}>
              {sortedVideos.map(v => <RealVideoCard key={v.id} video={v} winnerRank={weeklyWinnerRanks.get(v.id)} />)}
            </div>
          )}
        </>
      )}

      {/* Saved — no backing data yet */}
      {activeSidebar === 'saved' && (
        <div style={{ maxWidth: '600px', margin: '40px auto 60px', padding: '18px 22px', borderRadius: '12px', background: 'var(--bg-card)', border: '1px dashed var(--border-color)', textAlign: 'center' }}>
          <p style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', margin: 0, lineHeight: 1.6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <Bookmark size={13} /> Saved videos aren&apos;t wired up yet — this is a placeholder for the sidebar item. Coming in a later step.
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
