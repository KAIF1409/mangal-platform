'use client';

// app/parent-consent/[token]/page.tsx
//
// SECURITY NOTE (2026-08-21): this page used to update `profiles` directly
// from the browser using the anon key, keyed only by the token in the URL.
// That relied on a permissive "anon can update profiles by token" RLS
// policy which has since been dropped -- the real confirm logic now lives
// server-side in /api/confirm-parent-consent, which validates the token,
// checks status/expiry, and uses the service role to flip
// parent_consent_status + account_active together. Client code should
// never be trusted to grant account access.
//
// This page is kept only as a redirect, in case any previously-sent email
// (or a bookmark) still points here -- it forwards straight to the real
// endpoint and lets that route's redirect take over.

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function ParentConsentPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();

  useEffect(() => {
    if (params.token) {
      router.replace(`/api/confirm-parent-consent?token=${encodeURIComponent(params.token)}`);
    }
  }, [params.token, router]);

  return null;
}
