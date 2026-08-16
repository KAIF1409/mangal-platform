import { createBrowserClient } from '@supabase/ssr';

// Explicit cookieOptions — without these, @supabase/ssr's defaults have been
// observed (Vercel runtime logs, Aug 9-10 2026) to occasionally drop the PKCE
// code_verifier cookie between the redirect to Google and the redirect back
// to /auth/callback, causing "PKCE code verifier not found in storage" ->
// login?error=session_exchange_failed. sameSite: 'lax' is required (not
// 'strict') because the code_verifier cookie must survive a cross-site
// top-level navigation (Google's redirect back to us).
//
// IMPORTANT: these cookieOptions apply to every cookie this client sets,
// including the long-lived session/auth-token cookie — don't add a short
// maxAge here, or every logged-in session would expire on that same timer.
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    cookieOptions: {
      sameSite: 'lax',
      secure: true,
      path: '/',
    },
  }
);