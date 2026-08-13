'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'mangal_theme';

export default function ThemeToggle({
  size = 34,
  onChange,
  defaultLight = true,
  syncGlobal = true,
}: {
  size?: number;
  onChange?: (isLight: boolean) => void;
  // Pages that force their own default independent of the site-wide
  // light-default (KaTube, landing page — see CONTEXT.md) pass
  // `defaultLight={false} syncGlobal={false}`. Without this, the mount
  // effect below used to always read the global <html> attribute — which
  // reflects the *site-wide* default, not this page's override — and call
  // onChange with that instead, silently flipping the page's local dark
  // default back to light right after paint for any first-time visitor.
  // Found while wiring the landing page's dark default; fixed here once for
  // every call site instead of patching around it per page.
  defaultLight?: boolean;
  // Whether toggling here should also mutate the global <html> attribute +
  // shared localStorage key (i.e. change the site-wide default other pages
  // read). Page-scoped overrides pass `false` so flipping the toggle only
  // re-themes *this* page (via onChange) and never leaks into the
  // sitewide preference other pages fall back to.
  syncGlobal?: boolean;
}) {
  // Starts null so we don't render a wrong icon before we know the real
  // initial value on mount.
  const [isLight, setIsLight] = useState<boolean | null>(null);

  useEffect(() => {
    // Global pages: reflect whatever the blocking script in layout.tsx
    // already set on <html> (source of truth for the site-wide default) so
    // server and client's first paint match.
    // Page-scoped pages: this page's own default wins, full stop — never
    // read from the global attribute, so the site-wide default can't
    // override it.
    const initial = syncGlobal
      ? document.documentElement.getAttribute('data-theme') === 'light'
      : defaultLight;
    setIsLight(initial); // eslint-disable-line react-hooks/set-state-in-effect
    onChange?.(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = () => {
    const next = !isLight;
    setIsLight(next);
    onChange?.(next);
    if (!syncGlobal) return; // page-scoped: caller re-themes via onChange only
    if (next) {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    try {
      // Light is the site default now — only 'dark' needs to be persisted;
      // clearing the key entirely would also work, but storing it explicitly
      // makes the saved choice easy to inspect/debug in localStorage.
      localStorage.setItem(STORAGE_KEY, next ? 'light' : 'dark');
    } catch {
      // localStorage unavailable — theme still applies for this session
    }
  };

  if (isLight === null) {
    // Reserve the space so nothing jumps once we know the real value
    return <div style={{ width: size, height: size, flexShrink: 0 }} />;
  }

  return (
    <button
      onClick={toggle}
      aria-label={isLight ? 'Switch to dark theme' : 'Switch to light theme'}
      title={isLight ? 'Switch to dark theme' : 'Switch to light theme'}
      style={{
        width: size, height: size, flexShrink: 0, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: '50%', border: '1px solid var(--border-color)',
        background: 'var(--bg-card)', fontSize: size * 0.5,
        transition: 'border-color 0.15s, transform 0.15s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-color)'; }}
    >
      {isLight ? '🌙' : '☀️'}
    </button>
  );
}
