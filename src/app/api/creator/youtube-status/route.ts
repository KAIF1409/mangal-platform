import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '../../../lib/auth/authedServerClient';

// SECURITY FIX (2026-08-21): youtube_verification_code, pending_youtube_
// channel_id etc. on creator_profiles used to be readable by anyone via
// the client (the table's old "viewable by everyone" RLS policy). That's
// now closed at the column-privilege level (see the
// lock_down_profiles_and_creator_profiles_pii migration) — those columns
// are no longer selectable directly by anon/authenticated at all, only
// via a route like this one that forwards the caller's own JWT, so RLS's
// existing "Users can view own creator profile" (auth.uid() = user_id)
// policy naturally scopes it to their own row.
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data, error } = await auth.supabase
    .from('creator_profiles')
    .select('verified_youtube_channel_id, pending_youtube_channel_id, youtube_verification_code, youtube_channel_handle')
    .eq('user_id', auth.userId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    verifiedChannelId: data?.verified_youtube_channel_id ?? null,
    pendingChannelId: data?.pending_youtube_channel_id ?? null,
    pendingCode: data?.youtube_verification_code ?? null,
    channelHandle: data?.youtube_channel_handle ?? null,
  });
}
