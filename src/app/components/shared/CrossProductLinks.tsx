'use client';

import Image from 'next/image';
import Link from 'next/link';

type Product = 'webmangal' | 'katube' | 'kcircle';

const PRODUCTS: Record<Product, { href: string; logo: string; label: string }> = {
  webmangal: { href: '/WebMangal', logo: '/webmangal-logo.png', label: 'WebMangal' },
  katube: { href: '/katube', logo: '/katube-logo.png', label: 'KaTube' },
  kcircle: { href: '/kalpana-circle', logo: '/kcircle-logo.png', label: 'Kalpana Circle' },
};

/**
 * Logo-only, clickable links to the OTHER two MANGAL products — deliberately
 * no text label next to the icon (per founder's spec: every product should
 * link out to the other two, icon-only, no "with text" version). Renders
 * whichever two entries in PRODUCTS aren't `current`, in a fixed order so
 * placement is predictable regardless of which product is calling it.
 *
 * Sits inline in a flex row by default — on a page whose nav already
 * scrolls horizontally on mobile (WebMangal's shared Navbar, KaTube's nav,
 * K Circle's rail), that's enough on its own to avoid the two icons
 * overlapping anything at phone width. `wrapScroll` opts into an explicit
 * own horizontally-scrollable strip for callers that don't already have one.
 */
export default function CrossProductLinks({
  current,
  size = 22,
  gap = 8,
  wrapScroll = false,
  direction = 'row',
}: {
  current: Product;
  size?: number;
  gap?: number;
  wrapScroll?: boolean;
  /** 'row' for a horizontal nav bar (default), 'column' for a vertical rail. */
  direction?: 'row' | 'column';
}) {
  const others = (Object.keys(PRODUCTS) as Product[]).filter(p => p !== current);

  const content = (
    <div style={{ display: 'flex', flexDirection: direction, alignItems: 'center', gap: `${gap}px`, flexShrink: 0 }}>
      {others.map(key => {
        const p = PRODUCTS[key];
        return (
          <Link
            key={key}
            href={p.href}
            data-cursor-hover="true"
            title={p.label}
            aria-label={`Go to ${p.label}`}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: `${size + 12}px`, height: `${size + 12}px`, borderRadius: '50%',
              flexShrink: 0, transition: 'background 0.15s, transform 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--border-color)'; (e.currentTarget as HTMLElement).style.transform = 'scale(1.08)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.transform = 'none'; }}
          >
            <Image src={p.logo} alt={p.label} width={70} height={70} style={{ width: `${size}px`, height: `${size}px`, objectFit: 'contain', display: 'block' }} />
          </Link>
        );
      })}
    </div>
  );

  if (!wrapScroll) return content;

  return (
    <div style={{ display: 'flex', overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', maxWidth: '100%' }}>
      {content}
    </div>
  );
}
