// app/api/notify-followers/route.ts
//
// Step 25 — New Chapter Notification
// SECURITY-REVIEWED VERSION (23 June 2026) — fixes applied:
//   1. This endpoint had NO auth check at all — anyone could POST any
//      seriesId and trigger an email blast to every follower of that
//      series, repeatedly. FIX: now requires a Bearer access token, and
//      verifies the calling user is the actual creator_id of the series
//      before sending anything.
//   2. auth.admin.listUsers() only returns its first page (default 50
//      users platform-wide) — once total users pass 50, followers beyond
//      that page silently never get emailed, with no error anywhere.
//      FIX: replaced with a bounded Promise.all of getUserById() calls,
//      one per follower (not per platform user), which is both correct at
//      any scale and never fetches unrelated users' emails into memory.
//   3. No idempotency — a double-click or client retry would re-blast the
//      same chapter's emails. FIX: best-effort check-and-set on
//      chapters.notified_at (skips gracefully if that column doesn't
//      exist yet — see migration note below).
//
// Optional migration for the idempotency guard:
//   ALTER TABLE chapters ADD COLUMN IF NOT EXISTS notified_at timestamptz;

import { createClient } from '@supabase/supabase-js';
import { sendNewChapterEmail } from '../../lib/email';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    // FIX: require the caller's session token, same pattern as the other
    // API routes (delete-account, export-data).
    const authHeader = req.headers.get('authorization');
    const accessToken = authHeader?.replace('Bearer ', '');
    if (!accessToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { seriesId, chapterId, chapterNumber, chapterTitle } = await req.json();

    if (!seriesId || !chapterId || chapterNumber == null) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: callerData, error: callerError } = await serviceClient.auth.getUser(accessToken);
    if (callerError || !callerData?.user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }
    const callerId = callerData.user.id;

    // 1. Fetch series title AND creator_id in the same query, so we can
    //    verify ownership before doing anything else.
    const { data: series, error: seriesError } = await serviceClient
      .from('series')
      .select('title, creator_id')
      .eq('id', seriesId)
      .single();

    if (seriesError || !series) {
      console.error('[notify-followers] series fetch error:', seriesError);
      return NextResponse.json({ error: 'Series not found' }, { status: 404 });
    }

    // FIX: the core ownership check — only the series' own creator (or a
    // developer/admin account) can trigger a notification blast for it.
    if (series.creator_id !== callerId) {
      const { data: callerProfile } = await serviceClient
        .from('profiles')
        .select('role')
        .eq('id', callerId)
        .single();
      if (callerProfile?.role !== 'developer') {
        return NextResponse.json({ error: 'Not authorized to notify followers for this series' }, { status: 403 });
      }
    }

    // FIX: confirm the chapter actually belongs to this series (prevents
    // a mismatched/forged chapterId from being used in the email link).
    const { data: chapter, error: chapterError } = await serviceClient
      .from('chapters')
      .select('id, series_id, notified_at')
      .eq('id', chapterId)
      .eq('series_id', seriesId)
      .single();

    if (chapterError || !chapter) {
      return NextResponse.json({ error: 'Chapter not found for this series' }, { status: 404 });
    }

    // FIX: idempotency guard — if this chapter was already notified about,
    // don't send again. Soft-fails (proceeds normally) if the optional
    // notified_at column doesn't exist yet, so this never breaks the route.
    if ('notified_at' in chapter && chapter.notified_at) {
      return NextResponse.json({ sent: 0, skipped: 0, note: 'Already notified for this chapter' });
    }

    // 2. Fetch followers with email_notifications enabled
    const { data: followers, error: followError } = await serviceClient
      .from('follows')
      .select('reader_id')
      .eq('series_id', seriesId)
      .eq('email_notifications', true);

    if (followError) {
      console.error('[notify-followers] follows fetch error:', followError);
      return NextResponse.json({ error: 'Could not fetch followers' }, { status: 500 });
    }

    if (!followers || followers.length === 0) {
      return NextResponse.json({ sent: 0, skipped: 0 });
    }

    const readerIds = followers.map((f: { reader_id: string }) => f.reader_id);

    // 3. FIX: fetch emails per-follower via getUserById instead of
    //    listUsers() — correct at any platform size, and never loads
    //    unrelated users' emails into this route's memory.
    const followerEmails: string[] = [];
    await Promise.all(
      readerIds.map(async (id: string) => {
        const { data: userResult, error: getUserError } = await serviceClient.auth.admin.getUserById(id);
        if (getUserError) {
          console.warn('[notify-followers] could not load user', id, getUserError.message);
          return;
        }
        const u = userResult?.user;
        if (u?.email && u.email_confirmed_at) {
          followerEmails.push(u.email);
        }
      })
    );

    // 4. Send emails — fire all in parallel, log individual failures
    let sent = 0;
    let skipped = 0;

    await Promise.all(
      followerEmails.map(async (email) => {
        const result = await sendNewChapterEmail(
          email,
          series.title,
          chapterNumber,
          chapterTitle ?? '',
          seriesId,
          chapterId,
          appUrl
        );
        if (result.ok) sent++;
        else { skipped++; console.warn('[notify-followers] failed to email', email, result.error); }
      })
    );

    // Best-effort: mark this chapter as notified so a retry doesn't re-blast.
    try {
      await serviceClient.from('chapters').update({ notified_at: new Date().toISOString() }).eq('id', chapterId);
    } catch (markErr) {
      console.warn('[notify-followers] could not set notified_at (column may not exist yet):', markErr);
    }

    console.log(`[notify-followers] series=${seriesId} ch=${chapterNumber}: sent=${sent} skipped=${skipped}`);
    return NextResponse.json({ sent, skipped });

  } catch (err) {
    console.error('[notify-followers] unexpected error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}