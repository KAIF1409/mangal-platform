import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

// WebMangal QA suite — unit / component / API-layer tests.
// E2E (Playwright) lives in ./playwright.config.ts.
//
// jsdom is the default environment because most WebMangal logic touches
// browser storage (sessionStorage/localStorage); the few node-env suites
// (API route handlers, fs-based logo asset checks) opt out with a
// `// @vitest-environment node` pragma at the top of the file.
export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/__tests__/**/*.{test,spec}.{ts,tsx}'],
    env: {
      // Deterministic placeholders — real secrets are never needed here:
      // every suite that hits Supabase mocks the client at module boundary.
      NEXT_PUBLIC_SUPABASE_URL: 'https://test-project.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    },
  },
});
