// @vitest-environment node
//
// Shared role helpers — the single source of truth for "who can see creator
// tools" (src/app/lib/auth/roles.ts). These assertions are the app-side half
// of the RLS contract: whatever canManageSeries() lets a viewer DO, the
// matching Postgres policy must also allow, or the UI offers an action the
// database then refuses ("new row violates row-level security policy for
// table chapters").
//
// Regression note (2026-09-24): a developer-role account could open
// "+ Add Chapter" on a series it did not own (canManageSeries returns true
// for developers by design) but the live chapters/pages INSERT policies only
// tested series.creator_id = auth.uid(), so the very first write of the
// publish pipeline failed. Fixed in
// supabase/migrations/20260924120000_admin_write_access_chapters_pages.sql.

import { describe, expect, it } from 'vitest';
import {
  canManageSeries,
  hasCreatorAccess,
  isDeveloperRole,
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

describe('canManageSeries', () => {
  it('lets a creator manage a series they own', () => {
    expect(canManageSeries('creator', true)).toBe(true);
  });

  it('stops a creator from managing someone else\u2019s series', () => {
    expect(canManageSeries('creator', false)).toBe(false);
  });

  it('lets a developer manage any series, owned or not', () => {
    // Deliberate: roles.ts documents this as the support/debugging override,
    // and it is why the DB needs a matching developer write policy.
    expect(canManageSeries('developer', false)).toBe(true);
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

  it('allows a developer on a series it does not own (empty reason)', () => {
    // The exact case from the incident: this must stay allowed here, because
    // the migration above grants the matching DB policy. Blocking it here
    // instead would hide the developer override the app is built around.
    expect(seriesWriteBlockReason('developer', false, true)).toBe('');
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
      seriesWriteBlockReason('reader', true, true),
      seriesWriteBlockReason(null, false, false),
    ];
    for (const reason of blocked) expect(reason.length).toBeGreaterThan(0);
  });
});
