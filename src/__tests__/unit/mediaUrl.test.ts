// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  MEDIA_ROUTE_PREFIX,
  mediaPathFromUrl,
  resolveMediaUrl,
} from '@/app/lib/media/mediaUrl';

const LIVE_ORIGIN = 'https://mangal-platform.mangak.workers.dev';

// pages.image_url stores an ABSOLUTE url including the origin the upload
// happened on (uploadClient.ts). Opening the Edit screen from any other origin
// (preview deploy, localhost, a future custom domain) therefore rendered every
// page as a broken thumbnail — which reads as "my pages are gone, I must
// re-upload the PDF". These tests pin the render-time rewrite that fixes it.
describe('resolveMediaUrl', () => {
  it('rewrites a foreign-origin media URL back to this deployment', () => {
    const stored = `http://localhost:3000${MEDIA_ROUTE_PREFIX}chapter-pages/abc.jpg`;
    expect(resolveMediaUrl(stored, LIVE_ORIGIN)).toBe(
      `${MEDIA_ROUTE_PREFIX}chapter-pages/abc.jpg`
    );
  });

  it('keeps the query string when rewriting', () => {
    const stored = 'https://old-preview.example.com/api/media/chapter-pages/a.jpg?v=2';
    expect(resolveMediaUrl(stored, LIVE_ORIGIN)).toBe(
      '/api/media/chapter-pages/a.jpg?v=2'
    );
  });

  it('leaves a same-origin URL exactly as stored', () => {
    const stored = `${LIVE_ORIGIN}${MEDIA_ROUTE_PREFIX}chapter-pages/abc.jpg`;
    expect(resolveMediaUrl(stored, LIVE_ORIGIN)).toBe(stored);
  });

  it('leaves relative paths and blob/data previews alone', () => {
    expect(resolveMediaUrl('/api/media/pages/a.jpg', LIVE_ORIGIN)).toBe('/api/media/pages/a.jpg');
    expect(resolveMediaUrl('blob:http://localhost:3000/1a2b', LIVE_ORIGIN)).toBe('blob:http://localhost:3000/1a2b');
    expect(resolveMediaUrl('data:image/png;base64,AAAA', LIVE_ORIGIN)).toBe('data:image/png;base64,AAAA');
  });

  it('does not touch legacy Supabase Storage or external URLs', () => {
    // Those are served by somebody else — rewriting them would break them.
    const supabase = 'https://xyz.supabase.co/storage/v1/object/public/manga-pages/1.png';
    expect(resolveMediaUrl(supabase, LIVE_ORIGIN)).toBe(supabase);
    const youtube = 'https://i.ytimg.com/vi/abc/hqdefault.jpg';
    expect(resolveMediaUrl(youtube, LIVE_ORIGIN)).toBe(youtube);
  });

  it('returns the input unchanged for empty, garbage and no-origin input', () => {
    expect(resolveMediaUrl('', LIVE_ORIGIN)).toBe('');
    expect(resolveMediaUrl('not a url', LIVE_ORIGIN)).toBe('not a url');
    // SSR: no origin known, so there is nothing better to return than stored.
    const stored = `${LIVE_ORIGIN}${MEDIA_ROUTE_PREFIX}a.jpg`;
    expect(resolveMediaUrl(stored, '')).toBe(stored);
  });
});

describe('mediaPathFromUrl', () => {
  it('extracts the R2 key, decoded and without query/scheme', () => {
    expect(mediaPathFromUrl(`${LIVE_ORIGIN}${MEDIA_ROUTE_PREFIX}chapter-pages/a.jpg`)).toBe('chapter-pages/a.jpg');
    expect(mediaPathFromUrl('/api/media/chapter-pages/a%20b.jpg?v=3')).toBe('chapter-pages/a b.jpg');
    expect(mediaPathFromUrl(`${MEDIA_ROUTE_PREFIX}manga-pages/covers/x.png`)).toBe('manga-pages/covers/x.png');
  });

  it('returns null for anything that is not one of our media URLs', () => {
    expect(mediaPathFromUrl('')).toBeNull();
    expect(mediaPathFromUrl('https://xyz.supabase.co/storage/v1/object/public/a.png')).toBeNull();
    expect(mediaPathFromUrl(`${LIVE_ORIGIN}${MEDIA_ROUTE_PREFIX}`)).toBeNull();
  });

  it('survives a malformed percent-escape instead of throwing', () => {
    expect(mediaPathFromUrl('/api/media/bad%zz.jpg')).toBe('bad%zz.jpg');
  });
});
