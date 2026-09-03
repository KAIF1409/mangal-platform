// @vitest-environment node
// SSR-safety contract: on the server (no window/sessionStorage) the helpers
// must no-op / return the default instead of throwing during prerender.
import { describe, expect, it } from 'vitest';
import { getBackNav, recordProductVisit } from '@/app/lib/backNav';

describe('backNav — SSR safety (node env, no window)', () => {
  it('recordProductVisit does nothing without a window', () => {
    expect(typeof window).toBe('undefined');
    expect(() => recordProductVisit('/katube')).not.toThrow();
  });

  it('getBackNav returns the default without a window', () => {
    expect(getBackNav()).toEqual({ href: '/', label: 'Back to Browse' });
  });
});
