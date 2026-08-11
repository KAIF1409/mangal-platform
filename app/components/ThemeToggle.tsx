'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'mangal_theme';

export default function ThemeToggle({ size = 34, onChange }: { size?: number; onChange?: (isLight: boolean) => void }) {
  // Starts null so we don't render a wrong icon before reading localStorage
  // on mount (the blocking <script> in layout.tsx already set the attribute
  // on <html> before paint — this just syncs the button's own state/icon).
  const [isLight, setIsLight] = useState<boolean | null>(null);

  useEffect(() => {
    // Reads the real theme (set by the blocking script in layout.tsx) after
    // mount so server and client's first paint match; avoids a hydration
    // mismatch that a lazy useState initializer touching `document` would cause.
    const initial = document.documentElement.getAttribute('data-theme') === 'light';
    setIsLight(initial); // eslint-disable-line react-hooks/set-state-in-effect
    onChange?.(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = () => {
    const next = !isLight;
    setIsLight(next);
    onChange?.(next);
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
