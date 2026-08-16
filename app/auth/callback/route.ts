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
// UPDATED (11 Aug 2026, later same day) — switched `next` from a query
// param on this callback URL to a cookie (see app/lib/authRedirect.ts).
// Reason: Supabase's Redirect URL allowlist matches the redirectTo URL
// EXACTLY — appending ?next=... to it means it no longer matches the
// registered `/auth/callback` entry, so Supabase silently falls back to
// the Site URL (root) with the code still attached instead of completing
// login. Confirmed as a real, reproducing failure on this project.
// The query param is still read as a fallback (e.g. old bookmarked/shared
// links), but login.tsx no longer generates it — the cookie is primary.
// SECURITY: `next` must be validated as a same-site relative path (starts
// with exactly one leading '/', not '//' or '/\') before use, or this
// becomes an open-redirect vector.

import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { POST_LOGIN_REDIRECT_COOKIE } from '../../lib/authRedirect';

function safeNextPath(raw: string | null | undefined): string {
  if (!raw) return '/WebMangal/home';
  // Must be an internal relative path: exactly one leading slash, no
  // scheme, no protocol-relative "//host" trick, no backslash trick.
  if (!/^\/(?!\/|\\)/.test(raw)) return '/WebMangal/home';
  return raw;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const oauthError = requestUrl.searchParams.get('error_description') || requestUrl.searchParams.get('error');

  const cookieStore = await cookies();
  // authRedirect.ts writes this cookie's value through encodeURIComponent
  // (it has to — cookie values can't safely contain a raw '/'), so it has
  // to be decoded on the way back out. This was missing: a stored path like
  // '/kalpana-circle' comes back as the literal string '%2Fkalpana-circle',
  // which starts with '%' not '/', so safeNextPath()'s leading-slash check
  // rejected it and silently fell back to the '/WebMangal/home' default —
  // every Google-login redirect that relied on this cookie landed on
  // WebMangal regardless of which product (KaTube, Kalpana Circle, or a
  // deep WebMangal link) the user actually logged in from.
  const rawCookieNext = cookieStore.get(POST_LOGIN_REDIRECT_COOKIE)?.value;
  let cookieNext: string | undefined;
  if (rawCookieNext) {
    try {
      cookieNext = decodeURIComponent(rawCookieNext);
    } catch {
      cookieNext = undefined; // malformed cookie value — fall through to default
    }
  }
  const next = safeNextPath(cookieNext ?? requestUrl.searchParams.get('next'));

  // FIX: the provider can redirect back with an error instead of a code
  // (e.g. user clicked "Cancel" on the Google consent screen). Previously
  // this fell through to the same /dashboard redirect as a success case.
  if (oauthError) {
    const res = NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(oauthError)}&next=${encodeURIComponent(next)}`, requestUrl.origin)
    );
    res.cookies.delete(POST_LOGIN_REDIRECT_COOKIE);
    return res;
  }

  if (!code) {
    const res = NextResponse.redirect(new URL(`/login?error=missing_code&next=${encodeURIComponent(next)}`, requestUrl.origin));
    res.cookies.delete(POST_LOGIN_REDIRECT_COOKIE);
    return res;
  }

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
    const res = NextResponse.redirect(
      new URL(`/login?error=session_exchange_failed&next=${encodeURIComponent(next)}`, requestUrl.origin)
    );
    res.cookies.delete(POST_LOGIN_REDIRECT_COOKIE);
    return res;
  }

  const res = NextResponse.redirect(new URL(next, requestUrl.origin));
  res.cookies.delete(POST_LOGIN_REDIRECT_COOKIE);
  return res;
}