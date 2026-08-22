'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import ThemeToggle from '../../components/shared/ThemeToggle';
import MangalLogo from '../../components/shared/MangalLogo';
import NotificationBell from '../../components/shared/NotificationBell';
import CrossProductLinks from '../../components/shared/CrossProductLinks';
import { Search, MessageCircle, Clapperboard, Megaphone, Bookmark, Trophy, User, MoreHorizontal } from 'lucide-react';

// ── K Circle desktop shell — shared across every K Circle page ──
// Extracted from the home feed page (app/kalpana-circle/page.tsx, §55 in
// CONTEXT.md) so the Discord-style icon rail + grid shell is defined once
// instead of copy-pasted into chat/watch-together/broadcasts/saved/etc.
// KaTube and every other MANGAL surface are untouched — this file is
// K Circle-only, imported only from inside app/kalpana-circle/.

export const KC_SHELL_CSS = `
  .kc-shell { display: block; }
  .kc-rail { display: none; }
  .kc-right-panel { display: none; }
  .kc-channel-header { display: none; }
  @media (min-width: 768px) {
    /* Instagram Web-style collapsed rail: a strict 72px icon column pinned to the
       left edge of the viewport. Previously the rail used position:sticky, but
       the page root (.kc-page) carries overflow-x:hidden — which makes that
       ancestor a scroll container, so position:sticky resolved against ITS
       scrollport (which never scrolls) instead of the viewport, and the rail
       just scrolled away with the feed / appeared clipped. position:fixed +
       z-index pins it for real; the shell reserves its 72px column via
       padding-left so the center feed and right panel never slide under it. */
    .kc-shell {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      padding-left: 72px;
      align-items: start;
    }
    .kc-rail {
      /* Fixed 72px icon column. Layout = fixed top block (brand) + a
         flex-1 nav column that scrolls internally + a fixed bottom block
         (create/bell/avatar/More). Previously the RAIL itself had
         overflow-y:auto, which computed overflow-x:auto and CLIPPED the
         absolutely-positioned popovers (NotificationBell's 320px panel,
         MoreMenu) into a ~72px sliver inside the rail — overlapping,
         unreadable, unclickable. Popovers now escape freely (rail
         overflow is visible); only the middle nav scrolls. */
      display: flex; flex-direction: column; align-items: center; justify-content: flex-start;
      position: fixed; left: 0; top: 0;
      width: 72px; height: 100vh; min-height: 100vh;
      z-index: 50;
      padding: 12px 0 12px;
      background: var(--bg-card); border-right: 1px solid var(--border-color);
      overflow: visible;
    }
    .kc-rail-nav { scrollbar-width: none; }
    .kc-rail-nav::-webkit-scrollbar { display: none; }
    .kc-channel-header { display: flex; }
  }
  @media (min-width: 1180px) {
    .kc-shell { grid-template-columns: minmax(0, 1fr) 300px; }
    .kc-right-panel {
      display: block; position: sticky; top: 0; height: 100vh;
      overflow-y: auto; padding: 22px 20px 40px; border-left: 1px solid var(--border-color);
    }
  }
  .kc-rail-btn { transition: border-radius 0.15s ease, background-color 0.15s ease, color 0.15s ease; }
  .kc-rail-btn:hover { border-radius: 16px !important; background: rgba(124,58,237,0.14) !important; color: #a78bfa !important; }

  @keyframes kc-drawer-in { from { transform: translateX(-100%); } to { transform: translateX(0); } }
  /* Search drawer sits flush left on mobile (no rail to sit next to);
     desktop offsets it past the 70px fixed rail so it opens "adjacent to
     the rail" rather than on top of it, per the reference layout. */
  @media (min-width: 768px) {
    .kc-search-drawer { left: 70px !important; }
  }
`;

/** Renders the shared shell CSS as a <style> tag. Drop this once per page, anywhere in the tree. */
export function KCircleShellStyle() {
  return <style>{KC_SHELL_CSS}</style>;
}

export type KCircleRailActive = 'home' | 'chat' | 'clips' | 'watch-together' | 'mangal-of-the-week' | 'broadcasts' | 'notifications' | 'saved';

const RADIANT = 'linear-gradient(135deg, #71717a 0%, #d4d4d8 45%, #f4f4f5 60%, #a1a1aa 100%)';

function railInitials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

/** Small self-contained avatar renderer — mirrors the Avatar() pattern every
 * K Circle page already defines locally (see chat/saved/settings/etc.), kept
 * local here too rather than importing across pages. */
