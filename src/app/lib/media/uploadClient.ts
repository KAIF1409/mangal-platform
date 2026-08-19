// Client-side replacement for direct `supabase.storage.from(bucket).upload()`
// / `.remove()` calls — goes through /api/upload-media and /api/delete-media
// instead, since the R2 binding only exists server-side. See r2.ts for the
// folder allowlist and CONTEXT.md §20 for the migration rationale.

import { supabase } from '../supabase';
import { MEDIA_FOLDERS } from './r2';

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token || ''}` };
}

export interface UploadResult {
  path: string; // relative key, e.g. "manga-pages/covers/<user>-<ts>.png"
  url: string;  // full path to fetch it back, e.g. "/api/media/manga-pages/covers/<user>-<ts>.png"
}

export async function uploadMediaFile(
  file: File,
  folder: (typeof MEDIA_FOLDERS)[keyof typeof MEDIA_FOLDERS]
): Promise<UploadResult> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('folder', folder);

  const res = await fetch('/api/upload-media', {
    method: 'POST',
    headers: await authHeader(),
    body: formData,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Upload failed.');
  // Absolute URL — mirrors the old Supabase public URL shape, since a few
  // call sites parse the stored image_url with `new URL(...)`.
  return { path: data.path, url: `${window.location.origin}${data.url}` } as UploadResult;
}

export async function deleteMediaFiles(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const res = await fetch('/api/delete-media', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ paths }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Delete failed.');
  }
}

export { MEDIA_FOLDERS };
