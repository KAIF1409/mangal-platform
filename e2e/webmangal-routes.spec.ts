import { expect, test } from '@playwright/test';
import {
  AUTH_GATED_PAGES,
  PUBLIC_PAGES,
  expectPageHealthy,
} from './helpers';

// ── Route Testing: every WebMangal page must respond 200, render, carry the
// MANGAL title brand, and never crash for an anonymous visitor. Auth-gated
// pages must route anonymous visitors to /login instead. ──

test.describe('WebMangal public route availability', () => {
  for (const path of PUBLIC_PAGES) {
    test(`route ${path} responds and renders`, async ({ page }) => {
      const resp = await expectPageHealthy(page, path);
      expect(resp?.status(), `${path} must be 200`).toBe(200);
      // Title brand continuity — every page title carries the MANGAL brand.
      const title = await page.title();
      expect(title, `${path} <title>`).toMatch(/MANGAL/);
      // The page must render its own content, not the login screen.
      await expect(page.getByRole('heading', { name: 'Welcome back' })).toHaveCount(0);
    });
  }

  test('unknown routes render the 404 page (not a server error)', async ({ page }) => {
    const resp = await page.goto('/WebMangal/this-route-does-not-exist-xyz');
    expect(resp?.status()).toBe(404);
  });

  test('/WebMangal carries the Browse metadata title', async ({ page }) => {
    await page.goto('/WebMangal', { waitUntil: 'load' });
    expect(await page.title()).toBe('Browse | MANGAL');
  });
});

test.describe('WebMangal auth-gated routes (anonymous visitors)', () => {
  for (const path of AUTH_GATED_PAGES) {
    test(`${path} routes anonymous readers to the sign-in screen`, async ({ page }) => {
      await expectPageHealthy(page, path);
      // Songs/upload gates via a client-side async auth check, so the URL
      // assertion auto-retries instead of racing the redirect.
      await expect(page, `${path} must gate anonymously`).toHaveURL(/\/login/);
      await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
      // The gate must stay MANGAL-branded.
      expect(await page.title()).toMatch(/MANGAL/i);
    });
  }
});

