import { expect, test } from '@playwright/test';
import { expectPageHealthy } from './helpers';

// ── Redirect Testing: 13 legacy routes were permanently moved under the
// /WebMangal namespace (next.config.ts redirects). Old bookmarks, shared
// links, and search-engine URLs must keep working. ──

const REDIRECTS: { from: string; to: string }[] = [
  { from: '/home', to: '/WebMangal' },
  // Next.js preserves the original `?q=` param when applying a query-rewrite
  // redirect, so `/search?q=ramayana` lands on
  // `/WebMangal/search?q=ramayana&keyword=ramayana` — the legacy keyword
  // still reaches the new search route (asserted below as a substring).
  { from: '/search?q=ramayana', to: '/WebMangal/search' },
  { from: '/search', to: '/WebMangal' },
  { from: '/series/abc123', to: '/WebMangal/series/abc123' },
  { from: '/read/ch-9', to: '/WebMangal/read/ch-9' },
  { from: '/bookmarks', to: '/WebMangal/bookmarks' },
  { from: '/history', to: '/WebMangal/history' },
  { from: '/library', to: '/WebMangal/library' },
  { from: '/rankings', to: '/WebMangal/rankings' },
  { from: '/tags', to: '/WebMangal/tags' },
  { from: '/tags/mythology', to: '/WebMangal/tags/mythology' },
  { from: '/upload', to: '/WebMangal/upload' },
  { from: '/creator/someone', to: '/WebMangal/creator/someone' },
];

test.describe('legacy → /WebMangal permanent redirects', () => {
  for (const { from, to } of REDIRECTS) {
    test(`${from} → ${to}`, async ({ page }) => {
      await page.goto(from, { waitUntil: 'load' });
      const actual = new URL(page.url()).pathname + new URL(page.url()).search;
      expect(actual).toContain(to);
      // The /search legacy `?q=` must be remapped onto the new `?keyword=`
      // param so the new search route actually runs the query.
      if (from.startsWith('/search?q=')) {
        expect(new URL(page.url()).search).toContain('keyword=ramayana');
      }
    });
  }

  test('redirects are PERMANENT (308) so caches/SEO consolidate', async ({ request }) => {
    const resp = await request.get('/home', { maxRedirects: 0 });
    expect([301, 308]).toContain(resp.status());
  });

  test('the redirect destination actually renders (not just a URL change)', async ({ page }) => {
    await expectPageHealthy(page, '/home');
    expect(new URL(page.url()).pathname).toBe('/WebMangal');
  });
});
