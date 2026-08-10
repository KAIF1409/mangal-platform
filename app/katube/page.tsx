'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import ThemeToggle from '../components/ThemeToggle';
import { supabase } from '../lib/supabase';

// ── KaTube — Step 2: video grid wired to real Supabase data ──
// The main grid below now reads from the `videos` table (see
// supabase/migrations/20260810_katube_videos.sql). Shorts row still uses
// placeholder data — that's a separate step. No upload flow exists yet, so
// the grid will legitimately be empty until a creator uploads something.
//
// Brand: white + blue (per founder request), distinct from Kalpana Circle's
// purple identity — the two doors should read as related but visually
// distinguishable products.

interface RealVideo {
  id: string;
  title: string;
  youtube_id: string;
  views: number;
  creator: string;
  basedOn: string | null;
}

const CATEGORY_PILLS = ['All', 'Action', 'Mythology', 'Horror', 'Slice of Life', 'Fantasy', 'Trailers'];

interface DemoShort {
  id: string;
  title: string;
  views: string;
  gradient: string;
  emoji: string;
}

const DEMO_SHORTS: DemoShort[] = [
  { id: 's1', title: 'Aryavarta in 30 seconds', views: '12K', gradient: 'linear-gradient(160deg, #2563eb, #0ea5e9)', emoji: '⚡' },
  { id: 's2', title: 'That plot twist though 😱', views: '8.7K', gradient: 'linear-gradient(160deg, #1e3a8a, #1d4ed8)', emoji: '😱' },
  { id: 's3', title: 'Banyan Spirit — best frame', views: '15K', gradient: 'linear-gradient(160deg, #0891b2, #2563eb)', emoji: '🌳' },
  { id: 's4', title: 'Street Life Mumbai vibes', views: '6.1K', gradient: 'linear-gradient(160deg, #0369a1, #38bdf8)', emoji: '🌆' },
  { id: 's5', title: 'POV: exam week hits different', views: '21K', gradient: 'linear-gradient(160deg, #2563eb, #7dd3fc)', emoji: '🎒' },
  { id: 's6', title: 'Horror anthology jumpscare', views: '9.4K', gradient: 'linear-gradient(160deg, #1e3a8a, #0ea5e9)', emoji: '👻' },
];

function ShortCard({ short }: { short: DemoShort }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        flexShrink: 0, width: '190px', borderRadius: '16px', overflow: 'hidden', cursor: 'pointer',
        position: 'relative', aspectRatio: '9/16', background: short.gradient,
        display: 'flex', alignItems: 'flex-end',
        transform: hover ? 'translateY(-4px) scale(1.02)' : 'none',
        boxShadow: hover ? '0 12px 24px rgba(37,99,235,0.28)' : '0 2px 8px rgba(0,0,0,0.12)',
        transition: 'transform 0.15s, box-shadow 0.2s',
      }}
    >
      <span style={{ position: 'absolute', top: '44%', left: '50%', transform: 'translate(-50%, -50%)', fontSize: '44px', opacity: 0.9 }}>{short.emoji}</span>
      <span style={{
        position: 'absolute', top: '10px', left: '10px', fontSize: '11px', fontWeight: 800, color: '#fff',
        background: 'rgba(0,0,0,0.5)', padding: '3px 9px', borderRadius: '20px', letterSpacing: '0.02em',
      }}>⚡ SHORTS</span>
      <div style={{
        position: 'relative', width: '100%', padding: '24px 14px 14px',
        background: 'linear-gradient(to top, rgba(0,0,0,0.75), transparent)',
      }}>
        <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff', lineHeight: 1.3, marginBottom: '4px' }}>{short.title}</div>
        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.75)' }}>{short.views} views</div>
      </div>
    </div>
  );
}

function RealVideoCard({ video }: { video: RealVideo }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        borderRadius: '14px', overflow: 'hidden', cursor: 'pointer',
        background: 'var(--bg-card)', border: '1px solid var(--border-color)',
        transition: 'transform 0.15s, box-shadow 0.2s',
        transform: hover ? 'translateY(-4px)' : 'none',
        boxShadow: hover ? '0 12px 28px rgba(37,99,235,0.20)' : 'none',
      }}
    >
      <div style={{ position: 'relative', aspectRatio: '16/9', background: '#000' }}>
        <img
          src={`https://img.youtube.com/vi/${video.youtube_id}/hqdefault.jpg`}
          alt={video.title}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
        {hover && (
          <div style={{
            position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              width: '46px', height: '46px', borderRadius: '50%',
              background: 'rgba(255,255,255,0.92)', display: 'flex',
              alignItems: 'center', justifyContent: 'center', fontSize: '18px',
            }}>▶️</div>
          </div>
        )}
      </div>
      <div style={{ padding: '12px 14px' }}>
        <div style={{
          fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary)',
          lineHeight: 1.35, marginBottom: '6px',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>{video.title}</div>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>{video.creator}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
          {video.basedOn && (
            <Link href="#" style={{
              fontSize: '10.5px', fontWeight: 700, color: '#2563eb', textDecoration: 'none',
              background: 'rgba(37,99,235,0.10)', border: '1px solid rgba(37,99,235,0.28)',
              padding: '3px 9px', borderRadius: '20px', whiteSpace: 'nowrap',
            }}>
              📖 {video.basedOn}
            </Link>
          )}
          <span style={{ fontSize: '11.5px', color: 'var(--text-tertiary)' }}>{video.views} views</span>
        </div>
      </div>
    </div>
  );
}

