'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
import { setPostLoginRedirect } from '../../../lib/auth/authRedirect';
import { Heart, MessageCircle, Share2, VolumeX, Volume2, ArrowLeft, Users, Home, Zap, Flame, PlusSquare, ExternalLink, X, Info, Play } from 'lucide-react';
import KatubeShareSheet from '../../components/KatubeShareSheet';

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
  description: string | null;
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
  const [userId, setUserId] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [watchTogetherOpen, setWatchTogetherOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const iframeRefs = useRef<Record<number, HTMLIFrameElement | null>>({});

  // Keep several upcoming YouTube players mounted. Crucially, their embed URL
  // never changes when they become active; changing it would discard the warm
  // player and make every swipe fetch the same short a second time.
  const [loadedIdx, setLoadedIdx] = useState<Set<number>>(new Set());
  const markLoaded = useCallback((idx: number) => {
    setLoadedIdx(prev => (prev.has(idx) ? prev : new Set(prev).add(idx)));
  }, []);

  // Preconnect to YouTube's embed + thumbnail hosts so the very first
  // connection (DNS + TLS handshake) for a short isn't paid for on the
  // critical path of the first/next iframe load — shaves a real chunk of
  // time off "time to first frame" especially on higher-latency mobile
  // networks, at zero cost on fast ones.
  useEffect(() => {
    const hosts = ['https://www.youtube.com', 'https://i.ytimg.com', 'https://img.youtube.com'];
    const added: HTMLLinkElement[] = [];
    hosts.forEach(href => {
      if (document.querySelector(`link[rel="preconnect"][href="${href}"]`)) return;
      const link = document.createElement('link');
      link.rel = 'preconnect';
      link.href = href;
      link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
      added.push(link);
    });
    return () => added.forEach(l => l.remove());
  }, []);

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
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    (async () => {
      const { data: rows } = await supabase
        .from('videos')
        .select('id, title, description, youtube_id, views, likes, creator_id')
        .eq('is_short', true)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!rows || rows.length === 0) { setLoading(false); return; }

      const creatorIds = [...new Set(rows.map(r => r.creator_id))];
      const { data: creators } = await supabase
        .from('creator_profiles').select('user_id, username').in('user_id', creatorIds);
      const creatorMap = new Map((creators || []).map(c => [c.user_id, c.username]));

      const list: Short[] = rows.map(r => ({
        id: r.id, title: r.title, description: r.description ?? null, youtube_id: r.youtube_id,
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

  // A warm iframe is driven through YouTube's player API instead of replacing
  // its src. That preserves the preloaded next clips during fast scrolling.
  useEffect(() => {
    const send = (frame: HTMLIFrameElement, func: string) => {
      frame.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args: [] }), 'https://www.youtube.com');
    };
    const syncPlayers = () => {
      Object.entries(iframeRefs.current).forEach(([index, frame]) => {
        if (!frame) return;
        if (Number(index) === activeIndex) {
          send(frame, muted ? 'mute' : 'unMute');
          send(frame, 'playVideo');
        } else {
          send(frame, 'pauseVideo');
        }
      });
    };
    const timers = [0, 250, 800, 1500].map(delay => setTimeout(syncPlayers, delay));
    return () => timers.forEach(clearTimeout);
  }, [activeIndex, muted, shorts.length]);

  return (
    <div style={{ height: '100vh', width: '100vw', background: '#000', position: 'relative', overflow: 'hidden' }}>
      {/* Heart-burst pop for double-tap-to-like, and safe-area insets so
          the back button / icon rail / caption never sit under a phone's
          notch, Dynamic Island, or home-indicator gesture bar — real
          devices, not just the browser chrome this was tested in before. */}
      <style>{`
        @keyframes katube-shorts-spin {
          to { transform: rotate(360deg); }
        }
        .katube-shorts-sidebar { display: none; }
        .katube-short-details {
          position: fixed; left: 16px; right: 16px; bottom: calc(16px + env(safe-area-inset-bottom)); z-index: 60;
          max-width: 520px; margin: 0 auto; padding: 18px; box-sizing: border-box;
          background: #18181d; border: 1px solid rgba(255,255,255,0.18); border-radius: 8px;
          box-shadow: 0 18px 48px rgba(0,0,0,0.45);
        }
        .katube-shorts-feed { overscroll-behavior-y: contain; touch-action: pan-y; }
        .katube-short-frame { width: min(100%, calc(100dvh * 9 / 16)); height: 100%; }
        .katube-short-caption { bottom: calc(76px + env(safe-area-inset-bottom)); right: 88px; }
        .katube-short-actions { bottom: calc(16px + env(safe-area-inset-bottom)); }
        .katube-youtube-title-shield { display: block; }
        @media (min-width: 900px) {
          .katube-shorts-sidebar {
            display: flex; position: fixed; inset: 0 auto 0 0; z-index: 40; width: 232px;
            flex-direction: column; padding: 22px 12px; box-sizing: border-box;
            background: #0b0b0f; border-right: 1px solid rgba(255,255,255,0.12);
          }
          .katube-shorts-feed { margin-left: 232px; width: calc(100% - 232px) !important; }
          .katube-shorts-back { left: 252px !important; }
          .katube-short-details { left: auto; right: 24px; bottom: 24px; width: 320px; margin: 0; }
          .katube-short-frame { max-width: 480px; }
        }
      `}</style>

      <aside className="katube-shorts-sidebar" aria-label="KaTube navigation">
        <Link href="/katube" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fff', textDecoration: 'none', padding: '0 12px 24px', fontSize: '18px', fontWeight: 900 }}>
          <Play size={20} fill="#f97316" color="#f97316" /> KaTube
        </Link>
        {[
          { href: '/katube', label: 'Home', icon: Home },
          { href: '/katube', label: 'Fast Tap', icon: Zap, active: true },
          { href: '/katube/trending', label: 'Trending', icon: Flame },
          { href: '/katube/subscriptions', label: 'Following', icon: Users },
        ].map(item => {
          const Icon = item.icon;
          return <Link key={item.label} href={item.href} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '11px 12px', borderRadius: '7px', color: item.active ? '#fff' : '#a1a1aa', background: item.active ? 'rgba(249,115,22,0.18)' : 'transparent', textDecoration: 'none', fontSize: '14px', fontWeight: item.active ? 800 : 600 }}><Icon size={19} color={item.active ? '#f97316' : 'currentColor'} />{item.label}</Link>;
        })}
        <Link href="/katube/upload" style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '11px', borderRadius: '7px', background: '#f97316', color: '#fff', textDecoration: 'none', fontSize: '13px', fontWeight: 800 }}><PlusSquare size={16} /> Upload</Link>
      </aside>

      <Link className="katube-shorts-back" href="/katube" style={{
        position: 'absolute', top: 'calc(16px + env(safe-area-inset-top))', left: 'calc(16px + env(safe-area-inset-left))', zIndex: 20,
        width: '38px', height: '38px', borderRadius: '50%', background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', textDecoration: 'none',
      }}><ArrowLeft size={16} strokeWidth={2} /></Link>

      {loading ? (
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.6)', fontSize: '13px' }}>
          Loading…
        </div>
      ) : shorts.length === 0 ? (
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px', padding: '20px', textAlign: 'center' }}>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px' }}>No Fast Tap videos yet.</p>
          <Link href="/katube" style={{ color: '#f97316', fontSize: '13px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}><ArrowLeft size={13} strokeWidth={2} /> Back to KaTube</Link>
        </div>
      ) : (
        <div
          ref={containerRef}
          className="katube-shorts-feed"
          style={{
            height: '100%', width: '100%', overflowY: 'auto',
            scrollSnapType: 'y mandatory', scrollBehavior: 'smooth',
          }}
        >
          {shorts.map((short, idx) => {
            // The active player and four forward players are kept warm, so a
            // fast multi-swipe still reaches an iframe that has begun loading.
            const distanceFromActive = idx - activeIndex;
            const isNear = distanceFromActive >= -1 && distanceFromActive <= 4;
            const isActive = idx === activeIndex;
            const isBuffering = isActive && !loadedIdx.has(idx);
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
                <div
                  className="katube-short-frame"
                  style={{ position: 'relative', aspectRatio: '9/16', margin: '0 auto' }}
                >
                  {isNear ? (
                    <>
                      {/* Thumbnail stays underneath the iframe until the
                          player actually reports loaded — covers the gap
                          between mount and first frame so it never reads
                          as a blank black screen while genuinely waiting
                          on a slow network. */}
                      {!loadedIdx.has(idx) && (
                        <img
                          src={`https://img.youtube.com/vi/${short.youtube_id}/hqdefault.jpg`}
                          alt={short.title}
                          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      )}
                      <iframe
                        ref={el => { iframeRefs.current[idx] = el; }}
                        src={`https://www.youtube.com/embed/${short.youtube_id}?rel=0&playsinline=1&controls=0&disablekb=1&fs=0&enablejsapi=1&autoplay=0&mute=1`}
                        title={short.title}
                        allow="accelerometer; autoplay; encrypted-media; gyroscope"
                        onLoad={() => markLoaded(idx)}
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
                      />
                      {/* On phones, YouTube renders a title/channel strip at
                          the top of an embed. It can open youtube.com, so it
                          is intentionally covered; KaTube's own title below
                          remains the only title interaction. */}
                      <div className="katube-youtube-title-shield" aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '136px', zIndex: 4, background: '#000' }} />
                    </>
                  ) : (
                    <img
                      src={`https://img.youtube.com/vi/${short.youtube_id}/hqdefault.jpg`}
                      alt={short.title}
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  )}

                  {/* Real network-tied buffering indicator — only shows for
                      the active short while it's genuinely still loading.
                      Never an artificial/timed delay: it's driven purely by
                      whether this iframe has actually fired its load event. */}
                  {isBuffering && (
                    <div style={{
                      position: 'absolute', top: '50%', left: '50%', zIndex: 4,
                      transform: 'translate(-50%, -50%)', pointerEvents: 'none',
                    }}>
                      <div style={{
                        width: '34px', height: '34px', borderRadius: '50%',
                        border: '3px solid rgba(255,255,255,0.25)',
                        borderTopColor: '#fff',
                        animation: 'katube-shorts-spin 0.8s linear infinite',
                      }} />
                    </div>
                  )}

                  {/* KaTube-owned metadata. The iframe above keeps YouTube's
                      own player controls and branding available for playback. */}
                  <div className="katube-short-caption" style={{
                    position: 'absolute', left: 0,
                    padding: '16px 16px 12px',
                    background: 'linear-gradient(to top, rgba(0,0,0,0.75), transparent)', zIndex: 5,
                  }}>
                    <div style={{ color: '#fff', fontWeight: 800, fontSize: '13.5px', marginBottom: '4px' }}>@{short.creator}</div>
                    <button onClick={() => { setActiveIndex(idx); setDetailsOpen(true); }} style={{ padding: 0, border: 0, background: 'transparent', color: '#fff', cursor: 'pointer', textAlign: 'left', fontSize: '12.5px', fontWeight: 700, lineHeight: 1.4 }}>
                      {short.title} <Info size={13} style={{ verticalAlign: 'text-bottom' }} />
                    </button>
                  </div>

                  {/* Right-edge overlay icons */}
                  <div className="katube-short-actions" style={{
                    position: 'absolute', right: 'calc(10px + env(safe-area-inset-right))', zIndex: 5,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px',
                  }}>
                    <button
                      onClick={() => showToast('Like isn\u2019t built yet')}
                      style={{ background: 'none', border: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', padding: '6px' }}
                    >
                      <Heart size={26} color="#fff" fill="#ef4444" stroke="#ef4444" />
                      <span style={{ color: '#fff', fontSize: '11px', fontWeight: 700 }}>{short.likes.toLocaleString()}</span>
                    </button>
                    <button
                      onClick={() => showToast('Comments aren\u2019t built yet')}
                      style={{ background: 'none', border: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', padding: '6px' }}
                    >
                      <MessageCircle size={24} color="#fff" />
                      <span style={{ color: '#fff', fontSize: '11px', fontWeight: 700 }}>Comment</span>
                    </button>
                    <button
                      onClick={() => {
                        if (!userId) { setPostLoginRedirect(window.location.pathname); window.location.href = '/login?next=' + encodeURIComponent(window.location.pathname); return; }
                        setActiveIndex(idx);
                        setShareOpen(true);
                      }}
                      style={{ background: 'none', border: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', padding: '6px' }}
                    >
                      <Share2 size={24} color="#fff" />
                      <span style={{ color: '#fff', fontSize: '11px', fontWeight: 700 }}>Share</span>
                    </button>
                    <button
                      onClick={() => {
                        if (!userId) { setPostLoginRedirect(window.location.pathname); window.location.href = '/login?next=' + encodeURIComponent(window.location.pathname); return; }
                        setActiveIndex(idx);
                        setWatchTogetherOpen(true);
                      }}
                      style={{ background: 'none', border: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', padding: '6px' }}
                    >
                      <Users size={24} color="#fff" />
                      <span style={{ color: '#fff', fontSize: '11px', fontWeight: 700 }}>Together</span>
                    </button>
                    {isActive && (
                      <button
                        onClick={toggleMuted}
                        aria-label={muted ? 'Unmute' : 'Mute'}
                        title={muted ? 'Unmute' : 'Mute'}
                        style={{ background: 'none', border: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', padding: '6px' }}
                      >
                        {muted ? <VolumeX size={24} color="#fff" /> : <Volume2 size={24} color="#fff" />}
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

      {detailsOpen && shorts[activeIndex] && (
        <section className="katube-short-details" aria-label="Fast Tap details">
          <button onClick={() => setDetailsOpen(false)} aria-label="Close details" title="Close details" style={{ position: 'absolute', top: '12px', right: '12px', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 0, color: '#fff', cursor: 'pointer' }}><X size={18} /></button>
          <div style={{ color: '#f97316', fontSize: '11px', fontWeight: 800, marginBottom: '7px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>KaTube Fast Tap</div>
          <h1 style={{ margin: '0 34px 10px 0', color: '#fff', fontSize: '17px', lineHeight: 1.35 }}>{shorts[activeIndex].title}</h1>
          <p style={{ margin: '0 0 16px', color: '#d4d4d8', fontSize: '13px', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{shorts[activeIndex].description || 'No description from this creator yet.'}</p>
          <a href={`https://www.youtube.com/watch?v=${shorts[activeIndex].youtube_id}`} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#fff', background: '#ef4444', borderRadius: '6px', padding: '9px 12px', textDecoration: 'none', fontSize: '12px', fontWeight: 800 }}>
            Watch on YouTube <ExternalLink size={14} />
          </a>
        </section>
      )}

      {shorts[activeIndex] && (
        <>
          <KatubeShareSheet
            open={shareOpen}
            onClose={() => setShareOpen(false)}
            video={{ id: shorts[activeIndex].id, title: shorts[activeIndex].title, isShort: true }}
            url={typeof window !== 'undefined' ? `${window.location.origin}/katube/shorts/${shorts[activeIndex].id}` : ''}
            dark
          />
          <KatubeShareSheet
            open={watchTogetherOpen}
            onClose={() => setWatchTogetherOpen(false)}
            video={{ id: shorts[activeIndex].id, title: shorts[activeIndex].title, isShort: true }}
            url={typeof window !== 'undefined' ? `${window.location.origin}/katube/shorts/${shorts[activeIndex].id}` : ''}
            dark
            initialView="wt-visibility"
          />
        </>
      )}

      {toast && (
        <div style={{
          position: 'absolute', bottom: 'calc(90px + env(safe-area-inset-bottom))', left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.85)', color: '#fff', fontSize: '12.5px', fontWeight: 600,
          padding: '9px 16px', borderRadius: '20px', zIndex: 30, whiteSpace: 'nowrap',
        }}>{toast}</div>
      )}
    </div>
  );
}
