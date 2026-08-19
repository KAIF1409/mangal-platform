import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '../../../lib/auth/authedServerClient';
import { fetchVideoModerationInfo } from '../../../lib/media/youtubeVerify';
import { checkThumbnailNsfw } from '../../../lib/media/nsfwCheck';

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
    description?: string; isShort?: boolean; category?: string; aiTool?: string; autoPostToCircle?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { youtubeId, title, seriesId, description, isShort, category, aiTool, autoPostToCircle } = body;
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

  let moderationInfo: { channelId: string; containsSyntheticMedia: boolean; thumbnailUrl: string | null; durationSeconds: number | null } | null;
  try {
    moderationInfo = await fetchVideoModerationInfo(youtubeId);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Video lookup failed.' },
      { status: 503 }
    );
  }

  if (!moderationInfo) {
    return NextResponse.json(
      { error: "Couldn't find that video on YouTube. Check the link and try again." },
      { status: 404 }
    );
  }

  if (moderationInfo.channelId !== profile.verified_youtube_channel_id) {
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
      description: description?.trim() || null,
      youtube_id: youtubeId,
      is_short: !!isShort,
      category: category || 'Trailers',
      ai_tool: aiTool || 'Other',
      // §28a — real duration from YouTube's contentDetails, powering the
      // duration search filter. null is fine (filter just excludes it)
      // rather than blocking the upload if YouTube didn't return one.
      duration_seconds: moderationInfo.durationSeconds,
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    return NextResponse.json({ error: insertError?.message || 'Something went wrong saving the video.' }, { status: 500 });
  }

  // §28a — notify followers of the new upload. Fan-out mirrors K Circle's
  // notifications pattern (kcircle_notifications): the actor (uploader)
  // inserts one row per recipient right after the insert that triggered it
  // succeeds, no DB trigger involved. Best-effort only, same as the K
  // Circle auto-post below — a notification failure must never fail the
  // upload itself. Skipped for Shorts-only feeds isn't needed here since
  // followers should hear about all new uploads, Shorts included.
  try {
    const { data: followers } = await auth.supabase
      .from('creator_follows')
      .select('follower_id')
      .eq('creator_id', auth.userId);

    if (followers && followers.length > 0) {
      await auth.supabase.from('katube_notifications').insert(
        followers.map(f => ({
          recipient_id: f.follower_id,
          actor_id: auth.userId,
          video_id: inserted.id,
          type: 'new_upload',
        }))
      );
    }
  } catch {
    // swallow — notification fan-out is best-effort, never blocks the upload
  }

  // §6b part 2 — AI-disclosure check. Soft enforcement, not a hard block:
  // YouTube's own containsSyntheticMedia field is self-declared by the
  // uploader on YouTube itself (not verified by YouTube), so a false
  // negative here is a plausible honest mistake, not necessarily fraud.
  // Send undisclosed uploads to the same admin review queue reports already
  // uses, instead of rejecting the upload outright. This mirrors the soft
  // (pending-review) approach already used for the NSFW check below rather
  // than hard-rejecting, per §6b's "founder to decide strict vs soft" note
  // — soft was picked as the safer default to avoid blocking legitimate
  // creators on a self-declared field YouTube itself doesn't verify.
  if (!moderationInfo.containsSyntheticMedia) {
    await auth.supabase.from('reports').insert({
      target_type: 'video',
      target_id: inserted.id,
      reporter_id: auth.userId,
      reason: 'Other',
      details:
        "Auto-flagged: uploader did not check YouTube's \"Altered or synthetic content\" " +
        'disclosure box for this video (status.containsSyntheticMedia = false/missing). ' +
        'KaTube requires AI-generated content — review before removing, this may be a ' +
        'creator who forgot to check the box on YouTube rather than real footage.',
      is_auto_flagged: true,
    });
  }

  // §6b part 3 — NSFW thumbnail check (NSFWJS). Same soft, non-blocking
  // approach: never rejects the upload itself, only routes a flagged
  // thumbnail into the existing admin review queue. checkThumbnailNsfw
  // returns null on any failure (network/model/decode), so a broken
  // classifier can never block a legitimate creator's upload.
  const nsfwResult = await checkThumbnailNsfw(moderationInfo.thumbnailUrl);
  if (nsfwResult?.flagged) {
    await auth.supabase.from('reports').insert({
      target_type: 'video',
      target_id: inserted.id,
      reporter_id: auth.userId,
      reason: 'Other',
      details:
        `Auto-flagged: NSFWJS classified the thumbnail as "${nsfwResult.topClass}" ` +
        `(${Math.round(nsfwResult.topProbability * 100)}% confidence). Review before ` +
        'removing — thumbnail classifiers can false-positive on suggestive but non-explicit images.',
      is_auto_flagged: true,
    });
  }

  // KaTube ↔ K Circle auto-post cross-link — opt-in per upload, off by
  // default (see app/katube/upload/page.tsx's confirm-before-on checkbox).
  // Best-effort only: a failure here must never fail the video upload
  // itself, so errors are swallowed, not surfaced to the response.
  if (autoPostToCircle) {
    try {
      let { data: convo } = await auth.supabase
        .from('kcircle_conversations')
        .select('id')
        .eq('created_by', auth.userId)
        .eq('is_broadcast', true)
        .maybeSingle();

      if (!convo) {
        const { data: created } = await auth.supabase
          .from('kcircle_conversations')
          .insert({ is_broadcast: true, is_group: true, created_by: auth.userId, title: 'Updates' })
          .select('id')
          .single();
        convo = created ?? null;
      }

      if (convo) {
        await auth.supabase.from('kcircle_messages').insert({
          conversation_id: convo.id,
          sender_id: auth.userId,
          text: `🎬 New video: "${title.trim()}"\nkatube/watch/${inserted.id}`,
        });
      }
    } catch {
      // swallow — auto-post is a nice-to-have, never blocks the upload
    }
  }

  return NextResponse.json({ id: inserted.id });
}
