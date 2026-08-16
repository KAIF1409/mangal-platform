// Pages like /creator/[username] are linked to from all three MANGAL
// products (WebMangal, KaTube, Kalpana Circle). A hardcoded "Back to
// Browse" -> "/" always sends the user to platform home, even if they
// arrived from KaTube or Kalpana Circle, which feels broken.
//
// This reads document.referrer (client-side only, same-origin check)
// and returns the right product home + label to send them back to.
// Falls back to WebMangal ("/", "Back to Browse") when there's no
// same-origin referrer (direct visit, new tab, external link, etc).

export interface BackNav {
  href: string;
  label: string;
}

const PRODUCT_HOMES: { prefix: string; href: string; label: string }[] = [
  { prefix: '/kalpana-circle', href: '/kalpana-circle', label: 'Back to Kalpana Circle' },
  { prefix: '/katube', href: '/katube', label: 'Back to KaTube' },
];

const DEFAULT_BACK_NAV: BackNav = { href: '/', label: 'Back to Browse' };

export function getBackNav(): BackNav {
  if (typeof document === 'undefined' || !document.referrer) return DEFAULT_BACK_NAV;

  try {
    const referrer = new URL(document.referrer);
    if (referrer.origin !== window.location.origin) return DEFAULT_BACK_NAV;

    const match = PRODUCT_HOMES.find((p) => referrer.pathname.startsWith(p.prefix));
    return match ? { href: match.href, label: match.label } : DEFAULT_BACK_NAV;
  } catch {
    return DEFAULT_BACK_NAV;
  }
}
