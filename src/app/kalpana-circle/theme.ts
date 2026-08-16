'use client';

import { useState, CSSProperties } from 'react';

// ── K Circle theme tokens ──
// Copied verbatim from KaTube/landing page's dark+light CSS var maps (see
// CONTEXT.md) so K Circle visually matches KaTube instead of the site-wide
// default. Page-scoped only — never touches the global <html data-theme>
// attribute or the sitewide localStorage key, so flipping this toggle can't
// leak into other pages' default (mirrors KaTube's own page-scoped override,
// see ThemeToggle's defaultLight/syncGlobal comments).
export const KC_DARK_VARS: CSSProperties = {
  '--bg-primary': '#07070a', '--bg-card': '#0d0d14', '--bg-input': '#08080c',
  '--border-color': 'rgba(255, 255, 255, 0.18)', '--text-primary': '#f9fafb',
  '--text-secondary': '#9ca3af', '--text-tertiary': '#6b7280', '--text-faint': '#374151',
  '--nav-bg': 'rgba(7, 7, 10, 0.97)', '--nav-bg-transparent': 'rgba(7, 7, 10, 0.85)',
} as CSSProperties;

export const KC_LIGHT_VARS: CSSProperties = {
  '--bg-primary': '#ffffff', '--bg-card': '#f7f7f9', '--bg-input': '#f0f0f3',
  '--border-color': '#e5e7eb', '--text-primary': '#14141c',
  '--text-secondary': '#4b5563', '--text-tertiary': '#6b7280', '--text-faint': '#d1d5db',
  '--nav-bg': 'rgba(255, 255, 255, 0.97)', '--nav-bg-transparent': 'rgba(255, 255, 255, 0.88)',
} as CSSProperties;

// K Circle defaults to dark, like KaTube — independent of the site-wide
// light-default. Pass the returned `onChange`/`defaultLight`/`syncGlobal`
// straight to <ThemeToggle> so the toggle re-themes this page only.
export function useKCircleTheme() {
  const [isLight, setIsLight] = useState(false);
  const themeVars = isLight ? KC_LIGHT_VARS : KC_DARK_VARS;
  const dataTheme = isLight ? 'light' : 'dark';
  return { isLight, setIsLight, themeVars, dataTheme } as const;
}
