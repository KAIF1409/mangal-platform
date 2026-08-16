'use client';

import { useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';

// §28a — Continue Watching + Autoplay Next, both built on the YouTube
// IFrame Player API (not the plain <iframe> the watch page used before).
// Per §28c's YouTube API Services policy note: this shares playback data
// with YouTube on page load rather than only on user interaction, which is
// why the autoplay disclosure line was added to /privacy alongside this
// component (see that page's diff in the same commit).

// Typed narrowly and accessed via casts rather than a `declare global`
// augmentation, since app/katube/watch/[videoId]/room/[roomId]/page.tsx
// already declares a (non-optional, differently-shaped) global `Window.YT`
// for Watch Together rooms — redeclaring it here would conflict. Both
// components load the same real `window.YT` at runtime; this file just
// doesn't assume its exact shape ahead of time.
interface YTPlayerAPI {
  Player: new (elementId: string, opts: Record<string, unknown>) => YTPlayerInstance;
  PlayerState: { ENDED: number; PLAYING: number };
}

interface YTPlayerInstance {
  getCurrentTime: () => number;
  getDuration: () => number;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  destroy: () => void;
}

// Cast helper instead of augmenting the global Window type (see note
// above) — reads/writes the same runtime globals the YouTube script sets,
// just without declaring a conflicting TS type for them.
function getWin(): { YT?: YTPlayerAPI; onYouTubeIframeAPIReady?: () => void } {
  return window as unknown as { YT?: YTPlayerAPI; onYouTubeIframeAPIReady?: () => void };
}

let apiLoadPromise: Promise<void> | null = null;
function loadYouTubeIframeApi(): Promise<void> {
  if (apiLoadPromise) return apiLoadPromise;
  apiLoadPromise = new Promise((resolve) => {
    const win = getWin();
    if (win.YT?.Player) { resolve(); return; }
    const prevReady = win.onYouTubeIframeAPIReady;
    win.onYouTubeIframeAPIReady = () => { prevReady?.(); resolve(); };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  });
  return apiLoadPromise;
}

export default function KaTubePlayer({
  videoId,
  youtubeId,
  isShort,
  userId,
  resumeSeconds,
  onEnded,
}: {
  videoId: string;
  youtubeId: string;
  isShort: boolean;
  userId: string | null;
  resumeSeconds?: number;
  onEnded?: () => void;
}) {
  const containerId = `katube-player-${videoId}`;
  const playerRef = useRef<YTPlayerInstance | null>(null);
  const saveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  useEffect(() => {
    let cancelled = false;

    loadYouTubeIframeApi().then(() => {
      const win = getWin();
      if (cancelled || !win.YT) return;
      const player = new win.YT.Player(containerId, {
        videoId: youtubeId,
        playerVars: { rel: 0, enablejsapi: 1 },
        events: {
          onReady: () => {
            if (resumeSeconds && resumeSeconds > 5) {
              player.seekTo(resumeSeconds, true);
            }
          },
          onStateChange: (e: { data: number }) => {
            const w = getWin();
            if (!w.YT) return;
            if (e.data === w.YT.PlayerState.ENDED) {
              onEndedRef.current?.();
            }
          },
        },
      });
      playerRef.current = player;
    });

    // Continue Watching — save playback position every 8s while this page
    // is open. A periodic save (rather than only on unmount) survives a
    // hard tab close/navigation-away that would otherwise lose the last
    // few seconds of progress.
    if (userId) {
      saveIntervalRef.current = setInterval(async () => {
        const player = playerRef.current;
        if (!player) return;
        try {
          const position = Math.floor(player.getCurrentTime());
          const duration = Math.floor(player.getDuration());
          if (!position || position < 3) return;
          await supabase.from('katube_watch_progress').upsert({
            viewer_id: userId,
            video_id: videoId,
            position_seconds: position,
            duration_seconds: duration || null,
            updated_at: new Date().toISOString(),
          });
        } catch {
          // best-effort — a missed progress save is never worth surfacing
        }
      }, 8000);
    }

    return () => {
      cancelled = true;
      if (saveIntervalRef.current) clearInterval(saveIntervalRef.current);
      playerRef.current?.destroy?.();
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, youtubeId]);

  return (
    <div
      style={{
        position: 'relative', width: '100%', aspectRatio: isShort ? '9/16' : '16/9',
        maxWidth: isShort ? '420px' : 'none', margin: isShort ? '0 auto' : '0',
        borderRadius: '14px', overflow: 'hidden', background: '#000',
        boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
      }}
    >
      <div id={containerId} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
    </div>
  );
}
