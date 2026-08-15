'use client';

// Shared product-scope switcher for the /dashboard/* tabs — see CONTEXT.md
// §43. One dashboard shell per tab; this switcher scopes the data shown
// *inside* the tab rather than navigating anywhere (Notion-workspace-switcher
// pattern, not a router). Each tab owns its own state for the selected
// scope and passes it down to whatever query/copy needs to branch on it.

import { Sparkles, BookOpen, PlaySquare, Users2, type LucideIcon } from 'lucide-react';

export type ProductScope = 'all' | 'webmangal' | 'katube' | 'kcircle';

const OPTIONS: { value: ProductScope; label: string; icon: LucideIcon }[] = [
  { value: 'all', label: 'All', icon: Sparkles },
  { value: 'webmangal', label: 'WebMangal', icon: BookOpen },
  { value: 'katube', label: 'KaTube', icon: PlaySquare },
  { value: 'kcircle', label: 'Kalpana Circle', icon: Users2 },
];

export default function ProductScopeSwitcher({
  value,
  onChange,
  // Tabs that are naturally cross-product (Academy, Nova) can hide the
  // "All" pill's emphasis or drop options they don't branch on — pass a
  // subset here. Defaults to every option.
  options,
}: {
  value: ProductScope;
  onChange: (scope: ProductScope) => void;
  options?: ProductScope[];
}) {
  const visible = options
    ? OPTIONS.filter((o) => options.includes(o.value))
    : OPTIONS;

  return (
    <div
      style={{
        display: 'flex',
        gap: '6px',
        padding: '4px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: '10px',
        width: 'fit-content',
        marginBottom: '24px',
        flexWrap: 'wrap',
      }}
    >
      {visible.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              borderRadius: '7px',
              border: 'none',
              background: active ? 'var(--accent)' : 'transparent',
              color: active ? '#fff' : 'var(--text-secondary)',
              fontWeight: 700,
              fontSize: '12.5px',
              cursor: 'pointer',
              transition: 'background 0.15s ease, color 0.15s ease',
            }}
          >
            <opt.icon size={14} strokeWidth={2} />
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
