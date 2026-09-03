'use client';

// ── /about features section (§145, extended §147) ───────────────────────────
// Per-platform capability grid for the company page. Copy is grounded in the
// §145 Phase 0 audit of what is actually shipped (CONTEXT.md) — nothing here
// describes an unbuilt feature (no Nova, no K Circle servers/roles, no Live,
// no chapter-synced audio — §147). §147 extension: added the recommendations
// card (verified against /api/recommendations + RecommendedForYou.tsx) and
// split the single AI Writer card into assistant + translation cards so the
// two §144 AI actions read separately; §145 copy otherwise untouched.
//
// Pattern (§145 Phase 1): 2-5 word title + one sentence per feature, grouped
// by user segment (WebMangal reader/writer, KaTube viewer/creator) or by
// capability (K Circle — peer-to-peer, no reader/writer split). One-time
// scroll-triggered fade + rise per card via IntersectionObserver — no
// animation library added (see gate 4 rationale in CONTEXT.md §145).
// prefers-reduced-motion: cards render visible, no animation.

import { useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react';
import {
  BarChart3,
  Bookmark,
  BookMarked,
  BookOpen,
  Camera,
  Clapperboard,
  Compass,
  FileText,
  Flame,
  Languages,
  ListVideo,
  Megaphone,
  MessageCircle,
  MessagesSquare,
  Music,
  PlaySquare,
  Sparkles,
  Tag,
  TrendingUp,
  Trophy,
  Upload,
  Users,
  Zap,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react';

interface FeatureItem {
  icon: LucideIcon;
  title: string;
  desc: string;
}

interface FeatureGroup {
  label: string;
  /** Optional one-line rationale shown next to the group label. */
  note?: string;
  items: FeatureItem[];
}

interface PlatformBlock {
  name: string;
  tagline: string;
  icon: LucideIcon;
  href: string;
  groups: FeatureGroup[];
}

const PLATFORMS: PlatformBlock[] = [
  {
    name: 'WebMangal',
    tagline: 'Comics, web novels, books and songs — free to read, free to publish.',
    icon: BookOpen,
    href: '/WebMangal/home',
    groups: [
      {
        label: 'For readers',
        items: [
          {
            icon: BookOpen,
            title: 'Manga & novel reader',
            desc: 'Vertical-strip comics and paged novels share one reader — right-to-left support, fullscreen mode, adjustable background, and emoji reactions on every chapter.',
          },
          {
            icon: FileText,
            title: 'Books, PDF & EPUB',
            desc: 'A dedicated Books section with its own PDF and EPUB reader, theme and typography controls, and progress that picks up where you left off.',
          },
          {
            icon: Music,
            title: 'Songs',
            desc: 'Original songs published as block-by-block lyric sheets — verse, chorus, hook — tagged by genre and linked to the series they\u2019re based on.',
          },
          {
            icon: Compass,
            title: 'Recommended for you',
            desc: 'Rails on the WebMangal home built from what you read and follow — “For You”, “Because you read…” and “Trending in your top genre.” New readers get trending picks instead.',
          },
          {
            icon: Bookmark,
            title: 'Your reading, tracked',
            desc: 'Bookmarks, reading history and a personal library, plus rankings and tags for finding the next series.',
          },
        ],
      },
      {
        label: 'For writers',
        note: 'in Mangal Studio',
        items: [
          {
            icon: Sparkles,
            title: 'AI writing assistant',
            desc: 'Polish drafts in batched passes with autosave and word-count goals — runs on-device by default, or with your own API key, kept encrypted in your browser and never on our servers.',
          },
          {
            icon: Languages,
            title: 'Hinglish & Hindi translation',
            desc: 'One click converts Hinglish to clean English, or translates English ↔ Hindi with the direction detected automatically.',
          },
          {
            icon: Tag,
            title: 'Metadata manager',
            desc: 'Cover, synopsis, genre tags, mature-content flag and scheduled publishing — managed from one dashboard form.',
          },
          {
            icon: BookMarked,
            title: 'Codex',
            desc: 'Character profiles and lore entries that open as a read-only sidebar while you write, so names and world facts stay consistent.',
          },
          {
            icon: Clapperboard,
            title: 'Storyboard converter',
            desc: 'Paste a chapter\u2019s text and get a webtoon panel board — rearrange the panels, then export as JSON or a scene script.',
          },
          {
            icon: BarChart3,
            title: 'Analytics',
            desc: 'Reading-time distribution, views by country and reader demographics for every series you publish.',
          },
        ],
      },
    ],
  },
  {
    name: 'KaTube',
    tagline: 'Short and long-form video — same account, same zero-fee creator economics.',
    icon: PlaySquare,
    href: '/katube',
    groups: [
      {
        label: 'For viewers',
        items: [
          {
            icon: Zap,
            title: 'Shorts',
            desc: 'A vertical fast-swipe feed — Fast Tap — alongside full-length playback through the real YouTube player.',
          },
          {
            icon: ListVideo,
            title: 'Playlists',
            desc: 'Save any video to your own playlists while you watch, and browse the collection back any time.',
          },
          {
            icon: Flame,
            title: 'Trending & Following',
            desc: 'A trending chart plus a Following feed for the channels you keep up with.',
          },
        ],
      },
      {
        label: 'For creators',
        items: [
          {
            icon: Upload,
            title: 'Upload flow',
            desc: 'Publish by pasting a YouTube link — mark it a Short or a full video and link the WebMangal series it adapts.',
          },
          {
            icon: PlaySquare,
            title: 'Channel pages',
            desc: 'A channel page of your videos, Shorts and playlists for followers to browse.',
          },
          {
            icon: TrendingUp,
            title: 'Creator analytics',
            desc: 'Views and likes per video, rolled up in Mangal Studio.',
          },
          {
            icon: Users,
            title: 'Mangal Ideas',
            desc: 'The KaTube homepage surfaces WebMangal stories that have no adaptation yet, inviting you to team up with the writer.',
          },
        ],
      },
    ],
  },
  {
    name: 'K Circle',
    tagline: 'The community layer — where the people behind the stories and the people reading them meet.',
    icon: MessagesSquare,
    href: '/kalpana-circle',
    groups: [
      {
        label: 'What you can do',
        note: 'grouped by capability, not reader/writer — K Circle is peer-to-peer: the same person posts, chats and watches',
        items: [
          {
            icon: Camera,
            title: 'Feed, stories & polls',
            desc: 'Post updates, run polls and share photo stories — with a close-friends audience for the ones that aren\u2019t for everyone.',
          },
          {
            icon: Megaphone,
            title: 'Broadcast channels',
            desc: 'One announcement channel per creator: the creator posts, fans react and reply — none of the group-chat noise.',
          },
          {
            icon: MessageCircle,
            title: 'Realtime chat',
            desc: 'Direct messages and group chats that update live as the messages land.',
          },
          {
            icon: Clapperboard,
            title: 'Watch together',
            desc: 'Host a room, sync playback of any KaTube video or run a Fast Tap shorts session, and chat side-by-side while you watch.',
          },
          {
            icon: Trophy,
            title: 'Mangal of the Week',
            desc: 'A weekly, audience-voted leaderboard that ranks the best videos across the ecosystem.',
          },
        ],
      },
    ],
  },
];

// ── one-time scroll reveal (fade + slight rise) ──────────────────────────────
// Cards are server-rendered visible (no-JS safe); on hydration the effect arms
// them hidden and IntersectionObserver reveals each card once. Running the arm
// inside an isomorphic useLayoutEffect means the hide happens before the first
// client paint — no visible flash. Reduced-motion users skip arming entirely.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

const REVEAL_CSS = `
  .feat-card { opacity: 1; }
  @media (prefers-reduced-motion: no-preference) {
    .feat-card.feat-armed { opacity: 0; transform: translateY(14px); }
    .feat-card.feat-armed.feat-in {
      opacity: 1; transform: translateY(0);
      transition: opacity 0.5s ease, transform 0.5s ease;
    }
  }
`;

const cardStyle: CSSProperties = {
  padding: '14px 16px',
  borderRadius: '12px',
  background: 'var(--bg-card)',
  border: '1px solid var(--border-color)',
  minWidth: 0,
};

// Interactive element in this section — the per-platform "Open" link — keeps a
// 48px minimum tap height for the mobile touch-target rule (§145 Phase 3).
const openLinkStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  minHeight: '48px',
  padding: '0 10px',
  borderRadius: '10px',
  fontSize: '12.5px',
  fontWeight: 800,
  color: 'var(--accent)',
  textDecoration: 'none',
  whiteSpace: 'nowrap',
};

// minmax(min(100%, 300px), 1fr): 2 columns on desktop (~772px content width),
// single column below ~612px — at a 320px viewport the track resolves to
// min(100%, 300px) = the full content width, so nothing overflows.
const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))',
  gap: '12px',
};

