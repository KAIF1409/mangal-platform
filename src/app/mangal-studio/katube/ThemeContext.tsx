'use client';

import { createContext, useContext } from 'react';

export interface KatubeStudioTheme {
  isLight: boolean;
  setIsLight: (v: boolean) => void;
}

export const KatubeStudioThemeContext = createContext<KatubeStudioTheme>({
  isLight: false,
  setIsLight: () => {},
});

export function useKatubeStudioTheme() {
  return useContext(KatubeStudioThemeContext);
}
