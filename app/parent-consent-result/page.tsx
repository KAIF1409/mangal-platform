'use client';

// app/parent-consent-result/page.tsx
// Parent lands here after clicking the confirmation link in the email.
// The confirm-parent-consent API route already ran (server-side, in route.ts)
// and set the ?status= query param. This page just renders the outcome.

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

type ConsentStatus =
  | 'success'
  | 'already_confirmed'
  | 'invalid'
  | 'expired'
  | 'error';

const CONFIG: Record<
  ConsentStatus,
  { emoji: string; title: string; body: string; color: string }
> = {
  success: {
    emoji: '✅',
    title: 'Consent Confirmed',
    body: "You've successfully given parental consent. Your child's MANGAL account is now active. They can log in and start reading.",
    color: '#16a34a',
  },
  already_confirmed: {
    emoji: '👍',
    title: 'Already Confirmed',
    body: "This consent was already given earlier. Your child's account is active — nothing more to do.",
    color: '#d97706',
  },
  invalid: {
    emoji: '❌',
    title: 'Invalid Link',
    body: 'This confirmation link is not valid. It may have been copied incorrectly. Ask your child to re-register so a fresh link can be sent.',
    color: '#991b1b',
  },
  expired: {
    emoji: '⏳',
    title: 'Link Expired',
    body: 'This confirmation link has expired (links are valid for 7 days). Ask your child to log in again — MANGAL will automatically send a new confirmation email.',
    color: '#991b1b',
  },
  error: {
    emoji: '⚠️',
    title: 'Something Went Wrong',
    body: "We couldn't process this request right now. Please try clicking the link again. If the problem persists, contact us at grievance@mangal.in.",
    color: '#991b1b',
  },
};

function ConsentResult() {
  const params = useSearchParams();
  const raw = params.get('result') ?? 'error';
  const status: ConsentStatus =
    raw in CONFIG ? (raw as ConsentStatus) : 'error';
  const { emoji, title, body, color } = CONFIG[status];

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-primary)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        }}
    >
      {/* Card */}
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '16px',
          maxWidth: '480px',
          width: '100%',
          padding: '40px 32px',
          textAlign: 'center',
        }}
      >
        {/* Logo */}
        <div
          style={{
            fontSize: '13px',
            fontWeight: 700,
            letterSpacing: '0.15em',
            color: '#7f1d1d',
            textTransform: 'uppercase',
            marginBottom: '32px',
          }}
        >
          MANGAL
        </div>

        {/* Emoji */}
        <div style={{ fontSize: '56px', marginBottom: '20px', lineHeight: 1 }}>
          {emoji}
        </div>

        {/* Title */}
        <h1
          style={{
            color: '#f1f5f9',
            fontSize: '22px',
            fontWeight: 700,
            margin: '0 0 12px 0',
          }}
        >
          {title}
        </h1>

        {/* Status pill */}
        <div
          style={{
            display: 'inline-block',
            background: color + '22',
            border: `1px solid ${color}55`,
            color: color,
            borderRadius: '999px',
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.08em',
            padding: '3px 12px',
            textTransform: 'uppercase',
            marginBottom: '20px',
          }}
        >
          {status.replace('_', ' ')}
        </div>

        {/* Body */}
        <p
          style={{
            color: '#94a3b8',
            fontSize: '15px',
            lineHeight: 1.6,
            margin: '0 0 32px 0',
          }}
        >
          {body}
        </p>

        {/* Divider */}
        <div
          style={{
            borderTop: '1px solid var(--border-color)',
            paddingTop: '24px',
          }}
        >
          <p
            style={{
              color: '#475569',
              fontSize: '13px',
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            MANGAL is an Indian comics &amp; novels platform for young readers.
            <br />
            Questions? Write to{' '}
            <a
              href="mangal.indiaplatform@gmail.com"
              style={{ color: '#7f1d1d', textDecoration: 'none' }}
            >
              mangal.indiaplatform@gmail.com
            </a>
          </p>
        </div>
      </div>

      {/* Footer note */}
      <p
        style={{
          color: '#334155',
          fontSize: '12px',
          marginTop: '24px',
          textAlign: 'center',
        }}
      >
        You can close this tab. This page is only for parental consent
        confirmation.
      </p>
    </div>
  );
}

// Wrap in Suspense because useSearchParams() requires it in Next.js App Router
export default function ParentConsentResultPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: '100vh',
            background: 'var(--bg-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#475569',
            }}
        >
          Loading...
        </div>
      }
    >
      <ConsentResult />
    </Suspense>
  );
}