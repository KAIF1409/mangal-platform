import { describe, expect, it } from 'vitest';
import {
  BANNED_ACCOUNT_COPY,
  CONSENT_VERSION,
  PARENT_CONSENT_PENDING_COPY,
  canTrackForPersonalization,
  isMinor,
  isPlausibleDateOfBirth,
} from '@/app/lib/compliance/dpdp';

const today = new Date();
const ageAt = (years: number, dayOffset = 0) =>
  new Date(today.getFullYear() - years, today.getMonth(), today.getDate() + dayOffset);

describe('isMinor — DPDP Act 2023 "child" boundary (<18)', () => {
  it('a user born exactly 18 years ago TODAY is NOT a minor', () => {
    expect(isMinor(ageAt(18))).toBe(false);
  });

  it('a user born one day after that boundary IS a minor', () => {
    expect(isMinor(ageAt(18, 1))).toBe(true);
  });

  it('an adult is not a minor', () => {
    expect(isMinor(ageAt(30))).toBe(false);
    expect(isMinor(ageAt(45, -10))).toBe(false);
  });

  it('a young teen is a minor', () => {
    expect(isMinor(ageAt(13))).toBe(true);
  });

  it('fails closed on an invalid DOB (treated as not-a-minor, no crash)', () => {
    expect(isMinor('not-a-date')).toBe(false);
  });
});

describe('isPlausibleDateOfBirth — input sanity guard', () => {
  it('accepts a normal DOB', () => {
    expect(isPlausibleDateOfBirth(ageAt(25))).toBe(true);
  });

  it('rejects a future date', () => {
    const future = new Date(today.getFullYear() + 1, 0, 1);
    expect(isPlausibleDateOfBirth(future)).toBe(false);
  });

  it('rejects an implausibly old date (>120 years)', () => {
    expect(isPlausibleDateOfBirth(ageAt(130))).toBe(false);
  });

  it('rejects invalid input', () => {
    expect(isPlausibleDateOfBirth('nope')).toBe(false);
  });
});

describe('canTrackForPersonalization — minor behavioral-tracking gate', () => {
  it('never tracks without a profile (fail closed)', () => {
    expect(canTrackForPersonalization(null)).toBe(false);
  });

  it('never tracks a minor', () => {
    expect(canTrackForPersonalization({ is_minor: true })).toBe(false);
  });

  it('tracks a confirmed adult', () => {
    expect(canTrackForPersonalization({ is_minor: false })).toBe(true);
  });
});

describe('consent versioning + UX copy', () => {
  it('ships a CONSENT_VERSION that the consent banner keys off', () => {
    expect(CONSENT_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('minor-pending and banned copy are distinct screens (§144 regression guard)', () => {
    expect(PARENT_CONSENT_PENDING_COPY.title).not.toBe(BANNED_ACCOUNT_COPY.title);
    expect(BANNED_ACCOUNT_COPY.title).toContain('suspended');
  });
});
