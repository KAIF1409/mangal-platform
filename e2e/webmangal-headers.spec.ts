import { expect, test } from '@playwright/test';

// ── Security Header Testing: next.config.ts applies these to EVERY route.
// They are a shipped product requirement (CSP, clickjacking, MIME sniffing,
// referrer + HSTS + permissions policy). ──

test.describe('security headers on WebMangal routes', () => {
  for (const path of ['/WebMangal', '/WebMangal/books', '/WebMangal/songs']) {
    test(`headers on ${path}`, async ({ request }) => {
      const resp = await request.get(path);
      expect(resp.status()).toBe(200);
      const h = resp.headers();

      expect(h['content-security-policy'], 'CSP present').toContain("default-src 'self'");
      expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
      expect(h['x-frame-options'], 'clickjacking guard').toBe('DENY');
      expect(h['x-content-type-options'], 'MIME sniffing guard').toBe('nosniff');
      expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect(h['strict-transport-security'], 'HSTS').toContain('max-age=');
      expect(h['permissions-policy']).toContain('camera=()');
    });
  }

  test('CSP allows the WebMangal AI Writer on-device lane (WebLLM WASM + HF CDNs)', async ({
    request,
  }) => {
    const resp = await request.get('/WebMangal');
    const csp = resp.headers()['content-security-policy'] ?? '';
    expect(csp).toContain("'wasm-unsafe-eval'"); // WebLLM's TVM WASM runtime
    expect(csp).toContain('https://*.hf.co'); // model weight downloads
    expect(csp).toContain('wss://*.supabase.co'); // realtime sockets
  });
});
