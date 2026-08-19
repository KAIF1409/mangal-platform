// §90 part 3 — one-time migration of pre-existing media out of the old
// Supabase Storage buckets (manga-pages, kcircle-media) into R2.
//
// Everything uploaded AFTER the §90 part 1/2 commits already lands in R2
// via /api/upload-media. This route only handles the backlog: rows whose
// url column still points at a Supabase public storage URL.
//
// Why a route instead of a local script: the R2 binding (MEDIA_BUCKET)
// only resolves inside the deployed Worker runtime (or `wrangler dev`),
// not a plain Node script run outside it — same constraint documented in
// lib/media/r2.ts. This route runs the copy *inside* the Worker instead,
// where both the R2 binding and outbound fetch() to Supabase's public
// URLs are available.
//
// Gated behind requireUser + developer role — same pattern as
// admin/mangal-of-the-week and admin/reports. Call it repeatedly (it's
// idempotent and batch-limited) until the response says hasMore: false.
// Safe to leave in the codebase afterward — once every row is migrated
// every batch becomes an instant no-op — but fine to delete once done too.
//
//   curl -X POST https://<your-worker-domain>/api/admin/migrate-media \
//     -H "Authorization: Bearer <your-session-access-token>" \
//     -H "Content-Type: application/json" -d '{"batchSize": 25}'

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireUser } from '../../../lib/auth/authedServerClient';
import { isDeveloperRole } from '../../../lib/auth/roles';
import { getMediaBucket } from '../../../lib/media/r2';

// Reads/writes in this route use the service-role client, not the caller's
// session-scoped one — most rows being migrated (series covers, pages,
// other creators' avatars/posts) are owned by other users, and RLS UPDATE
// policies on tables like `series`/`pages` only allow the row's own
// creator to write (no developer-role bypass exists for UPDATE, only for
// DELETE on `series`). Using the caller's client meant the R2 copy would
// silently succeed while the DB write was filtered out to 0 rows by RLS —
// found in production after a real run reported "18 succeeded" but the
// underlying series/pages rows still pointed at the old Supabase URLs.
// The developer-role check right below is what stands in for auth here
// (same reasoning as the webhook/service routes) — never remove it.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface MigrateResult {
  table: string;
  column: string;
  id: string;
  from: string;
  to: string;
  ok: boolean;
  error?: string;
}

// Old Supabase public storage URL shape:
// https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>
function parseSupabaseStorageUrl(url: string): { bucket: string; path: string } | null {
  const marker = '/storage/v1/object/public/';
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const rest = url.slice(idx + marker.length);
  const slash = rest.indexOf('/');
  if (slash === -1) return null;
  return { bucket: rest.slice(0, slash), path: decodeURIComponent(rest.slice(slash + 1)) };
}

function isAlreadyMigrated(url: string | null | undefined): boolean {
  return !url || url.includes('/api/media/');
}

