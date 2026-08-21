// app/api/export-data/route.ts
//
// Step 19 — "Download My Data" export.
//
// Returns everything the Privacy Policy's itemized data table promises:
// account info, reading progress, follows, comments, reactions, ratings,
// and (if applicable) creator profile + published series metadata.
//
// Deliberately excludes: payout details (UPI/bank info) in raw form — we
// return only whether payout info is on file, not the actual account
// numbers, to avoid a data export becoming a way to exfiltrate sensitive
// financial details via a stolen session. If a creator specifically wants
// their payout details, that's a manual request to the Grievance Officer,
// same as today.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit, getClientIp } from '@/app/lib/rateLimit';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function GET(req: NextRequest) {
  const supabase = getServiceClient();
  const ip = getClientIp(req);
  const withinLimit = await checkRateLimit(supabase, `export-data:${ip}`, 5, 300);
  if (!withinLimit) {
    return NextResponse.json({ error: 'Too many requests. Please try again shortly.' }, { status: 429 });
  }

  const authHeader = req.headers.get('authorization');
  const accessToken = authHeader?.replace('Bearer ', '');
  if (!accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData?.user) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }
  const userId = userData.user.id;
  const email = userData.user.email;

  const [profile, creatorProfile, follows, readingProgress, comments, reactions, ratings, series, consentHistory] =
    await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('creator_profiles').select('user_id, username, bio, joined_at, payout_method, payout_verified').eq('user_id', userId).maybeSingle(),
      supabase.from('follows').select('series_id, created_at').eq('reader_id', userId),
      supabase.from('reading_progress').select('series_id, chapter_id, page_number, updated_at').eq('reader_id', userId),
      supabase.from('comments').select('chapter_id, body, created_at').eq('reader_id', userId),
      supabase.from('reactions').select('chapter_id, emoji, created_at').eq('reader_id', userId),
      supabase.from('ratings').select('series_id, stars, created_at').eq('reader_id', userId),
      supabase.from('series').select('id, title, status, created_at').eq('creator_id', userId),
      supabase.from('consent_log').select('consent_version, action, created_at').eq('user_id', userId),
    ]);

  const exportPayload = {
    exported_at: new Date().toISOString(),
    account: {
      email,
      ...profile.data,
    },
    creator_profile: creatorProfile.data ?? null,
    follows: follows.data ?? [],
    reading_progress: readingProgress.data ?? [],
    comments: comments.data ?? [],
    reactions: reactions.data ?? [],
    ratings: ratings.data ?? [],
    published_series: series.data ?? [],
    consent_history: consentHistory.data ?? [],
    note:
      'Payout details (UPI ID / bank account) are intentionally excluded from this export. Contact the Grievance Officer if you specifically need those on record.',
  };

  return NextResponse.json(exportPayload, {
    headers: {
      'Content-Disposition': 'attachment; filename="mangal-my-data.json"',
    },
  });
}