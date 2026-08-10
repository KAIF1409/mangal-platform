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
}

export default function KaTubeWatchPage() {
  const params = useParams();
  const videoId = params?.videoId as string;

  const [video, setVideo] = useState<WatchVideo | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!videoId) return;

    (async () => {
      const { data: row } = await supabase
        .from('videos')
        .select('id, title, youtube_id, views, likes, creator_id, series_id')
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
      });
      setLoading(false);

      // best-effort view increment — not awaited, doesn't block render
      supabase.from('videos').update({ views: row.views + 1 }).eq('id', row.id).then(() => {});
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

      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '28px 20px 60px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-tertiary)', fontSize: '13px' }}>Loading video…</div>
        ) : notFound || !video ? (
          <div style={{ textAlign: 'center', padding: '80px 20px' }}>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px' }}>This video doesn&apos;t exist or was removed.</p>
            <Link href="/katube" style={{ fontSize: '13px', fontWeight: 700, color: '#2563eb' }}>← Back to KaTube</Link>
          </div>
        ) : (
          <>
            {/* Player */}
            <div style={{
              position: 'relative', width: '100%', aspectRatio: '16/9',
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
              Like, comment, and subscribe aren&apos;t built yet — that&apos;s the next step, along with the
              creator upload flow.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
