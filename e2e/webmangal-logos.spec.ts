import { expect, test } from '@playwright/test';
import {
  AUTH_GATED_PAGES,
  PUBLIC_PAGES,
  dismissConsentBanner,
  expectPageHealthy,
} from './helpers';

// ── Logo & Brand Testing ──
// (1) Every PUBLIC WebMangal page carries the WEBMANGAL logo image, named
//     "WebMangal" (alt text + visible wordmark).
// (2) Auth-gated pages route to the MANGAL-branded sign-in screen.
// (3) The MANGAL brand stays present everywhere: titles, the "powered by
//     MANGAL" badge, and the MANGAL mark assets resolve correctly.

const LOGO_PAGES = PUBLIC_PAGES; // pages an anonymous visitor actually sees

test.describe('WebMangal logo with its name on every page', () => {
  for (const path of LOGO_PAGES) {
    test(`${path} shows the WebMangal logo + wordmark`, async ({ page }) => {
      await expectPageHealthy(page, path);
      const logo = page
        .locator('img[src*="webmangal-logo.png"]')
        .filter({ visible: true })
        .first();
      await expect(logo, `${path} must render a visible WebMangal logo`).toBeVisible();
      await expect(logo, 'logo alt must be the product name').toHaveAttribute(
        'alt',
        'WebMangal',
      );
      await expect(
        page.getByText('WebMangal', { exact: true }).first(),
        `${path} must show the "WebMangal" wordmark next to its logo`,
      ).toBeVisible();
    });
  }
});

test.describe('auth-gated pages keep the brand at the gate', () => {
  for (const path of AUTH_GATED_PAGES) {
    test(`${path} shows the MANGAL-branded sign-in screen when anonymous`, async ({
      page,
    }) => {
      await expectPageHealthy(page, path);
      expect(new URL(page.url()).pathname).toBe('/login');
      // The login screen carries the MANGAL mark + name (MangalLogo).
      const mangalBrand = page.locator('img[alt="MANGAL"]').first();
      await expect(mangalBrand).toBeVisible();
      await expect(mangalBrand).toHaveAttribute('src', /icon\.png$/);
    });
  }
});

test.describe('MANGAL logo + MANGAL title brand', () => {
  test('/WebMangal is badged "powered by MANGAL" under the brand', async ({ page }) => {
    await page.goto('/WebMangal', { waitUntil: 'load' });
    await expect(page.getByText(/powered by MANGAL/i).first()).toBeVisible();
  });

  test('/WebMangal/home footer pairs the WebMangal logo with the WebMangal name', async ({
    page,
  }) => {
    await page.goto('/WebMangal/home', { waitUntil: 'load' });
    const footerLogo = page.locator('footer img[src*="webmangal-logo.png"]').first();
    await expect(footerLogo).toBeVisible();
    await expect(footerLogo).toHaveAttribute('alt', 'WebMangal');
    await expect(page.locator('footer').getByText('WebMangal', { exact: true })).toBeVisible();
  });

  test('the official MANGAL mark (/icon.png) is served for the company brand', async ({
    page,
  }) => {
    const resp = await page.request.get('/icon.png');
    expect(resp.status()).toBe(200);
    expect(resp.headers()['content-type']).toContain('image/png');
  });

  test('brand assets resolve: favicon.ico, og-image.jpg, webmangal-logo.png', async ({
    page,
  }) => {
    for (const asset of ['/favicon.ico', '/og-image.jpg', '/webmangal-logo.png']) {
      const resp = await page.request.get(asset);
      expect(resp.status(), `${asset} must resolve`).toBe(200);
    }
  });

  test('every WebMangal page title carries the MANGAL brand', async ({ page }) => {
    for (const path of [...PUBLIC_PAGES.slice(0, 6), ...AUTH_GATED_PAGES]) {
      await page.goto(path, { waitUntil: 'load' });
      // toHaveTitle auto-retries: the auth-gated pages redirect client-side
      // (window.location.href = '/login'), during which the <title> is
      // transiently reset to "" — a one-shot page.title() read races that.
      await expect(page, `${path} <title> must carry MANGAL`).toHaveTitle(/MANGAL/);
    }
  });
});

