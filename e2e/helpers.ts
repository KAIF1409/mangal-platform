import { expect, type Page } from '@playwright/test';

// WebMangal pages that render their own content for an ANONYMOUS visitor.
export const PUBLIC_PAGES = [
  '/WebMangal',
  '/WebMangal/home',
  '/WebMangal/search',
  '/WebMangal/rankings',
  '/WebMangal/tags',
  '/WebMangal/books',
  '/WebMangal/songs',
  '/WebMangal/upload',
] as const;

// WebMangal pages that are AUTH-GATED: anonymous visitors are redirected to
// /login (verified against the shipped build — bookmarks/history/library and
// the songs upload flow route you to the sign-in screen).
export const AUTH_GATED_PAGES = [
  '/WebMangal/library',
  '/WebMangal/bookmarks',
  '/WebMangal/history',
  '/WebMangal/songs/upload',
] as const;

const CRASH_TEXTS = [
  'Application error: a client-side exception has occurred',
  'Internal Server Error',
];

/** Navigates and asserts: <500 status, no Next crash screen, no uncaught JS exceptions. */
export async function expectPageHealthy(page: Page, path: string) {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  const resp = await page.goto(path, { waitUntil: 'load', timeout: 45_000 });
  const status = resp?.status() ?? 0;
  expect(status, `HTTP status for ${path}`).toBeLessThan(500);
  const body = page.locator('body');
  for (const crash of CRASH_TEXTS) {
    await expect(body, `${path} must not show "${crash}"`).not.toContainText(crash);
  }
  expect(errors, `uncaught JS exceptions on ${path}`).toEqual([]);
  return resp;
}

/** Accepts (or declines) the DPDP consent banner if it is up, so journeys can interact. */
export async function dismissConsentBanner(page: Page, accept = true) {
  const dialog = page.locator('div[role="dialog"][aria-label="Cookie and data consent"]');
  if (await dialog.count()) {
    await dialog
      .getByRole('button', { name: accept ? 'Accept' : 'Decline' })
      .click({ timeout: 5_000 })
      .catch(() => undefined);
  }
}

/** First content link of a given shape, or null when the catalog is empty. */
export async function firstHrefOrNull(page: Page, selector: string): Promise<string | null> {
  const loc = page.locator(selector).first();
  if ((await loc.count()) === 0) return null;
  const href = await loc.getAttribute('href', { timeout: 10_000 });
  return href;
}
