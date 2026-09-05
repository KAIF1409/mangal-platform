'use client';

// Locks an entire route tree (KaTube, Kalpana Circle — both still being
// actively built and buggy, WebMangal is the only surface meant to be
// public right now) behind the developer/admin role. Drop this in a
// segment's layout.tsx and every page under it — current and future,
// nothing per-page to remember — is covered in one place.
//
// Non-admins get a static "Coming soon" screen: no links, no buttons,
// nothing to tap. Admins (profiles.role === 'developer', same check as
// /admin/*) see the real app underneath, completely unaffected.

import { useEffect, useState, type ReactNode } from 'react';
import { Hourglass } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { isDeveloperRole } from '../../lib/auth/roles';

type CheckState = 'checking' | 'allowed' | 'locked';

function ComingSoonScreen({ label }: { label: string }) {
  return (
    <div
      style={{
        minHeight: '100vh', background: '#07070a', color: '#fff',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: '18px', padding: '24px', textAlign: 'center',
        // Nothing here should be interactive — belt-and-braces against any
        // stray clickable element accidentally ending up inside.
        pointerEvents: 'none', userSelect: 'none',
      }}
    >
      <div style={{
        width: '64px', height: '64px', borderRadius: '18px', background: 'rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Hourglass size={28} color="rgba(255,255,255,0.7)" />
      </div>
      <h1 style={{ fontSize: '22px', fontWeight: 900, margin: 0 }}>{label} is coming soon</h1>
      <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.55)', margin: 0, maxWidth: '360px', lineHeight: 1.5 }}>
        We&apos;re still building this out. Check back soon — in the meantime, WebMangal is live and ready to read.
      </p>
    </div>
  );
}

export default function ComingSoonGate({ label, children }: { label: string; children: ReactNode }) {
  const [state, setState] = useState<CheckState>('checking');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Same stale-auth-lock timeout as the book reader — getUser() can
      // hang indefinitely on a stuck cross-tab lock; fall back to
      // "signed out" (i.e. locked) rather than stalling the gate forever.
      const u = await Promise.race([
        supabase.auth.getUser(),
        new Promise<{ data: { user: null } }>((resolve) => setTimeout(() => resolve({ data: { user: null } }), 4000)),
      ]).then((r) => r.data).catch(() => ({ user: null }));

      if (!u.user) { if (!cancelled) setState('locked'); return; }

      const { data: profile } = await supabase.from('profiles').select('role').eq('id', u.user.id).single();
      if (cancelled) return;
      setState(isDeveloperRole(profile?.role) ? 'allowed' : 'locked');
    })();
    return () => { cancelled = true; };
  }, []);

  if (state === 'checking') {
    // Blank dark frame, not the real UI and not the Coming Soon copy —
    // avoids a flash of either before the role check resolves.
    return <div style={{ minHeight: '100vh', background: '#07070a' }} />;
  }

  if (state === 'locked') {
    return <ComingSoonScreen label={label} />;
  }

  return <>{children}</>;
}
