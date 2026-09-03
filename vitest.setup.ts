import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';
import React from 'react';

// jsdom cannot run Next's image optimizer — render next/image as a plain
// <img> carrying the same src/alt so branding assertions still work.
vi.mock('next/image', () => ({
  default: (props: { src?: unknown; alt?: string; [key: string]: unknown }) => {
    const { src, alt = '', ...rest } = props;
    const resolved =
      typeof src === 'string' ? src : ((src as { src?: string } | null)?.src ?? '');
    return React.createElement('img', { src: resolved, alt, ...rest });
  },
}));

// Router hooks used across WebMangal components. The mock object is shared,
// so tests can grab the same spies via useRouter() from 'next/navigation'
// and assert push()/replace() calls.
const navMocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => navMocks,
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

export {};
