'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import VideoGridCard, { type GridVideo } from '../components/VideoGridCard';
import { KaTubeShell } from '../components/VideoGridCard';
import { setPostLoginRedirect } from '../../lib/auth/authRedirect';

// §28a — Subscriptions feed: only new uploads from creators the viewer
// already follows, separate from the general/trending grid. `creator_follows`
// and `videos` already exist (see CONTEXT.md §4/§28a) — this is a filtered
// view on top of them, no new table needed.

export default function SubscriptionsFeedPage() {
  const [videos, setVideos] = useState<GridVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) {
        setSignedIn(false);
        setLoading(false);
        // Eager cookie set — same fix as playlists/upload (see their
        // comments): sidesteps the Link/prefetch quirk where ?next= can
        // silently get dropped on the way to /login.
        setPostLoginRedirect('/katube/subscriptions');
        return;
      }
      setSignedIn(true);

      const { data: follows } = await supabase.from('creator_follows').select('creator_id').eq('follower_id', uid);
      const creatorIds = (follows || []).map(f => f.creator_id);
      if (creatorIds.length === 0) { setLoading(false); return; }

      const { data: rows } = await supabase.from('videos')
        .select('id, title, youtube_id, views, created_at, creator_id, series_id')
        .in('creator_id', creatorIds)
        .eq('is_short', false)
        .order('created_at', { ascending: false });

      if (!rows || rows.length === 0) { setLoading(false); return; }

      const seriesIds = [...new Set(rows.map(r => r.series_id).filter(Boolean))];
      const [creatorsRes, seriesRes] = await Promise.all([
        supabase.from('creator_profiles').select('user_id, username').in('user_id', creatorIds),
        seriesIds.length ? supabase.from('series').select('id, title').in('id', seriesIds) : Promise.resolve({ data: [] as { id: string; title: string }[] }),
      ]);
      const creatorMap = new Map((creatorsRes.data || []).map(c => [c.user_id, c.username]));
      const seriesMap = new Map((seriesRes.data || []).map(s => [s.id, s.title]));

      setVideos(rows.map(r => ({
        id: r.id, title: r.title, youtube_id: r.youtube_id, views: r.views, created_at: r.created_at,
        creator: creatorMap.get(r.creator_id) || 'MANGAL Creator',
        basedOn: r.series_id ? (seriesMap.get(r.series_id) || null) : null,
      })));
      setLoading(false);
    })();
  }, []);

  return (
    <KaTubeShell title="Following">
      {signedIn === false ? (
        <EmptyNote>
          Sign in to see new uploads from the creators you follow. <Link href="/login?next=/katube/subscriptions" style={{ color: '#f97316', fontWeight: 700 }}>Sign in</Link>
        </EmptyNote>
      ) : loading ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#6b7280', fontSize: '13px' }}>Loading…</div>
      ) : videos.length === 0 ? (
        <EmptyNote>
          No new uploads yet from creators you follow. Follow a creator from any watch page and their new videos will show up here.
        </EmptyNote>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
          {videos.map(v => <VideoGridCard key={v.id} video={v} />)}
        </div>
      )}
    </KaTubeShell>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ maxWidth: '600px', margin: '40px auto', padding: '18px 22px', borderRadius: '12px', background: '#0d0d14', border: '1px dashed rgba(255,255,255,0.18)', textAlign: 'center' }}>
      <p style={{ fontSize: '12.5px', color: '#9ca3af', margin: 0, lineHeight: 1.6 }}>{children}</p>
    </div>
  );
}
