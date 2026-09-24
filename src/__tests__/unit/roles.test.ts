// @vitest-environment node
//
// Shared role helpers — the single source of truth for "who can see creator
// tools" (src/app/lib/auth/roles.ts). These assertions are the app-side half
// of the RLS contract: whatever canManageSeries() lets a viewer DO, the
// matching Postgres policy must also allow, or the UI offers an action the
// database then refuses ("new row violates row-level security policy for
// table chapters").
//
// Regression (2026-09-24): a developer-role account was shown "+ Add Chapter",
// chapter Edit/Delete and Delete-series on a series it did NOT own, because
// canManageSeries() returned true for every developer regardless of
// series.creator_id. The live policies for chapters/pages/series are
// ownership-only, so the publish died on the first INSERT. Fix: ownership is
// the rule for every role (canManageSeries = creator toolset AND isOwner) —
// the DB was deliberately NOT widened to match the old UI.

import { describe, expect, it } from 'vitest';
import {
  canManageSeries,
  hasCreatorAccess,
  isDeveloperRole,
  ownsSeries,
  seriesWriteBlockReason,
} from '@/app/lib/auth/roles';

describe('hasCreatorAccess', () => {
  it('is true for creator and developer roles', () => {
    expect(hasCreatorAccess('creator')).toBe(true);
    expect(hasCreatorAccess('developer')).toBe(true);
  });

  it('is false for readers and for a missing role', () => {
    expect(hasCreatorAccess('reader')).toBe(false);
    expect(hasCreatorAccess(null)).toBe(false);
    expect(hasCreatorAccess(undefined)).toBe(false);
  });
});

describe('isDeveloperRole', () => {
  it('is true only for the developer override account', () => {
    expect(isDeveloperRole('developer')).toBe(true);
    expect(isDeveloperRole('creator')).toBe(false);
    expect(isDeveloperRole('reader')).toBe(false);
    expect(isDeveloperRole(null)).toBe(false);
  });
});

describe('ownsSeries', () => {
  it('is true only when the viewer is the series creator_id', () => {
    expect(ownsSeries('u-1', 'u-1')).toBe(true);
  });

  it('is false for every other account, developer accounts included', () => {
    // Roles never enter this comparison — that is the whole point.
    expect(ownsSeries('dev-account', 'u-1')).toBe(false);
    expect(ownsSeries('creator-2', 'u-1')).toBe(false);
  });

  it('is false for a signed-out viewer or a series with no creator_id', () => {
    expect(ownsSeries(null, 'u-1')).toBe(false);
    expect(ownsSeries(undefined, 'u-1')).toBe(false);
    expect(ownsSeries('u-1', null)).toBe(false);
    expect(ownsSeries('u-1', undefined)).toBe(false);
  });
});

describe('canManageSeries', () => {
  it('lets a creator manage a series they own', () => {
    expect(canManageSeries('creator', true)).toBe(true);
  });

  it('stops a creator from managing someone else\u2019s series', () => {
    expect(canManageSeries('creator', false)).toBe(false);
  });

  it('does NOT let a developer manage a series it does not own', () => {
    // The exact regression from 2026-09-24 — this used to be `true`, which is
    // what put "+ Add Chapter" / chapter Edit-Delete in front of a non-author
    // while the ownership-only INSERT/UPDATE policies refused the write.
    expect(canManageSeries('developer', false)).toBe(false);
  });

  it('still lets a developer manage a series it created itself', () => {
    expect(canManageSeries('developer', true)).toBe(true);
  });

  it('never lets a reader manage a series, even one they own', () => {
    expect(canManageSeries('reader', true)).toBe(false);
    expect(canManageSeries(null, true)).toBe(false);
  });
});

describe('seriesWriteBlockReason', () => {
  it('allows the series owner (empty reason)', () => {
    expect(seriesWriteBlockReason('creator', true, true)).toBe('');
  });

  it('allows a developer on a series it created itself (empty reason)', () => {
    expect(seriesWriteBlockReason('developer', true, true)).toBe('');
  });

  it('blocks a developer on a series it does not own, like any other non-owner', () => {
    // The incident case. The DB has no developer bypass for chapters/pages/
    // series writes, so the UI must not pretend there is one.
    const reason = seriesWriteBlockReason('developer', false, true);
    expect(reason).toMatch(/different creator account/i);
    expect(reason).not.toMatch(/row-level security/i);
  });

  it('asks a signed-out viewer to log back in, before any ownership check', () => {
    const reason = seriesWriteBlockReason(null, false, false);
    expect(reason).toMatch(/session has expired/i);
    expect(reason).toMatch(/log in/i);
  });

  it('explains that the series belongs to another account', () => {
    const reason = seriesWriteBlockReason('creator', false, true);
    expect(reason).toMatch(/different creator account/i);
    expect(reason).not.toMatch(/row-level security/i);
  });

  it('blocks a reader who owns the series (no creator access)', () => {
    const reason = seriesWriteBlockReason('reader', true, true);
    expect(reason).toMatch(/different creator account/i);
  });

  it('never returns an empty string for a genuinely blocked write', () => {
    const blocked = [
      seriesWriteBlockReason('creator', false, true),
      seriesWriteBlockReason('developer', false, true),
      seriesWriteBlockReason('reader', true, true),
      seriesWriteBlockReason(null, false, false),
    ];
    for (const reason of blocked) expect(reason.length).toBeGreaterThan(0);
  });

  it('agrees with the authoring gate the series page renders from', () => {
    // The two helpers must never disagree: "" (allowed) exactly when
    // canManageSeries(...) is true. If they ever drift, the page shows
    // authoring controls for a write the upload flow then refuses.
    const cases: Array<[Parameters<typeof canManageSeries>[0], boolean]> = [
      ['creator', true], ['creator', false],
      ['developer', true], ['developer', false],
      ['reader', true], ['reader', false],
      [null, true], [null, false],
    ];
    for (const [role, isOwner] of cases) {
      expect(seriesWriteBlockReason(role, isOwner, true) === '').toBe(canManageSeries(role, isOwner));
    }
  });
});
