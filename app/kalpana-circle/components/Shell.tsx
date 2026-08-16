'use client';

import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import ThemeToggle from '../../components/ThemeToggle';
import NotificationBell from '../../components/NotificationBell';
import { Search, MessageCircle, Clapperboard, Megaphone, Bookmark } from 'lucide-react';

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
    .kc-shell { display: grid; grid-template-columns: 78px 1fr; align-items: start; }
    .kc-rail {
      display: flex; flex-direction: column; align-items: center;
      position: sticky; top: 0; height: 100vh; padding: 16px 0 20px;
      background: var(--bg-card); border-right: 1px solid var(--border-color);
      overflow-y: auto; scrollbar-width: none;
    }
    .kc-rail::-webkit-scrollbar { display: none; }
    .kc-channel-header { display: flex; }
  }
  @media (min-width: 1180px) {
    .kc-shell { grid-template-columns: 78px 1fr 300px; }
    .kc-right-panel {
      display: block; position: sticky; top: 0; height: 100vh;
      overflow-y: auto; padding: 22px 20px 40px; border-left: 1px solid var(--border-color);
    }
  }
  .kc-rail-btn { transition: border-radius 0.15s ease, background-color 0.15s ease, color 0.15s ease; }
  .kc-rail-btn:hover { border-radius: 16px !important; background: rgba(124,58,237,0.14) !important; color: #a78bfa !important; }
`;

/** Renders the shared shell CSS as a <style> tag. Drop this once per page, anywhere in the tree. */
export function KCircleShellStyle() {
  return <style>{KC_SHELL_CSS}</style>;
}

export type KCircleRailActive = 'home' | 'chat' | 'watch-together' | 'broadcasts' | 'saved';

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

interface KCircleRailProps {
  active: KCircleRailActive;
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
    { key: 'broadcasts', title: 'Broadcasts', href: navHref('/kalpana-circle/broadcasts'), icon: <Megaphone size={20} /> },
    { key: 'saved', title: 'Saved', href: navHref('/kalpana-circle/saved'), icon: <Bookmark size={20} /> },
  ];

  return (
    <aside className="kc-rail">
      <Link href="/home" title="Back to MANGAL" className="kc-rail-btn" style={{
        width: '46px', height: '46px', borderRadius: '14px', display: 'flex',
        alignItems: 'center', justifyContent: 'center', marginBottom: '10px', flexShrink: 0,
      }}>
        <Image src="/icon.png" alt="MANGAL" width={30} height={30} style={{ borderRadius: '9px', display: 'block' }} />
      </Link>
      <div style={{ width: '30px', height: '2px', background: 'var(--border-color)', borderRadius: '2px', marginBottom: '10px', flexShrink: 0 }} />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '9px', flex: 1, minHeight: 0 }}>
        <Link href="/kalpana-circle" title="Home feed" className="kc-rail-btn" style={active === 'home' ? RAIL_ICON_ACTIVE : RAIL_ICON_BASE}>
          <Image src="/kcircle-logo.png" alt="" width={100} height={100} style={{ width: '25px', height: '25px', objectFit: 'contain' }} />
        </Link>
        {items.map(item => (
          <Link key={item.key} href={item.href} title={item.title} className="kc-rail-btn" style={active === item.key ? RAIL_ICON_ACTIVE : RAIL_ICON_BASE}>
            {item.icon}
          </Link>
        ))}
        <button
          onClick={onSearch ?? (() => { window.location.href = '/kalpana-circle'; })}
          title="Search"
          className="kc-rail-btn"
          style={{ ...RAIL_ICON_BASE, background: 'transparent', border: 'none', cursor: 'pointer' }}
        ><Search size={19} /></button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', flexShrink: 0, paddingTop: '10px' }}>
        {onCreatePost ? (
          <button onClick={onCreatePost} title="Create post" style={{
            width: '44px', height: '44px', borderRadius: '14px', background: RADIANT, border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#27272a',
            fontSize: '20px', fontWeight: 900, cursor: 'pointer', flexShrink: 0,
          }}>+</button>
        ) : (
          <Link href={createHref} title="Create post" style={{
            width: '44px', height: '44px', borderRadius: '14px', background: RADIANT,
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#27272a',
            fontSize: '20px', fontWeight: 900, textDecoration: 'none', flexShrink: 0,
          }}>+</Link>
        )}
        <NotificationBell userId={userId} iconSize={20} />
        <Link href={profileHref} title="Profile"><RailAvatar name={myUsername ?? 'you'} avatarUrl={myAvatarUrl} size={34} /></Link>
        <ThemeToggle size={26} onChange={setIsLight} defaultLight={false} syncGlobal={false} />
        <Link href="/katube" title="KaTube" style={{
          width: '38px', height: '38px', borderRadius: '11px', border: '1px solid rgba(37,99,235,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}><Image src="/katube-logo.png" alt="" width={70} height={70} style={{ height: '19px', width: '19px', objectFit: 'contain' }} /></Link>
      </div>
    </aside>
  );
}
