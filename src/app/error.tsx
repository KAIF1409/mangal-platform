'use client';

import { useEffect } from 'react';
import Link from 'next/link';

// §148 — site-wide error boundary. Before this file existed, there was NO
// error.tsx anywhere in the app: any uncaught render-time exception on any
// page (including the landing page) left the visitor looking at a fully
// blank screen with no message and no way back, because Next has nothing to
// fall back to without one. This catches that case, logs it for debugging,
// and gives the visitor a way to retry or get back to a working page instead
// of a dead white screen.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[MANGAL] Uncaught render error:', error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '18px',
        padding: '24px',
        textAlign: 'center',
        backgroundColor: '#07070a',
        color: '#f9fafb',
      }}
    >
      <span style={{ fontSize: '40px', fontWeight: 900, letterSpacing: '-0.03em' }}>
        MANGAL
      </span>
      <p style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>
        Something went wrong loading this page.
      </p>
      <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0, maxWidth: '440px', lineHeight: 1.6 }}>
        This has been logged. You can try again, or head back to the homepage.
      </p>
      <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
        <button
          onClick={() => reset()}
          style={{
            padding: '10px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
            color: '#fff', border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg, #7f1d1d, #d97706)',
          }}
        >
          Try again
        </button>
        <Link
          href="/"
          style={{
            padding: '10px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
            color: '#f9fafb', textDecoration: 'none', border: '1px solid rgba(255,255,255,0.18)',
          }}
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
