'use client';

import Link from 'next/link';
import Image from 'next/image';
import ThemeToggle from './ThemeToggle';
import { ArrowLeft } from 'lucide-react';

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
  /** Logo image path. Defaults to the umbrella "/icon.png" (MANGAL). Pass a
   *  product-specific logo (e.g. "/webmangal-logo.png") for pages that want
   *  their own brand mark here instead of the generic MANGAL one. */
  logoSrc?: string;
  /** Where the logo links to. Defaults to "/" (homepage). */
  href?: string;
  /** Optional small subtitle under/after the wordmark, e.g. "powered by MANGAL"
   *  — only shown when set, so existing callers are unaffected. */
  subtitle?: string;
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
  logoSrc = '/icon.png',
  href = '/',
  subtitle,
  navClassName,
  brandWrapperClassName,
}: NavbarProps) {
  return (
    <nav
      className={`mangal-shared-nav${navClassName ? ` ${navClassName}` : ''}`}
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: scrolled ? 'var(--nav-bg)' : 'var(--nav-bg-transparent)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border-color)',
        padding: '0 24px',
        height: '60px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        transition: 'background 0.3s, border-color 0.3s',
      }}
    >
      {/* Every "custom" page that renders this component was passing its own
          centerSlot (2-6 nav links) with no responsive handling — Navbar
          itself had no default mobile behavior, so any page that didn't
          separately wire up its own .mangal-*-nav-center media queries
          (library, bookmarks, rankings, etc.) silently overflowed on phones.
          Fixed once, here, instead of per-page: .mangal-shared-nav-center
          becomes horizontally scrollable at every width (invisible on
          desktop, a real scroll strip on phones) and the brand wordmark
          hides under 420px — see the matching rules in globals.css. */}
      <div
        className={`mangal-shared-nav-brand${brandWrapperClassName ? ` ${brandWrapperClassName}` : ''}`}
        style={{ display: 'flex', alignItems: 'center', gap: '32px', minWidth: 0 }}
      >
        <Link
          href={href}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none', flexShrink: 0 }}
        >
          <Image
            src={logoSrc}
            alt={platformName}
            width={logoSize}
            height={logoSize}
            style={{ display: 'block', filter: logoSrc === '/icon.png' ? 'drop-shadow(0 0 8px rgba(217,119,6,0.5))' : undefined }}
          />
          <span className="mangal-shared-nav-brand-text" style={{ fontWeight: 900, fontSize: '18px', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            {platformName}
          </span>
          {subtitle && (
            <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.01em', whiteSpace: 'nowrap' }}>
              {subtitle}
            </span>
          )}
        </Link>

        {variant === 'custom' && centerSlot && (
          <div className="mangal-shared-nav-center">{centerSlot}</div>
        )}
      </div>

      {variant === 'legal' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
          <ThemeToggle size={30} />
          {/* BUG FIX: this used to be hardcoded to href="/" regardless of what
              the caller passed in via the `href` prop, so every "legal"-variant
              Navbar (e.g. KaTube's dashboard) sent "Back to Home" to the root
              MANGAL landing page instead of that product's own home. Now reuses
              the same `href` prop the logo link above already uses, so callers
              that pass e.g. href="/katube" get a correct product-scoped link. */}
          <Link href={href} style={{ fontSize: '12px', color: 'var(--text-tertiary)', textDecoration: 'none', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <ArrowLeft size={12} strokeWidth={2} /> Back to Home
          </Link>
        </div>
      ) : (
        <div className="mangal-shared-nav-right" style={{ display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
          <ThemeToggle size={32} />
          {rightSlot}
        </div>
      )}
    </nav>
  );
}