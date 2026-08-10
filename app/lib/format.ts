// Shared formatters. formatViews was independently duplicated verbatim in
// at least 7 files (app/page.tsx, app/home/page.tsx, app/search/page.tsx,
// app/creator/[username]/page.tsx, app/library/page.tsx, app/bookmarks/page.tsx,
// app/tags/[slug]/page.tsx) — single source of truth now.

export function formatViews(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}
