'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import ThemeToggle from '../components/ThemeToggle';

// ── AnimeTube — demo/mockup page ──
// Step 2 of the AnimeTube build plan: a static video-grid UI with placeholder
// data so the concept can be seen and felt before any real backend, upload
// flow, or YouTube-embed wiring goes in. No live data, no Supabase calls yet.

interface DemoVideo {
  id: string;
  title: string;
  creator: string;
  basedOn: string;
  views: string;
  duration: string;
  gradient: string;
  emoji: string;
}

const DEMO_VIDEOS: DemoVideo[] = [
  { id: '1', title: 'Aryavarta Rising — Episode 1 (AI Trailer)', creator: 'Kaif', basedOn: 'Aryavarta Chronicles', views: '2.4K', duration: '1:12', gradient: 'linear-gradient(135deg, #db2777, #7b2cbf)', emoji: '⚔️' },
  { id: '2', title: 'The Last Panchayat — Cold Open', creator: 'Kaif', basedOn: 'The Last Panchayat', views: '1.1K', duration: '0:48', gradient: 'linear-gradient(135deg, #7b2cbf, #4f46e5)', emoji: '🏯' },
  { id: '3', title: 'Street Life Mumbai — Opening Sequence', creator: 'MANGAL Studio', basedOn: 'Street Life Mumbai', views: '3.8K', duration: '1:34', gradient: 'linear-gradient(135deg, #ea580c, #db2777)', emoji: '🌆' },
  { id: '4', title: 'Desi Horror Anthology — Teaser', creator: 'MANGAL Studio', basedOn: 'Desi Horror Anthology', views: '890', duration: '0:55', gradient: 'linear-gradient(135deg, #1e1b4b, #7b2cbf)', emoji: '👻' },
  { id: '5', title: 'Folk Tale: The Banyan Spirit', creator: 'Kaif', basedOn: 'Folk Tales of Bharat', views: '5.2K', duration: '2:03', gradient: 'linear-gradient(135deg, #059669, #7b2cbf)', emoji: '🌳' },
  { id: '6', title: 'School Life Chronicles — Ep. 1 Recap', creator: 'MANGAL Studio', basedOn: 'School Life Chronicles', views: '1.6K', duration: '1:20', gradient: 'linear-gradient(135deg, #d97706, #db2777)', emoji: '🎒' },
];

const CATEGORY_PILLS = ['All', 'Action', 'Mythology', 'Horror', 'Slice of Life', 'Fantasy', 'Trailers'];

interface DemoShort {
  id: string;
  title: string;
  views: string;
  gradient: string;
  emoji: string;
}

const DEMO_SHORTS: DemoShort[] = [
  { id: 's1', title: 'Aryavarta in 30 seconds', views: '12K', gradient: 'linear-gradient(160deg, #db2777, #4f46e5)', emoji: '⚡' },
  { id: 's2', title: 'That plot twist though 😱', views: '8.7K', gradient: 'linear-gradient(160deg, #7b2cbf, #1e1b4b)', emoji: '😱' },
  { id: 's3', title: 'Banyan Spirit — best frame', views: '15K', gradient: 'linear-gradient(160deg, #059669, #7b2cbf)', emoji: '🌳' },
  { id: 's4', title: 'Street Life Mumbai vibes', views: '6.1K', gradient: 'linear-gradient(160deg, #ea580c, #db2777)', emoji: '🌆' },
  { id: 's5', title: 'POV: exam week hits different', views: '21K', gradient: 'linear-gradient(160deg, #d97706, #db2777)', emoji: '🎒' },
  { id: 's6', title: 'Horror anthology jumpscare', views: '9.4K', gradient: 'linear-gradient(160deg, #1e1b4b, #db2777)', emoji: '👻' },
];

