'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BookOpen, ListPlus, Plus, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';

// Shared card used by the new §28a pages (Subscriptions, Trending,
// Playlists) — pulled out of app/katube/page.tsx's inline RealVideoCard so
// these new routes don't duplicate the whole 890-line home page just to
// render a grid. Visual style matches RealVideoCard exactly (same
// thumbnail, hover-lift, based-on chip) so a card looks identical whether
// you're looking at it on Home, Trending, or Subscriptions.

export interface GridVideo {
  id: string;
  title: string;
  youtube_id: string;
  views: number;
  created_at: string;
  creator: string;
  basedOn: string | null;
}

export function timeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function VideoGridCard({ video, badge }: { video: GridVideo; badge?: React.ReactNode }) {
  const [hover, setHover] = useState(false);
  const router = useRouter();
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => router.push(`/katube/watch/${video.id}`)}
      style={{
        borderRadius: '14px', overflow: 'hidden', cursor: 'pointer',
        background: 'var(--bg-card)', border: '1px solid var(--border-color)',
        transition: 'transform 0.15s, box-shadow 0.2s',
        transform: hover ? 'translateY(-4px)' : 'none',
        boxShadow: hover ? '0 12px 28px rgba(249,115,22,0.20)' : 'none',
      }}
    >
      <div style={{ position: 'relative', aspectRatio: '16/9', background: '#000' }}>
        <img
          src={`https://img.youtube.com/vi/${video.youtube_id}/hqdefault.jpg`}
          alt={video.title}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
        {badge && (
          <div style={{ position: 'absolute', bottom: '8px', right: '8px' }}>{badge}</div>
        )}
        {hover && (
          <div style={{
            position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              width: '46px', height: '46px', borderRadius: '50%',
              background: 'rgba(255,255,255,0.92)', display: 'flex',
              alignItems: 'center', justifyContent: 'center', fontSize: '18px',
            }}>▶️</div>
          </div>
        )}
      </div>
      <div style={{ padding: '12px 14px' }}>
        <div style={{
          fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary)',
          lineHeight: 1.35, marginBottom: '6px',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>{video.title}</div>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
          {video.creator} · {timeAgo(video.created_at)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
          {video.basedOn ? (
            <span style={{
              fontSize: '10.5px', fontWeight: 700, color: '#f97316',
              background: 'rgba(249,115,22,0.10)', border: '1px solid rgba(249,115,22,0.28)',
              padding: '3px 9px', borderRadius: '20px', whiteSpace: 'nowrap',
              display: 'inline-flex', alignItems: 'center', gap: '4px',
            }}>
              <BookOpen size={11} /> {video.basedOn}
            </span>
          ) : <span />}
          <span style={{ fontSize: '11.5px', color: 'var(--text-tertiary)' }}>{video.views} views</span>
        </div>
      </div>
    </div>
  );
}

// §28a — "Save to playlist" button for the watch page. Small popover:
// lists the viewer's own playlists with a checkbox-like toggle, plus an
// inline "new playlist" field so a viewer never has to leave the watch
// page to start one. Signed-out viewers just don't see this button at
// all (parent page only renders it once `userId` is known).
export function AddToPlaylistButton({ videoId, userId }: { videoId: string; userId: string }) {
  const [open, setOpen] = useState(false);
  const [playlists, setPlaylists] = useState<{ id: string; title: string; has: boolean }[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      const { data: mine } = await supabase.from('katube_playlists').select('id, title').eq('owner_id', userId).order('created_at', { ascending: false });
      const { data: memberships } = await supabase.from('katube_playlist_videos').select('playlist_id').eq('video_id', videoId);
      const haveSet = new Set((memberships || []).map(m => m.playlist_id));
      setPlaylists((mine || []).map(p => ({ id: p.id, title: p.title, has: haveSet.has(p.id) })));
      setLoading(false);
    })();
  }, [open, userId, videoId]);

  async function toggle(playlistId: string, has: boolean) {
    setPlaylists(ps => ps.map(p => p.id === playlistId ? { ...p, has: !has } : p));
    if (has) {
      await supabase.from('katube_playlist_videos').delete().eq('playlist_id', playlistId).eq('video_id', videoId);
    } else {
      await supabase.from('katube_playlist_videos').insert({ playlist_id: playlistId, video_id: videoId });
    }
  }

  async function createAndAdd() {
    if (!newTitle.trim()) return;
    const { data: pl } = await supabase.from('katube_playlists').insert({ owner_id: userId, title: newTitle.trim() }).select('id, title').single();
    if (pl) {
      await supabase.from('katube_playlist_videos').insert({ playlist_id: pl.id, video_id: videoId });
      setPlaylists(ps => [{ id: pl.id, title: pl.title, has: true }, ...ps]);
      setNewTitle('');
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700,
          color: 'var(--text-secondary)', background: 'transparent', border: '1px solid var(--border-color)',
          borderRadius: '20px', padding: '4px 12px', cursor: 'pointer',
        }}
      >
        <ListPlus size={14} /> Save
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
          <div style={{
            position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 21, width: '260px',
            background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px',
            padding: '10px', boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
          }}>
            <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-primary)', padding: '4px 6px 8px' }}>Save to playlist</div>
            {loading ? (
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', padding: '6px' }}>Loading…</div>
            ) : playlists.length === 0 ? (
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', padding: '6px' }}>No playlists yet.</div>
            ) : (
              <div style={{ maxHeight: '160px', overflowY: 'auto', marginBottom: '8px' }}>
                {playlists.map(p => (
                  <div
                    key={p.id}
                    onClick={() => toggle(p.id, p.has)}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 6px', borderRadius: '8px', cursor: 'pointer', fontSize: '12.5px', color: 'var(--text-primary)' }}
                  >
                    <span style={{
                      width: '16px', height: '16px', borderRadius: '4px', border: '1.5px solid var(--border-color)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: p.has ? '#f97316' : 'transparent', borderColor: p.has ? '#f97316' : 'var(--border-color)',
                    }}>{p.has && <Check size={11} color="#fff" />}</span>
                    {p.title}
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: '6px', borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
              <input
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') createAndAdd(); }}
                placeholder="New playlist"
                style={{ flex: 1, fontSize: '12px', padding: '6px 8px', borderRadius: '7px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none' }}
              />
              <button onClick={createAndAdd} style={{ display: 'flex', alignItems: 'center', border: 'none', background: '#f97316', color: '#fff', borderRadius: '7px', padding: '0 9px', cursor: 'pointer' }}>
                <Plus size={13} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Shared dark-first page chrome (top bar with back link + title) so the new
// §28a routes read as part of KaTube rather than bare unstyled pages. Not a
// full re-implementation of the home page's nav — just enough chrome to
// orient the viewer and get back home, matching KaTube's dark-by-default
// background/text colors (see katubeDarkVars in app/katube/page.tsx).
export function KaTubeShell({ title, backHref = '/katube', children }: { title: string; backHref?: string; children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh', background: '#07070a', color: '#f9fafb',
    } as React.CSSProperties}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 10, background: 'rgba(7,7,10,0.97)',
        borderBottom: '1px solid rgba(255,255,255,0.1)', padding: '14px 20px',
        display: 'flex', alignItems: 'center', gap: '14px',
      }}>
        <Link href={backHref} style={{ color: '#9ca3af', textDecoration: 'none', fontSize: '13px', fontWeight: 600 }}>← KaTube</Link>
        <h1 style={{ fontSize: '15px', fontWeight: 900, margin: 0, letterSpacing: '-0.02em' }}>{title}</h1>
      </div>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 20px 60px' }}>
        {children}
      </div>
    </div>
  );
}
