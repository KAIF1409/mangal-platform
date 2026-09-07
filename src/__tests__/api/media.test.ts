// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ get: vi.fn(), match: vi.fn(), put: vi.fn(), waitUntil: vi.fn() }));
vi.mock('@/app/lib/media/r2', () => ({ getMediaBucket: () => ({ get: mocks.get }) }));
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: () => ({ ctx: { waitUntil: mocks.waitUntil } }) }));
import { GET } from '@/app/api/media/[...path]/route';

function call(path: string[]) {
  return GET(new NextRequest(`https://mangal.test/api/media/${path.join('/')}`), { params: Promise.resolve({ path }) });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('caches', { default: { match: mocks.match, put: mocks.put } });
  mocks.get.mockImplementation(async () => ({ body: new Response('image').body, size: 5, etag: 'etag', httpMetadata: { contentType: 'image/png' } }));
  mocks.put.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());

describe('public media security boundary', () => {
  it.each([['books', 'files', 'paid.pdf'], ['books', 'files', 'draft.epub']])('denies private file %j before cache or storage lookup', async (...path) => {
    mocks.match.mockResolvedValue(new Response('cached private document'));
    const res = await call(path);
    expect(res.status).toBe(404);
    expect(mocks.match).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('still streams public covers', async () => {
    const res = await call(['books', 'covers', 'cover.png']);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('image');
    expect(mocks.put).toHaveBeenCalled();
  });

  it('can serve storage without the Workers Cache API in a Node test runtime', async () => {
    vi.stubGlobal('caches', undefined);
    const res = await call(['manga-pages', 'chapters', 'page.png']);
    expect(await res.text()).toBe('image');
  });

  it('falls back to storage when cache lookup fails', async () => {
    mocks.match.mockRejectedValue(new Error('Cache unavailable'));
    expect((await call(['books', 'covers', 'cover.png'])).status).toBe(200);
  });
});