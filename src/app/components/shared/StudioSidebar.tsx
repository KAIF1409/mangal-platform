'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FolderKanban,
  Wallet,
  Rocket,
  Gift,
  GraduationCap,
  Clapperboard,
  Sparkles,
  Wrench,
  Inbox,
  MessageCircle,
  ShoppingBag,
  Bot,
  Menu,
  X,
  type LucideIcon,
} from 'lucide-react';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  hasArrow?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/workspace', label: 'Workspace', icon: FolderKanban, hasArrow: true },
  { href: '/dashboard/earnings', label: 'Earnings', icon: Wallet },
  { href: '/dashboard/boost', label: 'Boost', icon: Rocket },
  { href: '/dashboard/perks', label: 'Perks', icon: Gift },
  { href: '/dashboard/academy', label: 'Academy', icon: GraduationCap },
  { href: '/katube/dashboard', label: 'KaTube', icon: Clapperboard },
];

const BOTTOM_ITEMS: NavItem[] = [
  { href: '/dashboard/nova', label: 'Nova', icon: Sparkles, hasArrow: true },
  { href: '/dashboard/tools', label: 'Tools', icon: Wrench, hasArrow: true },
  { href: '/dashboard/ai-tools', label: 'AI Toolkit', icon: Bot },
];

function useClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date()); // eslint-disable-line react-hooks/set-state-in-effect
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!now) return { time: '--:--:--', offset: '' };

  const time = now.toLocaleTimeString('en-GB', { hour12: false });
  const offsetMinutes = -now.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const hours = Math.floor(Math.abs(offsetMinutes) / 60);
  const offset = `GMT${sign}${hours}`;

  return { time, offset };
}

