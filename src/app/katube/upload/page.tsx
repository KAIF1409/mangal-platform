'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import ThemeToggle from '../../components/shared/ThemeToggle';
import MangalLogo from '../../components/shared/MangalLogo';
import { supabase } from '../../lib/supabase';
import { setPostLoginRedirect } from '../../lib/auth/authRedirect';
import { CheckCircle2, Zap, Megaphone, ArrowLeft, ArrowRight } from 'lucide-react';

const CATEGORY_OPTIONS = ['Action', 'Mythology', 'Horror', 'Slice of Life', 'Fantasy', 'Dark Fantasy', 'Supernatural', 'Science Fiction', 'Trailers'];
const AI_TOOL_OPTIONS = ['Sora', 'Kling', 'Runway', 'Pika', 'Hailuo', 'Veo', 'Other'];

// ── KaTube — Step 4: creator upload flow ──
// Paste a YouTube link, optionally pick which MANGAL series it's based on,
// submit. Inserts a row into `videos` (see
// supabase/migrations/20260810_katube_videos.sql) with is_short = false —
// this is the "main grid" upload path. A dedicated Shorts upload toggle can
// come later alongside the real Shorts row (still placeholder data on the
// main /katube page as of this step).
//
// No creator_profiles gating — matches the existing WebMangal upload page
// (app/upload/page.tsx), which only requires being logged in, not a
// separate "creator" flag.

interface OwnSeries {
  id: string;
  title: string;
}

interface ChannelStatus {
  verifiedChannelId: string | null;
  pendingChannelId: string | null;
  pendingCode: string | null;
  channelHandle: string | null;
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
  const [aiTool, setAiTool] = useState('Other');
  const [ownSeries, setOwnSeries] = useState<OwnSeries[]>([]);

  // Per-video toggle, default OFF — nothing auto-posts unless the creator
  // opts in on this specific upload. Turning it on shows a one-time Yes/No
  // confirmation instead of flipping the checkbox immediately, so a creator
  // can't accidentally post to their K Circle channel with a stray click.
  const [autoPostToCircle, setAutoPostToCircle] = useState(false);
  const [showAutoPostConfirm, setShowAutoPostConfirm] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Mobile step flow (YouTube Studio-style: Video -> Details -> Publish).
  // Desktop keeps the original single flat form — this only kicks in under
  // the 768px breakpoint. Steps: 1 = link/title/preview, 2 = series +
  // category + AI tool, 3 = Short/auto-post toggles + submit.
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [mobileStep, setMobileStep] = useState(1);
  const TOTAL_STEPS = 3;

