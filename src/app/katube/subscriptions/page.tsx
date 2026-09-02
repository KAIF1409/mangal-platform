'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import VideoGridCard, { type GridVideo } from '../components/VideoGridCard';
import { KaTubeShell } from '../components/VideoGridCard';
import { setPostLoginRedirect } from '../../lib/auth/authRedirect';

// §28a — Subscriptions feed: only new uploads from creators the viewer
// already follows, separate from the general/trending grid. `creator_follows`
// and `videos` already exist (see CONTEXT.md §4/§28a) — this is a filtered
// view on top of them, no new table needed.
//
// §139-A7 — this feed used to fetch EVERY video from EVERY followed creator
// in one unbounded query. It now pages 24 at a time via the §82 `.range()` +
// "Load more" pattern (same as the browse/songs lists).
const SUBS_PAGE_SIZE = 24;

export default function SubscriptionsFeedPage() {
  const [videos, setVideos] = useState<GridVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const pageRef = useRef(0);
  const creatorIdsRef = useRef<string[]>([]);
  // Enrichment maps cached across pages — creator/series names don't change
  // between pages, so later pages only fetch names they haven't seen yet.
  const creatorMapRef = useRef(new Map<string, string>());
  const seriesMapRef = useRef(new Map<string, string>());

  const fetchPage = async (creatorIds: string[], pageNum: number) => {
    const { data: rows } = await supabase.from('videos')
      .select('id, title, youtube_id, views, created_at, creator_id, series_id')
      .in('creator_id', creatorIds)
      .eq('is_short', false)
      .order('created_at', { ascending: false })
      .range(pageNum * SUBS_PAGE_SIZE, pageNum * SUBS_PAGE_SIZE + SUBS_PAGE_SIZE - 1);

    if (!rows || rows.length === 0) return [];
    const seriesIds = [...new Set(rows.map(r => r.series_id).filter(Boolean))];
    const missingCreatorIds = [...new Set(rows.map(r => r.creator_id))].filter(id => !creatorMapRef.current.has(id));
    const [creatorsRes, seriesRes] = await Promise.all([
      missingCreatorIds.length
        ? supabase.from('creator_profiles').select('user_id, username').in('user_id', missingCreatorIds)
        : Promise.resolve({ data: [] as { user_id: string; username: string }[] }),
      seriesIds.length
        ? supabase.from('series').select('id, title').in('id', seriesIds)
        : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    ]);
    (creatorsRes.data || []).forEach(c => creatorMapRef.current.set(c.user_id, c.username));
    (seriesRes.data || []).forEach(s => seriesMapRef.current.set(s.id, s.title));

    return rows.map(r => ({
      id: r.id, title: r.title, youtube_id: r.youtube_id, views: r.views, created_at: r.created_at,
      creator: creatorMapRef.current.get(r.creator_id) || 'MANGAL Creator',
      basedOn: r.series_id ? (seriesMapRef.current.get(r.series_id) || null) : null,
    }));
  };

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
      creatorIdsRef.current = creatorIds;

      // §139-A7 — first page only; "Load more" fetches subsequent pages.
      const mapped = await fetchPage(creatorIds, 0);
      setVideos(mapped);
      pageRef.current = 0;
      setHasMore(mapped.length === SUBS_PAGE_SIZE);
      setLoading(false);
    })();
  }, []);

  // §139-A7 — next page of the feed. Offsets can shift when new uploads land
  // mid-view, so the append de-dupes by id.
  const handleLoadMore = async () => {
    if (loadingMore || !hasMore || creatorIdsRef.current.length === 0) return;
    setLoadingMore(true);
    const next = pageRef.current + 1;
    const mapped = await fetchPage(creatorIdsRef.current, next);
    setVideos(prev => {
      const known = new Set(prev.map(v => v.id));
      return [...prev, ...mapped.filter(v => !known.has(v.id))];
    });
    pageRef.current = next;
    setHasMore(mapped.length === SUBS_PAGE_SIZE);
    setLoadingMore(false);
  };

  return (
    <KaTubeShell title="Following">
      {signedIn === false ? (
        <EmptyNote>
          Sign in to see new uploads from the creators you follow. <Link href="/login?next=/katube/subscriptions" style={{ color: '#e11d48', fontWeight: 700 }}>Sign in</Link>
        </EmptyNote>
      ) : loading ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#6b7280', fontSize: '13px' }}>Loading…</div>
      ) : videos.length === 0 ? (
        <EmptyNote>
          No new uploads yet from creators you follow. Follow a creator from any watch page and their new videos will show up here.
        </EmptyNote>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
            {videos.map(v => <VideoGridCard key={v.id} video={v} />)}
          </div>
          {hasMore && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '24px' }}>
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                style={{
                  fontSize: '12px', fontWeight: 700, cursor: loadingMore ? 'default' : 'pointer',
                  color: '#b088a0', background: '#1d0a18',
                  border: '1px solid rgba(225,29,72,0.25)', borderRadius: '20px', padding: '9px 18px',
                }}
              >
                {loadingMore ? 'Loading…' : 'Load more videos'}
              </button>
            </div>
          )}
        </>
      )}
    </KaTubeShell>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ maxWidth: '600px', margin: '40px auto', padding: '18px 22px', borderRadius: '12px', background: '#1d0a18', border: '1px dashed rgba(225,29,72,0.22)', textAlign: 'center' }}>
      <p style={{ fontSize: '12.5px', color: '#b088a0', margin: 0, lineHeight: 1.6 }}>{children}</p>
    </div>
  );
}
