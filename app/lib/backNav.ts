// Pages like /creator/[username] are linked to from all three MANGAL
// products (WebMangal, KaTube, Kalpana Circle). A hardcoded "Back to
// Browse" -> "/" always sends the user to platform home, even if they
// arrived from KaTube or Kalpana Circle, which feels broken.
//
// First attempt used document.referrer, but that doesn't work: Next.js
// <Link> navigation is client-side routing (no full page load), so
// document.referrer stays frozen at whatever it was when the TAB was
// first opened — it never updates to the in-app page you actually came
// from. So instead, <ProductVisitTracker> (mounted once in the root
// layout) writes the current product section to sessionStorage on every
// route change, and this reads that back.

export interface BackNav {
  href: string;
  label: string;
}

const STORAGE_KEY = 'mangal_last_product';

const PRODUCT_HOMES: { prefix: string; href: string; label: string }[] = [
  { prefix: '/kalpana-circle', href: '/kalpana-circle', label: 'Back to Kalpana Circle' },
  { prefix: '/katube', href: '/katube', label: 'Back to KaTube' },
];

const DEFAULT_BACK_NAV: BackNav = { href: '/', label: 'Back to Browse' };

/** Call on every route change (see ProductVisitTracker) to record which
 * product section the user is currently browsing, skipping /creator/...
 * itself so it never overwrites the value with its own visit. */
export function recordProductVisit(pathname: string): void {
  if (typeof window === 'undefined') return;
  const match = PRODUCT_HOMES.find((p) => pathname.startsWith(p.prefix));
  try {
    if (match) sessionStorage.setItem(STORAGE_KEY, match.href);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // sessionStorage unavailable (private mode etc) — fall back silently
  }
}

export function getBackNav(): BackNav {
  if (typeof window === 'undefined') return DEFAULT_BACK_NAV;
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    const match = PRODUCT_HOMES.find((p) => p.href === stored);
    return match ?? DEFAULT_BACK_NAV;
  } catch {
    return DEFAULT_BACK_NAV;
  }
}
