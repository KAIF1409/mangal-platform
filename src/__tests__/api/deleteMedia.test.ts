// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), delete: vi.fn(), purge: vi.fn() }));
vi.mock('@/app/lib/auth/authedServerClient', () => ({ requireUser: mocks.requireUser }));
vi.mock('@/app/lib/media/r2', () => ({ getMediaBucket: () => ({ delete: mocks.delete }) }));
vi.mock('@/app/lib/media/cachePurge', () => ({ purgeMediaEdgeCache: mocks.purge }));
import { POST } from '@/app/api/delete-media/route';

const call = (body: unknown) => POST(new NextRequest('https://mangal.test/api/delete-media', {
  method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
}));
beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireUser.mockResolvedValue({ userId: 'owner' });
});

describe('delete media request validation', () => {
  it.each([null, [], 'text', {}, { paths: 'x' }, { paths: [null] }, { paths: [''] }])('rejects malformed payload %j without deleting', async (body) => {
    expect((await call(body)).status).toBe(400);
    expect(mocks.delete).not.toHaveBeenCalled();
  });
  it('requires authentication', async () => {
    mocks.requireUser.mockResolvedValue(null);
    expect((await call({ paths: [] })).status).toBe(401);
  });
  it('rejects foreign files atomically', async () => {
    expect((await call({ paths: ['books/covers/owner-a.png', 'books/covers/other-a.png'] })).status).toBe(403);
    expect(mocks.delete).not.toHaveBeenCalled();
  });
  it('deduplicates owned files and purges them', async () => {
    const path = 'books/covers/owner-a.png';
    const res = await call({ paths: [path, path] });
    expect(await res.json()).toEqual({ ok: true, deleted: 1 });
    expect(mocks.delete).toHaveBeenCalledWith([path]);
    expect(mocks.purge).toHaveBeenCalledWith('https://mangal.test', [path]);
  });
  it('accepts an empty list', async () => {
    expect(await (await call({ paths: [] })).json()).toEqual({ ok: true, deleted: 0 });
  });
  it('rejects oversized batches before storage calls', async () => {
    expect((await call({ paths: Array(1001).fill('books/covers/owner-a.png') })).status).toBe(400);
    expect(mocks.delete).not.toHaveBeenCalled();
  });
});