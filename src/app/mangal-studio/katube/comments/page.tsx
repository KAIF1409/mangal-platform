'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
import { useStudioAuth } from '../lib/useStudioAuth';
import { Info } from 'lucide-react';

interface CommentRow {
  id: string;
  comment_text: string;
  created_at: string;
  video_id: string;
  videoTitle: string;
}

export default function KatubeStudioComments() {
  const { user, loading } = useStudioAuth('/mangal-studio/katube/comments');
  const [rows, setRows] = useState<CommentRow[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data: videos } = await supabase.from('videos').select('id, title').eq('creator_id', user.id);
      const videoMap = new Map((videos ?? []).map(v => [v.id, v.title]));
      const ids = (videos ?? []).map(v => v.id);
      if (ids.length === 0) { setDataLoading(false); return; }

      const { data: comments } = await supabase
        .from('video_comments')
        .select('id, comment_text, created_at, video_id')
        .in('video_id', ids)
        .order('created_at', { ascending: false })
        .limit(100);

      setRows((comments ?? []).map(c => ({ ...c, videoTitle: videoMap.get(c.video_id) ?? 'Untitled' })));
      setDataLoading(false);
    };
    load();
  }, [user]);

  if (loading || dataLoading) {
    return <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px' }}>Loading…</div>;
  }

  return (
    <div style={{ maxWidth: '760px' }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '12px 14px', borderRadius: '10px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', marginBottom: '18px', fontSize: '12px', color: 'var(--text-tertiary)' }}>
        <Info size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
        Read-only for now — deleting other viewers&apos; comments needs a new moderation permission that hasn&apos;t
        been added yet, so this view is for keeping an eye on your comment activity, not moderating it.
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: '30px', textAlign: 'center', borderRadius: '12px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-tertiary)', fontSize: '13px' }}>
          No comments yet across your videos.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {rows.map(c => (
            <div key={c.id} style={{ padding: '14px 16px', borderRadius: '12px', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginBottom: '6px' }}>
                <Link href={`/katube/watch/${c.video_id}`} style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--accent)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.videoTitle}
                </Link>
                <span style={{ fontSize: '11px', color: 'var(--text-faint, var(--text-tertiary))', flexShrink: 0 }}>
                  {new Date(c.created_at).toLocaleDateString()}
                </span>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text-primary)', margin: 0, lineHeight: 1.5 }}>{c.comment_text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
