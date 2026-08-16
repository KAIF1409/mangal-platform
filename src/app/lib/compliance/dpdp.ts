// lib/dpdp.ts
//
// Step 19 — DPDP Act 2023 + DPDP Rules 2025 helper functions.
// Pure functions only — no Supabase calls here, so this can be unit-tested
// and imported from both client and server code without pulling in a client.

/** Current consent-notice version. Bump this whenever the itemized data list
 *  in app/privacy/page.tsx materially changes, so existing users get re-prompted. */
export const CONSENT_VERSION = '2026-06-21';

/**
 * DPDP Act, 2023 defines anyone under 18 as a "child." This mirrors the
 * `is_minor` generated column in Postgres so client-side checks (e.g. right
 * after the DOB field is typed, before the row is even saved) match server
 * truth exactly — same boundary, same "exactly 18 today is NOT a minor" rule.
 */
export function isMinor(dateOfBirth: string | Date): boolean {
  const dob = typeof dateOfBirth === 'string' ? new Date(dateOfBirth) : dateOfBirth;
  if (Number.isNaN(dob.getTime())) return false;

  const today = new Date();
  const eighteenYearsAgo = new Date(
    today.getFullYear() - 18,
    today.getMonth(),
    today.getDate()
  );
  // Born after this date => not yet 18 => minor.
  return dob.getTime() > eighteenYearsAgo.getTime();
}

/**
 * Basic sanity check on a DOB input: not in the future, not implausibly old.
 * This is a UX guard, not a security boundary — RLS / server checks still apply.
 */
export function isPlausibleDateOfBirth(dateOfBirth: string | Date): boolean {
  const dob = typeof dateOfBirth === 'string' ? new Date(dateOfBirth) : dateOfBirth;
  if (Number.isNaN(dob.getTime())) return false;
  const now = new Date();
  const oldestPlausible = new Date(now.getFullYear() - 120, now.getMonth(), now.getDate());
  return dob.getTime() <= now.getTime() && dob.getTime() >= oldestPlausible.getTime();
}

/**
 * For accounts flagged as minors, behavioral tracking and targeted/personalized
 * recommendations built from reading history must be disabled. Call this
 * before firing any analytics/recommendation-feeding event.
 *
 * `profile` is intentionally typed loosely here — pass whatever shape your
 * profiles row query returns, this only reads is_minor.
 */
export function canTrackForPersonalization(profile: { is_minor: boolean | null } | null): boolean {
  if (!profile) return false; // fail closed: no profile data => don't track
  return profile.is_minor !== true;
}

/** Human-readable copy shown on the "waiting for parental consent" screen. */
export const PARENT_CONSENT_PENDING_COPY = {
  title: 'Almost there — we just need a parent or guardian to confirm',
  body:
    "Because you're under 18, Indian law (the DPDP Act, 2023) requires a parent or guardian to confirm your account before you can start using MANGAL. We've sent a confirmation link to the email address you provided. Once they click it, your account activates automatically — no need to come back and check, we'll redirect you.",
};

export type ParentConsentStatus = 'not_required' | 'pending' | 'confirmed';