export default function KaTubePage() {
  const [videos, setVideos] = useState<RealVideo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: rows } = await supabase
        .from('videos')
        .select('id, title, youtube_id, views, creator_id, series_id')
        .eq('is_short', false)
        .order('created_at', { ascending: false });

      if (!rows || rows.length === 0) { setLoading(false); return; }

      const creatorIds = [...new Set(rows.map(r => r.creator_id))];
      const seriesIds = [...new Set(rows.map(r => r.series_id).filter(Boolean))];

      const [creatorsRes, seriesRes] = await Promise.all([
        supabase.from('creator_profiles').select('user_id, username').in('user_id', creatorIds),
        seriesIds.length ? supabase.from('series').select('id, title').in('id', seriesIds) : Promise.resolve({ data: [] as { id: string; title: string }[] }),
      ]);
      const creatorMap = new Map((creatorsRes.data || []).map(c => [c.user_id, c.username]));
      const seriesMap = new Map((seriesRes.data || []).map(s => [s.id, s.title]));

      setVideos(rows.map(r => ({
        id: r.id,
        title: r.title,
        youtube_id: r.youtube_id,
        views: r.views,
        creator: creatorMap.get(r.creator_id) || 'MANGAL Creator',
        basedOn: r.series_id ? (seriesMap.get(r.series_id) || null) : null,
      })));
      setLoading(false);
    })();
  }, []);

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
          <span style={{
            fontSize: '9.5px', fontWeight: 800, color: '#2563eb',
            background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(37,99,235,0.32)',
            padding: '2px 7px', borderRadius: '20px', marginLeft: '4px',
          }}>DEMO</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Link href="/kalpana-circle" style={{
            padding: '8px 14px', borderRadius: '8px', fontSize: '12.5px', fontWeight: 700,
            color: '#7c3aed', textDecoration: 'none', border: '1px solid rgba(124,58,237,0.35)',
            whiteSpace: 'nowrap',
          }}>💬 K Circle</Link>
          <ThemeToggle size={30} />
          <Link href="/" style={{
            padding: '8px 16px', borderRadius: '8px', fontSize: '12.5px', fontWeight: 700,
            color: 'var(--text-secondary)', textDecoration: 'none', border: '1px solid var(--border-color)',
          }}>← Back to MANGAL</Link>
        </div>
      </nav>

      {/* ── HERO STRIP ── */}
      <div style={{
        padding: '36px 20px 24px', textAlign: 'center',
        background: 'radial-gradient(ellipse 70% 60% at 50% 0%, rgba(37,99,235,0.10) 0%, transparent 70%)',
      }}>
        <h1 style={{
          fontSize: 'clamp(24px, 4vw, 40px)', fontWeight: 900, margin: '0 0 8px', letterSpacing: '-0.03em',
        }}>AI-Anime, Made by MANGAL Creators</h1>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', maxWidth: '560px', margin: '0 auto' }}>
          Every video here is an original AI-generated adaptation of a MANGAL series. This is an early demo —
          real uploads and a working watch page are coming next.
        </p>
      </div>

      {/* Shorts row */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 20px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 900, margin: 0, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '6px' }}>
            ⚡ Shorts
          </h2>
          <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#2563eb' }}>See all →</span>
        </div>
        <div style={{ display: 'flex', gap: '16px', overflowX: 'auto', paddingBottom: '8px' }}>
          {DEMO_SHORTS.map(s => <ShortCard key={s.id} short={s} />)}
        </div>
      </div>

      {/* Category pills */}
      <div style={{
        display: 'flex', gap: '8px', overflowX: 'auto', padding: '20px 20px 20px',
        maxWidth: '1200px', margin: '0 auto',
      }}>
        {CATEGORY_PILLS.map((c, i) => (
          <span key={c} style={{
            flexShrink: 0, fontSize: '12px', fontWeight: 700, padding: '7px 16px', borderRadius: '20px',
            background: i === 0 ? 'linear-gradient(135deg, #2563eb, #0ea5e9)' : 'var(--bg-card)',
            color: i === 0 ? '#fff' : 'var(--text-secondary)',
            border: i === 0 ? 'none' : '1px solid var(--border-color)',
            cursor: 'pointer', whiteSpace: 'nowrap',
          }}>{c}</span>
        ))}
      </div>

      {/* Video grid */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 20px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 900, margin: '0 0 14px', letterSpacing: '-0.02em' }}>🎬 Videos</h2>
      </div>
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-tertiary)', fontSize: '13px' }}>Loading videos…</div>
      ) : videos.length === 0 ? (
        <div style={{ maxWidth: '600px', margin: '0 auto 60px', padding: '18px 22px', borderRadius: '12px', background: 'var(--bg-card)', border: '1px dashed var(--border-color)', textAlign: 'center' }}>
          <p style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', margin: 0, lineHeight: 1.6 }}>
            No videos yet — this grid is wired to real Supabase data, but no creator has uploaded a video
            here yet. Once the upload flow ships, real creator videos will show up here automatically.
          </p>
        </div>
      ) : (
        <div style={{
          padding: '0 20px 60px', maxWidth: '1200px', margin: '0 auto',
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '18px',
        }}>
          {videos.map(v => <RealVideoCard key={v.id} video={v} />)}
        </div>
      )}

      {/* Placeholder note (Shorts + actions still pending) */}
      <div style={{ maxWidth: '600px', margin: '0 auto 60px', padding: '18px 22px', borderRadius: '12px', background: 'var(--bg-card)', border: '1px dashed var(--border-color)', textAlign: 'center' }}>
        <p style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', margin: 0, lineHeight: 1.6 }}>
          The video grid above is live Supabase data. Shorts and actions like subscribe, like, and
          comment aren&apos;t built yet — that&apos;s the next step, along with the creator upload flow.
        </p>
      </div>
    </div>
  );
}
