'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import ThemeToggle from '../../../components/ThemeToggle';
import { supabase } from '../../../lib/supabase';

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
  creatorUsername: string | null;
  seriesId: string | null;
  basedOn: string | null;
  isShort: boolean;
}

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
  const videoId = params?.videoId as string;

  const [video, setVideo] = useState<WatchVideo | null>(null);
  const [recommended, setRecommended] = useState<RecommendedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

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

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', overflowX: 'hidden' }}>

      {/* ── NAV ── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'var(--nav-bg)', backdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--border-color)',
        padding: '0 20px', height: '64px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none', flexShrink: 0 }}>
          <Image src="/icon.png" alt="MANGAL" width={32} height={32} style={{ display: 'block', borderRadius: '8px' }} />
          <span style={{ fontWeight: 900, fontSize: '13px', color: 'var(--text-tertiary)', letterSpacing: '-0.02em' }}>MANGAL</span>
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Image src="/katube-logo.png" alt="KaTube" width={140} height={70} style={{ display: 'block', height: '34px', width: 'auto', objectFit: 'contain' }} priority />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ThemeToggle size={30} />
          <Link href="/katube" style={{
            padding: '8px 16px', borderRadius: '8px', fontSize: '12.5px', fontWeight: 700,
            color: 'var(--text-secondary)', textDecoration: 'none', border: '1px solid var(--border-color)',
          }}>← Back to KaTube</Link>
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
            <Link href="/katube" style={{ fontSize: '13px', fontWeight: 700, color: '#2563eb' }}>← Back to KaTube</Link>
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
                  <span>·</span>
                  <span>{video.views.toLocaleString()} views</span>
                  <span>·</span>
                  <span>👍 {video.likes.toLocaleString()}</span>
                </div>

                {video.basedOn && (
                  <Link href={video.seriesId ? `/series/${video.seriesId}` : '#'} style={{
                    fontSize: '11.5px', fontWeight: 700, color: '#2563eb', textDecoration: 'none',
                    background: 'rgba(37,99,235,0.10)', border: '1px solid rgba(37,99,235,0.28)',
                    padding: '4px 11px', borderRadius: '20px', whiteSpace: 'nowrap',
                  }}>
                    📖 Based on {video.basedOn}
                  </Link>
                )}
              </div>

              <div style={{
                padding: '14px 16px', borderRadius: '12px', background: 'var(--bg-card)',
                border: '1px solid var(--border-color)', fontSize: '12.5px', color: 'var(--text-tertiary)', lineHeight: 1.6,
              }}>
                Like, comment, and subscribe aren&apos;t built yet — that&apos;s the next step.
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