function RailAvatar({ name, avatarUrl, size }: { name: string; avatarUrl?: string | null; size: number }) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- avatar_url is a user-uploaded Supabase Storage public URL
      <img src={avatarUrl} alt={name} width={size} height={size} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', display: 'block' }} />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: RADIANT, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.36, fontWeight: 800, color: '#27272a',
    }}>{railInitials(name)}</div>
  );
}

/** Bottom-left "More" popup — houses everything that isn't core K Circle
 * navigation or the user's own account: theme toggle, the other two MANGAL
 * products' logos, and the company mark. Previously these three sat
 * directly in the rail's footer cluster, which read as visual overcrowding
 * next to the account avatar — same click-outside-to-close pattern as
 * NotificationBell (mousedown listener + a ref on the whole popover root). */
function MoreMenu({ setIsLight }: { setIsLight: (light: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        title="More"
        aria-label="More"
        className="kc-rail-btn"
        style={{ ...RAIL_ICON_BASE, background: open ? 'rgba(124,58,237,0.14)' : 'transparent', border: 'none', cursor: 'pointer', color: open ? '#a78bfa' : 'var(--text-tertiary)' }}
      ><MoreHorizontal size={20} /></button>

      {open && (
        <div style={{
          position: 'absolute', bottom: 0, left: 'calc(100% + 10px)',
          width: '186px', padding: '12px', borderRadius: '14px',
          background: 'var(--bg-card)', border: '1px solid var(--border-color)',
          boxShadow: '0 12px 32px rgba(0,0,0,0.22)', zIndex: 300,
        }}>
          <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase', margin: '0 0 10px' }}>
            More
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>Theme</span>
            <ThemeToggle size={24} onChange={setIsLight} defaultLight={false} syncGlobal={false} />
          </div>
          <div style={{ borderTop: '1px solid var(--border-color)', margin: '0 0 12px' }} />
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-tertiary)', marginBottom: '9px' }}>Other MANGAL apps</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <CrossProductLinks current="kcircle" size={20} gap={10} direction="row" />
            <Link href="/home" title="Back to MANGAL" aria-label="Back to MANGAL" style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '32px', height: '32px', borderRadius: '50%',
            }}><MangalLogo size={20} /></Link>
          </div>
        </div>
      )}
    </div>
  );
}

interface KCircleRailProps {
  /** Omit when the current page isn't one of the five rail destinations
   * (e.g. close-friends, settings, a profile page) — nothing highlights. */
  active?: KCircleRailActive;
  userId: string | null;
  myUsername?: string | null;
  myAvatarUrl?: string | null;
  profileHref: string;
  navHref: (path: string) => string;
  setIsLight: (light: boolean) => void;
  /** Where the "+" create button goes. Only the home feed has an inline
   * composer, so every other page just links back there. */
  createHref?: string;
  /** Home feed passes this to scroll to its inline composer instead of
   * navigating away. Other pages omit it and get the createHref link. */
  onCreatePost?: () => void;
  /** Optional: open an in-page search overlay instead of navigating. */
  onSearch?: () => void;
}

const RAIL_ICON_BASE: CSSProperties = {
  width: '46px', height: '46px', borderRadius: '50%', display: 'flex',
  alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', flexShrink: 0,
};
const RAIL_ICON_ACTIVE: CSSProperties = {
  ...RAIL_ICON_BASE, borderRadius: '16px', color: '#71717a',
  background: 'rgba(124,58,237,0.16)', border: '1px solid rgba(124,58,237,0.4)',
};

