'use client';

import { createContext, useContext } from 'react';

export interface WebMangalStudioTheme {
  isLight: boolean;
  setIsLight: (v: boolean) => void;
}

export const WebMangalStudioThemeContext = createContext<WebMangalStudioTheme>({
  isLight: false,
  setIsLight: () => {},
});

export function useWebMangalStudioTheme() {
  return useContext(WebMangalStudioThemeContext);
}
