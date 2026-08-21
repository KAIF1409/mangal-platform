'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useStudioAuth } from '../lib/useStudioAuth';
import { Info } from 'lucide-react';

interface VideoRow {
  id: string;
  title: string;
  is_short: boolean;
  views: number;
  likes: number;
  duration_seconds: number | null;
  created_at: string;
}

interface WatchRow {
  video_id: string;
  position_seconds: number;
  duration_seconds: number | null;
}

type ContentType = 'long' | 'short';

function fmtPct(n: number) {
  return `${n.toFixed(1)}%`;
}

export default function KatubeStudioAnalytics() {
  const { user, loading } = useStudioAuth('/mangal-studio/katube/analytics');
  const [contentType, setContentType] = useState<ContentType>('long');
  const [dataLoading, setDataLoading] = useState(true);
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [watchRows, setWatchRows] = useState<WatchRow[]>([]);
  const [commentCount, setCommentCount] = useState(0);
  const [followersGained, setFollowersGained] = useState(0);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const since28d = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString();
      const { data: videoData } = await supabase
        .from('videos')
        .select('id, title, is_short, views, likes, duration_seconds, created_at')
        .eq('creator_id', user.id);
      const vids = videoData ?? [];
      setVideos(vids);

      const videoIds = vids.map(v => v.id);
      if (videoIds.length > 0) {
        // §114 Tier 1.5 — now readable thanks to the new
        // "Creators can view watch progress on their own videos" policy.
        const [watchRes, commentsRes, followRes] = await Promise.all([
          supabase.from('katube_watch_progress').select('video_id, position_seconds, duration_seconds').in('video_id', videoIds),
          supabase.from('video_comments').select('id', { count: 'exact', head: true }).in('video_id', videoIds),
          supabase.from('creator_follows').select('follower_id', { count: 'exact', head: true }).eq('creator_id', user.id).gte('created_at', since28d),
        ]);
        setWatchRows(watchRes.data ?? []);
        setCommentCount(commentsRes.count ?? 0);
        setFollowersGained(followRes.count ?? 0);
      }
      setDataLoading(false);
    };
    load();
  }, [user]);

  const scoped = useMemo(() => videos.filter(v => (contentType === 'short') === v.is_short), [videos, contentType]);
  const scopedIds = useMemo(() => new Set(scoped.map(v => v.id)), [scoped]);

  const totals = useMemo(() => {
    const totalViews = scoped.reduce((s, v) => s + (v.views ?? 0), 0);
    const totalLikes = scoped.reduce((s, v) => s + (v.likes ?? 0), 0);
    return { totalViews, totalLikes, count: scoped.length };
  }, [scoped]);

  // Completion % per video, from katube_watch_progress — coarse (latest
  // position per viewer, not a per-second curve, per §114's Tier 1.5
  // scope note) but a real, non-fabricated number.
  const completionByVideo = useMemo(() => {
    const relevant = watchRows.filter(w => scopedIds.has(w.video_id));
    const map: Record<string, { sum: number; n: number }> = {};
    for (const w of relevant) {
      const dur = w.duration_seconds || scoped.find(v => v.id === w.video_id)?.duration_seconds;
      if (!dur || dur <= 0) continue;
      const pct = Math.min(100, (w.position_seconds / dur) * 100);
      if (!map[w.video_id]) map[w.video_id] = { sum: 0, n: 0 };
      map[w.video_id].sum += pct;
      map[w.video_id].n += 1;
    }
    return map;
  }, [watchRows, scopedIds, scoped]);

  const avgCompletion = useMemo(() => {
    const entries = Object.values(completionByVideo);
    if (entries.length === 0) return null;
    const totalSum = entries.reduce((s, e) => s + e.sum, 0);
    const totalN = entries.reduce((s, e) => s + e.n, 0);
    return totalN > 0 ? totalSum / totalN : null;
  }, [completionByVideo]);

  if (loading || dataLoading) {
    return <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px' }}>Loading…</div>;
  }

  const card: React.CSSProperties = { padding: '16px', borderRadius: '12px', background: 'var(--bg-card)', border: '1px solid var(--border-color)' };

  return (
    <div style={{ maxWidth: '900px' }}>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        {(['long', 'short'] as ContentType[]).map(t => (
          <button
            key={t}
            onClick={() => setContentType(t)}
            style={{
              padding: '8px 16px', borderRadius: '999px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer',
              border: `1px solid ${contentType === t ? 'var(--accent)' : 'var(--border-color)'}`,
              background: contentType === t ? 'var(--accent)' : 'transparent',
              color: contentType === t ? '#fff' : 'var(--text-secondary)',
            }}
          >{t === 'long' ? 'Long-form' : 'Fast Tap (Shorts)'}</button>
        ))}
      </div>

      {/* ── Overview ── */}
      <h2 style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 10px' }}>Overview</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', marginBottom: '24px' }}>
        <div style={card}><div style={{ fontSize: '18px', fontWeight: 900 }}>{totals.count}</div><div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{contentType === 'long' ? 'Videos' : 'Fast Taps'}</div></div>
        <div style={card}><div style={{ fontSize: '18px', fontWeight: 900 }}>{totals.totalViews.toLocaleString()}</div><div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Views</div></div>
        <div style={card}><div style={{ fontSize: '18px', fontWeight: 900 }}>{totals.totalLikes.toLocaleString()}</div><div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Likes</div></div>
        <div style={card}>
          <div style={{ fontSize: '18px', fontWeight: 900 }}>{avgCompletion !== null ? fmtPct(avgCompletion) : '—'}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Avg. completion</div>
        </div>
      </div>

      {/* ── Engagement ── */}
      <h2 style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 10px' }}>Engagement</h2>
      <div style={{ ...card, marginBottom: '24px' }}>
        {Object.keys(completionByVideo).length === 0 ? (
          <p style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', margin: 0 }}>
            No watch-progress data yet for this content type — completion % appears once viewers start watching.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {scoped
              .filter(v => completionByVideo[v.id])
              .sort((a, b) => (completionByVideo[b.id].sum / completionByVideo[b.id].n) - (completionByVideo[a.id].sum / completionByVideo[a.id].n))
              .slice(0, 8)
              .map(v => {
                const pct = completionByVideo[v.id].sum / completionByVideo[v.id].n;
                return (
                  <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.title}</div>
                    <div style={{ width: '120px', height: '6px', borderRadius: '4px', background: 'var(--border-color)', overflow: 'hidden', flexShrink: 0 }}>
                      <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: 'var(--accent)' }} />
                    </div>
                    <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', width: '50px', textAlign: 'right', flexShrink: 0 }}>{fmtPct(pct)}</div>
                  </div>
                );
              })}
          </div>
        )}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--divider)' }}>
          <Info size={13} color="var(--text-faint)" style={{ marginTop: '1px', flexShrink: 0 }} />
          <p style={{ fontSize: '11px', color: 'var(--text-faint)', margin: 0, lineHeight: 1.5 }}>
            Completion % is each viewer&apos;s latest saved position, not a full per-second retention curve —
            an honest single-number estimate, not YouTube&apos;s frame-by-frame graph.
          </p>
        </div>
      </div>

      {/* ── Audience ── */}
      <h2 style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 10px' }}>Audience</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
        <div style={card}>
          <div style={{ fontSize: '18px', fontWeight: 900 }}>{followersGained.toLocaleString()}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Followers gained (28d, channel-wide)</div>
        </div>
        <div style={card}>
          <div style={{ fontSize: '18px', fontWeight: 900 }}>{commentCount.toLocaleString()}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Comments (channel-wide)</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', marginTop: '10px' }}>
        <Info size={13} color="var(--text-faint)" style={{ marginTop: '1px', flexShrink: 0 }} />
        <p style={{ fontSize: '11px', color: 'var(--text-faint)', margin: 0, lineHeight: 1.5 }}>
          Followers-gained and comment totals are channel-wide (not split by content type yet) — the
          creator_follows table doesn&apos;t log which video drove a follow, so a per-type breakdown here
          would be a guess, not a real number.
        </p>
      </div>
    </div>
  );
}
