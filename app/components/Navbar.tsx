'use client';

import Link from 'next/link';
import Image from 'next/image';

interface NavbarProps {
  /** "legal" = logo + "← Back to Home" only (privacy/terms/grievance style).
   *  "custom" = logo + optional centerSlot + rightSlot (homepage/dashboard style). */
  variant?: 'legal' | 'custom';
  /** Fully custom center content (nav links with active-state styling, etc.)
   *  Only used when variant="custom". Pass your own <a> tags so per-page
   *  active-link logic (e.g. navLinkStyle(isActive)) keeps working exactly
   *  as before. */
  centerSlot?: React.ReactNode;
  /** Right-side content — auth buttons, ProfileMenu, language toggle, etc.
   *  Only used when variant="custom" */
  rightSlot?: React.ReactNode;
  /** Logo size in px. Defaults to 32. */
  logoSize?: number;
  /** Darker background once the page has scrolled (homepage-style fade-in).
   *  Pass true for a flat always-solid nav (legal pages, dashboard). */
  scrolled?: boolean;
  platformName?: string;
  /** Optional className on the <nav> itself — needed if your globals.css
   *  has responsive rules targeting a specific class (e.g. "mangal-dash-nav"). */
  navClassName?: string;
  /** Optional className on the logo+centerSlot wrapper div — same reason. */
  brandWrapperClassName?: string;
}

export default function Navbar({
  variant = 'legal',
  centerSlot,
  rightSlot,
  logoSize = 32,
  scrolled = true,
  platformName = 'MANGAL',
  navClassName,
  brandWrapperClassName,
}: NavbarProps) {
  return (
    <nav
      className={navClassName}
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: scrolled ? 'rgba(7,7,10,0.98)' : 'rgba(7,7,10,0.85)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid #1a1a26',
        padding: '0 24px',
        height: '60px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        transition: 'background 0.3s, border-color 0.3s',
      }}
    >
      <div
        className={brandWrapperClassName}
        style={{ display: 'flex', alignItems: 'center', gap: '32px', minWidth: 0 }}
      >
        <Link
          href="/"
          style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none', flexShrink: 0 }}
        >
          <Image
            src="/icon.png"
            alt={platformName}
            width={logoSize}
            height={logoSize}
            style={{ display: 'block', filter: 'drop-shadow(0 0 8px rgba(217,119,6,0.5))' }}
          />
          <span style={{ fontWeight: 900, fontSize: '18px', color: '#fff', letterSpacing: '-0.02em' }}>
            {platformName}
          </span>
        </Link>

        {variant === 'custom' && centerSlot}
      </div>

      {variant === 'legal' ? (
        <a href="/" style={{ fontSize: '12px', color: '#6b7280', textDecoration: 'none' }}>
          ← Back to Home
        </a>
      ) : (
        rightSlot
      )}
    </nav>
  );
}