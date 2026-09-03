import { expect, test } from '@playwright/test';

// ── LIVE TESTING (read-only smoke against the deployed Workers URL).
// Run with: npm run test:live
// Never writes to the production database — only GETs and page renders. ──

test.describe('live: deployed platform smoke', () => {
  test('landing page is up and branded', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    const resp = await page.goto('/', { waitUntil: 'load', timeout: 45_000 });
    expect(resp?.status()).toBe(200);
    expect(await page.title()).toMatch(/MANGAL/i);
    expect(errors).toEqual([]);
  });

  test('/WebMangal is live with the WebMangal logo + MANGAL title', async ({ page }) => {
    const resp = await page.goto('/WebMangal', { waitUntil: 'load', timeout: 45_000 });
    expect(resp?.status()).toBe(200);
    await expect(page.locator('img[src*="webmangal-logo.png"]').first()).toBeVisible();
    expect(await page.title()).toMatch(/MANGAL/i);
  });

  test('/WebMangal/books and /WebMangal/songs respond 200', async ({ request }) => {
    expect((await request.get('/WebMangal/books')).status()).toBe(200);
    expect((await request.get('/WebMangal/songs')).status()).toBe(200);
  });

  test('recommendation engine answers anonymously (read-only GET)', async ({ request }) => {
    const resp = await request.get('/api/recommendations');
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body).toHaveProperty('forYou');
    expect(body).toHaveProperty('personalized');
  });

  test('brand assets resolve on the deployed domain', async ({ request }) => {
    for (const asset of ['/favicon.ico', '/icon.png', '/webmangal-logo.png', '/og-image.jpg']) {
      expect((await request.get(asset)).status(), `${asset}`).toBe(200);
    }
  });

  test('legacy /home redirect still consolidates to /WebMangal', async ({ page }) => {
    await page.goto('/home', { waitUntil: 'load' });
    expect(new URL(page.url()).pathname).toBe('/WebMangal');
  });

  test('unknown media keys 404 (no storage exception leaks)', async ({ request }) => {
    const resp = await request.get('/api/media/does/not/exist.jpg');
    expect(resp.status()).toBe(404);
  });
});
