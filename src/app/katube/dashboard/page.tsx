'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// §114 — /katube/dashboard's channel-verify + analytics content moved
// into MANGAL Studio (Overview + Channel setup tabs at /mangal-studio/
// katube). This route now just redirects there so old links/bookmarks
// keep working.
export default function KatubeDashboardRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/mangal-studio/katube');
  }, [router]);
  return <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px' }}>Redirecting to MANGAL Studio…</div>;
}
