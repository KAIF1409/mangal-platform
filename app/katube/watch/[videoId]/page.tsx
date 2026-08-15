'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import ThemeToggle from '../../../components/ThemeToggle';
import { supabase } from '../../../lib/supabase';
import { setPostLoginRedirect } from '../../../lib/authRedirect';
import { Users, ThumbsUp, BookOpen, Star } from 'lucide-react';

// ── KaTube — Step 3: watch page ──
// Clicking a video card on /katube now opens this page, which loads the
// video row from Supabase and renders the real YouTube iframe embed.
// Completes Step 3 (real videos table + YouTube embed).

interface WatchVideo {
  id: string;
  title: string;
  youtube_id: string;
  views: number;
  likes: number;
  creator: string;
  creatorId: string;
  creatorUsername: string | null;
  seriesId: string | null;
  basedOn: string | null;
  isShort: boolean;
}

interface VideoComment {
  id: string;
  comment_text: string;
  created_at: string;
  commenter_id: string;
  commenterName: string;
}

// ── Review Hub — Step 27 ──
// Structured accuracy rating (1-5 stars) for how well the video adapts its
// source novel, separate from the free-for-all comments section above.
// Only shown when the video is tied to a series (video.seriesId), since
// "accuracy to source" is meaningless without a source to compare to.
interface AccuracyReview {
  id: string;
  stars: number;
  review_text: string | null;
  created_at: string;
  reviewer_id: string;
  reviewerName: string;
}

// ── §4 item 5, step 1: Like ──
// video_likes join table + RLS already existed (20260810_katube_videos.sql).
// This wires it up: toggles a row in video_likes and keeps videos.likes in
// sync so existing view-count-style reads (grid cards, this page) stay
// correct without needing a join everywhere.

interface RecommendedVideo {
  id: string;
  title: string;
  youtube_id: string;
  views: number;
  creator: string;
}

