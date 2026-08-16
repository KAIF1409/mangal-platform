import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Server-only. Builds a Supabase client that acts AS the requesting user
// (their JWT is forwarded on every request), so existing RLS policies like
// "auth.uid() = user_id" apply exactly as if the browser had called it
// directly — no service-role key needed for routes that only ever touch a
// user's own rows.
export function getUserScopedClient(accessToken: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
  );
}

// Reads the "Authorization: Bearer <token>" header, verifies it, and
// returns both the userId and a client scoped to that user. Returns null
// if there's no valid session — callers should respond 401.
export async function requireUser(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!accessToken) return null;

  const supabase = getUserScopedClient(accessToken);
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data?.user) return null;

  return { userId: data.user.id, supabase };
}
