import { defineConfig, devices } from '@playwright/test';

// WebMangal E2E — two projects:
//   local-chromium : full suites against a production build (`next build` +
//                    `next start`, auto-started by webServer on :3100).
//   live-smoke     : read-only smoke against the deployed Workers URL.
const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${PORT}`;
const liveOnly = process.argv.some((a) => a === '--project=live-smoke');

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'local-chromium',
      testIgnore: /live[/\\]live-smoke\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'live-smoke',
      testMatch: /live[/\\]live-smoke\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.LIVE_BASE_URL ?? 'https://mangal-platform.mangak.workers.dev',
      },
    },
  ],
  webServer: liveOnly
    ? undefined
    : {
        command: `npm run start -- --port ${PORT}`,
        url: `${baseURL}/`,
        reuseExistingServer: true,
        timeout: 240_000,
      },
});