export default function StudioSidebar() {
  const pathname = usePathname();
  const { time, offset } = useClock();
  // Mobile fix: below 900px the desktop <aside> is hidden (`.mg-studio-sidebar
  // { display: none }`) with nothing standing in for it — every creator on a
  // phone/tablet landed on a dashboard page with zero way to reach Workspace/
  // Earnings/Boost/Perks/Academy/Nova/Tools/AI Toolkit/KaTube except editing
  // the URL by hand. Added a slim mobile top bar (hamburger + "Studio" label)
  // that opens the same nav list as a full-screen drawer, closing on
  // navigation — same pattern already used for K Circle's channel sidebar.
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === '/dashboard' : pathname?.startsWith(href);

  const itemStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 14px',
    borderRadius: '10px',
    textDecoration: 'none',
    color: active ? 'var(--accent)' : 'var(--text-secondary)',
    background: active ? 'rgba(var(--accent-rgb), 0.12)' : 'transparent',
    fontSize: '14px',
    fontWeight: active ? 700 : 600,
    transition: 'background 0.15s, color 0.15s',
  });

  return (
    <>
      <style>{`
        .mg-studio-sidebar { width: 220px; flex-shrink: 0; border-right: 1px solid var(--border-color); padding: 20px 12px; display: flex; flex-direction: column; min-height: 100vh; background: var(--bg-primary); }
        .mg-studio-nav-list { display: flex; flex-direction: column; gap: 2px; }
        .mg-studio-nav-item:hover { background: var(--bg-card) !important; }
        .mg-studio-clock { margin-top: auto; padding: 10px 14px; font-size: 11px; color: var(--text-tertiary); border-top: 1px solid var(--divider); }
        .mg-studio-bottom-icons { display: flex; gap: 8px; padding: 10px 4px 0; }
        .mg-studio-bottom-icons a { flex: 1; display: flex; align-items: center; justify-content: center; padding: 8px 0; border-radius: 8px; background: var(--bg-card); border: 1px solid var(--border-color); color: var(--text-secondary); }
        .mg-studio-bottom-icons a:hover { color: var(--accent); background: rgba(var(--accent-rgb), 0.1); }

        @media (max-width: 900px) {
          .mg-studio-sidebar { display: none; }
          .mg-studio-mobilebar { display: flex !important; }
        }

        .mg-studio-mobilebar {
          display: none; align-items: center; gap: 10px;
          position: sticky; top: 0; z-index: 90;
          padding: 10px 14px; background: var(--nav-bg); backdrop-filter: blur(12px);
          border-bottom: 1px solid var(--border-color);
        }
        .mg-studio-mobilebar-btn {
          display: flex; align-items: center; justify-content: center;
          width: 34px; height: 34px; border-radius: 8px; flex-shrink: 0;
          background: var(--bg-card); border: 1px solid var(--border-color); color: var(--text-secondary);
        }
        .mg-studio-drawer-backdrop {
          position: fixed; inset: 0; z-index: 199; background: rgba(0,0,0,0.55);
        }
        .mg-studio-drawer {
          position: fixed; top: 0; left: 0; bottom: 0; z-index: 200;
          width: min(280px, 84vw); background: var(--bg-primary);
          border-right: 1px solid var(--border-color);
          padding: 16px 12px; display: flex; flex-direction: column; overflow-y: auto;
        }
      `}</style>

      {/* Mobile top bar — hamburger only; hidden entirely at >=900px where
          the real sidebar is visible instead. */}
      <div className="mg-studio-mobilebar">
        <button
          className="mg-studio-mobilebar-btn"
          onClick={() => setMobileOpen(true)}
          aria-label="Open studio menu"
        ><Menu size={18} /></button>
        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Studio</span>
      </div>

      {mobileOpen && (
        <div className="mg-studio-drawer-backdrop" onClick={() => setMobileOpen(false)}>
          <aside className="mg-studio-drawer" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 6px 12px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Studio</span>
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="Close studio menu"
                style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', display: 'flex' }}
              ><X size={18} /></button>
            </div>

            <div className="mg-studio-nav-list">
              {NAV_ITEMS.map((item) => (
                <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className="mg-studio-nav-item" style={itemStyle(isActive(item.href))}>
                  <item.icon size={18} strokeWidth={2} />
                  <span style={{ flex: 1 }}>{item.label}</span>
                </Link>
              ))}
            </div>

            <div style={{ height: '1px', background: 'var(--divider)', margin: '14px 4px' }} />

            <div className="mg-studio-nav-list">
              {BOTTOM_ITEMS.map((item) => (
                <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className="mg-studio-nav-item" style={itemStyle(isActive(item.href))}>
                  <item.icon size={18} strokeWidth={2} />
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {item.hasArrow && <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>›</span>}
                </Link>
              ))}
            </div>

            <div className="mg-studio-clock">
              <div>{offset}</div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', marginTop: '2px' }}>{time}</div>
            </div>
          </aside>
        </div>
      )}

      <aside className="mg-studio-sidebar">
        <div className="mg-studio-nav-list">
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} className="mg-studio-nav-item" style={itemStyle(isActive(item.href))}>
              <item.icon size={18} strokeWidth={2} />
              <span style={{ flex: 1 }}>{item.label}</span>
            </Link>
          ))}
        </div>

        <div style={{ height: '1px', background: 'var(--divider)', margin: '14px 4px' }} />

        <div className="mg-studio-nav-list">
          {BOTTOM_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} className="mg-studio-nav-item" style={itemStyle(isActive(item.href))}>
              <item.icon size={18} strokeWidth={2} />
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.hasArrow && <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>›</span>}
            </Link>
          ))}
        </div>

        <div className="mg-studio-clock">
          <div>{offset}</div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', marginTop: '2px' }}>{time}</div>
        </div>

        <div className="mg-studio-bottom-icons">
          <Link href="/dashboard" title="Inbox"><Inbox size={16} strokeWidth={2} /></Link>
          <Link href="/dashboard" title="Messages"><MessageCircle size={16} strokeWidth={2} /></Link>
          <Link href="/dashboard" title="Shop"><ShoppingBag size={16} strokeWidth={2} /></Link>
        </div>
      </aside>
    </>
  );
}
