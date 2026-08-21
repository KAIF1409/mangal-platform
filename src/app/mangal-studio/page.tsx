'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// §114 — root switcher. K Circle Studio / WebMangal Studio are Phase 2/3,
// not built yet, so there's currently only one real destination. Once
// those ship, this becomes the "which products does this creator have
// content on" redirect/switcher described in CONTEXT.md §114. For now it
// just sends creators straight into the one Studio that exists.
export default function MangalStudioRoot() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/mangal-studio/katube');
  }, [router]);
  return <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px' }}>Loading Studio…</div>;
}
