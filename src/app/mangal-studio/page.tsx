'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';

// §127 — real "which products does this creator have content on"
// redirect, per §114's original plan for this route (K Circle Studio
// is still Phase 3, not built — WebMangal Studio shipped this pass).
// Checks both products' own tables directly rather than guessing from
// role flags, so a creator only gets redirected into a Studio they
// actually have content on; if they have both (or neither), they land
// on the small switcher screen instead of being silently redirected
// into just one.
export default function MangalStudioRoot() {
  const router = useRouter();
  const [choices, setChoices] = useState<{ katube: boolean; webmangal: boolean } | null>(null);

  useEffect(() => {
    const check = async () => {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id;
      if (!userId) { router.replace('/mangal-studio/katube'); return; }

      const [videosRes, seriesRes] = await Promise.all([
        supabase.from('videos').select('id', { count: 'exact', head: true }).eq('creator_id', userId),
        supabase.from('series').select('id', { count: 'exact', head: true }).eq('creator_id', userId),
      ]);
      const hasKatube = (videosRes.count || 0) > 0;
      const hasWebmangal = (seriesRes.count || 0) > 0;

      if (hasKatube && !hasWebmangal) { router.replace('/mangal-studio/katube'); return; }
      if (hasWebmangal && !hasKatube) { router.replace('/mangal-studio/webmangal'); return; }
      // Both, or neither (new creator with nothing yet) — show the
      // switcher rather than guessing which one they meant.
      setChoices({ katube: hasKatube, webmangal: hasWebmangal });
    };
    check();
  }, [router]);

  if (!choices) {
    return <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px' }}>Loading Studio…</div>;
  }

  return (
    <div style={{ maxWidth: '420px', margin: '80px auto', textAlign: 'center', padding: '0 20px' }}>
      <h1 style={{ fontSize: '18px', fontWeight: 900, marginBottom: '6px' }}>Choose a Studio</h1>
      <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '24px' }}>
        {choices.katube || choices.webmangal
          ? "You have content on more than one product — pick which Studio to open."
          : "Pick a Studio to get started — you can switch anytime."}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <a href="/mangal-studio/katube" style={{ padding: '14px', borderRadius: '12px', textDecoration: 'none', fontWeight: 800, fontSize: '14px', background: '#e11d48', color: '#fff' }}>KaTube Studio</a>
        <a href="/mangal-studio/webmangal" style={{ padding: '14px', borderRadius: '12px', textDecoration: 'none', fontWeight: 800, fontSize: '14px', background: '#d97706', color: '#fff' }}>WebMangal Studio</a>
      </div>
    </div>
  );
}
