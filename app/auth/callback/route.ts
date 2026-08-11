// app/auth/callback/route.ts
// SECURITY-REVIEWED VERSION (23 June 2026) — fix applied:
//   exchangeCodeForSession()'s result was never checked. If the code was
//   invalid, expired, or already used (replay), the route still redirected
//   to /dashboard as if login succeeded — the user would land there with
//   no real session and get a confusing experience instead of a clear
//   "please try logging in again" message.
//   FIX: check the error, and also handle the case where the OAuth
//   provider itself sends back an error (e.g. user cancelled the Google
//   consent screen) instead of a code at all.
//
// UPDATED (11 Aug 2026) — added `next` redirect-target support. Previously
// this route ALWAYS redirected to /home regardless of where login was
// initiated from, so e.g. clicking "Log in" from /katube/upload would land
// the user back on the MangaNovels home page instead of returning them to
// KaTube's upload page. `next` is threaded through: /login?next=... ->
// signInWithOAuth's redirectTo carries it as a query param on this callback
// URL -> read here and used as the post-login destination.
// SECURITY: `next` must be validated as a same-site relative path (starts
// with exactly one leading '/', not '//' or '/\') before use, or this
// becomes an open-redirect vector.

import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

function safeNextPath(raw: string | null): string {
  if (!raw) return '/home';
  // Must be an internal relative path: exactly one leading slash, no
  // scheme, no protocol-relative "//host" trick, no backslash trick.
  if (!/^\/(?!\/|\\)/.test(raw)) return '/home';
  return raw;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const oauthError = requestUrl.searchParams.get('error_description') || requestUrl.searchParams.get('error');
  const next = safeNextPath(requestUrl.searchParams.get('next'));

  // FIX: the provider can redirect back with an error instead of a code
  // (e.g. user clicked "Cancel" on the Google consent screen). Previously
  // this fell through to the same /dashboard redirect as a success case.
  if (oauthError) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(oauthError)}&next=${encodeURIComponent(next)}`, requestUrl.origin)
    );
  }

  if (!code) {
    return NextResponse.redirect(new URL(`/login?error=missing_code&next=${encodeURIComponent(next)}`, requestUrl.origin));
  }

  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        sameSite: 'lax',
        secure: true,
        path: '/',
      },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  // FIX: check the exchange result instead of assuming success.
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    console.error('[auth/callback] exchangeCodeForSession failed:', exchangeError.message);
    return NextResponse.redirect(
      new URL(`/login?error=session_exchange_failed&next=${encodeURIComponent(next)}`, requestUrl.origin)
    );
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}