  useEffect(() => {
    const check = () => setIsMobileViewport(window.innerWidth <= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // KaTube §6 — channel-ownership verification, gates the rest of the form.
  // The one-time connect/verify flow itself now lives at /katube/dashboard
  // (a creator's KaTube profile) — this page only reads the status to decide
  // whether to show the upload form or point them there. Nobody is asked to
  // verify twice; this is a read-only check every visit, not a re-ask.
  const [channelStatus, setChannelStatus] = useState<ChannelStatus | null>(null);
  const [channelLoading, setChannelLoading] = useState(true);

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

  const refreshChannelStatus = async (uid: string) => {
    setChannelLoading(true);
    const { data } = await supabase
      .from('creator_profiles')
      .select('verified_youtube_channel_id, pending_youtube_channel_id, youtube_verification_code, youtube_channel_handle')
      .eq('user_id', uid)
      .maybeSingle();
    setChannelStatus({
      verifiedChannelId: data?.verified_youtube_channel_id ?? null,
      pendingChannelId: data?.pending_youtube_channel_id ?? null,
      pendingCode: data?.youtube_verification_code ?? null,
      channelHandle: data?.youtube_channel_handle ?? null,
    });
    setChannelLoading(false);
  };

  useEffect(() => {
    if (!userId) return;
    refreshChannelStatus(userId); // eslint-disable-line react-hooks/set-state-in-effect -- same pattern as ThemeToggle's mount-time state sync
  }, [userId]);

  async function authHeader() {
    const { data } = await supabase.auth.getSession();
    return { Authorization: `Bearer ${data.session?.access_token || ''}` };
  }

  const previewId = extractYoutubeId(youtubeLink);

  function goNextStep() {
    setError('');
    if (mobileStep === 1 && (!previewId || !title.trim())) {
      setError(!previewId ? "Add a valid YouTube link first." : 'Give the video a title.');
      return;
    }
    setMobileStep(s => Math.min(TOTAL_STEPS, s + 1));
  }
  function goPrevStep() {
    setError('');
    setMobileStep(s => Math.max(1, s - 1));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    // On mobile, Enter/submit from an earlier step should advance the
    // wizard, not submit the form — the browser will still fire a form
    // submit on Enter inside a text input regardless of which step is
    // visually shown.
    if (isMobileViewport && mobileStep < TOTAL_STEPS) { goNextStep(); return; }

    if (!userId) { setError('You need to be logged in to upload.'); return; }

    const youtubeId = extractYoutubeId(youtubeLink);
    if (!youtubeId) { setError("That doesn't look like a valid YouTube link or video ID."); return; }
    if (!title.trim()) { setError('Give the video a title.'); return; }

    setSubmitting(true);

    try {
      const res = await fetch('/api/katube/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({
          youtubeId, title: title.trim(), seriesId: seriesId || null,
          description: description.trim(),
          isShort, category, aiTool, autoPostToCircle,
        }),
      });
      const data = await res.json();
      setSubmitting(false);

      if (!res.ok) { setError(data.error || 'Something went wrong saving the video.'); return; }

      setSuccess(true);
      setTimeout(() => { router.push(`/katube/watch/${data.id}`); }, 900);
    } catch {
      setSubmitting(false);
      setError('Network error — try again.');
    }
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', overflowX: 'hidden' }}>

      {/* Same nav-overflow bug as /katube/watch — see that page's commit
          for details. Same .mangal-* + <style> fix. */}
      <style>{`
        @media (max-width: 480px) {
          .mangal-upload-nav { padding: 0 12px !important; gap: 6px; }
          .mangal-upload-brand-text { display: none; }
          .mangal-upload-back-text { display: none; }
          .mangal-upload-back { padding: 8px 10px !important; }
        }
      `}</style>

      {/* ── NAV ── */}
      <nav className="mangal-upload-nav" style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'var(--nav-bg)', backdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--border-color)',
        padding: '0 20px', height: '64px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: '8px',
      }}>
        <Link href="/katube" style={{ display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none', flexShrink: 0, minWidth: 0 }}>
          <Image src="/katube-logo.png" alt="KaTube" width={140} height={140} style={{ display: 'block', height: '44px', width: '44px', objectFit: 'contain' }} priority />
          <span className="mangal-upload-brand-text" style={{ fontWeight: 900, fontSize: '17px', color: '#2563eb', letterSpacing: '-0.02em' }}>Tube</span>
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <ThemeToggle size={30} />
          <Link href="/katube" className="mangal-upload-back" style={{
            padding: '8px 16px', borderRadius: '8px', fontSize: '12.5px', fontWeight: 700,
            color: 'var(--text-secondary)', textDecoration: 'none', border: '1px solid var(--border-color)', whiteSpace: 'nowrap',
            display: 'inline-flex', alignItems: 'center', gap: '6px',
          }}><ArrowLeft size={13} strokeWidth={2} /> <span className="mangal-upload-back-text">Back to KaTube</span></Link>
          <Link href="/" title="MANGAL" aria-label="Back to MANGAL" style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <MangalLogo size={26} />
          </Link>
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
            <Link href="/login?next=/katube/upload" style={{ color: '#f97316', fontWeight: 700 }}>Log in</Link>
          </div>
        ) : success ? (
          <div style={{
            padding: '20px', borderRadius: '12px', background: 'rgba(249,115,22,0.08)',
            border: '1px solid rgba(249,115,22,0.3)', fontSize: '13px', fontWeight: 700, color: '#f97316',
          }}>
            Uploaded! Taking you to the video…
          </div>
        ) : channelLoading ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px' }}>Checking your channel…</div>
        ) : !channelStatus?.verifiedChannelId ? (
          <div style={{
            padding: '20px', borderRadius: '12px', background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
          }}>
            <h2 style={{ fontSize: '15px', fontWeight: 800, marginBottom: '6px' }}>Verify your channel first — just once</h2>
            <p style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', marginBottom: '18px', lineHeight: 1.6 }}>
              Connect and verify your YouTube channel in your KaTube profile. It&apos;s a
              one-time step — after that, every upload here is checked automatically
              and you won&apos;t be asked again.
            </p>
            <Link href="/katube/dashboard" style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 18px', borderRadius: '10px',
              background: '#f97316', color: '#fff', fontSize: '13px', fontWeight: 700,
              textDecoration: 'none',
            }}>Go to my KaTube profile <ArrowRight size={13} strokeWidth={2} /></Link>
          </div>
        ) : (
          <>
          <div style={{
            padding: '10px 14px', borderRadius: '10px', marginBottom: '20px',
            background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.25)',
            fontSize: '12px', fontWeight: 700, color: '#f97316', display: 'flex', alignItems: 'center', gap: '6px',
          }}><CheckCircle2 size={14} /> Verified channel — every upload is still checked against it. <Link href="/katube/dashboard" style={{ color: '#f97316' }}>View KaTube profile</Link></div>

          {/* Step indicator — mobile only. YouTube Studio's mobile upload
              flow is step-by-step rather than one long scroll; desktop
              keeps the original flat form (isMobileViewport false ->
              this whole block renders nothing). */}
          {isMobileViewport && (
            <div style={{ marginBottom: '22px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-secondary)' }}>
                  Step {mobileStep} of {TOTAL_STEPS} — {mobileStep === 1 ? 'Video' : mobileStep === 2 ? 'Details' : 'Publish'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                  <div key={i} style={{
                    flex: 1, height: '4px', borderRadius: '999px',
                    background: i < mobileStep ? '#f97316' : 'var(--border-color)',
                    transition: 'background 0.2s',
                  }} />
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {(!isMobileViewport || mobileStep === 1) && (
            <>
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
            <p style={{ fontSize: '11.5px', color: 'var(--text-tertiary)', marginBottom: previewId ? '10px' : '20px', minHeight: '16px' }}>
              {youtubeLink && !previewId ? "Couldn't read a video from that link." : previewId ? `Video ID detected: ${previewId}` : ' '}
            </p>

            {/* Thumbnail preview — YouTube Studio-style confirmation that
                the right video was picked up, pulled straight from
                YouTube's own thumbnail CDN (no upload/storage on our side,
                matches the "we only store the link" copy above). */}
            {previewId && (
              <div style={{
                position: 'relative', width: '100%', maxWidth: '280px', aspectRatio: '16/9',
                borderRadius: '10px', overflow: 'hidden', marginBottom: '20px', background: '#000',
                border: '1px solid var(--border-color)',
              }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://img.youtube.com/vi/${previewId}/hqdefault.jpg`}
                  alt="Video thumbnail preview"
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
            )}

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

            {isMobileViewport && error && (
              <div style={{
                padding: '12px 14px', borderRadius: '10px', background: 'rgba(220,38,38,0.08)',
                border: '1px solid rgba(220,38,38,0.3)', color: '#dc2626', fontSize: '12.5px',
                marginBottom: '20px',
              }}>
                {error}
              </div>
            )}
            {isMobileViewport && (
              <button
                type="button"
                onClick={goNextStep}
                style={{
                  width: '100%', padding: '13px', borderRadius: '10px', border: 'none',
                  background: '#f97316', color: '#fff', fontSize: '14px', fontWeight: 800, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginBottom: '10px',
                }}
              >Next <ArrowRight size={15} /></button>
            )}
            </>
            )}

            {(!isMobileViewport || mobileStep === 2) && (
            <>
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
                    background: category === c ? 'linear-gradient(135deg, #f97316, #fb923c)' : 'var(--bg-card)',
                    color: category === c ? '#fff' : 'var(--text-secondary)',
                    border: category === c ? 'none' : '1px solid var(--border-color)',
                    cursor: 'pointer',
                  }}
                >{c}</span>
              ))}
            </div>

            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, marginBottom: '6px' }}>
              Made with which AI tool?
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
              {AI_TOOL_OPTIONS.map(t => (
                <span
                  key={t}
                  onClick={() => setAiTool(t)}
                  style={{
                    fontSize: '12px', fontWeight: 700, padding: '7px 16px', borderRadius: '20px',
                    background: aiTool === t ? 'linear-gradient(135deg, #f97316, #fb923c)' : 'var(--bg-card)',
                    color: aiTool === t ? '#fff' : 'var(--text-secondary)',
                    border: aiTool === t ? 'none' : '1px solid var(--border-color)',
                    cursor: 'pointer',
                  }}
                >{t}</span>
              ))}
            </div>

            {isMobileViewport && (
              <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                <button
                  type="button"
                  onClick={goPrevStep}
                  style={{
                    flex: '0 0 auto', padding: '13px 18px', borderRadius: '10px',
                    border: '1px solid var(--border-color)', background: 'transparent',
                    color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 700, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '6px',
                  }}
                ><ArrowLeft size={15} /> Back</button>
                <button
                  type="button"
                  onClick={goNextStep}
                  style={{
                    flex: 1, padding: '13px', borderRadius: '10px', border: 'none',
                    background: '#f97316', color: '#fff', fontSize: '14px', fontWeight: 800, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  }}
                >Next <ArrowRight size={15} /></button>
              </div>
            )}
            </>
            )}

            {(!isMobileViewport || mobileStep === 3) && (
            <>
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
                <span style={{ fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '5px' }}><Zap size={13} /> This is a Fast Tap video</span>
                <span style={{ color: 'var(--text-tertiary)' }}> — vertical/short-form, shows in the Fast Tap row instead of the main grid</span>
              </span>
            </label>

            <label style={{
              display: 'flex', alignItems: 'center', gap: '10px', marginBottom: showAutoPostConfirm ? '10px' : '20px',
              padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border-color)',
              background: 'var(--bg-card)', cursor: 'pointer',
            }}>
              <input
                type="checkbox"
                checked={autoPostToCircle}
                onChange={e => {
                  if (e.target.checked) setShowAutoPostConfirm(true);
                  else { setAutoPostToCircle(false); setShowAutoPostConfirm(false); }
                }}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '13px' }}>
                <span style={{ fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '5px' }}><Megaphone size={13} /> Auto-post to K Circle</span>
                <span style={{ color: 'var(--text-tertiary)' }}> — off by default, only for this video</span>
              </span>
            </label>

            {showAutoPostConfirm && (
              <div style={{
                padding: '12px 14px', borderRadius: '10px', marginBottom: '20px',
                background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.3)',
              }}>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 10px', lineHeight: 1.5 }}>
                  Post a short update about this video to your K Circle channel?
                </p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" onClick={() => setShowAutoPostConfirm(false)} style={{
                    padding: '7px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                    border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer',
                  }}>No</button>
                  <button type="button" onClick={() => { setAutoPostToCircle(true); setShowAutoPostConfirm(false); }} style={{
                    padding: '7px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                    border: 'none', background: '#7c3aed', color: '#fff', cursor: 'pointer',
                  }}>Yes, auto-post</button>
                </div>
              </div>
            )}

            {error && (
              <div style={{
                padding: '12px 14px', borderRadius: '10px', background: 'rgba(220,38,38,0.08)',
                border: '1px solid rgba(220,38,38,0.3)', color: '#dc2626', fontSize: '12.5px',
                marginBottom: '20px',
              }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px' }}>
              {isMobileViewport && (
                <button
                  type="button"
                  onClick={goPrevStep}
                  disabled={submitting}
                  style={{
                    flex: '0 0 auto', padding: '13px 18px', borderRadius: '10px',
                    border: '1px solid var(--border-color)', background: 'transparent',
                    color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 700,
                    cursor: submitting ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                  }}
                ><ArrowLeft size={15} /> Back</button>
              )}
              <button
                type="submit"
                disabled={submitting}
                style={{
                  flex: 1, padding: '13px', borderRadius: '10px', border: 'none',
                  background: submitting ? '#fdba8c' : '#f97316', color: '#fff',
                  fontSize: '14px', fontWeight: 800, cursor: submitting ? 'default' : 'pointer',
                }}
              >
                {submitting ? 'Uploading…' : 'Upload video'}
              </button>
            </div>
            </>
            )}
          </form>
          </>
        )}
      </div>
    </div>
  );
}
