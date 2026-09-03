// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { checkRateLimit, getClientIp } from '@/app/lib/rateLimit';

const reqWith = (headers: Record<string, string>) =>
  new Request('http://localhost:3000/api/x', { headers }) as Request;

describe('getClientIp — rate-limit bucketing identity', () => {
  it('prefers cf-connecting-ip (Cloudflare edge) when present', () => {
    const req = reqWith({
      'cf-connecting-ip': '203.0.113.7',
      'x-forwarded-for': '10.0.0.1, 10.0.0.2',
    });
    expect(getClientIp(req as never)).toBe('203.0.113.7');
  });

  it('falls back to the FIRST x-forwarded-for hop, trimmed', () => {
    const req = reqWith({ 'x-forwarded-for': ' 198.51.100.9 , 10.0.0.2' });
    expect(getClientIp(req as never)).toBe('198.51.100.9');
  });

  it('returns "unknown" when no proxy headers exist', () => {
    expect(getClientIp(reqWith({}) as never)).toBe('unknown');
  });
});

describe('checkRateLimit — Postgres-backed limiter', () => {
  const makeClient = (impl: (...args: unknown[]) => unknown) =>
    ({ rpc: vi.fn(impl) }) as unknown as SupabaseClient;

  it('returns true when the rpc verdict is inside the rate', async () => {
    const client = makeClient(() => ({ data: true, error: null }));
    await expect(checkRateLimit(client, 'bucket', 10, 60)).resolves.toBe(true);
  });

  it('returns false when the rpc verdict says reject', async () => {
    const client = makeClient(() => ({ data: false, error: null }));
    await expect(checkRateLimit(client, 'bucket', 1, 60)).resolves.toBe(false);
  });

  it('FAILS OPEN when the limiter itself errors (never down the whole route)', async () => {
    const client = makeClient(() => ({ data: null, error: { message: 'rpc missing' } }));
    await expect(checkRateLimit(client, 'bucket', 10, 60)).resolves.toBe(true);
  });

  it('FAILS OPEN when the rpc call throws', async () => {
    const client = makeClient(() => {
      throw new Error('network down');
    });
    await expect(checkRateLimit(client, 'bucket', 10, 60)).resolves.toBe(true);
  });

  it('passes the bucket key and window to the rpc', async () => {
    const rpc = vi.fn(() => ({ data: true, error: null }));
    const client = { rpc } as unknown as SupabaseClient;
    await checkRateLimit(client, 'confirm-parent-consent:1.2.3.4', 10, 60);
    expect(rpc).toHaveBeenCalledWith('check_rate_limit', {
      p_bucket_key: 'confirm-parent-consent:1.2.3.4',
      p_max_events: 10,
      p_window_seconds: 60,
    });
  });
});
