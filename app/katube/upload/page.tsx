'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import ThemeToggle from '../../components/ThemeToggle';
import { supabase } from '../../lib/supabase';
import { setPostLoginRedirect } from '../../lib/authRedirect';

const CATEGORY_OPTIONS = ['Action', 'Mythology', 'Horror', 'Slice of Life', 'Fantasy', 'Trailers'];

// ── KaTube — Step 4: creator upload flow ──
// Paste a YouTube link, optionally pick which MANGAL series it's based on,
// submit. Inserts a row into `videos` (see
// supabase/migrations/20260810_katube_videos.sql) with is_short = false —
// this is the "main grid" upload path. A dedicated Shorts upload toggle can
// come later alongside the real Shorts row (still placeholder data on the
// main /katube page as of this step).
//
// No creator_profiles gating — matches the existing MangaNovels upload page
// (app/upload/page.tsx), which only requires being logged in, not a
// separate "creator" flag.

interface OwnSeries {
  id: string;
  title: string;
}

// Accepts youtube.com/watch?v=ID, youtu.be/ID, youtube.com/shorts/ID,
// youtube.com/embed/ID, or a bare 11-char video ID.
function extractYoutubeId(input: string): string | null {
  const trimmed = input.trim();

  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    if (url.hostname === 'youtu.be') {
      const id = url.pathname.slice(1);
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (url.hostname.includes('youtube.com')) {
      const vParam = url.searchParams.get('v');
      if (vParam && /^[a-zA-Z0-9_-]{11}$/.test(vParam)) return vParam;

      const shortsMatch = url.pathname.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
      if (shortsMatch) return shortsMatch[1];

      const embedMatch = url.pathname.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
      if (embedMatch) return embedMatch[1];
    }
  } catch {
    // not a valid URL — fall through to null
  }

  return null;
}

