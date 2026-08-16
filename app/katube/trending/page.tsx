'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import VideoGridCard, { type GridVideo } from '../components/VideoGridCard';
import { KaTubeShell } from '../components/VideoGridCard';
import { Flame } from 'lucide-react';

// §28a — Pure KaTube trending page: trending across all genres/creators,
// independent of any novel/series tie-in. Distinct from the existing
// tag-based "Up next" recommendations (§8), which are series-anchored —
// this is a single global ranked list, no series filter involved.
//
// Ranking: a simple recency-weighted score (views decayed by video age)
// rather than a raw views-desc sort, so a 6-month-old video with a big
// view count doesn't permanently camp the #1 spot over genuinely-hot
// recent uploads. No new column needed — computed client-side from
// views + created_at, same inputs the Popular/New tabs on the home grid
// already use.

interface Row {
  id: string; title: string; youtube_id: string; views: number; likes: number;
  created_at: string; creator_id: string; series_id: string | null;
}

function trendingScore(views: number, likes: number, createdAt: string): number {
  const ageHours = Math.max(1, (Date.now() - new Date(createdAt).getTime()) / 3600000);
  // Reddit-"hot"-style decay: engagement matters, but recency matters more
  // the older something gets. Likes weighted 3x views since a like is a
  // stronger signal than a view.
  return (views + likes * 3) / Math.pow(ageHours + 2, 1.3);
}

export default function TrendingPage() {
  const [videos, setVideos] = useState<GridVideo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: rows } = await supabase.from('videos')
        .select('id, title, youtube_id, views, likes, created_at, creator_id, series_id')
        .eq('is_short', false)
        .order('created_at', { ascending: false })
        .limit(300);

      if (!rows || rows.length === 0) { setLoading(false); return; }

      const ranked = [...(rows as Row[])].sort(
        (a, b) => trendingScore(b.views, b.likes, b.created_at) - trendingScore(a.views, a.likes, a.created_at)
      ).slice(0, 60);

      const creatorIds = [...new Set(ranked.map(r => r.creator_id))];
      const seriesIds = [...new Set(ranked.map(r => r.series_id).filter(Boolean))];
      const [creatorsRes, seriesRes] = await Promise.all([
        supabase.from('creator_profiles').select('user_id, username').in('user_id', creatorIds),
        seriesIds.length ? supabase.from('series').select('id, title').in('id', seriesIds) : Promise.resolve({ data: [] as { id: string; title: string }[] }),
      ]);
      const creatorMap = new Map((creatorsRes.data || []).map(c => [c.user_id, c.username]));
      const seriesMap = new Map((seriesRes.data || []).map(s => [s.id, s.title]));

      setVideos(ranked.map(r => ({
        id: r.id, title: r.title, youtube_id: r.youtube_id, views: r.views, created_at: r.created_at,
        creator: creatorMap.get(r.creator_id) || 'MANGAL Creator',
        basedOn: r.series_id ? (seriesMap.get(r.series_id) || null) : null,
      })));
      setLoading(false);
    })();
  }, []);

  return (
    <KaTubeShell title="Trending">
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '18px', color: '#f97316', fontSize: '13px', fontWeight: 700 }}>
        <Flame size={16} /> What&apos;s hot across all of KaTube right now
      </div>
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#6b7280', fontSize: '13px' }}>Loading…</div>
      ) : videos.length === 0 ? (
        <div style={{ maxWidth: '600px', margin: '40px auto', padding: '18px 22px', borderRadius: '12px', background: '#0d0d14', border: '1px dashed rgba(255,255,255,0.18)', textAlign: 'center' }}>
          <p style={{ fontSize: '12.5px', color: '#9ca3af', margin: 0 }}>Nothing trending yet — check back once there are a few uploads.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
          {videos.map((v, i) => (
            <div key={v.id} style={{ position: 'relative' }}>
              {i < 10 && (
                <div style={{
                  position: 'absolute', top: '8px', left: '8px', zIndex: 1,
                  background: 'rgba(0,0,0,0.75)', color: '#f97316', fontWeight: 900,
                  fontSize: '12px', padding: '2px 8px', borderRadius: '8px',
                }}>#{i + 1}</div>
              )}
              <VideoGridCard video={v} />
            </div>
          ))}
        </div>
      )}
    </KaTubeShell>
  );
}
