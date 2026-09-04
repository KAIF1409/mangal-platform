import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '../../lib/auth/authedServerClient';
import { getMediaBucket } from '../../lib/media/r2';
import { purgeMediaEdgeCache } from '../../lib/media/cachePurge';

// Replaces client-side `supabase.storage.from(bucket).remove([...])`.
// Ownership check: every key this app generates is prefixed
// `<folder>/<userId>-...` (see upload-media/route.ts), so a user can only
// ever delete their own uploads — the same practical guarantee the old
// per-bucket RLS policies gave, without needing a DB lookup here.
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body: { paths?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const paths = (body.paths || []).filter((p): p is string => typeof p === 'string' && p.length > 0);
  if (paths.length === 0) return NextResponse.json({ ok: true, deleted: 0 });

  const filename = (key: string) => key.split('/').pop() || '';
  const owned = paths.filter(p => filename(p).startsWith(`${auth.userId}-`));
  if (owned.length !== paths.length) {
    return NextResponse.json({ error: "Can't delete files you don't own." }, { status: 403 });
  }

  try {
    const bucket = getMediaBucket();
    await bucket.delete(owned);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Delete failed.' },
      { status: 500 }
    );
  }

  // CDN hygiene: /api/media serves R2 objects with a 1-year immutable
  // edge-cache entry, so a deleted object would otherwise keep being served
  // from the edge for up to a year. Purge the matching Cache API entries —
  // best-effort (per-PoP only; see cachePurge.ts) and never fatal: the R2
  // delete itself already succeeded.
  try {
    await purgeMediaEdgeCache(new URL(req.url).origin, owned);
  } catch {
    // ignore — purge is opportunistic
  }

  return NextResponse.json({ ok: true, deleted: owned.length });
}
