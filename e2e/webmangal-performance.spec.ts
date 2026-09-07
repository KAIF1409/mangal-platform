import { test } from '@playwright/test';

// Opt-in lab measurements, not Lighthouse scores or field Core Web Vitals.
// Run with AUDIT_PERF=1 and --workers=1 against a production build.
test.describe('pre-launch performance measurements', () => {
  test.skip(process.env.AUDIT_PERF !== '1', 'opt-in performance audit');
  for (const mobile of [false, true]) {
    test(`${mobile ? 'mobile-4x-cpu-slow-network' : 'desktop'} lab metrics`, async ({ browser }, testInfo) => {
      test.setTimeout(180_000);
      const context = await browser.newContext({
        viewport: mobile ? { width: 375, height: 812 } : { width: 1440, height: 900 },
        isMobile: mobile, hasTouch: mobile,
      });
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      if (mobile) {
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        await cdp.send('Network.enable');
        await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200_000, uploadThroughput: 93_750 });
      }
      await page.addInitScript(() => {
        const metrics = { lcp: 0, cls: 0, longTaskMs: 0 };
        Object.assign(window, { auditMetrics: metrics });
        new PerformanceObserver(list => {
          for (const entry of list.getEntries()) metrics.lcp = entry.startTime;
        }).observe({ type: 'largest-contentful-paint', buffered: true });
        // Raw cumulative shift sum for this short navigation window (not a
        // field/session-window CLS implementation).
        new PerformanceObserver(list => {
          for (const entry of list.getEntries()) {
            const shift = entry as PerformanceEntry & { hadRecentInput: boolean; value: number };
            if (!shift.hadRecentInput) metrics.cls += shift.value;
          }
        }).observe({ type: 'layout-shift', buffered: true });
        new PerformanceObserver(list => {
          for (const entry of list.getEntries()) metrics.longTaskMs += Math.max(0, entry.duration - 50);
        }).observe({ type: 'longtask', buffered: true });
      });
      const baseURL = String(testInfo.project.use.baseURL);
      const paths = ['/', '/WebMangal', '/mangal-studio/webmangal'];
      if (process.env.AUDIT_CHAPTER_ID) paths.push(`/WebMangal/read/${process.env.AUDIT_CHAPTER_ID}`);
      const results = [];
      for (const path of paths) {
        const errors: string[] = [];
        const onError = (error: Error) => errors.push(error.message);
        page.on('pageerror', onError);
        await cdp.send('Network.clearBrowserCache');
        await page.goto(`${baseURL}${path}`, { waitUntil: 'load' });
        await page.waitForTimeout(5000);
        results.push(await page.evaluate(({ path, errors }) => {
          const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
          const metrics = (window as unknown as { auditMetrics: { lcp: number; cls: number; longTaskMs: number } }).auditMetrics;
          return { path, finalPath: location.pathname, ...metrics, ttfb: nav.responseStart - nav.requestStart,
            jsBytes: performance.getEntriesByType('resource').filter(e => e.name.includes('/_next/') && e.name.includes('.js')).reduce((sum, e) => sum + (e as PerformanceResourceTiming).encodedBodySize, 0),
            horizontalOverflow: document.documentElement.scrollWidth > innerWidth, errors };
        }, { path, errors }));
        page.off('pageerror', onError);
      }
      console.log('AUDIT_METRICS', JSON.stringify({ mobile, results, readerMeasured: !!process.env.AUDIT_CHAPTER_ID }));
      await testInfo.attach('performance.json', { body: JSON.stringify(results, null, 2), contentType: 'application/json' });
      await context.close();
    });
  }
});