function ShortCard({ short }: { short: DemoShort }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        flexShrink: 0, width: '140px', borderRadius: '14px', overflow: 'hidden', cursor: 'pointer',
        position: 'relative', aspectRatio: '9/16', background: short.gradient,
        display: 'flex', alignItems: 'flex-end',
        transform: hover ? 'translateY(-4px) scale(1.02)' : 'none',
        boxShadow: hover ? '0 12px 24px rgba(219,39,119,0.28)' : '0 2px 8px rgba(0,0,0,0.12)',
        transition: 'transform 0.15s, box-shadow 0.2s',
      }}
    >
      <span style={{ position: 'absolute', top: '44%', left: '50%', transform: 'translate(-50%, -50%)', fontSize: '32px', opacity: 0.9 }}>{short.emoji}</span>
      <span style={{
        position: 'absolute', top: '8px', left: '8px', fontSize: '9.5px', fontWeight: 800, color: '#fff',
        background: 'rgba(0,0,0,0.5)', padding: '2px 7px', borderRadius: '20px', letterSpacing: '0.02em',
      }}>⚡ SHORTS</span>
      <div style={{
        position: 'relative', width: '100%', padding: '18px 10px 10px',
        background: 'linear-gradient(to top, rgba(0,0,0,0.75), transparent)',
      }}>
        <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#fff', lineHeight: 1.3, marginBottom: '3px' }}>{short.title}</div>
        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.75)' }}>{short.views} views</div>
      </div>
    </div>
  );
}

function VideoCard({ video }: { video: DemoVideo }) {
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
        boxShadow: hover ? '0 12px 28px rgba(219,39,119,0.22)' : 'none',
      }}
    >
      {/* Thumbnail */}
      <div style={{
        position: 'relative', aspectRatio: '16/9', background: video.gradient,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: '40px', opacity: 0.9 }}>{video.emoji}</span>
        <span style={{
          position: 'absolute', bottom: '8px', right: '8px',
          fontSize: '11px', fontWeight: 700, color: '#fff',
          background: 'rgba(0,0,0,0.65)', padding: '2px 7px', borderRadius: '6px',
        }}>{video.duration}</span>
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

      {/* Info */}
      <div style={{ padding: '12px 14px' }}>
        <div style={{
          fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary)',
          lineHeight: 1.35, marginBottom: '6px',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>{video.title}</div>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>{video.creator}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
          <Link href="#" style={{
            fontSize: '10.5px', fontWeight: 700, color: '#f472b6', textDecoration: 'none',
            background: 'rgba(219,39,119,0.12)', border: '1px solid rgba(219,39,119,0.3)',
            padding: '3px 9px', borderRadius: '20px', whiteSpace: 'nowrap',
          }}>
            📖 {video.basedOn}
          </Link>
          <span style={{ fontSize: '11.5px', color: 'var(--text-tertiary)' }}>{video.views} views</span>
        </div>
      </div>
    </div>
  );
}

export default function AnimeTubePage() {
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
          <span style={{ fontSize: '20px' }}>🎬</span>
          <span style={{
            fontWeight: 900, fontSize: '20px', letterSpacing: '-0.03em',
            background: 'linear-gradient(135deg, #f472b6, #a78bfa)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          }}>AnimeTube</span>
          <span style={{
            fontSize: '9.5px', fontWeight: 800, color: '#f472b6',
            background: 'rgba(219,39,119,0.15)', border: '1px solid rgba(219,39,119,0.35)',
            padding: '2px 7px', borderRadius: '20px', marginLeft: '4px',
          }}>DEMO</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Link href="/anime-chat" style={{
            padding: '8px 14px', borderRadius: '8px', fontSize: '12.5px', fontWeight: 700,
            color: '#c4b5fd', textDecoration: 'none', border: '1px solid rgba(124,58,237,0.35)',
            whiteSpace: 'nowrap',
          }}>💬 Anime Chat</Link>
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
        background: 'radial-gradient(ellipse 70% 60% at 50% 0%, rgba(219,39,119,0.14) 0%, transparent 70%)',
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
          <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#f472b6' }}>See all →</span>
        </div>
        <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '8px' }}>
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
            background: i === 0 ? 'linear-gradient(135deg, #db2777, #7b2cbf)' : 'var(--bg-card)',
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
      <div style={{
        padding: '0 20px 60px', maxWidth: '1200px', margin: '0 auto',
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '18px',
      }}>
        {DEMO_VIDEOS.map(v => <VideoCard key={v.id} video={v} />)}
      </div>

      {/* Placeholder note */}
      <div style={{ maxWidth: '600px', margin: '0 auto 60px', padding: '18px 22px', borderRadius: '12px', background: 'var(--bg-card)', border: '1px dashed var(--border-color)', textAlign: 'center' }}>
        <p style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', margin: 0, lineHeight: 1.6 }}>
          These are placeholder cards for the demo — thumbnails, Shorts, and view counts are not wired to
          real data yet, and actions like subscribe, like, and comment aren&apos;t built yet either. The
          next build step wires this grid to real Supabase data and embeds actual creator-uploaded YouTube
          videos in place of these gradient tiles.
        </p>
      </div>
    </div>
  );
}
