import { beforeEach, describe, expect, it } from 'vitest';
import { getBackNav, recordProductVisit } from '@/app/lib/backNav';

// backNav drives the "Back to <product>" link on /WebMangal/creator/[username]
// — the page every product links into. sessionStorage is available in jsdom.
beforeEach(() => {
  sessionStorage.clear();
});

describe('recordProductVisit / getBackNav — cross-product back navigation', () => {
  it('records a KaTube visit', () => {
    recordProductVisit('/katube/watch/abc');
    const nav = getBackNav();
    expect(nav.href).toBe('/katube');
    expect(nav.label).toBe('Back to KaTube');
  });

  it('records a Kalpana Circle visit', () => {
    recordProductVisit('/kalpana-circle/feed');
    const nav = getBackNav();
    expect(nav.href).toBe('/kalpana-circle');
    expect(nav.label).toBe('Back to Kalpana Circle');
  });

  it('falls back to "Back to Browse" after browsing WebMangal pages', () => {
    recordProductVisit('/katube');
    recordProductVisit('/WebMangal/series/1');
    expect(getBackNav()).toEqual({ href: '/', label: 'Back to Browse' });
  });

  it('ignores a stored value that is not a real product home', () => {
    sessionStorage.setItem('mangal_last_product', '/evil');
    expect(getBackNav()).toEqual({ href: '/', label: 'Back to Browse' });
  });

  it('matches product homes on prefix, not exact equality', () => {
    recordProductVisit('/kalpana-circle/groups/g1/chat');
    expect(getBackNav().href).toBe('/kalpana-circle');
  });

  it('survives sessionStorage being unavailable', () => {
    const original = window.sessionStorage;
    // jsdom allows replacing the storage object reference on window.
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError: storage disabled');
      },
    });
    expect(() => recordProductVisit('/katube')).not.toThrow();
    expect(() => getBackNav()).not.toThrow();
    expect(getBackNav()).toEqual({ href: '/', label: 'Back to Browse' });
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: original,
    });
  });
});
