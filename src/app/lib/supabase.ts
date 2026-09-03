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
// §148 fix — this used to call createBrowserClient with the raw env vars
// forced non-null (`!`). @supabase/ssr throws synchronously ("supabaseUrl is
// required." / "Invalid supabaseUrl") if either is missing or malformed. This
// is a top-level `export const`, evaluated the instant this module is
// imported — and 88 files import it, including src/app/page.tsx (the
// landing page) and everything it renders. So on any build/deploy where
// NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY weren't actually
// present when `next build` ran (these get inlined into the client bundle at
// BUILD time, not read at Worker runtime — a Cloudflare dashboard/wrangler.jsonc
// runtime var does NOT cover this; it has to be set as a build-time variable
// in Cloudflare's Workers Builds config for the `next build` / `opennextjs-
// cloudflare build` step), importing this module threw immediately, which
// crashed React's client-side render for every page that pulls it in —
// the landing page went fully blank ("everything got crashed") because
// src/app/page.tsx imports it directly at the top.
//
// This no longer throws at import time. If the vars are missing it logs a
// loud, unmistakable console error and falls back to obviously-fake
// placeholder values so createBrowserClient itself doesn't throw — the page
// still renders (nav, hero, doors, video, footer all show up), and only the
// actual Supabase-backed calls (trending series, tags, auth) fail quietly
// with a network/auth error instead of taking the whole app down with them.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[MANGAL] NEXT_PUBLIC_SUPABASE_URL and/or NEXT_PUBLIC_SUPABASE_ANON_KEY ' +
    'are missing from this build. Every Supabase-backed feature (auth, ' +
    'trending series, tags, etc.) will fail until these are set as BUILD-TIME ' +
    'variables in Cloudflare Workers Builds (Settings → Build → Variables and ' +
    'secrets) — a wrangler.jsonc `vars`/dashboard runtime secret is NOT enough, ' +
    'because these NEXT_PUBLIC_* values get inlined into the client JS bundle ' +
    'while `next build` runs, not read at Worker runtime.'
  );
}

export const supabase = createBrowserClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    cookieOptions: {
      sameSite: 'lax',
      secure: true,
      path: '/',
    },
  }
);