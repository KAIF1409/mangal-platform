'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { useStudioAuth } from './lib/useStudioAuth';
import { TrendingUp, ArrowRight } from 'lucide-react';

interface KatubeStats {
  totalVideos: number;
  totalViews: number;
  totalLikes: number;
  totalFollowers: number;
  followersGained28d: number;
}

interface VideoPerf {
  id: string;
  title: string;
  views: number;
  likes: number;
  isShort: boolean;
}

export default function KatubeStudioOverview() {
  const { user, loading } = useStudioAuth('/mangal-studio/katube');
  const [statsLoading, setStatsLoading] = useState(true);
  const [stats, setStats] = useState<KatubeStats>({ totalVideos: 0, totalViews: 0, totalLikes: 0, totalFollowers: 0, followersGained28d: 0 });
  const [videoPerf, setVideoPerf] = useState<VideoPerf[]>([]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const since28d = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString();
      const [videosRes, followersRes, recentFollowersRes] = await Promise.all([
        supabase.from('videos').select('id, title, views, likes, is_short').eq('creator_id', user.id),
        supabase.from('creator_follows').select('follower_id', { count: 'exact', head: true }).eq('creator_id', user.id),
        supabase.from('creator_follows').select('follower_id', { count: 'exact', head: true }).eq('creator_id', user.id).gte('created_at', since28d),
      ]);
      const data = videosRes.data ?? [];
      const totalVideos = data.length;
      const totalViews = data.reduce((sum, v) => sum + (v.views ?? 0), 0);
      const totalLikes = data.reduce((sum, v) => sum + (v.likes ?? 0), 0);
      setStats({
        totalVideos, totalViews, totalLikes,
        totalFollowers: followersRes.count ?? 0,
        followersGained28d: recentFollowersRes.count ?? 0,
      });
      setVideoPerf(
        [...data]
          .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
          .map(v => ({ id: v.id, title: v.title, views: v.views ?? 0, likes: v.likes ?? 0, isShort: v.is_short }))
      );
      setStatsLoading(false);
    };
    load();
  }, [user]);

  if (loading || statsLoading) {
    return <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px' }}>Loading…</div>;
  }

  return (
    <div style={{ maxWidth: '860px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '20px' }}>
        {[
          { label: 'Videos', value: stats.totalVideos },
          { label: 'Total views', value: stats.totalViews },
          { label: 'Total likes', value: stats.totalLikes },
          { label: 'Followers', value: stats.totalFollowers },
        ].map(m => (
          <div key={m.label} style={{ padding: '16px', borderRadius: '12px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', textAlign: 'center' }}>
            <div style={{ fontSize: '20px', fontWeight: 900 }}>{m.value.toLocaleString()}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>{m.label}</div>
          </div>
        ))}
      </div>

      <div style={{
        padding: '14px 18px', borderRadius: '12px', background: 'var(--bg-card)',
        border: '1px solid var(--border-color)', marginBottom: '20px',
        display: 'flex', alignItems: 'center', gap: '10px',
      }}>
        <TrendingUp size={16} color="var(--accent)" />
        <div style={{ fontSize: '13px' }}>
          <strong>{stats.followersGained28d.toLocaleString()}</strong> new followers in the last 28 days
        </div>
      </div>

      {videoPerf.length > 0 ? (
        <div style={{ padding: '18px 20px', borderRadius: '12px', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '4px' }}>
            <h2 style={{ fontSize: '14px', fontWeight: 800, margin: 0 }}>Video performance</h2>
            <Link href="/mangal-studio/katube/content" style={{ fontSize: '11.5px', color: 'var(--accent)', fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px' }}>
              See all content <ArrowRight size={12} />
            </Link>
          </div>
          <p style={{ fontSize: '11.5px', color: 'var(--text-tertiary)', margin: '0 0 14px' }}>Ranked by views, highest first.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {videoPerf.slice(0, 10).map(v => {
              const maxViews = videoPerf[0]?.views || 1;
              const barPct = Math.max(4, Math.round((v.views / maxViews) * 100));
              return (
                <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {v.title} {v.isShort && <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>· Fast Tap</span>}
                  </div>
                  <div style={{ width: '120px', height: '6px', borderRadius: '4px', background: 'var(--border-color)', overflow: 'hidden', flexShrink: 0 }}>
                    <div style={{ width: `${barPct}%`, height: '100%', background: 'var(--accent)' }} />
                  </div>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', width: '54px', textAlign: 'right', flexShrink: 0 }}>{v.views.toLocaleString()}</div>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-tertiary)', width: '46px', textAlign: 'right', flexShrink: 0 }}>♡ {v.likes.toLocaleString()}</div>
                </div>
              );
            })}
            {videoPerf.length > 10 && (
              <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', margin: '4px 0 0', textAlign: 'center' }}>+{videoPerf.length - 10} more — see Content tab</p>
            )}
          </div>
        </div>
      ) : (
        <div style={{ padding: '30px', textAlign: 'center', borderRadius: '12px', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', margin: '0 0 14px' }}>No videos yet — upload your first one to start seeing stats here.</p>
          <Link href="/katube/upload" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 18px', borderRadius: '10px', textDecoration: 'none', background: 'var(--accent)', color: '#fff', fontSize: '13px', fontWeight: 800 }}>
            Upload a video <ArrowRight size={14} />
          </Link>
        </div>
      )}
    </div>
  );
}
