'use client';

import MangalLogo from './MangalLogo';

type FooterLink = { label: string; href: string };

interface FooterProps {
  /** Small line under the logo. Defaults to the standard MANGAL tagline.
   *  Pass t('madeWithLove') from a page that supports Hindi translation. */
  tagline?: string;
  /** Footer links + labels. Defaults to English. Pass translated labels
   *  (e.g. using t('privacyPolicy')) from pages with Hindi support. */
  links?: FooterLink[];
  platformName?: string;
  logoSize?: number;
  /** Show the logo + name block above the tagline. Set false for a links-only footer. */
  showBrandBlock?: boolean;
  /** Where the footer logo links to. Defaults to "/". Pass the official
   *  MANGAL site (e.g. on legal pages) to point at the company's official
   *  page instead of this app's own homepage. External (http/https) values
   *  open in a new tab; internal paths navigate normally. */
  logoHref?: string;
}

const DEFAULT_FOOTER_LINKS: FooterLink[] = [
  { label: 'Home', href: '/' },
  { label: 'About', href: '/about' },
  { label: 'Help Center', href: '/help' },
  { label: 'Privacy Policy', href: '/privacy' },
  { label: 'Terms of Service', href: '/terms' },
  { label: 'Grievance Officer', href: '/grievance' },
];

export default function Footer({
  tagline = "India's home for original comics & novels. Made with love in Bharat.",
  links = DEFAULT_FOOTER_LINKS,
  platformName = 'MANGAL',
  logoSize = 28,
  showBrandBlock = true,
  logoHref = '/',
}: FooterProps) {
  const isExternal = logoHref.startsWith('http://') || logoHref.startsWith('https://');

  const brandMark = (
    <>
      <MangalLogo size={logoSize} />
      <span style={{ fontWeight: 900, fontSize: '16px', color: 'var(--footer-text)' }}>{platformName}</span>
    </>
  );

  return (
    <footer
      style={{
        borderTop: '1px solid var(--footer-border)',
        background: 'var(--footer-bg)',
        padding: '32px 24px',
        textAlign: 'center',
        transition: 'background-color 0.2s ease, color 0.2s ease',
      }}
    >
      {showBrandBlock && (
        <a
          href={logoHref}
          {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            justifyContent: 'center',
            marginBottom: '12px',
            textDecoration: 'none',
          }}
        >
          {brandMark}
        </a>
      )}

      <p style={{ fontSize: '12px', color: 'var(--footer-text-muted)', margin: '0 0 14px' }}>{tagline}</p>

      <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', flexWrap: 'wrap' }}>
        {links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            style={{ fontSize: '11px', color: 'var(--footer-link)', textDecoration: 'none' }}
          >
            {link.label}
          </a>
        ))}
      </div>
    </footer>
  );
}