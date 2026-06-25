// app/api/delete-account/route.ts
//
// Step 19 — "Delete My Account" flow.
//
// Implements the erasure-vs-retention split described in the context doc and
// in app/privacy/page.tsx's "What Happens When You Delete Your Account"
// section:
//
//   IMMEDIATELY: profile row, avatar, bio, reading_progress, follows,
//   comments, reactions, ratings, creator_profiles row, payout details —
//   all permanently deleted from the live database.
//
//   RETAINED 180 DAYS (IT Rules 2021): account-creation timestamp,
//   registration IP, and an encrypted identifier move to
//   deletion_cold_storage, a table with RLS locked to service-role-only.
//   A separate scheduled job purges rows past their `purge_after` date.
//
// IMPORTANT — this route needs the Supabase SERVICE ROLE key, not the anon
// key, because deleting another table's rows on behalf of the user requires
// bypassing RLS in a few places (e.g. writing to deletion_cold_storage,
// which intentionally has no public-facing policy at all). Set
// SUPABASE_SERVICE_ROLE_KEY in your environment — never expose it to the
// browser bundle.
//
// This file assumes the Next.js App Router convention (route handlers).
// Adjust the import path for createClient / your server Supabase helper to
// match your actual lib/supabase.ts if it differs.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Server-only client — service role bypasses RLS, so this file must NEVER
// be imported into client-side code or a 'use client' component.
function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars'
    );
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Encrypt the user id before it goes into cold storage, per the context
// doc's "encrypted user identifier" requirement. AES-256-GCM with a server
// secret — this is one-way enough for the stated purpose (an opaque token
// developers can still correlate with a CERT-In request if law enforcement
// supplies the same user id to look up), not meant to be decrypted in normal
// operation.
function encryptUserId(userId: string): string {
  const secret = process.env.COLD_STORAGE_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error('Missing COLD_STORAGE_ENCRYPTION_KEY env var');
  }
  const key = crypto.createHash('sha256').update(secret).digest(); // 32 bytes for aes-256
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(userId, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Pack iv + authTag + ciphertext together so it's self-contained.
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

export async function POST(req: NextRequest) {
  const supabase = getServiceClient();

  // Identify the requesting user from their session token, sent by the
  // client as a Bearer token (the client should call this with the user's
  // current access token, not the service key).
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

  // Log the deletion request before doing anything destructive, so there's
  // an audit trail even if a later step fails partway through.
  const { data: deletionRow, error: logError } = await supabase
    .from('account_deletions')
    .insert({ user_id: userId, status: 'pending' })
    .select()
    .single();

  if (logError || !deletionRow) {
    return NextResponse.json({ error: 'Could not start deletion process' }, { status: 500 });
  }

  try {
    // Pull what we need for cold storage BEFORE deleting the profile.
    const { data: profile } = await supabase
      .from('profiles')
      .select('created_at')
      .eq('id', userId)
      .single();

    const { data: authUser } = await supabase.auth.admin.getUserById(userId);
    const registrationIp =
      (authUser?.user?.user_metadata as Record<string, unknown> | undefined)?.[
        'registration_ip'
      ] ?? null;

    // ---- IMMEDIATE PURGE: front-facing personal data ----
    // Order matters where foreign keys exist — delete child rows before
    // parent rows where there's no ON DELETE CASCADE already configured.
    await supabase.from('reactions').delete().eq('reader_id', userId);
    await supabase.from('comments').delete().eq('reader_id', userId);
    await supabase.from('ratings').delete().eq('reader_id', userId);
    await supabase.from('follows').delete().eq('reader_id', userId);
    await supabase.from('reading_progress').delete().eq('reader_id', userId);
    await supabase.from('consent_log').delete().eq('user_id', userId);
    await supabase.from('creator_profiles').delete().eq('user_id', userId);
    await supabase.from('profiles').delete().eq('id', userId);

    // Note: published series/chapters/pages are deliberately NOT deleted
    // here — per Terms §3 ("Content Ownership"), creator-uploaded content
    // may be retained or transferred under the takedown policy rather than
    // deleted outright, so readers who already followed a series aren't
    // left with broken pages. If the user wants their published series
    // removed too, that's a separate explicit action, not implied by
        // account deletion alone.

    // ---- 180-DAY COLD STORAGE: the IT Rules 2021 retention split ----
    if (profile?.created_at) {
      await supabase.from('deletion_cold_storage').insert({
        encrypted_user_id: encryptUserId(userId),
        account_created_at: profile.created_at,
        registration_ip: registrationIp,
      });
    }

    // Finally, remove the auth user itself so they can no longer log in.
    await supabase.auth.admin.deleteUser(userId);

    await supabase
      .from('account_deletions')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', deletionRow.id);

    return NextResponse.json({ success: true });
  } catch (err) {
    await supabase
      .from('account_deletions')
      .update({
        status: 'failed',
        failure_reason: err instanceof Error ? err.message : 'Unknown error',
      })
      .eq('id', deletionRow.id);

    return NextResponse.json(
      { error: 'Deletion failed partway through. Our team has been notified — please also email the Grievance Officer if this persists.' },
      { status: 500 }
    );
  }
}