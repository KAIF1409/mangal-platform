'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { KaTubeShell } from '../components/VideoGridCard';
import { setPostLoginRedirect } from '../../lib/auth/authRedirect';
import { ListVideo, Plus } from 'lucide-react';

// §28a — Playlists: viewer builds their own playlist across creators/
// videos (YouTube-style), stored as MANGAL data (video ID references
// only — see katube_playlists / katube_playlist_videos migration).

interface PlaylistRow { id: string; title: string; created_at: string; count: number }

export default function PlaylistsPage() {
  const [playlists, setPlaylists] = useState<PlaylistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);

  async function load() {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) {
      setSignedIn(false);
      setLoading(false);
      // Set eagerly, not only when "Sign in" is clicked — sidesteps the
      // Next.js <Link>/prefetch quirk (see app/katube/upload/page.tsx's
      // comment, confirmed 11 Aug 2026) where /login?next=... can render
      // without ever picking up the ?next= value client-side.
      setPostLoginRedirect('/katube/playlists');
      return;
    }
    setSignedIn(true);

    const { data: rows } = await supabase.from('katube_playlists')
      .select('id, title, created_at, katube_playlist_videos(video_id)')
      .eq('owner_id', uid)
      .order('created_at', { ascending: false });

    setPlaylists((rows || []).map((r) => ({
      id: r.id, title: r.title, created_at: r.created_at,
      count: Array.isArray(r.katube_playlist_videos) ? r.katube_playlist_videos.length : 0,
    })));
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function createPlaylist() {
    if (!newTitle.trim()) return;
    setCreating(true);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) { setCreating(false); return; }
    await supabase.from('katube_playlists').insert({ owner_id: uid, title: newTitle.trim() });
    setNewTitle('');
    setCreating(false);
    load();
  }

  return (
    <KaTubeShell title="Playlists">
      {signedIn === false ? (
        <div style={{ maxWidth: '600px', margin: '40px auto', padding: '18px 22px', borderRadius: '12px', background: '#0d0d14', border: '1px dashed rgba(255,255,255,0.18)', textAlign: 'center' }}>
          <p style={{ fontSize: '12.5px', color: '#9ca3af', margin: 0 }}>
            Sign in to build playlists. <Link href="/login?next=/katube/playlists" style={{ color: '#f97316', fontWeight: 700 }}>Sign in</Link>
          </p>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '24px', maxWidth: '420px' }}>
            <input
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createPlaylist(); }}
              placeholder="New playlist name"
              style={{
                flex: 1, padding: '10px 14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.18)',
                background: '#08080c', color: '#f9fafb', fontSize: '13px', outline: 'none',
              }}
            />
            <button
              onClick={createPlaylist}
              disabled={creating || !newTitle.trim()}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 16px', borderRadius: '10px',
                border: 'none', background: '#f97316', color: '#fff', fontWeight: 700, fontSize: '13px',
                cursor: creating || !newTitle.trim() ? 'default' : 'pointer', opacity: creating || !newTitle.trim() ? 0.6 : 1,
              }}
            >
              <Plus size={15} /> Create
            </button>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#6b7280', fontSize: '13px' }}>Loading…</div>
          ) : playlists.length === 0 ? (
            <div style={{ maxWidth: '600px', padding: '18px 22px', borderRadius: '12px', background: '#0d0d14', border: '1px dashed rgba(255,255,255,0.18)', textAlign: 'center' }}>
              <p style={{ fontSize: '12.5px', color: '#9ca3af', margin: 0 }}>No playlists yet — create one above, then add videos from any watch page.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '14px' }}>
              {playlists.map(p => (
                <Link key={p.id} href={`/katube/playlists/${p.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div style={{
                    padding: '18px', borderRadius: '14px', background: '#0d0d14', border: '1px solid rgba(255,255,255,0.14)',
                    display: 'flex', flexDirection: 'column', gap: '10px', cursor: 'pointer',
                  }}>
                    <ListVideo size={20} color="#f97316" />
                    <div style={{ fontSize: '14px', fontWeight: 700 }}>{p.title}</div>
                    <div style={{ fontSize: '11.5px', color: '#6b7280' }}>{p.count} video{p.count === 1 ? '' : 's'}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </KaTubeShell>
  );
}
