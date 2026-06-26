'use client';

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
}

const DEFAULT_FOOTER_LINKS: FooterLink[] = [
  { label: 'Home', href: '/' },
  { label: 'Privacy Policy', href: '/privacy' },
  { label: 'Terms of Service', href: '/terms' },
  { label: 'Grievance Officer', href: '/grievance' },
];

export default function Footer({
  tagline = "India's home for original comics & novels. Made with ❤️ in Bharat.",
  links = DEFAULT_FOOTER_LINKS,
  platformName = 'MANGAL',
  logoSize = 28,
  showBrandBlock = true,
}: FooterProps) {
  return (
    <footer style={{ borderTop: '1px solid #1a1a26', padding: '32px 24px', textAlign: 'center' }}>
      {showBrandBlock && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            justifyContent: 'center',
            marginBottom: '12px',
          }}
        >
          <img
            src="/logo-icon.png"
            alt={platformName}
            style={{ width: logoSize, height: logoSize, borderRadius: logoSize * 0.28, display: 'block' }}
          />
          <span style={{ fontWeight: 900, fontSize: '16px', color: '#fff' }}>{platformName}</span>
        </div>
      )}

      <p style={{ fontSize: '12px', color: '#374151', margin: '0 0 14px' }}>{tagline}</p>

      <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', flexWrap: 'wrap' }}>
        {links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            style={{ fontSize: '11px', color: '#4b5563', textDecoration: 'none' }}
          >
            {link.label}
          </a>
        ))}
      </div>
    </footer>
  );
}