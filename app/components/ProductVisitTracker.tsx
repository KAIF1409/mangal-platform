'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { recordProductVisit } from '../lib/backNav';

// Renders nothing — just watches route changes so getBackNav() (used by
// pages like /creator/[username]) knows which product to send you back to.
export default function ProductVisitTracker() {
  const pathname = usePathname();

  useEffect(() => {
    recordProductVisit(pathname);
  }, [pathname]);

  return null;
}
