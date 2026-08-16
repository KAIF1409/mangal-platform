import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '../../../../lib/auth/authedServerClient';
import { fetchChannelDescription } from '../../../../lib/media/youtubeVerify';

// KaTube §6 step 3 — creator clicks "Verify" after pasting the code into
// their channel's About/description. Only the real channel owner can edit
// that description, so finding the code there is proof of ownership.
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: profile, error: profileError } = await auth.supabase
    .from('creator_profiles')
    .select('pending_youtube_channel_id, youtube_verification_code')
    .eq('user_id', auth.userId)
    .maybeSingle();

  if (profileError || !profile?.pending_youtube_channel_id || !profile?.youtube_verification_code) {
    return NextResponse.json(
      { error: 'Connect a channel first — no pending verification found.' },
      { status: 400 }
    );
  }

  let description: string | null;
  try {
    description = await fetchChannelDescription(profile.pending_youtube_channel_id);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Channel lookup failed.' },
      { status: 503 }
    );
  }

  if (description === null) {
    return NextResponse.json({ error: "Couldn't re-fetch that channel from YouTube. Try again." }, { status: 502 });
  }

  if (!description.includes(profile.youtube_verification_code)) {
    return NextResponse.json(
      { error: "Verification code not found in the channel description yet. Make sure you saved it on YouTube, then try again." },
      { status: 400 }
    );
  }

  const { error: updateError } = await auth.supabase
    .from('creator_profiles')
    .update({
      verified_youtube_channel_id: profile.pending_youtube_channel_id,
      channel_verified_at: new Date().toISOString(),
      youtube_verification_code: null,
    })
    .eq('user_id', auth.userId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ verified: true, channelId: profile.pending_youtube_channel_id });
}
