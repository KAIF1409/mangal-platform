'use client';

import { createContext, useContext } from 'react';

// KaTube dashboard is forced dark-by-default (maroon/red theme, matching
// the rest of KaTube — see app/katube/page.tsx's katubeDarkVars comment)
// with a light option, same pattern as every other KaTube page. Unlike
// those pages, this one's chrome (StudioSidebar) is rendered by
// layout.tsx as a sibling of page.tsx's content rather than inside it, so
// a single page-local `useState` can't reach both — this context is the
// bridge: layout.tsx owns the `isLight` state and applies the CSS-var
// override to the whole route shell (sidebar included), page.tsx reads/
// writes it through here so its <Navbar>'s ThemeToggle stays in sync.
export interface KatubeDashboardTheme {
  isLight: boolean;
  setIsLight: (v: boolean) => void;
}

export const KatubeDashboardThemeContext = createContext<KatubeDashboardTheme>({
  isLight: false,
  setIsLight: () => {},
});

export function useKatubeDashboardTheme() {
  return useContext(KatubeDashboardThemeContext);
}
