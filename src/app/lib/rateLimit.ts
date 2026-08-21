// lib/rateLimit.ts
//
// Postgres-backed rate limiting for API routes (see the
// rate_limiting_infrastructure migration for why this isn't in-memory).
//
// USAGE (inside a route handler, before doing any real work):
//
//   const ip = getClientIp(req);
//   const ok = await checkRateLimit(supabaseAdmin, `confirm-parent-consent:${ip}`, 10, 60);
//   if (!ok) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Best-effort caller IP for rate-limit bucketing. Cloudflare sets
 * cf-connecting-ip on every request reaching the Worker; x-forwarded-for is
 * a fallback for local dev / other proxies. Never trust this for anything
 * beyond "which bucket to throttle" - it's not an identity check.
 */
export function getClientIp(req: Request): string {
  const cf = req.headers.get('cf-connecting-ip');
  if (cf) return cf;
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return 'unknown';
}

/**
 * Returns true if this call is within the allowed rate, false if the
 * caller should be rejected with a 429. Fails OPEN (returns true) if the
 * rate-limit check itself errors - a broken limiter should never be able
 * to take the whole route down; log and let normal auth/validation in the
 * route still apply.
 */
export async function checkRateLimit(
  supabaseAdmin: SupabaseClient,
  bucketKey: string,
  maxEvents: number,
  windowSeconds: number
): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc('check_rate_limit', {
    p_bucket_key: bucketKey,
    p_max_events: maxEvents,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    console.error('[rateLimit] check failed, failing open:', error);
    return true;
  }

  return data === true;
}
