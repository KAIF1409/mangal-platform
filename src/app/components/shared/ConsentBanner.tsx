'use client';

// components/ConsentBanner.tsx
//
// Step 19 — DPDP Rules 2025 consent banner.
//
// Shown on first visit (tracked via localStorage on the device, NOT a
// reliable legal record by itself — for logged-in users, the real record of
// consent lives in the `consent_log` table once they accept while signed in).
// For logged-out/anonymous browsing, this banner covers the DPDP Rules 2025
// requirement that processing reading-history data for an anonymous visitor
// (view counts, language preference) also needs a clear accept/decline,
// not just a silent default.
//
// USAGE: render this once near the root, e.g. in app/layout.tsx:
//   <ConsentBanner />
//
// On "Decline": we still let people read (core reading must stay free per
// Terms §2), but we should NOT write the local-storage view-dedupe flag or
// any other local storage value until they accept. Wire that check into
// wherever those writes happen (see the `hasConsent()` export below).

import { useEffect, useState } from 'react';
import { CONSENT_VERSION } from '../../lib/compliance/dpdp';

const STORAGE_KEY = 'mangal_consent_v1';

interface StoredConsent {
  status: 'accepted' | 'declined';
  version: string;
  at: string;
}

/** Call this anywhere before writing a non-essential localStorage value
 *  (view-dedupe flags, language preference, etc.) to respect a decline. */
export function hasConsent(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed: StoredConsent = JSON.parse(raw);
    return parsed.status === 'accepted' && parsed.version === CONSENT_VERSION;
  } catch {
    return false;
  }
}

export default function ConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setVisible(true);
        return;
      }
      const parsed: StoredConsent = JSON.parse(raw);
      // Re-prompt if the consent notice version has changed since they last answered.
      if (parsed.version !== CONSENT_VERSION) {
        setVisible(true);
      }
    } catch {
      setVisible(true);
    }
  }, []);

  const respond = (status: 'accepted' | 'declined') => {
    const record: StoredConsent = { status, version: CONSENT_VERSION, at: new Date().toISOString() };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
    } catch {
      // localStorage unavailable (private browsing, etc.) — banner will just
      // reappear next visit, which is the safe failure mode here.
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie and data consent"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: 'var(--bg-card)',
        borderTop: '1px solid var(--border-color)',
        padding: '16px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '20px',
        flexWrap: 'wrap',
        boxShadow: '0 -8px 24px rgba(0,0,0,0.4)',
      }}
    >
      <p
        style={{
          fontSize: '13px',
          color: 'var(--text-secondary)',
          lineHeight: 1.6,
          margin: 0,
          maxWidth: '560px',
          flex: '1 1 320px',
        }}
      >
        We store your reading history to improve your experience — things like
        remembering your place and showing relevant Trending sections. We never
        sell your data or run targeted ads against minors. See our{' '}
        <a href="/privacy" style={{ color: '#d97706', textDecoration: 'none' }}>
          Privacy Policy
        </a>{' '}
        for the full itemized list.
      </p>
      <div style={{ display: 'flex', gap: '10px', flexShrink: 0 }}>
        <button
          onClick={() => respond('declined')}
          style={{
            padding: '9px 18px',
            borderRadius: '8px',
            background: 'transparent',
            border: '1px solid #2a2a36',
            color: 'var(--text-secondary)',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Decline
        </button>
        <button
          onClick={() => respond('accepted')}
          style={{
            padding: '9px 18px',
            borderRadius: '8px',
            background: '#d97706',
            border: '1px solid #d97706',
            color: 'var(--bg-primary)',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Accept
        </button>
      </div>
    </div>
  );
}