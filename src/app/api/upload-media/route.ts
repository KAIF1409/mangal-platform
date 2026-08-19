import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '../../lib/auth/authedServerClient';
import { getMediaBucket, MEDIA_FOLDERS } from '../../lib/media/r2';

// Replaces direct client-side `supabase.storage.from(bucket).upload(...)`
// calls (see CONTEXT.md §20 for the Supabase→R2 rationale). The R2
// binding only exists server-side inside the Worker, so uploads now go
// through this route instead of a browser SDK talking to storage
// directly with an anon key + RLS policy.
//
// folder must be one of MEDIA_FOLDERS' values — an allowlist, not a
// free-form client-supplied path, so nothing can write outside the
// expected prefixes in the bucket.
const ALLOWED_FOLDERS = new Set<string>(Object.values(MEDIA_FOLDERS));

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid upload — expected multipart/form-data.' }, { status: 400 });
  }

  const file = formData.get('file');
  const folder = formData.get('folder');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing file.' }, { status: 400 });
  }
  if (typeof folder !== 'string' || !ALLOWED_FOLDERS.has(folder)) {
    return NextResponse.json({ error: 'Invalid or missing folder.' }, { status: 400 });
  }

  // 15MB cap — generous for a manga page/cover/avatar image, prevents
  // someone from streaming an enormous file through the Worker.
  const MAX_BYTES = 15 * 1024 * 1024;
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File too large — 15MB max.' }, { status: 413 });
  }

  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
  const key = `${folder}/${auth.userId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  try {
    const bucket = getMediaBucket();
    const bytes = await file.arrayBuffer();
    await bucket.put(key, bytes, {
      httpMetadata: { contentType: file.type || 'application/octet-stream' },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Upload failed.' },
      { status: 500 }
    );
  }

  // Full path is what callers store in the DB and what /api/media serves.
  return NextResponse.json({ path: key, url: `/api/media/${key}` });
}
