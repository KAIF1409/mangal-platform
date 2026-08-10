'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import ThemeToggle from '../components/ThemeToggle';

// ── Kalpana Circle — demo/mockup page (renamed from Anime Chat) ──
// A standalone community space for anime talk, separate from Kalpanaverse's
// video feed. Placeholder posts only — no real posting/comment backend yet.

interface DemoPost {
  id: string;
  author: string;
  tag: string;
  text: string;
  replies: number;
  likes: number;
  time: string;
  avatarGradient: string;
}

const DEMO_POSTS: DemoPost[] = [
  { id: '1', author: 'Kaif', tag: 'Theory', text: 'Wild theory: the Banyan Spirit in the Folk Tales series is actually connected to the Panchayat storyline. Anyone else notice the recurring symbol?', replies: 14, likes: 32, time: '2h', avatarGradient: 'linear-gradient(135deg, #db2777, #7b2cbf)' },
  { id: '2', author: 'ReaderX', tag: 'Fan Art', text: 'Drew a quick fan piece of the Aryavarta protagonist after watching the AI trailer on Kalpanaverse 🔥', replies: 8, likes: 51, time: '5h', avatarGradient: 'linear-gradient(135deg, #059669, #7b2cbf)' },
  { id: '3', author: 'MangaMaya', tag: 'Request', text: 'Can someone adapt Street Life Mumbai next? That series deserves an AI-anime short so bad', replies: 21, likes: 19, time: '8h', avatarGradient: 'linear-gradient(135deg, #ea580c, #db2777)' },
  { id: '4', author: 'AnimeFan108', tag: 'Reaction', text: 'The Desi Horror Anthology teaser genuinely scared me at 30 seconds long, how', replies: 6, likes: 27, time: '1d', avatarGradient: 'linear-gradient(135deg, #1e1b4b, #7b2cbf)' },
];

const CHANNEL_PILLS = ['All', 'Theories', 'Fan Art', 'Requests', 'Reactions', 'Introductions'];

function PostCard({ post }: { post: DemoPost }) {
  return (
    <div style={{
      padding: '16px 18px', borderRadius: '14px', background: 'var(--bg-card)',
      border: '1px solid var(--border-color)', marginBottom: '12px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
        <div style={{
          width: '34px', height: '34px', borderRadius: '50%', background: post.avatarGradient,
          flexShrink: 0,
        }} />
        <div>
          <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)' }}>{post.author}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{post.time} ago</div>
        </div>
        <span style={{
          marginLeft: 'auto', fontSize: '10px', fontWeight: 800, color: '#c4b5fd',
          background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.3)',
          padding: '3px 9px', borderRadius: '20px', whiteSpace: 'nowrap',
        }}>{post.tag}</span>
      </div>
      <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: 1.55, margin: '0 0 12px' }}>
        {post.text}
      </p>
      <div style={{ display: 'flex', gap: '18px' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '5px' }}>💬 {post.replies}</span>
        <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '5px' }}>❤️ {post.likes}</span>
      </div>
    </div>
  );
}

export default function KalpanaCirclePage() {
  const [draft, setDraft] = useState('');

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
          <span style={{ fontSize: '20px' }}>💬</span>
          <span style={{
            fontWeight: 900, fontSize: '20px', letterSpacing: '-0.03em',
            background: 'linear-gradient(135deg, #a78bfa, #f472b6)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          }}>Kalpana Circle</span>
          <span style={{
            fontSize: '9.5px', fontWeight: 800, color: '#c4b5fd',
            background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.35)',
            padding: '2px 7px', borderRadius: '20px', marginLeft: '4px',
          }}>DEMO</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Link href="/kalpanaverse" style={{
            padding: '8px 14px', borderRadius: '8px', fontSize: '12.5px', fontWeight: 700,
            color: '#2563eb', textDecoration: 'none', border: '1px solid rgba(37,99,235,0.35)',
            whiteSpace: 'nowrap',
          }}>🎬 Kalpanaverse</Link>
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
        background: 'radial-gradient(ellipse 70% 60% at 50% 0%, rgba(124,58,237,0.14) 0%, transparent 70%)',
      }}>
        <h1 style={{
          fontSize: 'clamp(24px, 4vw, 40px)', fontWeight: 900, margin: '0 0 8px', letterSpacing: '-0.03em',
        }}>Talk Anime With the Community</h1>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', maxWidth: '560px', margin: '0 auto' }}>
          Theories, fan art, reactions, and requests for what MANGAL creators should adapt next on Kalpanaverse.
          This is an early demo — posting isn&apos;t live yet.
        </p>
      </div>

      {/* Channel pills */}
      <div style={{
        display: 'flex', gap: '8px', overflowX: 'auto', padding: '8px 20px 20px',
        maxWidth: '640px', margin: '0 auto',
      }}>
        {CHANNEL_PILLS.map((c, i) => (
          <span key={c} style={{
            flexShrink: 0, fontSize: '12px', fontWeight: 700, padding: '7px 16px', borderRadius: '20px',
            background: i === 0 ? 'linear-gradient(135deg, #7c3aed, #db2777)' : 'var(--bg-card)',
            color: i === 0 ? '#fff' : 'var(--text-secondary)',
            border: i === 0 ? 'none' : '1px solid var(--border-color)',
            cursor: 'pointer', whiteSpace: 'nowrap',
          }}>{c}</span>
        ))}
      </div>

      {/* Feed */}
      <div style={{ maxWidth: '640px', margin: '0 auto', padding: '0 20px 40px' }}>

        {/* Composer (disabled demo state) */}
        <div style={{
          padding: '14px 16px', borderRadius: '14px', background: 'var(--bg-card)',
          border: '1px dashed var(--border-color)', marginBottom: '20px',
        }}>
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Share a theory, fan art, or request... (demo only — posting isn't live yet)"
            rows={2}
            style={{
              width: '100%', border: 'none', outline: 'none', resize: 'none',
              background: 'transparent', color: 'var(--text-primary)', fontSize: '13.5px',
              fontFamily: 'inherit', marginBottom: '8px',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <span style={{
              fontSize: '12px', fontWeight: 700, padding: '7px 18px', borderRadius: '8px',
              background: 'var(--border-color)', color: 'var(--text-tertiary)', cursor: 'not-allowed',
            }}>Post (coming soon)</span>
          </div>
        </div>

        {DEMO_POSTS.map(p => <PostCard key={p.id} post={p} />)}

        {/* Placeholder note */}
        <div style={{ padding: '16px 20px', borderRadius: '12px', background: 'var(--bg-card)', border: '1px dashed var(--border-color)', textAlign: 'center' }}>
          <p style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', margin: 0, lineHeight: 1.6 }}>
            These posts are placeholder content for the demo. Posting, replies, and likes aren&apos;t wired to
            a real backend yet — the next build step adds a Supabase-backed posts/comments table here.
          </p>
        </div>
      </div>
    </div>
  );
}
