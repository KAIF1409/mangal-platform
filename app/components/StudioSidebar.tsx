'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItem {
  href: string;
  label: string;
  icon: string;
  hasArrow?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/dashboard/workspace', label: 'Workspace', icon: '🗂️', hasArrow: true },
  { href: '/dashboard/earnings', label: 'Earnings', icon: '💰' },
  { href: '/dashboard/boost', label: 'Boost', icon: '🚀' },
  { href: '/dashboard/perks', label: 'Perks', icon: '🎁' },
  { href: '/dashboard/academy', label: 'Academy', icon: '🎓' },
  { href: '/dashboard/katube', label: 'KaTube', icon: '🎬' },
];

const BOTTOM_ITEMS: NavItem[] = [
  { href: '/dashboard/nova', label: 'Nova', icon: '✨', hasArrow: true },
  { href: '/dashboard/tools', label: 'Tools', icon: '🧰', hasArrow: true },
];

function useClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
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
        .mg-studio-bottom-icons a { flex: 1; text-align: center; padding: 8px 0; border-radius: 8px; background: var(--bg-card); border: 1px solid var(--border-color); font-size: 14px; }

        @media (max-width: 900px) {
          .mg-studio-sidebar { display: none; }
        }
      `}</style>

      <aside className="mg-studio-sidebar">
        <div className="mg-studio-nav-list">
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} className="mg-studio-nav-item" style={itemStyle(isActive(item.href))}>
              <span>{item.icon}</span>
              <span style={{ flex: 1 }}>{item.label}</span>
            </Link>
          ))}
        </div>

        <div style={{ height: '1px', background: 'var(--divider)', margin: '14px 4px' }} />

        <div className="mg-studio-nav-list">
          {BOTTOM_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} className="mg-studio-nav-item" style={itemStyle(isActive(item.href))}>
              <span>{item.icon}</span>
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
          <Link href="/dashboard" title="Inbox">📥</Link>
          <Link href="/dashboard" title="Messages">💬</Link>
          <Link href="/dashboard" title="Shop">🛍️</Link>
        </div>
      </aside>
    </>
  );
}