function RecommendedCard({ video }: { video: RecommendedVideo }) {
  return (
    <Link href={`/katube/watch/${video.id}`} style={{
      display: 'flex', gap: '10px', textDecoration: 'none', padding: '6px',
      borderRadius: '10px', transition: 'background 0.15s',
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-card)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >
      <div style={{ position: 'relative', width: '150px', flexShrink: 0, aspectRatio: '16/9', borderRadius: '8px', overflow: 'hidden', background: '#000' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://img.youtube.com/vi/${video.youtube_id}/hqdefault.jpg`}
          alt={video.title}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.35, marginBottom: '4px',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>{video.title}</div>
        <div style={{ fontSize: '11.5px', color: 'var(--text-tertiary)' }}>{video.creator}</div>
        <div style={{ fontSize: '11.5px', color: 'var(--text-tertiary)' }}>{video.views.toLocaleString()} views</div>
      </div>
    </Link>
  );
}

export default function KaTubeWatchPage() {
  const params = useParams();
  const router = useRouter();
  const videoId = params?.videoId as string;

  const [creatingRoom, setCreatingRoom] = useState(false);

  const [video, setVideo] = useState<WatchVideo | null>(null);
  const [recommended, setRecommended] = useState<RecommendedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [liked, setLiked] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  // Synchronous lock, separate from the `likeBusy` state used for the UI's
  // disabled/opacity look. State updates are batched/async in React, so a
  // fast double-click can fire the handler twice before the first
  // setLikeBusy(true) has actually re-rendered — both calls would read the
  // same stale `likeBusy === false` and both would fire. A ref is mutated
  // synchronously, so the second click sees the lock immediately.
  const likeLockRef = useRef(false);

  // ── §4 item 5, step 2: Comment + Follow ──
  // video_comments + creator_follows tables (RLS already in place,
  // 20260811165752_katube_comments_and_subscriptions.sql +
  // 20260812120000_katube_subscriptions_to_follows_rename.sql — this isn't
  // sub-for-sub, it's a follow, same word/model as MANGAL's own `follows`
  // table for series). Same toggle pattern as the like button above:
  // optimistic UI, composite PK does the duplicate-prevention work at the
  // DB level.
  const [following, setFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followBusy, setFollowBusy] = useState(false);
  const followLockRef = useRef(false);

  const [comments, setComments] = useState<VideoComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [commentBusy, setCommentBusy] = useState(false);
  const commentLockRef = useRef(false);

  // ── Review Hub — Step 27 ──
  const [accuracyReviews, setAccuracyReviews] = useState<AccuracyReview[]>([]);
  const [accuracyLoading, setAccuracyLoading] = useState(true);
  const [myStars, setMyStars] = useState(0);
  const [hoverStars, setHoverStars] = useState(0);
  const [myReviewText, setMyReviewText] = useState('');
  const [accuracyBusy, setAccuracyBusy] = useState(false);
  const accuracyLockRef = useRef(false);

  useEffect(() => {
    if (!videoId) return;

    (async () => {
      const { data: row } = await supabase
        .from('videos')
        .select('id, title, youtube_id, views, likes, creator_id, series_id, is_short')
        .eq('id', videoId)
        .single();

      if (!row) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const [creatorRes, seriesRes] = await Promise.all([
        supabase.from('creator_profiles').select('username').eq('user_id', row.creator_id).single(),
        row.series_id
          ? supabase.from('series').select('title').eq('id', row.series_id).single()
          : Promise.resolve({ data: null as { title: string } | null }),
      ]);

      setVideo({
        id: row.id,
        title: row.title,
        youtube_id: row.youtube_id,
        views: row.views,
        likes: row.likes,
        creator: creatorRes.data?.username || 'MANGAL Creator',
        creatorId: row.creator_id,
        creatorUsername: creatorRes.data?.username || null,
        seriesId: row.series_id,
        basedOn: seriesRes.data?.title || null,
        isShort: row.is_short,
      });
      setLoading(false);

      // best-effort view increment — not awaited, doesn't block render
      supabase.from('videos').update({ views: row.views + 1 }).eq('id', row.id).then(() => {});

      // Tag-based recommendations — long-form only (§8). Falls back
      // gracefully via the RPC's own scoring if there's no tag overlap yet.
      if (!row.is_short) {
        const { data: relatedRows } = await supabase.rpc('related_videos', {
          target_video_id: row.id, result_limit: 10,
        });
        if (relatedRows && relatedRows.length > 0) {
          const relCreatorIds = [...new Set(relatedRows.map((r: { creator_id: string }) => r.creator_id))];
          const { data: relCreators } = await supabase
            .from('creator_profiles').select('user_id, username').in('user_id', relCreatorIds);
          const relCreatorMap = new Map((relCreators || []).map(c => [c.user_id, c.username]));
          setRecommended(relatedRows.map((r: { id: string; title: string; youtube_id: string; views: number; creator_id: string }) => ({
            id: r.id, title: r.title, youtube_id: r.youtube_id, views: r.views,
            creator: relCreatorMap.get(r.creator_id) || 'MANGAL Creator',
          })));
        }
      }
    })();
  }, [videoId]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id || null));
  }, []);

  useEffect(() => {
    if (!videoId || !userId) return;
    supabase
      .from('video_likes')
      .select('video_id')
      .eq('video_id', videoId)
      .eq('liker_id', userId)
      .maybeSingle()
      .then(({ data }) => setLiked(!!data));
  }, [videoId, userId]);

  // Comments — public read, so fetch as soon as we have the videoId (no
  // need to wait on auth). Commenter usernames joined client-side the same
  // way the recommended-videos creator names are (single batched `in()`
  // query rather than N+1 per-comment lookups).
  useEffect(() => {
    if (!videoId) return;
    (async () => {
      setCommentsLoading(true);
      const { data: rows } = await supabase
        .from('video_comments')
        .select('id, comment_text, created_at, commenter_id')
        .eq('video_id', videoId)
        .order('created_at', { ascending: false });

      if (!rows || rows.length === 0) {
        setComments([]);
        setCommentsLoading(false);
        return;
      }

      const commenterIds = [...new Set(rows.map(r => r.commenter_id))];
      const { data: profiles } = await supabase
        .from('creator_profiles')
        .select('user_id, username')
        .in('user_id', commenterIds);
      const nameMap = new Map((profiles || []).map(p => [p.user_id, p.username]));

      setComments(rows.map(r => ({
        ...r,
        commenterName: nameMap.get(r.commenter_id) || 'MANGAL Viewer',
      })));
      setCommentsLoading(false);
    })();
  }, [videoId]);

  // Accuracy reviews — public read, same batched-username-join pattern as
  // comments. Only fetched once we know the video is tied to a series
  // (video?.seriesId), since the section doesn't render otherwise.
  useEffect(() => {
    if (!videoId || !video?.seriesId) return;
    (async () => {
      setAccuracyLoading(true);
      const { data: rows } = await supabase
        .from('video_accuracy_reviews')
        .select('id, stars, review_text, created_at, reviewer_id')
        .eq('video_id', videoId)
        .order('created_at', { ascending: false });

      if (!rows || rows.length === 0) {
        setAccuracyReviews([]);
        setAccuracyLoading(false);
        return;
      }

      const reviewerIds = [...new Set(rows.map(r => r.reviewer_id))];
      const { data: profiles } = await supabase
        .from('creator_profiles')
        .select('user_id, username')
        .in('user_id', reviewerIds);
      const nameMap = new Map((profiles || []).map(p => [p.user_id, p.username]));

      setAccuracyReviews(rows.map(r => ({
        ...r,
        reviewerName: nameMap.get(r.reviewer_id) || 'MANGAL Viewer',
      })));
      setAccuracyLoading(false);
    })();
  }, [videoId, video?.seriesId]);

  // Pre-fill the star picker with the viewer's own existing review, if any.
  // Deferred via Promise.resolve().then(...) — same pattern as the
  // `following` effect above — to avoid a synchronous setState-in-effect.
  useEffect(() => {
    if (!userId || accuracyReviews.length === 0) return;
    const mine = accuracyReviews.find(r => r.reviewer_id === userId);
    if (mine) {
      Promise.resolve().then(() => {
        setMyStars(mine.stars);
        setMyReviewText(mine.review_text || '');
      });
    }
  }, [userId, accuracyReviews]);

  // Follower count — public read, doesn't need userId.
  useEffect(() => {
    if (!video?.creatorId) return;
    supabase
      .from('creator_follows')
      .select('follower_id', { count: 'exact', head: true })
      .eq('creator_id', video.creatorId)
      .then(({ count }) => setFollowerCount(count || 0));
  }, [video?.creatorId]);

  // Whether the current viewer is following — needs both.
  useEffect(() => {
    if (!video?.creatorId || !userId) {
      Promise.resolve().then(() => setFollowing(false));
      return;
    }
    supabase
      .from('creator_follows')
      .select('creator_id')
      .eq('creator_id', video.creatorId)
      .eq('follower_id', userId)
      .maybeSingle()
      .then(({ data }) => setFollowing(!!data));
  }, [video?.creatorId, userId]);

  async function handleFollow() {
    if (!video) return;
    if (!userId) {
      setPostLoginRedirect(window.location.pathname);
      window.location.href = '/login?next=' + encodeURIComponent(window.location.pathname);
      return;
    }
    if (userId === video.creatorId) return; // can't follow your own channel
    // Synchronous lock check+set — see likeLockRef comment above for why
    // this can't just be the `followBusy` state check.
    if (followLockRef.current) return;
    followLockRef.current = true;
    setFollowBusy(true);

    const wasFollowing = following;
    setFollowing(!wasFollowing);
    setFollowerCount(c => Math.max(0, c + (wasFollowing ? -1 : 1)));

    const { error } = wasFollowing
      ? await supabase.from('creator_follows').delete().eq('creator_id', video.creatorId).eq('follower_id', userId)
      : await supabase.from('creator_follows').insert({ creator_id: video.creatorId, follower_id: userId });

    if (error) {
      // roll back on failure
      setFollowing(wasFollowing);
      setFollowerCount(c => Math.max(0, c + (wasFollowing ? 1 : -1)));
    }
    followLockRef.current = false;
    setFollowBusy(false);
  }

  async function handleCommentSubmit() {
    if (!video) return;
    if (!userId) {
      setPostLoginRedirect(window.location.pathname);
      window.location.href = '/login?next=' + encodeURIComponent(window.location.pathname);
      return;
    }
    const text = commentText.trim();
    if (!text) return;
    if (commentLockRef.current) return;
    commentLockRef.current = true;
    setCommentBusy(true);

    const { data: row, error } = await supabase
      .from('video_comments')
      .insert({ video_id: video.id, commenter_id: userId, comment_text: text })
      .select('id, comment_text, created_at, commenter_id')
      .single();

    if (!error && row) {
      const { data: profile } = await supabase
        .from('creator_profiles').select('username').eq('user_id', userId).single();
      setComments(cs => [{ ...row, commenterName: profile?.username || 'You' }, ...cs]);
      setCommentText('');
    }
    commentLockRef.current = false;
    setCommentBusy(false);
  }

  async function handleAccuracySubmit() {
    if (!video) return;
    if (!userId) {
      setPostLoginRedirect(window.location.pathname);
      window.location.href = '/login?next=' + encodeURIComponent(window.location.pathname);
      return;
    }
    if (myStars < 1) return;
    if (accuracyLockRef.current) return;
    accuracyLockRef.current = true;
    setAccuracyBusy(true);

    const text = myReviewText.trim();
    const { data: row, error } = await supabase
      .from('video_accuracy_reviews')
      .upsert(
        { video_id: video.id, reviewer_id: userId, stars: myStars, review_text: text || null, updated_at: new Date().toISOString() },
        { onConflict: 'video_id,reviewer_id' },
      )
      .select('id, stars, review_text, created_at, reviewer_id')
      .single();

    if (!error && row) {
      const { data: profile } = await supabase
        .from('creator_profiles').select('username').eq('user_id', userId).single();
      setAccuracyReviews(rs => {
        const withoutMine = rs.filter(r => r.reviewer_id !== userId);
        return [{ ...row, reviewerName: profile?.username || 'You' }, ...withoutMine];
      });
    }
    accuracyLockRef.current = false;
    setAccuracyBusy(false);
  }

  async function handleWatchWithFriends() {
    if (!video) return;
    if (!userId) {
      setPostLoginRedirect(window.location.pathname);
      window.location.href = '/login?next=' + encodeURIComponent(window.location.pathname);
      return;
    }
    setCreatingRoom(true);
    const { data: newRoom, error } = await supabase
      .from('watch_rooms')
      .insert({ video_id: video.id, host_id: userId, visibility: 'private', title: video.title })
      .select('id')
      .single();
    if (error || !newRoom) {
      setCreatingRoom(false);
      return;
    }
    // Host also gets a membership row, so the room's member list (which
    // reads from watch_room_members, not host_id, for a single unified
    // list) shows them immediately without a separate "host" special case.
    await supabase.from('watch_room_members').insert({ room_id: newRoom.id, user_id: userId });
    router.push(`/katube/watch/${videoId}/room/${newRoom.id}`);
  }

  async function handleLike() {
    if (!video) return;
    if (!userId) {
      setPostLoginRedirect(window.location.pathname);
      window.location.href = '/login?next=' + encodeURIComponent(window.location.pathname);
      return;
    }
    if (likeLockRef.current) return;
    likeLockRef.current = true;
    setLikeBusy(true);

    const wasLiked = liked;
    const prevLikes = video.likes;
    const nextLikes = prevLikes + (wasLiked ? -1 : 1);

    // optimistic UI
    setLiked(!wasLiked);
    setVideo(v => v ? { ...v, likes: nextLikes } : v);

    const { error } = wasLiked
      ? await supabase.from('video_likes').delete().eq('video_id', video.id).eq('liker_id', userId)
      : await supabase.from('video_likes').insert({ video_id: video.id, liker_id: userId });

    if (!error) {
      await supabase.from('videos').update({ likes: Math.max(0, nextLikes) }).eq('id', video.id);
    } else {
      // roll back optimistic UI on failure
      setLiked(wasLiked);
      setVideo(v => v ? { ...v, likes: prevLikes } : v);
    }
    likeLockRef.current = false;
    setLikeBusy(false);
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', overflowX: 'hidden' }}>

      {/* Nav: MANGAL logo+wordmark, centered KaTube logo, theme toggle + a
          text "← Back to KaTube" button, in one non-wrapping row — on a
          ~320-375px phone that's easily 370px+ of content forced into a
          ~330px available width. Same .mangal-* + <style> pattern used
          across this sweep. */}
      <style>{`
        @media (max-width: 480px) {
          .mangal-watch-nav { padding: 0 12px !important; gap: 6px; }
          .mangal-watch-brand-text { display: none; }
          .mangal-watch-back-text { display: none; }
          .mangal-watch-back { padding: 8px 10px !important; }
        }
      `}</style>

      {/* ── NAV ── */}
      <nav className="mangal-watch-nav" style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'var(--nav-bg)', backdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--border-color)',
        padding: '0 20px', height: '64px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: '8px',
      }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none', flexShrink: 0 }}>
          <Image src="/icon.png" alt="MANGAL" width={32} height={32} style={{ display: 'block', borderRadius: '8px' }} />
          <span className="mangal-watch-brand-text" style={{ fontWeight: 900, fontSize: '13px', color: 'var(--text-tertiary)', letterSpacing: '-0.02em' }}>MANGAL</span>
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
          <Image src="/katube-logo.png" alt="KaTube" width={140} height={140} style={{ display: 'block', height: '44px', width: '44px', objectFit: 'contain' }} priority />
          <span style={{ fontWeight: 900, fontSize: '17px', color: '#2563eb', letterSpacing: '-0.02em' }}>Tube</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <ThemeToggle size={30} />
          <Link href="/katube" className="mangal-watch-back" style={{
            padding: '8px 16px', borderRadius: '8px', fontSize: '12.5px', fontWeight: 700,
            color: 'var(--text-secondary)', textDecoration: 'none', border: '1px solid var(--border-color)', whiteSpace: 'nowrap',
          }}>← <span className="mangal-watch-back-text">Back to KaTube</span></Link>
        </div>
      </nav>

      <div style={{
        maxWidth: video?.isShort === false ? '1400px' : '960px', margin: '0 auto', padding: '28px 20px 60px',
        display: video?.isShort === false ? 'flex' : 'block', gap: '28px', alignItems: 'flex-start', flexWrap: 'wrap',
      }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-tertiary)', fontSize: '13px', width: '100%' }}>Loading video…</div>
        ) : notFound || !video ? (
          <div style={{ textAlign: 'center', padding: '80px 20px', width: '100%' }}>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px' }}>This video doesn&apos;t exist or was removed.</p>
            <Link href="/katube" style={{ fontSize: '13px', fontWeight: 700, color: '#f97316' }}>← Back to KaTube</Link>
          </div>
        ) : (
          <>
            {/* Left column — player + info */}
            <div style={{ flex: video.isShort ? undefined : '1 1 640px', minWidth: 0, width: video.isShort ? '100%' : undefined }}>
              {/* Player */}
              <div style={{
                position: 'relative', width: '100%', aspectRatio: video.isShort ? '9/16' : '16/9', maxWidth: video.isShort ? '420px' : 'none', margin: video.isShort ? '0 auto' : '0',
                borderRadius: '14px', overflow: 'hidden', background: '#000',
                boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
              }}>
                <iframe
                  src={`https://www.youtube.com/embed/${video.youtube_id}?rel=0`}
                  title={video.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
                />
              </div>

              {/* Watch with Friends — Sync-Play Watch Rooms, KaTube entry
                  point. Always creates a *private* room: KaTube's normal
                  watch page is already the "public" surface (anyone can
                  open this URL any time), so a public room here would just
                  duplicate that with extra steps. Public rooms live on the
                  Kalpana Circle "Watch Together" tab instead. */}
              {!video.isShort && (
                <button
                  onClick={handleWatchWithFriends}
                  disabled={creatingRoom}
                  style={{
                    marginTop: '12px', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)',
                    background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '10px',
                    padding: '9px 16px', cursor: creatingRoom ? 'default' : 'pointer', opacity: creatingRoom ? 0.6 : 1,
                    display: 'flex', alignItems: 'center', gap: '8px',
                  }}
                >
                  <Users size={15} /> {creatingRoom ? 'Setting up room...' : 'Watch with Friends'}
                </button>
              )}

              {/* Info */}
              <h1 style={{ fontSize: 'clamp(18px, 3vw, 24px)', fontWeight: 900, margin: '18px 0 8px', letterSpacing: '-0.02em' }}>
                {video.title}
              </h1>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                  {video.creatorUsername ? (
                    <Link href={`/creator/${video.creatorUsername}`} style={{ fontWeight: 700, color: 'var(--text-primary)', textDecoration: 'none' }}>
                      {video.creator}
                    </Link>
                  ) : (
                    <span style={{ fontWeight: 700 }}>{video.creator}</span>
                  )}
                  {userId !== video.creatorId && (
                    <button
                      onClick={handleFollow}
                      disabled={followBusy}
                      style={{
                        fontSize: '12px', fontWeight: 700,
                        color: following ? 'var(--text-secondary)' : '#fff',
                        background: following ? 'var(--bg-card)' : '#f97316',
                        border: following ? '1px solid var(--border-color)' : '1px solid #f97316',
                        borderRadius: '20px', padding: '5px 14px', cursor: followBusy ? 'default' : 'pointer',
                        opacity: followBusy ? 0.6 : 1,
                      }}
                    >
                      {following ? 'Following' : 'Follow'}{followerCount > 0 ? ` · ${followerCount.toLocaleString()}` : ''}
                    </button>
                  )}
                  <span>·</span>
                  <span>{video.views.toLocaleString()} views</span>
                  <span>·</span>
                  <button
                    onClick={handleLike}
                    disabled={likeBusy}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      fontSize: '13px', fontWeight: 700,
                      color: liked ? '#f97316' : 'var(--text-secondary)',
                      background: liked ? 'rgba(249,115,22,0.10)' : 'transparent',
                      border: liked ? '1px solid rgba(249,115,22,0.28)' : '1px solid var(--border-color)',
                      borderRadius: '20px', padding: '4px 12px', cursor: likeBusy ? 'default' : 'pointer',
                      opacity: likeBusy ? 0.6 : 1,
                    }}
                  >
                    <ThumbsUp size={14} fill={liked ? '#f97316' : 'none'} /> {video.likes.toLocaleString()}
                  </button>
                </div>

                {video.basedOn && (
                  <Link href={video.seriesId ? `/series/${video.seriesId}` : '#'} style={{
                    fontSize: '11.5px', fontWeight: 700, color: '#f97316', textDecoration: 'none',
                    background: 'rgba(249,115,22,0.10)', border: '1px solid rgba(249,115,22,0.28)',
                    padding: '4px 11px', borderRadius: '20px', whiteSpace: 'nowrap',
                  }}>
                    <BookOpen size={13} /> Based on {video.basedOn}
                  </Link>
                )}
              </div>

              {/* Review Hub — Step 27, accuracy-to-source rating */}
              {video.seriesId && (
                <div style={{
                  marginTop: '8px', marginBottom: '20px', padding: '16px',
                  borderRadius: '12px', border: '1px solid var(--border-color)', background: 'var(--bg-card)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                    <h2 style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <BookOpen size={14} /> Review Hub — accuracy to source
                    </h2>
                    {accuracyReviews.length > 0 && (
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Star size={12} fill="#f97316" stroke="none" /> {(accuracyReviews.reduce((s, r) => s + r.stars, 0) / accuracyReviews.length).toFixed(1)} avg
                        {' · '}{accuracyReviews.length.toLocaleString()} {accuracyReviews.length === 1 ? 'review' : 'reviews'}
                      </span>
                    )}
                  </div>

                  <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: '0 0 12px' }}>
                    How well does this adaptation match {video.basedOn ? `“${video.basedOn}”` : 'the source novel'}?
                  </p>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '10px' }}>
                    {[1, 2, 3, 4, 5].map(n => (
                      <button
                        key={n}
                        onClick={() => userId ? setMyStars(n) : (setPostLoginRedirect(window.location.pathname), window.location.href = '/login?next=' + encodeURIComponent(window.location.pathname))}
                        onMouseEnter={() => setHoverStars(n)}
                        onMouseLeave={() => setHoverStars(0)}
                        aria-label={`${n} star${n > 1 ? 's' : ''}`}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer', padding: '2px',
                          display: 'flex', lineHeight: 1,
                          color: (hoverStars || myStars) >= n ? '#f97316' : 'var(--border-color)',
                        }}
                      ><Star size={22} fill={(hoverStars || myStars) >= n ? '#f97316' : 'none'} /></button>
                    ))}
                  </div>

                  {myStars > 0 && (
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '4px' }}>
                      <input
                        value={myReviewText}
                        onChange={e => setMyReviewText(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !accuracyBusy) handleAccuracySubmit(); }}
                        placeholder="Optional: what did the adaptation get right or wrong?"
                        disabled={accuracyBusy}
                        style={{
                          flex: 1, minWidth: 0, padding: '9px 14px', borderRadius: '20px',
                          border: '1px solid var(--border-color)', background: 'var(--bg-primary)',
                          color: 'var(--text-primary)', fontSize: '12.5px', outline: 'none',
                        }}
                      />
                      <button
                        onClick={handleAccuracySubmit}
                        disabled={accuracyBusy}
                        style={{
                          fontSize: '12px', fontWeight: 700, color: '#fff', background: '#f97316',
                          border: 'none', borderRadius: '20px', padding: '0 16px', cursor: 'pointer',
                          opacity: accuracyBusy ? 0.5 : 1, flexShrink: 0,
                        }}
                      >
                        {accuracyReviews.some(r => r.reviewer_id === userId) ? 'Update' : 'Submit'}
                      </button>
                    </div>
                  )}

                  {!accuracyLoading && accuracyReviews.filter(r => r.review_text).length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border-color)' }}>
                      {accuracyReviews.filter(r => r.review_text).map(r => (
                        <div key={r.id}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>{r.reviewerName}</span>
                            <span style={{ fontSize: '11px', color: '#f97316', display: 'inline-flex', gap: '1px' }}>
                              {Array.from({ length: 5 }).map((_, i) => (
                                <Star key={i} size={11} fill={i < r.stars ? '#f97316' : 'none'} stroke={i < r.stars ? 'none' : '#f97316'} />
                              ))}
                            </span>
                          </div>
                          <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0, wordBreak: 'break-word' }}>
                            {r.review_text}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Comments */}
              <div style={{ marginTop: '8px' }}>
                <h2 style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 12px' }}>
                  {comments.length > 0 ? `${comments.length.toLocaleString()} Comments` : 'Comments'}
                </h2>

                <div style={{ display: 'flex', gap: '10px', marginBottom: '18px' }}>
                  <input
                    value={commentText}
                    onChange={e => setCommentText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !commentBusy) handleCommentSubmit(); }}
                    placeholder={userId ? 'Add a comment…' : 'Log in to comment'}
                    disabled={commentBusy}
                    style={{
                      flex: 1, minWidth: 0, padding: '10px 14px', borderRadius: '20px',
                      border: '1px solid var(--border-color)', background: 'var(--bg-card)',
                      color: 'var(--text-primary)', fontSize: '13px', outline: 'none',
                    }}
                  />
                  <button
                    onClick={handleCommentSubmit}
                    disabled={commentBusy || !commentText.trim()}
                    style={{
                      fontSize: '12.5px', fontWeight: 700, color: '#fff', background: '#f97316',
                      border: 'none', borderRadius: '20px', padding: '0 18px', cursor: 'pointer',
                      opacity: (commentBusy || !commentText.trim()) ? 0.5 : 1, flexShrink: 0,
                    }}
                  >
                    Post
                  </button>
                </div>

                {commentsLoading ? (
                  <p style={{ fontSize: '12.5px', color: 'var(--text-tertiary)' }}>Loading comments…</p>
                ) : comments.length === 0 ? (
                  <p style={{ fontSize: '12.5px', color: 'var(--text-tertiary)' }}>
                    No comments yet — be the first to say something.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {comments.map(c => (
                      <div key={c.id} style={{ display: 'flex', gap: '10px' }}>
                        <div style={{
                          width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
                          background: 'rgba(249,115,22,0.15)', color: '#f97316',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '13px', fontWeight: 800,
                        }}>
                          {c.commenterName.charAt(0).toUpperCase()}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '2px' }}>
                            <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-primary)' }}>{c.commenterName}</span>
                            <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                              {new Date(c.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0, wordBreak: 'break-word' }}>
                            {c.comment_text}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right column — tag-based recommendations, long-form videos only */}
            {!video.isShort && (
              <div style={{ flex: '1 1 320px', maxWidth: '400px', minWidth: '280px' }}>
                <h2 style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-secondary)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                  Up next
                </h2>
                {recommended.length === 0 ? (
                  <p style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', padding: '6px' }}>
                    No related videos yet — recommendations improve as more videos and series tags get added.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {recommended.map(r => <RecommendedCard key={r.id} video={r} />)}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
