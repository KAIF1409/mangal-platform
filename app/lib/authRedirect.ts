// Where to send the user after OAuth login, without ever putting it in the
// redirectTo URL sent to Supabase. Supabase's Redirect URL allowlist only
// matches exact registered URLs — appending ?next=... to the callback URL
// makes it fail that match, and Supabase silently falls back to the Site
// URL (root) with the code still attached, which looks like a broken/no-op
// login. Confirmed as a real failure mode on this project (11 Aug 2026).
//
// Fix: every signInWithOAuth call always uses the exact same, single
// allowlisted redirectTo (`${origin}/auth/callback`, no query string). If
// the caller wants the user to land somewhere other than the default
// (/home) afterwards, it stores that path in this cookie first.
// /auth/callback reads it once, then clears it.

const COOKIE_NAME = 'mangal_post_login_redirect';

/** Call this right before supabase.auth.signInWithOAuth(). */
export function setPostLoginRedirect(path: string) {
  if (typeof document === 'undefined') return;
  // 5 minutes is plenty for an OAuth round trip; short-lived on purpose so a
  // stale cookie can never redirect a later, unrelated login.
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(path)}; path=/; max-age=300; SameSite=Lax`;
}

export const POST_LOGIN_REDIRECT_COOKIE = COOKIE_NAME;
