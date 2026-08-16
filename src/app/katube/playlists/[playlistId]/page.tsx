'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import VideoGridCard, { type GridVideo } from '../../components/VideoGridCard';
import { KaTubeShell } from '../../components/VideoGridCard';
import { X } from 'lucide-react';

export default function PlaylistDetailPage() {
  const { playlistId } = useParams<{ playlistId: string }>();
  const [title, setTitle] = useState('');
  const [videos, setVideos] = useState<GridVideo[]>([]);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    const { data: userData } = await supabase.auth.getUser();
    setUid(userData.user?.id || null);

    const { data: playlist } = await supabase.from('katube_playlists').select('title, owner_id').eq('id', playlistId).single();
    if (!playlist) { setLoading(false); return; }
    setTitle(playlist.title);
    setOwnerId(playlist.owner_id);

    const { data: items } = await supabase.from('katube_playlist_videos')
      .select('video_id, position, added_at')
      .eq('playlist_id', playlistId)
      .order('position', { ascending: true });

    const videoIds = (items || []).map(i => i.video_id);
    if (videoIds.length === 0) { setVideos([]); setLoading(false); return; }

    const { data: rows } = await supabase.from('videos').select('id, title, youtube_id, views, created_at, creator_id, series_id').in('id', videoIds);
    const creatorIds = [...new Set((rows || []).map(r => r.creator_id))];
    const seriesIds = [...new Set((rows || []).map(r => r.series_id).filter(Boolean))];
    const [creatorsRes, seriesRes] = await Promise.all([
      supabase.from('creator_profiles').select('user_id, username').in('user_id', creatorIds),
      seriesIds.length ? supabase.from('series').select('id, title').in('id', seriesIds) : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    ]);
    const creatorMap = new Map((creatorsRes.data || []).map(c => [c.user_id, c.username]));
    const seriesMap = new Map((seriesRes.data || []).map(s => [s.id, s.title]));
    const videoMap = new Map((rows || []).map(r => [r.id, r]));

    setVideos(videoIds.map(id => videoMap.get(id)).filter(Boolean).map(r => ({
      id: r!.id, title: r!.title, youtube_id: r!.youtube_id, views: r!.views, created_at: r!.created_at,
      creator: creatorMap.get(r!.creator_id) || 'MANGAL Creator',
      basedOn: r!.series_id ? (seriesMap.get(r!.series_id) || null) : null,
    })));
    setLoading(false);
  }

  useEffect(() => { if (playlistId) load(); }, [playlistId]);

  async function removeVideo(videoId: string) {
    await supabase.from('katube_playlist_videos').delete().eq('playlist_id', playlistId).eq('video_id', videoId);
    setVideos(v => v.filter(x => x.id !== videoId));
  }

  const isOwner = uid && ownerId && uid === ownerId;

  return (
    <KaTubeShell title={title || 'Playlist'} backHref="/katube/playlists">
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#6b7280', fontSize: '13px' }}>Loading…</div>
      ) : videos.length === 0 ? (
        <div style={{ maxWidth: '600px', padding: '18px 22px', borderRadius: '12px', background: '#0d0d14', border: '1px dashed rgba(255,255,255,0.18)', textAlign: 'center' }}>
          <p style={{ fontSize: '12.5px', color: '#9ca3af', margin: 0 }}>No videos in this playlist yet. Add some from any watch page.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
          {videos.map(v => (
            <div key={v.id} style={{ position: 'relative' }}>
              {isOwner && (
                <button
                  onClick={(e) => { e.stopPropagation(); removeVideo(v.id); }}
                  title="Remove from playlist"
                  style={{
                    position: 'absolute', top: '8px', right: '8px', zIndex: 1, width: '26px', height: '26px',
                    borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.75)', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                  }}
                >
                  <X size={14} />
                </button>
              )}
              <VideoGridCard video={v} />
            </div>
          ))}
        </div>
      )}
    </KaTubeShell>
  );
}
