'use client';

import { useState, type CSSProperties } from 'react';
import StudioSidebar from '../../components/shared/StudioSidebar';
import { KatubeDashboardThemeContext } from './ThemeContext';

// Split out of layout.tsx so layout.tsx can stay a server component (keeps
// its `metadata` export working) while this piece — StudioSidebar +
// children wrapped in the forced-dark/light theme override — is the only
// part that needs client-side state.
export default function DashboardThemeShell({ children }: { children: React.ReactNode }) {
  // Forced-dark-by-default with a light option, same pattern as every
  // other KaTube page. Applied here (not just in page.tsx) so
  // StudioSidebar — rendered as a sibling of `children`, not inside it —
  // picks up the same maroon/red theme instead of staying on the global
  // site-wide theme while the page content around it goes dark.
  const [isLight, setIsLight] = useState(false);

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

  return (
    <KatubeDashboardThemeContext.Provider value={{ isLight, setIsLight }}>
      <div
        data-theme={isLight ? 'light' : 'dark'}
        className="mg-dashboard-shell"
        style={{ ...katubeVars, display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
      >
        <style>{`
          @media (max-width: 900px) {
            .mg-dashboard-shell { flex-direction: column; }
          }
        `}</style>
        <StudioSidebar />
        <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      </div>
    </KatubeDashboardThemeContext.Provider>
  );
}
