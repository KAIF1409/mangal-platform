'use client';

import Image from 'next/image';

interface MangalLogoProps {
  /** Logo image size in px (square). Defaults to 32. */
  size?: number;
  /** Extra style on the outer gradient-ring wrapper (e.g. flexShrink, margin). */
  style?: React.CSSProperties;
}

/**
 * The official MANGAL company logo (public/icon.png), wrapped in a fixed
 * orange->green gradient ring. Deliberately built from hardcoded hex colors,
 * not theme CSS vars (--border-color etc.) — the ring is a brand mark and
 * must look identical in light and dark theme, unlike the rest of the chrome
 * around it which re-themes normally. Use this instead of a bare
 * `<Image src="/icon.png" .../>` anywhere the official logo appears.
 */
export default function MangalLogo({ size = 32, style }: MangalLogoProps) {
  return (
    <div
      style={{
        display: 'inline-flex',
        flexShrink: 0,
        lineHeight: 0,
        padding: '2px',
        borderRadius: `${Math.round(size * 0.3)}px`,
        background: 'linear-gradient(135deg, #f97316 0%, #16a34a 100%)',
        ...style,
      }}
    >
      <Image
        src="/icon.png"
        alt="MANGAL"
        width={size}
        height={size}
        style={{
          display: 'block',
          borderRadius: `${Math.round(size * 0.22)}px`,
          filter: 'drop-shadow(0 0 8px rgba(217,119,6,0.5))',
        }}
      />
    </div>
  );
}