/** Discord-style left icon rail — desktop only (hidden below 768px via .kc-rail). */
export function KCircleRail({
  active, userId, myUsername, myAvatarUrl, profileHref, navHref, setIsLight,
  createHref = '/kalpana-circle', onCreatePost, onSearch,
}: KCircleRailProps) {
  const items: { key: KCircleRailActive; title: string; href: string; icon: ReactNode }[] = [
    { key: 'chat', title: 'Chat', href: navHref('/kalpana-circle/chat'), icon: <MessageCircle size={20} /> },
    { key: 'watch-together', title: 'Watch Together', href: navHref('/kalpana-circle/watch-together'), icon: <Clapperboard size={20} /> },
    { key: 'mangal-of-the-week', title: 'Mangal of the Week', href: navHref('/kalpana-circle/mangal-of-the-week'), icon: <Trophy size={20} /> },
    { key: 'broadcasts', title: 'Broadcasts', href: navHref('/kalpana-circle/broadcasts'), icon: <Megaphone size={20} /> },
    { key: 'saved', title: 'Saved', href: navHref('/kalpana-circle/saved'), icon: <Bookmark size={20} /> },
  ];

  return (
    <aside className="kc-rail">
      {/* Product's own brand mark leads the rail and doubles as the ONLY
          home-feed link. Previously there were TWO identical kcircle-logo
          buttons stacked here (brand link + a second "Home feed" icon below
          the divider) — visual duplicate clutter; now just one. */}
      {/* Fixed top block: brand mark (also the single home-feed link) +
          hairline divider. Never participates in the scrollable nav. */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
      <Link href="/kalpana-circle" title="K Circle Home" aria-label="K Circle Home" className="kc-rail-btn" style={{
        width: '46px', height: '46px', borderRadius: '14px', display: 'flex',
        alignItems: 'center', justifyContent: 'center', marginBottom: '10px', flexShrink: 0,
      }}>
        <Image src="/kcircle-logo.png" alt="K Circle" width={100} height={100} style={{ width: '28px', height: '28px', objectFit: 'contain' }} />
      </Link>
        <div style={{ width: '30px', height: '2px', background: 'var(--border-color)', borderRadius: '2px', marginTop: '2px', flexShrink: 0 }} />
      </div>

      {/* ── CORE NAVIGATION — product sections (chat, clips/watch, trophies,
          broadcasts, saved) + search. This middle column is the ONLY
          scroller (flex:1 + min-height:0 + overflow-y:auto), so on short
          viewports it scrolls instead of the 46px icons squashing into the
          footer cluster — the logged-in "overlapping, can't-click icons"
          bug. (The + create button makes the footer taller when signed in,
          which used to tip the whole rail over on shorter screens.) ── */}
      <div className="kc-rail-nav" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 0 6px', scrollbarWidth: 'none' }}>
        {items.map(item => (
          <Link key={item.key} href={item.href} title={item.title} aria-label={item.title} className="kc-rail-btn" style={active === item.key ? RAIL_ICON_ACTIVE : RAIL_ICON_BASE}>
            {item.icon}
          </Link>
        ))}
        <button
          onClick={onSearch ?? (() => { window.location.href = '/kalpana-circle'; })}
          title="Search"
          aria-label="Search"
          className="kc-rail-btn"
          style={{ ...RAIL_ICON_BASE, background: 'transparent', border: 'none', cursor: 'pointer' }}
        ><Search size={19} /></button>
      </div>

      {/* ── UTILITY / FOOTER CLUSTER — fixed bottom block: create, bell,
          profile (exactly ONE avatar), and the MoreMenu popup. Lives
          OUTSIDE the scrollable nav and the rail's overflow is visible,
          so the bell/More popovers can render freely to the right. ── */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', flexShrink: 0, paddingTop: '10px' }}>
        <div style={{ width: '30px', height: '2px', background: 'var(--border-color)', borderRadius: '2px', marginBottom: '2px', flexShrink: 0 }} />
        {userId && (
          onCreatePost ? (
            <button onClick={onCreatePost} title="Create post" aria-label="Create post" style={{
              width: '44px', height: '44px', borderRadius: '14px', background: RADIANT, border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#27272a',
              fontSize: '20px', fontWeight: 900, cursor: 'pointer', flexShrink: 0,
            }}>+</button>
          ) : (
            <Link href={createHref} title="Create post" aria-label="Create post" style={{
              width: '44px', height: '44px', borderRadius: '14px', background: RADIANT,
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#27272a',
              fontSize: '20px', fontWeight: 900, textDecoration: 'none', flexShrink: 0,
            }}>+</Link>
          )
        )}
        {/* flipPanel: the 320px dropdown would otherwise anchor its right
            edge inside this ~70px rail and render mostly off-screen to the
            left; flipped, it opens rightward into the viewport. */}
        <NotificationBell userId={userId} iconSize={20} flipPanel />
        {/* Exactly ONE profile avatar in the rail. When logged out this is
            a neutral sign-in button — NOT the old phantom initials avatar,
            which rendered "YO" (initials of the fallback string 'you') for
            every guest and read as a broken/duplicate account chip. */}
        {userId ? (
          <Link href={profileHref} title="Your profile" aria-label="Your profile"><RailAvatar name={myUsername ?? 'you'} avatarUrl={myAvatarUrl} size={34} /></Link>
        ) : (
          <Link href={profileHref} title="Sign in" aria-label="Sign in" style={{
            width: '34px', height: '34px', borderRadius: '50%', display: 'flex',
            alignItems: 'center', justifyContent: 'center', border: '1px dashed var(--border-color)',
            color: 'var(--text-tertiary)', flexShrink: 0,
          }}><User size={17} /></Link>
        )}
        {/* Theme toggle + other-product logos + company mark all moved into
            this single "More" popup — see MoreMenu above — instead of
            sitting inline as three more icons after the avatar. */}
        <MoreMenu setIsLight={setIsLight} />
      </div>
    </aside>
  );
}
