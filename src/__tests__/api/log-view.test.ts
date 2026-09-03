// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const createClientMock = vi.hoisted(() => vi.fn());
vi.mock('@supabase/supabase-js', () => ({ createClient: createClientMock }));

const rpc = vi.fn();
createClientMock.mockReturnValue({ rpc });

const importRoute = async () => (await import('@/app/api/log-view/route')).POST;

const req = (body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest('http://localhost:3000/api/log-view', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

beforeEach(() => {
  rpc.mockReset();
  createClientMock.mockReturnValue({ rpc });
});

describe('POST /api/log-view — server-side view counter (SECURITY DEFINER rpc)', () => {
  it('increments views for a valid seriesId', async () => {
    rpc.mockResolvedValue({ error: null });
    const POST = await importRoute();
    const res = await POST(req({ seriesId: 'series-1' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith('increment_series_views', {
      series_id_input: 'series-1',
      country_input: null,
    });
  });

  it('passes the edge geo country code through (no IP ever stored)', async () => {
    rpc.mockResolvedValue({ error: null });
    const POST = await importRoute();
    await POST(req({ seriesId: 's' }, { 'x-vercel-ip-country': 'IN' }));
    expect(rpc).toHaveBeenCalledWith('increment_series_views', {
      series_id_input: 's',
      country_input: 'IN',
    });
  });

  it('400s when seriesId is missing or not a string', async () => {
    const POST = await importRoute();
    for (const bad of [{}, { seriesId: 42 }, { seriesId: null }]) {
      const res = await POST(req(bad));
      expect(res.status).toBe(400);
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it('500s when the rpc errors (surfaced verbatim for debugging)', async () => {
    rpc.mockResolvedValue({ error: { message: 'function not found' } });
    const POST = await importRoute();
    const res = await POST(req({ seriesId: 's' }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'function not found' });
  });

  it('400s on malformed JSON bodies', async () => {
    const POST = await importRoute();
    const res = await POST(req('{not-json'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid request' });
  });
});
