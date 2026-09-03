import { expect, test } from '@playwright/test';
import {
  dismissConsentBanner,
  expectPageHealthy,
  firstHrefOrNull,
} from './helpers';

// ── End-to-End user journeys across the integrated product. The catalog is
// read from the live database at runtime: if a surface has no content yet,
// that leg skips (the journeys assert navigation + rendering, not seed data). ──

test.describe('WebMangal reader journey', () => {
  test('browse → open a series → open a chapter', async ({ page }) => {
    await expectPageHealthy(page, '/WebMangal');
    await dismissConsentBanner(page);

    const seriesHref = await firstHrefOrNull(page, 'a[href^="/WebMangal/series/"]');
    test.skip(!seriesHref, 'no published series in the catalog yet');
    await expectPageHealthy(page, seriesHref!);
    await expect(page).toHaveURL(/\/WebMangal\/series\//);

    const chapterHref = await firstHrefOrNull(page, 'a[href^="/WebMangal/read/"]');
    if (chapterHref) {
      await expectPageHealthy(page, chapterHref);
      await expect(page).toHaveURL(/\/WebMangal\/read\//);
      // The reader must render something readable (images or prose).
      await expect(page.locator('body')).not.toBeEmpty();
    }
  });

  test('search route handles a keyword query without crashing', async ({ page }) => {
    await expectPageHealthy(page, '/WebMangal/search?keyword=the');
    await dismissConsentBanner(page);
    // Either results render or the explicit empty state shows — never a blank page.
    const body = page.locator('body');
    await expect(body).not.toBeEmpty();
  });
});

test.describe('WebMangal books journey', () => {
  test('books catalog → book detail (→ reader when available)', async ({ page }) => {
    await expectPageHealthy(page, '/WebMangal/books');
    await dismissConsentBanner(page);

    const bookHref = await firstHrefOrNull(page, 'a[href^="/WebMangal/books/"]');
    test.skip(!bookHref, 'no books in the catalog yet');
    await expectPageHealthy(page, bookHref!);

    const readHref = await firstHrefOrNull(page, 'a[href*="/read"]');
    if (readHref) await expectPageHealthy(page, readHref);
  });
});

test.describe('WebMangal songs journey', () => {
  test('songs catalog → song detail page', async ({ page }) => {
    await expectPageHealthy(page, '/WebMangal/songs');
    await dismissConsentBanner(page);

    const songHref = await firstHrefOrNull(page, 'a[href^="/WebMangal/songs/"]');
    if (!songHref || songHref === '/WebMangal/songs/upload') {
      test.skip(true, 'no songs in the catalog yet');
      return;
    }
    await expectPageHealthy(page, songHref);
    await expect(page).toHaveURL(/\/WebMangal\/songs\//);
  });
});

test.describe('MANGAL Assistant (platform-wide chatbot)', () => {
  test('launcher is present on WebMangal and opens the assistant panel', async ({ page }) => {
    await expectPageHealthy(page, '/WebMangal');
    // The DPDP consent banner (z-index 9999) overlays the launcher (z-index
    // 950) until dismissed — decline it first so the click lands.
    await dismissConsentBanner(page);
    const launcher = page.locator('.mchat-launcher');
    await expect(launcher, 'floating assistant launcher').toBeVisible();
    await launcher.click();
    await expect(
      page.locator('div[role="dialog"][aria-label="MANGAL Assistant chat"]'),
    ).toBeVisible();
    await expect(page.getByText('MANGAL Assistant')).toBeVisible();
  });

  test('assistant is also present on the browse, books, and songs routes', async ({ page }) => {
    for (const path of ['/WebMangal/books', '/WebMangal/songs', '/WebMangal/rankings']) {
      await expectPageHealthy(page, path);
      await expect(page.locator('.mchat-launcher'), `launcher on ${path}`).toBeVisible();
    }
  });
});

test.describe('mobile compatibility (repo convention: 320–768px)', () => {
  test.describe('375px (iPhone-class)', () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test('browse page renders the WebMangal brand and content at 375px', async ({ page }) => {
      await expectPageHealthy(page, '/WebMangal');
      // The desktop navbar's wordmark is intentionally hidden under 420px
      // (globals.css .mangal-shared-nav-brand-text), so pin the mobile nav's
      // brand block instead — it stays visible at every phone width.
      const brand = page
        .locator('.mangal-search-navbar-mobile a[href="/WebMangal"]')
        .first();
      await expect(brand).toBeVisible();
      await expect(brand.locator('img[alt="WebMangal"]')).toBeVisible();
      await expect(brand.getByText('WebMangal', { exact: true })).toBeVisible();
    });

    test('books and songs catalogs stay navigable at 375px', async ({ page }) => {
      await expectPageHealthy(page, '/WebMangal/books');
      await expectPageHealthy(page, '/WebMangal/songs');
    });
  });

  test.describe('320px (smallest supported)', () => {
    test.use({ viewport: { width: 320, height: 640 } });

    test('browse page renders usable content at 320px', async ({ page }) => {
      await expectPageHealthy(page, '/WebMangal');
      // Same scoping as the 375px case — the mobile nav brand block remains
      // visible while the desktop wordmark is hidden under 420px.
      const brand = page
        .locator('.mangal-search-navbar-mobile a[href="/WebMangal"]')
        .first();
      await expect(brand).toBeVisible();
      await expect(page.locator('body')).not.toBeEmpty();
    });

    test('books and songs catalogs stay navigable at 320px', async ({ page }) => {
      await expectPageHealthy(page, '/WebMangal/books');
      await expectPageHealthy(page, '/WebMangal/songs');
    });
  });
});
