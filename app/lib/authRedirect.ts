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
// (/WebMangal/home) afterwards, it stores that path in this cookie first.
// /auth/callback reads it once, then clears it.

const COOKIE_NAME = 'mangal_post_login_redirect';

/** Call this right before supabase.auth.signInWithOAuth(). */
export function setPostLoginRedirect(path: string) {
  if (typeof document === 'undefined') return;
  // 10 minutes — long enough to cover a real-world Google sign-in that
  // involves an account picker, 2FA/PIN prompt, and a consent screen
  // (previously 5 minutes, which is tight on a first-time device/account
  // and would silently expire mid-flow, dropping the intended redirect).
  // Still short-lived on purpose so a stale cookie can never redirect a
  // later, unrelated login.
  // `Secure` is explicit here (not just implied by the site being HTTPS) —
  // some browsers/extensions are stricter about accepting cookies that
  // don't declare it, even when the page itself is served over HTTPS.
  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(path)}; path=/; max-age=600; SameSite=Lax${secure}`;
}

export const POST_LOGIN_REDIRECT_COOKIE = COOKIE_NAME;

/**
 * Read + clear the post-login redirect cookie client-side. Used by
 * /login's own nextPath resolution (not just /auth/callback) — see the
 * comment on nextPath in app/login/page.tsx for why the ?next= query
 * param alone isn't reliable enough to be the only source of truth.
 */
export function consumePostLoginRedirect(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`));
  if (!match) return null;
  // Clear it immediately — same one-shot semantics as the server-side
  // read in /auth/callback, so a stale cookie can never redirect a later,
  // unrelated login.
  document.cookie = `${COOKIE_NAME}=; path=/; max-age=0`;
  try {
    const decoded = decodeURIComponent(match[1]);
    return /^\/(?!\/|\\)/.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}
