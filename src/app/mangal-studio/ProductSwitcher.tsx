'use client';

// §114 — StudioSwitcher. Founder confirmed (2026-08-21): Studio reskins
// per active product rather than staying neutral, so each pill carries
// its product's accent color even when inactive; the active pill is
// filled solid. K Circle is a real destination already (it routes to
// its existing page) but its own Studio build hasn't started — marked
// "Soon" and inert rather than linking to a half-built page.
//
// §131 — WebMangal now has its own Studio shell (Overview/Analytics,
// `/mangal-studio/webmangal`), matching §114's original phased plan
// (Phase 2) and KaTube Studio's own per-product-shell pattern — the
// §130/§126 unified Content dashboard (`/mangal-studio/katube/content`,
// type-toggle) is still where WebMangal's actual content management
// lives and stays that way (not duplicated); the new shell's Overview
// links out to it rather than rebuilding it. Color corrected from a
// placeholder blue to WebMangal's real site accent (`--accent: #d97706`
// in globals.css) — the two products' own themed shells now both use
// their real brand colors, not one real + one placeholder.
export type StudioProduct = 'katube' | 'kcircle' | 'webmangal';

const PRODUCTS: { id: StudioProduct; label: string; color: string; href: string; live: boolean }[] = [
  { id: 'katube', label: 'KaTube', color: '#e11d48', href: '/mangal-studio/katube', live: true },
  { id: 'kcircle', label: 'K Circle', color: '#9333ea', href: '/mangal-studio/kcircle', live: false },
  { id: 'webmangal', label: 'WebMangal', color: '#d97706', href: '/mangal-studio/webmangal', live: true },
];

export default function ProductSwitcher({ active }: { active: StudioProduct }) {
  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      {PRODUCTS.map(p => {
        const isActive = p.id === active;
        const content = (
          <span
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '7px 14px', borderRadius: '999px', fontSize: '12.5px', fontWeight: 700,
              border: `1px solid ${isActive ? p.color : 'var(--border-color)'}`,
              background: isActive ? p.color : 'transparent',
              color: isActive ? '#fff' : 'var(--text-secondary)',
              cursor: p.live ? 'pointer' : 'default',
              opacity: p.live ? 1 : 0.55,
            }}
          >
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: isActive ? '#fff' : p.color, flexShrink: 0 }} />
            {p.label}
            {!p.live && <span style={{ fontSize: '10px', fontWeight: 800, opacity: 0.85 }}>· SOON</span>}
          </span>
        );
        if (!p.live) return <span key={p.id}>{content}</span>;
        return p.live && !isActive ? (
          <a key={p.id} href={p.href} style={{ textDecoration: 'none' }}>{content}</a>
        ) : (
          <span key={p.id}>{content}</span>
        );
      })}
    </div>
  );
}