export default function FeaturesSection() {
  const rootRef = useRef<HTMLDivElement>(null);

  useIsoLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    // Browsers without IntersectionObserver: leave the cards permanently visible.
    if (typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const cards = Array.from(root.querySelectorAll<HTMLElement>('.feat-card'));
    cards.forEach((c) => c.classList.add('feat-armed'));

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('feat-in');
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -32px 0px' },
    );
    cards.forEach((c) => io.observe(c));
    return () => io.disconnect();
  }, []);

  return (
    <div ref={rootRef}>
      <style>{REVEAL_CSS}</style>
      {PLATFORMS.map((platform) => (
        <div key={platform.name} style={{ marginBottom: '36px' }}>
          <div style={{
            display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px',
            padding: '14px 20px', borderRadius: '12px',
            background: 'var(--bg-card)', border: '1px solid var(--border-color)',
            borderTop: '2px solid var(--accent)', marginBottom: '16px',
          }}>
            <span style={{ flexShrink: 0, color: 'var(--accent)', display: 'inline-flex' }}>
              <platform.icon size={24} strokeWidth={1.75} />
            </span>
            <div style={{ flex: '1 1 220px', minWidth: 0 }}>
              <div style={{ fontSize: '16px', fontWeight: 800, letterSpacing: '-0.01em' }}>
                {platform.name}
              </div>
              <div style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
                {platform.tagline}
              </div>
            </div>
            <a href={platform.href} style={openLinkStyle}>
              Open {platform.name} <ArrowRight size={14} />
            </a>
          </div>

          {platform.groups.map((group) => (
            <div key={group.label} style={{ marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap', margin: '0 0 10px' }}>
                <span style={{
                  fontSize: '11px', fontWeight: 800, color: 'var(--accent)',
                  textTransform: 'uppercase', letterSpacing: '0.08em',
                }}>
                  {group.label}
                </span>
                {group.note && (
                  <span style={{ fontSize: '11.5px', color: 'var(--text-tertiary)' }}>{group.note}</span>
                )}
              </div>
              <div style={gridStyle}>
                {group.items.map((item, i) => (
                  <div
                    key={item.title}
                    className="feat-card"
                    style={{ ...cardStyle, transitionDelay: `${Math.min(i, 5) * 60}ms` }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <span style={{ color: 'var(--accent)', display: 'inline-flex', flexShrink: 0 }}>
                        <item.icon size={17} strokeWidth={1.9} />
                      </span>
                      <span style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--text-primary)' }}>
                        {item.title}
                      </span>
                    </div>
                    <div style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
                      {item.desc}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}