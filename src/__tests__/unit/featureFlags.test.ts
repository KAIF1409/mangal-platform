import { describe, expect, it, vi } from 'vitest';

// Module-level const → both branches are verified through re-import with a
// reset module registry (vi.resetModules + dynamic import).
const load = async () => {
  vi.resetModules();
  return import('@/app/lib/payments/featureFlags');
};

describe('GLOBAL_PAYMENTS_ENABLED — global payments feature flag', () => {
  it('is OFF by default (direct-UPI-only checkout)', async () => {
    vi.stubEnv('NEXT_PUBLIC_ENABLE_GLOBAL_PAYMENTS', '');
    const { GLOBAL_PAYMENTS_ENABLED } = await load();
    expect(GLOBAL_PAYMENTS_ENABLED).toBe(false);
  });

  it('turns ON only for the literal string "true"', async () => {
    vi.stubEnv('NEXT_PUBLIC_ENABLE_GLOBAL_PAYMENTS', 'true');
    const { GLOBAL_PAYMENTS_ENABLED } = await load();
    expect(GLOBAL_PAYMENTS_ENABLED).toBe(true);
  });

  it('treats any other value ("1", "yes", "TRUE") as OFF', async () => {
    vi.stubEnv('NEXT_PUBLIC_ENABLE_GLOBAL_PAYMENTS', '1');
    const a = await load();
    expect(a.GLOBAL_PAYMENTS_ENABLED).toBe(false);

    vi.stubEnv('NEXT_PUBLIC_ENABLE_GLOBAL_PAYMENTS', 'TRUE');
    const b = await load();
    expect(b.GLOBAL_PAYMENTS_ENABLED).toBe(false);

    vi.unstubAllEnvs();
  });
});
