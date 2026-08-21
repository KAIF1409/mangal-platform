'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useStudioAuth } from '../lib/useStudioAuth';
import { ArrowUpDown } from 'lucide-react';

interface Row {
  id: string;
  title: string;
  youtube_id: string;
  is_short: boolean;
  category: string | null;
  views: number;
  likes: number;
  created_at: string;
  commentCount: number;
}

type SortKey = 'created_at' | 'views' | 'likes' | 'commentCount';
type FilterKey = 'all' | 'long' | 'short';

export default function KatubeStudioContent() {
  const { user, loading } = useStudioAuth('/mangal-studio/katube/content');
  const [rows, setRows] = useState<Row[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDesc, setSortDesc] = useState(true);
  const [filter, setFilter] = useState<FilterKey>('all');

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data: videos } = await supabase
        .from('videos')
        .select('id, title, youtube_id, is_short, category, views, likes, created_at')
        .eq('creator_id', user.id);

      const videoIds = (videos ?? []).map(v => v.id);
      let commentCounts: Record<string, number> = {};
      if (videoIds.length > 0) {
        const { data: comments } = await supabase.from('video_comments').select('video_id').in('video_id', videoIds);
        commentCounts = (comments ?? []).reduce((acc: Record<string, number>, c) => {
          acc[c.video_id] = (acc[c.video_id] ?? 0) + 1;
          return acc;
        }, {});
      }

      setRows((videos ?? []).map(v => ({ ...v, commentCount: commentCounts[v.id] ?? 0 })));
      setDataLoading(false);
    };
    load();
  }, [user]);

  const filtered = useMemo(() => {
    const base = rows.filter(r => filter === 'all' ? true : filter === 'short' ? r.is_short : !r.is_short);
    return [...base].sort((a, b) => {
      const av = sortKey === 'created_at' ? new Date(a.created_at).getTime() : a[sortKey];
      const bv = sortKey === 'created_at' ? new Date(b.created_at).getTime() : b[sortKey];
      return sortDesc ? bv - av : av - bv;
    });
  }, [rows, filter, sortKey, sortDesc]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDesc(d => !d);
    else { setSortKey(key); setSortDesc(true); }
  };

  if (loading || dataLoading) {
    return <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px' }}>Loading…</div>;
  }

  const filterBtn = (key: FilterKey, label: string) => (
    <button
      onClick={() => setFilter(key)}
      style={{
        padding: '7px 14px', borderRadius: '999px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer',
        border: `1px solid ${filter === key ? 'var(--accent)' : 'var(--border-color)'}`,
        background: filter === key ? 'var(--accent)' : 'transparent',
        color: filter === key ? '#fff' : 'var(--text-secondary)',
      }}
    >{label}</button>
  );

  const th = (key: SortKey, label: string) => (
    <th
      onClick={() => toggleSort(key)}
      style={{ padding: '10px 12px', fontSize: '11.5px', color: 'var(--text-tertiary)', textAlign: 'right', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>{label} <ArrowUpDown size={11} /></span>
    </th>
  );

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '18px' }}>
        {filterBtn('all', 'All')}
        {filterBtn('long', 'Long-form')}
        {filterBtn('short', 'Fast Tap')}
      </div>

      {filtered.length === 0 ? (
        <div style={{ padding: '30px', textAlign: 'center', borderRadius: '12px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-tertiary)', fontSize: '13px' }}>
          No content in this filter yet.
        </div>
      ) : (
        <div style={{ borderRadius: '12px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '640px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ padding: '10px 12px', fontSize: '11.5px', color: 'var(--text-tertiary)', textAlign: 'left' }}>Video</th>
                  <th style={{ padding: '10px 12px', fontSize: '11.5px', color: 'var(--text-tertiary)', textAlign: 'left' }}>Type</th>
                  {th('created_at', 'Uploaded')}
                  {th('views', 'Views')}
                  {th('likes', 'Likes')}
                  {th('commentCount', 'Comments')}
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: '220px' }}>
                        <img
                          src={`https://img.youtube.com/vi/${r.youtube_id}/mqdefault.jpg`}
                          alt=""
                          style={{ width: '64px', height: '36px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0, background: 'var(--bg-input)' }}
                        />
                        <div style={{ fontSize: '12.5px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '11.5px', color: 'var(--text-tertiary)' }}>{r.is_short ? 'Fast Tap' : 'Long-form'}</td>
                    <td style={{ padding: '10px 12px', fontSize: '11.5px', color: 'var(--text-tertiary)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {new Date(r.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '12.5px', textAlign: 'right' }}>{r.views.toLocaleString()}</td>
                    <td style={{ padding: '10px 12px', fontSize: '12.5px', textAlign: 'right' }}>{r.likes.toLocaleString()}</td>
                    <td style={{ padding: '10px 12px', fontSize: '12.5px', textAlign: 'right' }}>{r.commentCount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
