'use client';

import { useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import StudioSidebar from '../../components/shared/StudioSidebar';
import ProductSwitcher from '../ProductSwitcher';
import { KatubeStudioThemeContext } from './ThemeContext';
import { LayoutGrid, Clapperboard, BarChart3, MessageSquare, Settings2 } from 'lucide-react';

// §114 Phase 1 — same forced-dark maroon/red theme the old
// /katube/dashboard used (katubeDarkVars), carried over here since the
// founder confirmed KaTube Studio keeps its own reskin rather than a
// neutral shared Studio shell. Split into its own client component so
// katube/layout.tsx can stay a server component and keep `metadata`.
const TABS = [
  { href: '/mangal-studio/katube', label: 'Overview', icon: LayoutGrid, exact: true },
  { href: '/mangal-studio/katube/content', label: 'Content', icon: Clapperboard },
  { href: '/mangal-studio/katube/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/mangal-studio/katube/comments', label: 'Comments', icon: MessageSquare },
  { href: '/mangal-studio/katube/channel-setup', label: 'Channel setup', icon: Settings2 },
];

export default function KatubeStudioShell({ children }: { children: React.ReactNode }) {
  const [isLight, setIsLight] = useState(false);
  const pathname = usePathname();

  const katubeDarkVars = {
    '--bg-primary': '#120610', '--bg-card': '#1d0a18', '--bg-input': '#170815',
    '--border-color': 'rgba(225, 29, 72, 0.22)', '--text-primary': '#f9fafb',
    '--text-secondary': '#c9a3b8', '--text-tertiary': '#8a6478',
    '--nav-bg': 'rgba(18, 6, 16, 0.97)', '--nav-bg-transparent': 'rgba(18, 6, 16, 0.85)',
    '--divider': 'rgba(225, 29, 72, 0.18)', '--text-faint': '#5c3a4a',
    '--accent': '#e11d48', '--accent-rgb': '225, 29, 72',
  };
  const katubeLightVars = {
    '--bg-primary': '#ffffff', '--bg-card': '#f7f7f9', '--bg-input': '#f0f0f3',
    '--border-color': '#e5e7eb', '--text-primary': '#14141c',
    '--text-secondary': '#4b5563', '--text-tertiary': '#6b7280',
    '--nav-bg': 'rgba(255, 255, 255, 0.97)', '--nav-bg-transparent': 'rgba(255, 255, 255, 0.88)',
    '--divider': '#edeef1', '--text-faint': '#d1d5db',
    '--accent': '#e11d48', '--accent-rgb': '225, 29, 72',
  };
  const katubeVars = (isLight ? katubeLightVars : katubeDarkVars) as CSSProperties;

  const isTabActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname?.startsWith(href);

  return (
    <KatubeStudioThemeContext.Provider value={{ isLight, setIsLight }}>
      <div
        data-theme={isLight ? 'light' : 'dark'}
        className="mg-kstudio-shell"
        style={{ ...katubeVars, display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
      >
        <style>{`
          @media (max-width: 900px) { .mg-kstudio-shell { flex-direction: column; } }
          .mg-kstudio-tab:hover { color: var(--accent) !important; }
          .mg-kstudio-tabs { display: flex; gap: 4px; overflow-x: auto; border-bottom: 1px solid var(--border-color); padding: 0 24px; }
        `}</style>
        <StudioSidebar />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ padding: '20px 24px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--accent)', letterSpacing: '0.06em', marginBottom: '4px' }}>MANGAL STUDIO</div>
              <h1 style={{ fontSize: '22px', fontWeight: 900, margin: 0, letterSpacing: '-0.02em' }}>KaTube Studio</h1>
            </div>
            <ProductSwitcher active="katube" />
          </div>

          <nav className="mg-kstudio-tabs" style={{ marginTop: '18px' }}>
            {TABS.map(tab => {
              const active = isTabActive(tab.href, tab.exact);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  prefetch={false}
                  className="mg-kstudio-tab"
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px', padding: '12px 14px',
                    fontSize: '13px', fontWeight: 700, textDecoration: 'none',
                    color: active ? 'var(--accent)' : 'var(--text-secondary)',
                    borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
                    marginBottom: '-1px', whiteSpace: 'nowrap',
                  }}
                >
                  <tab.icon size={15} strokeWidth={2} />
                  {tab.label}
                </Link>
              );
            })}
          </nav>

          <div style={{ padding: '24px' }}>{children}</div>
        </div>
      </div>
    </KatubeStudioThemeContext.Provider>
  );
}
