'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';

// ── KaTube §7 — Fast Tap full-screen Shorts/Reels feed ──
// Full-screen vertical snap-scroll feed for is_short=true videos, replacing
// the old "click a Fast Tap card -> normal watch page" behavior. Matches
// YouTube Shorts / Instagram Reels: one short fills the viewport, scroll/
// swipe moves to next/previous, only the active short autoplays, overlay
// icons (like/comment/share) on the right, creator+caption bottom-left.
//
// Windowing: only the active short ± 1 get a mounted iframe (autoplay via
// YouTube's ?autoplay=1 URL param); everything else shows just the thumbnail
// so the DOM/network stays light as the shorts table grows.
//
// Not addressed yet (per CONTEXT.md §7): comment/subscribe backend isn't
// built, so those buttons fall back to a lightweight "not built yet" toast
// instead of blocking this feature.

interface Short {
  id: string;
  title: string;
  youtube_id: string;
  views: number;
  likes: number;
  creator: string;
}

// Sound preference key — shared across every KaTube Shorts session so once
// someone unmutes, later shorts (and later visits) keep playing with sound,
// the same way YouTube Shorts remembers your audio choice instead of
// re-muting every single clip.
const MUTE_PREF_KEY = 'katube-shorts-muted';

export default function KaTubeShortsFeedPage() {
  const params = useParams();
  const initialShortId = params?.shortId as string;

  const [shorts, setShorts] = useState<Short[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const iframeRefs = useRef<Record<number, HTMLIFrameElement | null>>({});

  // Default is UNMUTED (sound on), matching the founder's ask — only falls
  // back to muted if the person explicitly muted on a previous short/visit.
  const [muted, setMuted] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(MUTE_PREF_KEY) === 'true';
  });

  const toggleMuted = useCallback(() => {
    setMuted(prev => {
      const next = !prev;
      window.localStorage.setItem(MUTE_PREF_KEY, String(next));
      return next;
    });
  }, []);

  useEffect(() => {
    (async () => {
      const { data: rows } = await supabase
        .from('videos')
        .select('id, title, youtube_id, views, likes, creator_id')
        .eq('is_short', true)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!rows || rows.length === 0) { setLoading(false); return; }

      const creatorIds = [...new Set(rows.map(r => r.creator_id))];
      const { data: creators } = await supabase
        .from('creator_profiles').select('user_id, username').in('user_id', creatorIds);
      const creatorMap = new Map((creators || []).map(c => [c.user_id, c.username]));

      const list: Short[] = rows.map(r => ({
        id: r.id, title: r.title, youtube_id: r.youtube_id,
        views: r.views, likes: r.likes,
        creator: creatorMap.get(r.creator_id) || 'MANGAL Creator',
      }));
      setShorts(list);

      const startIdx = Math.max(0, list.findIndex(s => s.id === initialShortId));
      setActiveIndex(startIdx);
      setLoading(false);
    })();
  }, [initialShortId]);

  // Scroll to the requested starting short once the feed is mounted.
  useEffect(() => {
    if (loading || shorts.length === 0) return;
    sectionRefs.current[activeIndex]?.scrollIntoView({ behavior: 'auto' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // Track which short is in view; only that one autoplays.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || shorts.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
            const idx = Number((entry.target as HTMLElement).dataset.index);
            setActiveIndex(idx);
          }
        });
      },
      { root: container, threshold: 0.5 }
    );

    sectionRefs.current.forEach(el => el && observer.observe(el));
    return () => observer.disconnect();
  }, [shorts]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  }, []);

  // Sync audio on the active short: browsers only reliably allow autoplay
  // when it starts muted, so the iframe always loads with mute=1 in its src
  // (never remounted/restarted on toggle) — the real on/off happens here via
  // the YouTube Player postMessage API. Resent a few times shortly after a
  // short becomes active since the embedded player needs a moment to finish
  // loading before it'll accept commands.
  useEffect(() => {
    const frame = iframeRefs.current[activeIndex];
    if (!frame) return;
    const send = () => {
      frame.contentWindow?.postMessage(
        JSON.stringify({ event: 'command', func: muted ? 'mute' : 'unMute', args: [] }),
        '*'
      );
    };
    const timers = [0, 300, 800, 1500].map(delay => setTimeout(send, delay));
    return () => timers.forEach(clearTimeout);
  }, [activeIndex, muted, shorts.length]);

  return (
    <div style={{ height: '100vh', width: '100vw', background: '#000', position: 'relative', overflow: 'hidden' }}>
      <Link href="/katube" style={{
        position: 'absolute', top: '16px', left: '16px', zIndex: 20,
        width: '38px', height: '38px', borderRadius: '50%', background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontSize: '16px', textDecoration: 'none',
      }}>←</Link>

      {loading ? (
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.6)', fontSize: '13px' }}>
          Loading…
        </div>
      ) : shorts.length === 0 ? (
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px', padding: '20px', textAlign: 'center' }}>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px' }}>No Fast Tap shorts yet.</p>
          <Link href="/katube" style={{ color: '#f97316', fontSize: '13px', fontWeight: 700 }}>← Back to KaTube</Link>
        </div>
      ) : (
        <div
          ref={containerRef}
          style={{
            height: '100%', width: '100%', overflowY: 'scroll',
            scrollSnapType: 'y mandatory', scrollBehavior: 'smooth',
          }}
        >
          {shorts.map((short, idx) => {
            // Windowing: only mount the iframe for active ± 1
            const isNear = Math.abs(idx - activeIndex) <= 1;
            const isActive = idx === activeIndex;
            return (
              <div
                key={short.id}
                ref={el => { sectionRefs.current[idx] = el; }}
                data-index={idx}
                style={{
                  height: '100%', width: '100%', scrollSnapAlign: 'start',
                  position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: '#000',
                }}
              >
                <div style={{ position: 'relative', height: '100%', maxWidth: '480px', width: '100%', aspectRatio: '9/16', margin: '0 auto' }}>
                  {isNear ? (
                    <iframe
                      ref={el => { iframeRefs.current[idx] = el; }}
                      src={`https://www.youtube.com/embed/${short.youtube_id}?rel=0&playsinline=1&controls=0&enablejsapi=1${isActive ? '&autoplay=1&mute=1' : ''}`}
                      title={short.title}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
                    />
                  ) : (
                    <img
                      src={`https://img.youtube.com/vi/${short.youtube_id}/hqdefault.jpg`}
                      alt={short.title}
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  )}

                  {/* Bottom-left creator + caption */}
                  <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: '70px', padding: '16px 60px 20px 16px',
                    background: 'linear-gradient(to top, rgba(0,0,0,0.75), transparent)', zIndex: 5,
                  }}>
                    <div style={{ color: '#fff', fontWeight: 800, fontSize: '13.5px', marginBottom: '4px' }}>@{short.creator}</div>
                    <div style={{
                      color: 'rgba(255,255,255,0.9)', fontSize: '12.5px', lineHeight: 1.4,
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                    }}>{short.title}</div>
                  </div>

                  {/* Right-edge overlay icons */}
                  <div style={{
                    position: 'absolute', bottom: '20px', right: '10px', zIndex: 5,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '18px',
                  }}>
                    <button
                      onClick={() => showToast('Like isn\u2019t built yet')}
                      style={{ background: 'none', border: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}
                    >
                      <span style={{ fontSize: '26px' }}>❤️</span>
                      <span style={{ color: '#fff', fontSize: '11px', fontWeight: 700 }}>{short.likes.toLocaleString()}</span>
                    </button>
                    <button
                      onClick={() => showToast('Comments aren\u2019t built yet')}
                      style={{ background: 'none', border: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}
                    >
                      <span style={{ fontSize: '24px' }}>💬</span>
                      <span style={{ color: '#fff', fontSize: '11px', fontWeight: 700 }}>Comment</span>
                    </button>
                    <button
                      onClick={() => showToast('Share isn\u2019t built yet')}
                      style={{ background: 'none', border: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}
                    >
                      <span style={{ fontSize: '24px' }}>↗️</span>
                      <span style={{ color: '#fff', fontSize: '11px', fontWeight: 700 }}>Share</span>
                    </button>
                    {isActive && (
                      <button
                        onClick={toggleMuted}
                        aria-label={muted ? 'Unmute' : 'Mute'}
                        title={muted ? 'Unmute' : 'Mute'}
                        style={{ background: 'none', border: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}
                      >
                        <span style={{ fontSize: '24px' }}>{muted ? '🔇' : '🔊'}</span>
                        <span style={{ color: '#fff', fontSize: '11px', fontWeight: 700 }}>{muted ? 'Muted' : 'Sound'}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {toast && (
        <div style={{
          position: 'absolute', bottom: '90px', left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.85)', color: '#fff', fontSize: '12.5px', fontWeight: 600,
          padding: '9px 16px', borderRadius: '20px', zIndex: 30, whiteSpace: 'nowrap',
        }}>{toast}</div>
      )}
    </div>
  );
}