export default function KaTubeUploadPage() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [youtubeLink, setYoutubeLink] = useState('');
  const [title, setTitle] = useState('');
  const [seriesId, setSeriesId] = useState('');
  const [isShort, setIsShort] = useState(false);
  const [category, setCategory] = useState('Trailers');
  const [ownSeries, setOwnSeries] = useState<OwnSeries[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
      setCheckingAuth(false);
      // Set this eagerly (not only when "Log in" is clicked) — sidesteps a
      // Next.js Link/prefetch quirk where /login?next=/katube/upload
      // sometimes renders without ever picking up the ?next= value client-side.
      // Confirmed via debug logging (11 Aug 2026): nextPath was reading "/home"
      // even when the Link's href correctly included the query string.
      if (!data.user) setPostLoginRedirect('/katube/upload');
    });
  }, []);

  useEffect(() => {
    if (!userId) return;
    supabase.from('series').select('id, title').eq('creator_id', userId).order('title')
      .then(({ data }) => { if (data) setOwnSeries(data); });
  }, [userId]);

  const previewId = extractYoutubeId(youtubeLink);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!userId) { setError('You need to be logged in to upload.'); return; }

    const youtubeId = extractYoutubeId(youtubeLink);
    if (!youtubeId) { setError("That doesn't look like a valid YouTube link or video ID."); return; }
    if (!title.trim()) { setError('Give the video a title.'); return; }

    setSubmitting(true);

    const { data: inserted, error: insertError } = await supabase
      .from('videos')
      .insert({
        creator_id: userId,
        series_id: seriesId || null,
        title: title.trim(),
        youtube_id: youtubeId,
        is_short: isShort,
        category,
      })
      .select('id')
      .single();

    setSubmitting(false);

    if (insertError || !inserted) {
      setError(insertError?.message || 'Something went wrong saving the video.');
      return;
    }

    setSuccess(true);
    setTimeout(() => { router.push(`/katube/watch/${inserted.id}`); }, 900);
  }

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

      <div style={{ maxWidth: '560px', margin: '0 auto', padding: '40px 20px 60px' }}>
        <h1 style={{ fontSize: 'clamp(20px, 3vw, 26px)', fontWeight: 900, marginBottom: '6px', letterSpacing: '-0.02em' }}>
          Upload a video
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '28px', lineHeight: 1.6 }}>
          Paste the YouTube link to your AI-generated anime video. KaTube only stores the
          link and metadata — your video stays hosted on YouTube.
        </p>

        {checkingAuth ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px' }}>Checking your account…</div>
        ) : !userId ? (
          <div style={{
            padding: '20px', borderRadius: '12px', background: 'var(--bg-card)',
            border: '1px solid var(--border-color)', fontSize: '13px', lineHeight: 1.6,
          }}>
            You need to be logged in to upload a video.{' '}
            <Link href="/login?next=/katube/upload" style={{ color: '#2563eb', fontWeight: 700 }}>Log in</Link>
          </div>
        ) : success ? (
          <div style={{
            padding: '20px', borderRadius: '12px', background: 'rgba(37,99,235,0.08)',
            border: '1px solid rgba(37,99,235,0.3)', fontSize: '13px', fontWeight: 700, color: '#2563eb',
          }}>
            Uploaded! Taking you to the video…
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, marginBottom: '6px' }}>
              YouTube link
            </label>
            <input
              type="text"
              value={youtubeLink}
              onChange={e => setYoutubeLink(e.target.value)}
              placeholder="https://youtube.com/watch?v=..."
              style={{
                width: '100%', padding: '11px 14px', borderRadius: '10px',
                border: '1px solid var(--border-color)', background: 'var(--bg-card)',
                color: 'var(--text-primary)', fontSize: '13.5px', marginBottom: '6px',
                boxSizing: 'border-box',
              }}
            />
            <p style={{ fontSize: '11.5px', color: 'var(--text-tertiary)', marginBottom: '20px', minHeight: '16px' }}>
              {youtubeLink && !previewId ? "Couldn't read a video from that link." : previewId ? `Video ID detected: ${previewId}` : ' '}
            </p>

            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, marginBottom: '6px' }}>
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="What's the video called?"
              style={{
                width: '100%', padding: '11px 14px', borderRadius: '10px',
                border: '1px solid var(--border-color)', background: 'var(--bg-card)',
                color: 'var(--text-primary)', fontSize: '13.5px', marginBottom: '20px',
                boxSizing: 'border-box',
              }}
            />

            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, marginBottom: '6px' }}>
              Based on which MANGAL series? <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>(optional)</span>
            </label>
            <select
              value={seriesId}
              onChange={e => setSeriesId(e.target.value)}
              style={{
                width: '100%', padding: '11px 14px', borderRadius: '10px',
                border: '1px solid var(--border-color)', background: 'var(--bg-card)',
                color: 'var(--text-primary)', fontSize: '13.5px', marginBottom: '6px',
                boxSizing: 'border-box',
              }}
            >
              <option value="">— None —</option>
              {ownSeries.map(s => (
                <option key={s.id} value={s.id}>{s.title}</option>
              ))}
            </select>
            <p style={{ fontSize: '11.5px', color: 'var(--text-tertiary)', marginBottom: '20px' }}>
              {ownSeries.length === 0 ? "You don't have any published series yet — you can still upload without linking one." : 'Only series you created show up here.'}
            </p>

            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, marginBottom: '6px' }}>
              Category
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
              {CATEGORY_OPTIONS.map(c => (
                <span
                  key={c}
                  onClick={() => setCategory(c)}
                  style={{
                    fontSize: '12px', fontWeight: 700, padding: '7px 16px', borderRadius: '20px',
                    background: category === c ? 'linear-gradient(135deg, #2563eb, #0ea5e9)' : 'var(--bg-card)',
                    color: category === c ? '#fff' : 'var(--text-secondary)',
                    border: category === c ? 'none' : '1px solid var(--border-color)',
                    cursor: 'pointer',
                  }}
                >{c}</span>
              ))}
            </div>

            <label style={{
              display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px',
              padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border-color)',
              background: 'var(--bg-card)', cursor: 'pointer',
            }}>
              <input
                type="checkbox"
                checked={isShort}
                onChange={e => setIsShort(e.target.checked)}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '13px' }}>
                <span style={{ fontWeight: 700 }}>⚡ This is a Short</span>
                <span style={{ color: 'var(--text-tertiary)' }}> — vertical/short-form, shows in the Shorts row instead of the main grid</span>
              </span>
            </label>

            {error && (
              <div style={{
                padding: '12px 14px', borderRadius: '10px', background: 'rgba(220,38,38,0.08)',
                border: '1px solid rgba(220,38,38,0.3)', color: '#dc2626', fontSize: '12.5px',
                marginBottom: '20px',
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              style={{
                width: '100%', padding: '13px', borderRadius: '10px', border: 'none',
                background: submitting ? '#93c5fd' : '#2563eb', color: '#fff',
                fontSize: '14px', fontWeight: 800, cursor: submitting ? 'default' : 'pointer',
              }}
            >
              {submitting ? 'Uploading…' : 'Upload video'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
