import { expect, test } from '@playwright/test';

for (const width of [390, 1280]) {
  test(`Book Library guest discovery at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    // Deterministic catalog only; no writes or fixture creation on the live DB.
    await page.route('**/rest/v1/books?*', route => route.fulfill({ json: [{
      id: '00000000-0000-4000-8000-000000000001', title: 'A Quiet River',
      cover_image_url: null, file_type: 'epub', category: 'Fiction',
      status: 'published', publish_at: null,
    }] }));
    await page.route('**/rest/v1/book_vibes?*', route => route.fulfill({ status: 503, json: { message: 'Unavailable' } }));
    await page.goto('/WebMangal/books/library');
    await expect(page.getByRole('heading', { name: 'Your Book Library' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add A Quiet River to Up Next' })).toBeDisabled();
    await page.getByRole('button', { name: 'Cozy rainy day' }).click();
    // Text-filtered so an unrelated auth alert cannot trip strict mode.
    await expect(page.getByRole('alert').filter({ hasText: 'Mood Matcher is unavailable' })).toBeVisible();
    await page.getByRole('button', { name: 'All books', exact: true }).click();
    await expect(page.getByRole('link', { name: 'A Quiet River' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}