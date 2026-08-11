import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '../../../lib/authedServerClient';
import { fetchVideoChannelId } from '../../../lib/youtubeVerify';

// KaTube §6 step 4 — the actual fraud check. Verifying a channel once only
// proves "this channel belongs to me"; it does NOT mean every future
// upload is trusted by default. Every single upload goes through this
// route (replacing the old direct client-side insert) so the channelId
// check can never be skipped or bypassed from the browser.
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body: {
    youtubeId?: string; title?: string; seriesId?: string | null;
    isShort?: boolean; category?: string; aiTool?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { youtubeId, title, seriesId, isShort, category, aiTool } = body;
  if (!youtubeId || !title?.trim()) {
    return NextResponse.json({ error: 'Missing video link or title.' }, { status: 400 });
  }

  const { data: profile } = await auth.supabase
    .from('creator_profiles')
    .select('verified_youtube_channel_id')
    .eq('user_id', auth.userId)
    .maybeSingle();

  if (!profile?.verified_youtube_channel_id) {
    return NextResponse.json(
      { error: 'Connect and verify your YouTube channel before uploading — see the panel above.' },
      { status: 403 }
    );
  }

  let realChannelId: string | null;
  try {
    realChannelId = await fetchVideoChannelId(youtubeId);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Video lookup failed.' },
      { status: 503 }
    );
  }

  if (!realChannelId) {
    return NextResponse.json(
      { error: "Couldn't find that video on YouTube. Check the link and try again." },
      { status: 404 }
    );
  }

  if (realChannelId !== profile.verified_youtube_channel_id) {
    return NextResponse.json(
      { error: "This video isn't from your verified channel. Only videos from the channel you verified can be uploaded here." },
      { status: 403 }
    );
  }

  const { data: inserted, error: insertError } = await auth.supabase
    .from('videos')
    .insert({
      creator_id: auth.userId,
      series_id: seriesId || null,
      title: title.trim(),
      youtube_id: youtubeId,
      is_short: !!isShort,
      category: category || 'Trailers',
      ai_tool: aiTool || 'Other',
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    return NextResponse.json({ error: insertError?.message || 'Something went wrong saving the video.' }, { status: 500 });
  }

  return NextResponse.json({ id: inserted.id });
}