// Downloads the file from its still-live Supabase public URL and writes
// it into R2 under `<bucket>/<path>` — same prefix convention r2.ts's
// MEDIA_FOLDERS already uses for new uploads (manga-pages/..., kcircle-media/...),
// so old and new files end up living side by side in the same layout.
async function migrateOneUrl(url: string): Promise<{ newUrl: string } | { error: string }> {
  const parsed = parseSupabaseStorageUrl(url);
  if (!parsed) return { error: 'Not a recognized Supabase storage URL — left untouched.' };

  const key = `${parsed.bucket}/${parsed.path}`;

  const bucket = getMediaBucket();
  const existing = await bucket.get(key);
  if (existing) return { newUrl: `/api/media/${key}` }; // already copied in a prior batch

  const fileRes = await fetch(url);
  if (!fileRes.ok) return { error: `Source fetch failed: ${fileRes.status}` };

  const contentType = fileRes.headers.get('content-type') || 'application/octet-stream';
  const bytes = await fileRes.arrayBuffer();
  await bucket.put(key, bytes, { httpMetadata: { contentType } });

  return { newUrl: `/api/media/${key}` };
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', auth.userId).single();
  if (!isDeveloperRole(profile?.role)) {
    return NextResponse.json({ error: 'Developer access only.' }, { status: 403 });
  }

  let body: { batchSize?: number };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  // Keeps each call comfortably inside the Worker's per-request CPU/wall
  // time budget — call this route again to keep chewing through the
  // backlog rather than raising the limit and risking a timeout mid-batch.
  const budget = Math.min(Math.max(body.batchSize ?? 25, 1), 100);
  let remaining = budget;
  const results: MigrateResult[] = [];

  // Each entry: which table/column to scan, and how to write the new
  // url(s) back. `select` uses the row's primary/lookup column plus the
  // url column(s); `applyUpdate` persists whatever migrateOneUrl produced.
  const jobs: Array<{
    table: string;
    idColumn: string;
    urlColumn: string;
    isArray?: boolean;
  }> = [
    { table: 'series', idColumn: 'id', urlColumn: 'cover_url' },
    { table: 'pages', idColumn: 'id', urlColumn: 'image_url' },
    { table: 'creator_profiles', idColumn: 'user_id', urlColumn: 'avatar_url' },
    { table: 'kcircle_posts', idColumn: 'id', urlColumn: 'image_url' },
    { table: 'kcircle_posts', idColumn: 'id', urlColumn: 'image_urls', isArray: true },
    { table: 'kcircle_stories', idColumn: 'id', urlColumn: 'image_url' },
    { table: 'kcircle_channel_messages', idColumn: 'id', urlColumn: 'image_url' },
    { table: 'kcircle_messages', idColumn: 'id', urlColumn: 'attachment_url' },
  ];

  for (const job of jobs) {
    if (remaining <= 0) break;

    if (job.isArray) {
      // Array column: fetch a page of non-null rows, filter in JS for any
      // element still pointing at Supabase (can't index into an array
      // column with `not ilike` in a single filter), migrate just the
      // unmigrated elements, write the whole array back.
      const { data: rows } = await supabaseAdmin
        .from(job.table)
        .select(`${job.idColumn}, ${job.urlColumn}`)
        .not(job.urlColumn, 'is', null)
        .limit(200);

      for (const row of (rows ?? []) as unknown as Record<string, unknown>[]) {
        if (remaining <= 0) break;
        const urls = (row[job.urlColumn] as string[] | null) ?? [];
        if (urls.every(isAlreadyMigrated)) continue;

        const newUrls: string[] = [];
        let rowFailed = false;
        for (const u of urls) {
          if (remaining <= 0) { newUrls.push(u); continue; } // budget hit mid-row — leave rest for next batch
          if (isAlreadyMigrated(u)) { newUrls.push(u); continue; }
          const outcome = await migrateOneUrl(u);
          remaining--;
          if ('error' in outcome) {
            results.push({ table: job.table, column: job.urlColumn, id: String(row[job.idColumn]), from: u, to: '', ok: false, error: outcome.error });
            newUrls.push(u); // keep old url, don't lose the reference
            rowFailed = true;
          } else {
            results.push({ table: job.table, column: job.urlColumn, id: String(row[job.idColumn]), from: u, to: outcome.newUrl, ok: true });
            newUrls.push(outcome.newUrl);
          }
        }
        if (!rowFailed) {
          await supabaseAdmin.from(job.table).update({ [job.urlColumn]: newUrls }).eq(job.idColumn, row[job.idColumn]);
        }
      }
      continue;
    }

    const { data: rows } = await supabaseAdmin
      .from(job.table)
      .select(`${job.idColumn}, ${job.urlColumn}`)
      .not(job.urlColumn, 'is', null)
      .not(job.urlColumn, 'ilike', '%/api/media/%')
      .limit(remaining);

    for (const row of (rows ?? []) as unknown as Record<string, unknown>[]) {
      if (remaining <= 0) break;
      const url = row[job.urlColumn] as string;
      if (isAlreadyMigrated(url)) continue;

      const outcome = await migrateOneUrl(url);
      remaining--;

      if ('error' in outcome) {
        results.push({ table: job.table, column: job.urlColumn, id: String(row[job.idColumn]), from: url, to: '', ok: false, error: outcome.error });
        continue;
      }

      const { error: updateError } = await supabaseAdmin
        .from(job.table)
        .update({ [job.urlColumn]: outcome.newUrl })
        .eq(job.idColumn, row[job.idColumn]);

      results.push({
        table: job.table, column: job.urlColumn, id: String(row[job.idColumn]),
        from: url, to: outcome.newUrl, ok: !updateError,
        error: updateError?.message,
      });
    }
  }

  return NextResponse.json({
    processed: results.length,
    succeeded: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok),
    hasMore: remaining <= 0, // budget fully used up — likely more left; call again
    results,
  });
}
