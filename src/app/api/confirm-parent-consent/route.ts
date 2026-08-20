import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Service-role client — server-only, NEVER expose this key to the client.
// This is the only place allowed to write parent_consent_status now that
// the anon "by token" RLS policies on `profiles` have been dropped.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// How long a consent link stays valid after the email was sent (in ms).
// Adjust to match whatever window you already promise parents.
const CONSENT_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');

  if (!token || typeof token !== 'string' || token.length < 16) {
    return redirectToResult(req, 'invalid');
  }

  // 1. Look up the profile by EXACT token match — this is the check the
  // old RLS policy was missing entirely.
  const { data: profile, error: lookupError } = await supabaseAdmin
    .from('profiles')
    .select('id, parent_consent_status, parent_consent_email_sent_at')
    .eq('parent_consent_token', token)
    .maybeSingle();

  if (lookupError) {
    console.error('[confirm-parent-consent] lookup failed:', lookupError);
    return redirectToResult(req, 'error');
  }

  // Don't reveal whether the token exists, was already used, etc. —
  // generic "invalid" response for any non-confirmable state.
  if (!profile) {
    return redirectToResult(req, 'invalid');
  }

  if (profile.parent_consent_status !== 'pending') {
    // Already confirmed (or rejected/expired) — treat as already-handled,
    // not an error, so a parent re-clicking an old email link gets a sane message.
    return redirectToResult(
      req,
      profile.parent_consent_status === 'confirmed' ? 'already_confirmed' : 'invalid'
    );
  }

  // 2. Optional expiry check based on when the consent email was sent.
  if (profile.parent_consent_email_sent_at) {
    const sentAt = new Date(profile.parent_consent_email_sent_at).getTime();
    if (Date.now() - sentAt > CONSENT_TOKEN_TTL_MS) {
      return redirectToResult(req, 'expired');
    }
  }

  // 3. Token verified, status was pending, not expired — confirm it.
  const { error: updateError } = await supabaseAdmin
    .from('profiles')
    .update({
      parent_consent_status: 'confirmed',
      // Clear the token so it can't be replayed after use.
      parent_consent_token: null,
      // This was previously missing entirely — confirming consent never
      // actually activated the account, so the whole flow was a dead end
      // even when a parent did click through correctly.
      account_active: true,
    })
    .eq('id', profile.id)
    .eq('parent_consent_status', 'pending'); // belt-and-suspenders against race conditions

  if (updateError) {
    console.error('[confirm-parent-consent] update failed:', updateError);
    return redirectToResult(req, 'error');
  }

  return redirectToResult(req, 'success');
}

function redirectToResult(
  req: NextRequest,
  result: 'success' | 'already_confirmed' | 'invalid' | 'expired' | 'error'
) {
  // Use NEXT_PUBLIC_APP_URL as the base rather than req.url — more reliable
  // behind a proxy/load balancer where the request host header can be wrong.
  // Adjust the path to wherever you want parents to land after clicking the link.
  const base = process.env.NEXT_PUBLIC_APP_URL ?? req.url;
  const url = new URL('/parent-consent-result', base);
  url.searchParams.set('result', result);
  return NextResponse.redirect(url);
}