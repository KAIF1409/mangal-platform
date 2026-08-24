'use client';

import { useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import StudioSidebar from '../../components/shared/StudioSidebar';
import ProductSwitcher from '../ProductSwitcher';
import { WebMangalStudioThemeContext } from './ThemeContext';
import { LayoutGrid, BarChart3, Star, Sparkles } from 'lucide-react';

// §114/§126 Phase 2 — WebMangal Studio shell, same shape as
// KatubeStudioShell (forced-dark-by-default, light optional plumbing,
// per-product reskin per the founder's confirmed decision) but using
// WebMangal's own real site palette straight from globals.css
// (:root / [data-theme='light']) rather than inventing new colors —
// this *is* WebMangal's actual brand, unlike the placeholder blue
// ProductSwitcher had been using before this pass (fixed alongside).
//
// §132 — Reviews tab added: WebMangal has no "channel setup" concept
// (no channel-verify flow), so this is its Comments-tab equivalent —
// a read-only moderation view over `ratings` (stars + optional
// review_title/review_text), same honesty posture as KaTube's Comments
// tab (see WebMangalStudioReviews' own header comment).
const TABS = [
  { href: '/mangal-studio/webmangal', label: 'Overview', icon: LayoutGrid, exact: true },
  { href: '/mangal-studio/webmangal/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/mangal-studio/webmangal/reviews', label: 'Reviews', icon: Star },
  { href: '/mangal-studio/webmangal/write', label: 'AI Writer', icon: Sparkles },
];

export default function WebMangalStudioShell({ children }: { children: React.ReactNode }) {
  const [isLight, setIsLight] = useState(false);
  const pathname = usePathname();

  const webmangalDarkVars = {
    '--bg-primary': '#07070a', '--bg-card': '#0d0d14', '--bg-input': '#08080c',
    '--border-color': '#1a1a26', '--text-primary': '#f9fafb',
    '--text-secondary': '#9ca3af', '--text-tertiary': '#6b7280',
    '--nav-bg': 'rgba(7, 7, 10, 0.97)', '--nav-bg-transparent': 'rgba(7, 7, 10, 0.85)',
    '--divider': '#14141e', '--text-faint': '#374151',
    '--accent': '#d97706', '--accent-rgb': '217, 119, 6',
  };
  const webmangalLightVars = {
    '--bg-primary': '#ffffff', '--bg-card': '#f7f7f9', '--bg-input': '#f0f0f3',
    '--border-color': '#e5e7eb', '--text-primary': '#14141c',
    '--text-secondary': '#4b5563', '--text-tertiary': '#6b7280',
    '--nav-bg': 'rgba(255, 255, 255, 0.97)', '--nav-bg-transparent': 'rgba(255, 255, 255, 0.88)',
    '--divider': '#edeef1', '--text-faint': '#d1d5db',
    '--accent': '#b45309', '--accent-rgb': '180, 83, 9',
  };
  const vars = (isLight ? webmangalLightVars : webmangalDarkVars) as CSSProperties;

  const isTabActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname?.startsWith(href);

  return (
    <WebMangalStudioThemeContext.Provider value={{ isLight, setIsLight }}>
      <div
        data-theme={isLight ? 'light' : 'dark'}
        className="mg-wmstudio-shell"
        style={{ ...vars, display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
      >
        <style>{`
          @media (max-width: 900px) { .mg-wmstudio-shell { flex-direction: column; } }
          .mg-wmstudio-tab:hover { color: var(--accent) !important; }
          .mg-wmstudio-tabs { display: flex; gap: 4px; overflow-x: auto; border-bottom: 1px solid var(--border-color); padding: 0 24px; }
        `}</style>
        <StudioSidebar />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ padding: '20px 24px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--accent)', letterSpacing: '0.06em', marginBottom: '4px' }}>MANGAL STUDIO</div>
              <h1 style={{ fontSize: '22px', fontWeight: 900, margin: 0, letterSpacing: '-0.02em' }}>WebMangal Studio</h1>
            </div>
            <ProductSwitcher active="webmangal" />
          </div>

          <nav className="mg-wmstudio-tabs" style={{ marginTop: '18px' }}>
            {TABS.map(tab => {
              const active = isTabActive(tab.href, tab.exact);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  prefetch={false}
                  className="mg-wmstudio-tab"
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
    </WebMangalStudioThemeContext.Provider>
  );
}
