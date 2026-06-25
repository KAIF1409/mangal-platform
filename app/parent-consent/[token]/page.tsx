'use client';

// app/parent-consent/[token]/page.tsx
//
// Step 19 — Minors handling, piece 3 of 3 (DOB detection + tracking
// restriction were handled at signup and in lib/dpdp.ts; this is the
// "verifiable parental consent" step).
//
// MVP approach per the context doc: a parent email confirmation link. When
// signup detects a minor, the server sends an email to parent_email
// containing a link to /parent-consent/[token] where [token] is the
// parent_consent_token uuid stored on the profiles row. Clicking through
// here, and pressing Confirm, sets parent_consent_status = 'confirmed' and
// account_active = true.
//
// This is intentionally a single click-through with one explicit confirm
// button (not auto-confirmed just by opening the link) so there's a clear,
// logged moment of parental action — closer to "consent" than a tracking
// pixel firing when the parent's mail client prefetches the link.
//
// SETUP: wire the email send into your signup flow (e.g. login/page.tsx)
// once a minor account is created — that part is not in this file, since
// it depends on whatever email-sending service you wire up (Resend, Supabase
// built-in email, etc.) and isn't decided yet in the context doc.

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

// This page runs entirely client-side against the anon key. It only needs to
// read a profile by parent_consent_token (a random uuid, unguessable, acts
// as the capability token) and flip two columns — neither of which requires
// the service role, as long as RLS allows it. See the RLS policy note below.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type ConsentPageState = 'loading' | 'ready' | 'confirming' | 'confirmed' | 'invalid' | 'error';

export default function ParentConsentPage() {
  const params = useParams<{ token: string }>();
  const [state, setState] = useState<ConsentPageState>('loading');
  const [childFirstName, setChildFirstName] = useState<string>('');

  useEffect(() => {
    async function lookup() {
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, parent_consent_status')
        .eq('parent_consent_token', params.token)
        .maybeSingle();

      if (error || !data) {
        setState('invalid');
        return;
      }
      if (data.parent_consent_status === 'confirmed') {
        setState('confirmed');
        return;
      }
      setChildFirstName(data.full_name?.split(' ')[0] ?? 'your child');
      setState('ready');
    }
    lookup();
  }, [params.token]);

  const handleConfirm = async () => {
    setState('confirming');
    const { error } = await supabase
      .from('profiles')
      .update({
        parent_consent_status: 'confirmed',
        parent_consent_confirmed_at: new Date().toISOString(),
        account_active: true,
      })
      .eq('parent_consent_token', params.token);

    if (error) {
      setState('error');
      return;
    }
    setState('confirmed');
  };

  const wrapperStyle: React.CSSProperties = {
    minHeight: '100vh',
    backgroundColor: '#07070a',
    color: '#f9fafb',
    fontFamily: 'Arial, Helvetica, sans-serif',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
  };
  const cardStyle: React.CSSProperties = {
    background: '#0d0d14',
    border: '1px solid #1a1a26',
    borderRadius: '16px',
    padding: '32px',
    maxWidth: '440px',
    textAlign: 'center',
  };

  if (state === 'loading') {
    return (
      <div style={wrapperStyle}>
        <div style={cardStyle}>
          <p style={{ color: '#9ca3af', fontSize: '14px' }}>Loading…</p>
        </div>
      </div>
    );
  }

  if (state === 'invalid') {
    return (
      <div style={wrapperStyle}>
        <div style={cardStyle}>
          <h1 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '12px' }}>
            Link not recognized
          </h1>
          <p style={{ color: '#9ca3af', fontSize: '13px', lineHeight: 1.7 }}>
            This confirmation link is invalid or has already been used. If you
            believe this is an error, contact us at{' '}
            <a href="mailto:kaifmohammed.work@gmail.com" style={{ color: '#d97706' }}>
              kaifmohammed.work@gmail.com
            </a>
            .
          </p>
        </div>
      </div>
    );
  }

  if (state === 'confirmed') {
    return (
      <div style={wrapperStyle}>
        <div style={cardStyle}>
          <h1 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '12px', color: '#10b981' }}>
            ✓ Account confirmed
          </h1>
          <p style={{ color: '#9ca3af', fontSize: '13px', lineHeight: 1.7 }}>
            Thank you. The account is now active. As required under India&apos;s
            DPDP Act, 2023, MANGAL will not run targeted advertising or build
            behavioral profiles from this account&apos;s reading activity.
          </p>
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div style={wrapperStyle}>
        <div style={cardStyle}>
          <h1 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '12px', color: '#ef4444' }}>
            Something went wrong
          </h1>
          <p style={{ color: '#9ca3af', fontSize: '13px', lineHeight: 1.7 }}>
            We couldn&apos;t confirm this just now. Please try again, or email{' '}
            <a href="mailto:kaifmohammed.work@gmail.com" style={{ color: '#d97706' }}>
              kaifmohammed.work@gmail.com
            </a>
            .
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={wrapperStyle}>
      <div style={cardStyle}>
        <h1 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '12px' }}>
          Parental Consent Required
        </h1>
        <p style={{ color: '#9ca3af', fontSize: '13px', lineHeight: 1.7, marginBottom: '20px' }}>
          {childFirstName} has signed up for MANGAL and indicated they are
          under 18. Under India&apos;s Digital Personal Data Protection Act,
          2023, we need your confirmation as a parent or guardian before this
          account can be activated. Once confirmed, MANGAL will not run
          targeted advertising or build behavioral profiles from this
          account&apos;s reading activity.
        </p>
        <button
          onClick={handleConfirm}
          disabled={state === 'confirming'}
          style={{
            padding: '11px 24px',
            borderRadius: '8px',
            background: '#d97706',
            border: 'none',
            color: '#07070a',
            fontSize: '14px',
            fontWeight: 700,
            cursor: state === 'confirming' ? 'default' : 'pointer',
            opacity: state === 'confirming' ? 0.6 : 1,
          }}
        >
          {state === 'confirming' ? 'Confirming…' : 'I confirm I am this account holder\u2019s parent or guardian'}
        </button>
      </div>
    </div>
  );
}