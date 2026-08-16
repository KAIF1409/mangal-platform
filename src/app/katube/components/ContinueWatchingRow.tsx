'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';

// §28a — Continue Watching row, surfaced near the top of the KaTube home
// grid. Reads katube_watch_progress (written by KaTubePlayer's periodic
// getCurrentTime() save) joined against videos, sorted by most-recently-
// watched. Only meaningful past a few seconds of progress and clearly not
// finished (< 92% through) — a video watched to the end shouldn't linger
// here as "continue watching".

interface ProgressItem {
  videoId: string;
  title: string;
  youtubeId: string;
  positionSeconds: number;
  durationSeconds: number | null;
  pct: number;
}

export default function ContinueWatchingRow({ userId }: { userId: string }) {
  const [items, setItems] = useState<ProgressItem[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const { data: rows } = await supabase.from('katube_watch_progress')
        .select('video_id, position_seconds, duration_seconds, updated_at')
        .eq('viewer_id', userId)
        .order('updated_at', { ascending: false })
        .limit(12);

      if (!rows || rows.length === 0) { setLoading(false); return; }

      const videoIds = rows.map(r => r.video_id);
      const { data: videos } = await supabase.from('videos').select('id, title, youtube_id').in('id', videoIds);
      const videoMap = new Map((videos || []).map(v => [v.id, v]));

      const built: ProgressItem[] = rows
        .map(r => {
          const v = videoMap.get(r.video_id);
          if (!v) return null;
          const pct = r.duration_seconds ? Math.min(100, Math.round((r.position_seconds / r.duration_seconds) * 100)) : 0;
          return { videoId: r.video_id, title: v.title, youtubeId: v.youtube_id, positionSeconds: r.position_seconds, durationSeconds: r.duration_seconds, pct };
        })
        .filter((x): x is ProgressItem => x !== null && x.pct < 92);

      setItems(built);
      setLoading(false);
    })();
  }, [userId]);

  if (loading || items.length === 0) return null;

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto 28px', padding: '0 20px' }}>
      <h2 style={{ fontSize: '16px', fontWeight: 900, margin: '0 0 14px', letterSpacing: '-0.02em' }}>Continue Watching</h2>
      <div style={{ display: 'flex', gap: '14px', overflowX: 'auto', paddingBottom: '4px' }}>
        {items.map(item => (
          <div
            key={item.videoId}
            onClick={() => router.push(`/katube/watch/${item.videoId}`)}
            style={{
              flexShrink: 0, width: '220px', cursor: 'pointer', borderRadius: '12px', overflow: 'hidden',
              background: 'var(--bg-card)', border: '1px solid var(--border-color)',
            }}
          >
            <div style={{ position: 'relative', aspectRatio: '16/9', background: '#000' }}>
              <img
                src={`https://img.youtube.com/vi/${item.youtubeId}/hqdefault.jpg`}
                alt={item.title}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '4px', background: 'rgba(255,255,255,0.25)' }}>
                <div style={{ height: '100%', width: `${item.pct}%`, background: '#f97316' }} />
              </div>
            </div>
            <div style={{
              padding: '8px 10px', fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)',
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>{item.title}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
