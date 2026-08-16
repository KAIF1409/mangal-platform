import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '../../../../lib/auth/authedServerClient';
import { resolveChannel, generateVerificationCode } from '../../../../lib/media/youtubeVerify';

// KaTube §6 step 1+2 — one-time channel connect. Creator submits their
// YouTube channel URL/handle; we resolve the real channelId via the public
// channels.list endpoint and hand back a verification code for them to
// paste into their channel's About/description.
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let channelInput: string;
  try {
    const body = await req.json();
    channelInput = body.channelInput;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!channelInput || typeof channelInput !== 'string' || !channelInput.trim()) {
    return NextResponse.json({ error: 'Enter your YouTube channel URL or @handle.' }, { status: 400 });
  }

  let resolved;
  try {
    resolved = await resolveChannel(channelInput);
  } catch (err) {
    // Most likely YOUTUBE_API_KEY isn't configured yet.
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Channel lookup failed.' },
      { status: 503 }
    );
  }

  if (!resolved) {
    return NextResponse.json(
      { error: "Couldn't find that channel. Double-check the URL or @handle and try again." },
      { status: 404 }
    );
  }

  const code = generateVerificationCode();

  // creator_profiles might not have a row yet for this user (KaTube upload
  // deliberately doesn't require "becoming a creator" first — see upload
  // page's original design note). Update if a row exists, otherwise create
  // one with a fallback username derived from their MANGAL profile name.
  const { data: existing } = await auth.supabase
    .from('creator_profiles')
    .select('user_id')
    .eq('user_id', auth.userId)
    .maybeSingle();

  const channelFields = {
    youtube_channel_handle: channelInput.trim(),
    pending_youtube_channel_id: resolved.channelId,
    youtube_verification_code: code,
    // Reconnecting to a (possibly different) channel means the old
    // verification no longer applies until re-confirmed.
    verified_youtube_channel_id: null,
    channel_verified_at: null,
  };

  if (existing) {
    const { error: updateError } = await auth.supabase
      .from('creator_profiles')
      .update(channelFields)
      .eq('user_id', auth.userId);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  } else {
    const { data: profile } = await auth.supabase
      .from('profiles').select('full_name').eq('id', auth.userId).maybeSingle();
    const base = (profile?.full_name || 'creator').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'creator';
    // username has a unique constraint — suffix with part of the user id so
    // two people with the same display name never collide.
    const fallbackUsername = `${base}-${auth.userId.slice(0, 6)}`;

    const { error: insertError } = await auth.supabase
      .from('creator_profiles')
      .insert({ user_id: auth.userId, username: fallbackUsername, ...channelFields });
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({
    code,
    channelId: resolved.channelId,
    channelTitle: resolved.title,
  });
}
