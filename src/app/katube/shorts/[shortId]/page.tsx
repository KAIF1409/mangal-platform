'use client';

import { useState, useEffect, useRef, useCallback, type PointerEvent } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
import { setPostLoginRedirect } from '../../../lib/auth/authRedirect';
import { Heart, MessageCircle, Share2, VolumeX, Volume2, ArrowLeft, Users, Home, Zap, Flame, PlusSquare, ExternalLink, X, Info, Play, Search, MoreVertical, UserCircle } from 'lucide-react';
import KatubeShareSheet from '../../components/KatubeShareSheet';
import { rankShorts, markShortSeen } from '../../lib/shortsRanking';

// Which shorts stay mounted around the active one — the active short plus
// one short back and four forward, so fast multi-swipes still land on an
// iframe that's already begun loading. Shared as constants (rather than
// duplicated magic numbers in the render window check and the player
// cleanup effect below) so the two can never silently drift apart.
const NEAR_WINDOW_BACK = -1;
const NEAR_WINDOW_FORWARD = 4;
function isNearIndex(idx: number, activeIdx: number): boolean {
  const distance = idx - activeIdx;
  return distance >= NEAR_WINDOW_BACK && distance <= NEAR_WINDOW_FORWARD;
}

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
  creator_id: string;
  description: string | null;
  duration_seconds: number | null;
  created_at: string;
}

// Sound preference key — shared across every KaTube Shorts session so once
// someone unmutes, later shorts (and later visits) keep playing with sound,
// the same way YouTube Shorts remembers your audio choice instead of
// re-muting every single clip.
const MUTE_PREF_KEY = 'katube-shorts-muted';

interface YouTubePlayer {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setPlaybackRate: (rate: number) => void;
  mute: () => void;
  unMute: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  getIframe: () => HTMLIFrameElement;
  destroy: () => void;
}

interface YouTubeApi {
  Player: new (element: HTMLElement | string, options: Record<string, unknown>) => YouTubePlayer;
  PlayerState: { PLAYING: number; PAUSED: number };
}

function getYouTubeWindow(): { YT?: YouTubeApi; onYouTubeIframeAPIReady?: () => void } {
  return window as unknown as { YT?: YouTubeApi; onYouTubeIframeAPIReady?: () => void };
}

let youtubeApiPromise: Promise<void> | null = null;
function loadYouTubeApi(): Promise<void> {
  if (youtubeApiPromise) return youtubeApiPromise;
  youtubeApiPromise = new Promise(resolve => {
    const win = getYouTubeWindow();
    if (win.YT?.Player) { resolve(); return; }
    const previousReady = win.onYouTubeIframeAPIReady;
    win.onYouTubeIframeAPIReady = () => { previousReady?.(); resolve(); };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(script);
  });
  return youtubeApiPromise;
}

export default function KaTubeShortsFeedPage() {
  const params = useParams();
  const initialShortId = params?.shortId as string;

  const [shorts, setShorts] = useState<Short[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [followedCreatorIds, setFollowedCreatorIds] = useState<Set<string>>(new Set());
  const [joinBusyId, setJoinBusyId] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [watchTogetherOpen, setWatchTogetherOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [isFastForwarding, setIsFastForwarding] = useState(false);
  // Bug fix (§105): this defaulted to `true`, which is optimistic — it
  // assumes a short is already playing the instant it becomes active,
  // before YouTube has confirmed anything. Our own pause-cover overlay
  // (§101/§104) is keyed off `!isPlaying`, so with an optimistic `true`
  // default it never activated during the real startup window (iframe
  // loaded, but onReady/playVideo/onStateChange(PLAYING) hadn't actually
  // fired yet) — leaving YouTube's native "cued/idle" chrome (title,
  // channel, native controls, logo) fully exposed for however long that
  // took, which is exactly what kept showing up in screenshots. `false`
  // means the cover is up by default and only drops once onStateChange
  // actually confirms PLAYING.
  const [isPlaying, setIsPlaying] = useState(false);
  // Bug fix (§98): this used to gate whether the seek bar or a static
  // title <div> was rendered (see the always-mounted range input
  // below) — kept as a setter-only flag since other effects still key
  // off "was there a recent interaction" for unrelated bookkeeping
  // (e.g. suppressing the controls-timer during an active drag), but
  // nothing reads the boolean itself for rendering anymore.
  const [, setShowPlaybackControls] = useState(true);
  const [playback, setPlayback] = useState({ currentTime: 0, duration: 0 });
  // Bug fix (§100): which shorts' iframes are actually mounted in the DOM.
  // Previously the render computed this straight from `isNearIndex(idx,
  // activeIndex)` on every render, which meant React could unmount a
  // short's <iframe> in the very same commit that activeIndex changed —
  // before the cleanup effect below had run at all, let alone called
  // player.destroy() on it. YouTube's IFrame API wrapper keeps its own
  // internal setInterval-based polling alive independent of our code, and
  // when that timer next ticks against a player whose iframe disappeared
  // out from under it (torn down by React directly, not via the wrapper's
  // own destroy() sequence), it throws "e.getCurrentTime is not a
  // function" from inside YouTube's own minified script — harmless to
  // playback, but a real uncaught error, and not something a try/catch of
  // ours around any command *we* send can catch (that's a different code
  // path — see sendPlayerCommand's own fix in §96). Routing mounting
  // through this state lets the cleanup effect call destroy() first and
  // only unmount the DOM node on the render after, closing that gap.
  const [mountedIndices, setMountedIndices] = useState<Set<number>>(() => new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const iframeRefs = useRef<Record<number, HTMLIFrameElement | null>>({});
  const playerRefs = useRef<Record<number, YouTubePlayer | null>>({});
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdPointerRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const pressMovedRef = useRef(false);
  const fastForwardingRef = useRef(false);
  const lastActiveIndexRef = useRef<number | null>(null);
  const activeIndexRef = useRef(0);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSeekingRef = useRef(false);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  const clearControlsTimer = useCallback(() => {
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = null;
  }, []);

  // Keep the controls on screen while the viewer is interacting, then replace
  // them with KaTube's saved title after three seconds of uninterrupted play.
  const revealPlaybackControls = useCallback(() => {
    clearControlsTimer();
    setShowPlaybackControls(true);
    if (!isPlaying || isSeekingRef.current) return;
    controlsTimerRef.current = setTimeout(() => setShowPlaybackControls(false), 3000);
  }, [clearControlsTimer, isPlaying]);

  const sendPlayerCommand = useCallback((index: number, func: string, args: unknown[] = []) => {
    const player = playerRefs.current[index];
    if (player) {
      // Bug fix: a player whose iframe has scrolled out of the mounted
      // window (see isNearIndex/cleanup effect below) used to linger in
      // playerRefs indefinitely and still get commands sent to it every
      // time syncPlayers ran. Calling a method on a YT.Player instance
      // whose iframe has already been removed from the DOM can throw
      // (it postMessages into a contentWindow that no longer exists) —
      // an uncaught throw here used to abort the rest of that
      // Object.keys(...).forEach(...) pass in syncPlayers, silently
      // dropping the play/pause/mute command meant for a still-live
      // neighbor. Wrapping in try/catch keeps one stale player from
      // breaking playback control for every other one.
      try {
        if (func === 'playVideo') player.playVideo();
        if (func === 'pauseVideo') player.pauseVideo();
        if (func === 'seekTo') player.seekTo(Number(args[0]) || 0, Boolean(args[1]));
        if (func === 'setPlaybackRate') player.setPlaybackRate(Number(args[0]) || 1);
        if (func === 'mute') player.mute();
        if (func === 'unMute') player.unMute();
      } catch {
        // Player's iframe is gone (see cleanup effect) — drop the stale
        // reference so future syncPlayers passes don't try it again.
        delete playerRefs.current[index];
      }
      return;
    }

    // The API normally reaches ready state first. Retaining this fallback
    // keeps clicks and drags functional even while that API is loading.
    // Bug fix (§102): this used to fire unconditionally the moment there
    // was no `player` yet, including in the brief window right after an
    // iframe mounts but before it has actually navigated to a
    // youtube.com document. A cross-frame postMessage() with an explicit
    // targetOrigin only succeeds once the recipient window's real origin
    // matches that origin — while the iframe is still on its initial
    // blank document, it doesn't, so every one of these came back as a
    // browser-logged "target origin ... does not match the recipient
    // window's origin" warning. Gating on loadedIdxRef (mirroring
    // loadedIdx, set by the iframe's own onLoad) means we only attempt
    // this fallback once the iframe has actually loaded something —
    // before that, there's nothing productive to send anyway, so
    // dropping the command silently is strictly better than sending one
    // guaranteed to be rejected.
    if (!loadedIdxRef.current.has(index)) return;
    iframeRefs.current[index]?.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func, args }),
      'https://www.youtube.com'
    );
  }, []);

  // Keep several upcoming YouTube players mounted. Crucially, their embed URL
  // never changes when they become active; changing it would discard the warm
  // player and make every swipe fetch the same short a second time.
  const [loadedIdx, setLoadedIdx] = useState<Set<number>>(new Set());
  // Bug fix (§102): ref mirror of loadedIdx so sendPlayerCommand (memoized
  // with a stable, empty dependency array — it's called from hot paths
  // like drag handlers and shouldn't be recreated every time a short
  // finishes loading) can read the current loaded set without needing to
  // close over the state value directly.
  const loadedIdxRef = useRef<Set<number>>(new Set());
  const markLoaded = useCallback((idx: number) => {
    setLoadedIdx(prev => {
      if (prev.has(idx)) return prev;
      const next = new Set(prev).add(idx);
      loadedIdxRef.current = next;
      return next;
    });
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

  // Bug fix (§105): browsers don't just silently mute an autoplay request
  // that asks to start unmuted without a prior user gesture on the page —
  // they refuse the whole play() call outright, leaving the player stuck
  // on YouTube's native "cued" chrome (title/channel/native controls/
  // logo, all still fully visible since nothing ever reached a real
  // PLAYING state for our own pause-cover to key off) until something
  // gives the browser a genuine gesture — which was exactly what tapping
  // the (leaking) native play button did. Combined with the default sound
  // preference being unmuted, this meant a fresh visit (no Media
  // Engagement history — especially true in Incognito, no history at
  // all) would silently fail to autoplay at all, every time.
  // hasGesturedRef flips true on the first real pointerdown anywhere on
  // this page; until then, playback always starts muted regardless of
  // the sound preference (which browsers do allow without a gesture), so
  // shorts actually autoplay. Once a gesture has happened, the very next
  // sync pass unmutes the active player if the preference calls for it.
  const hasGesturedRef = useRef(false);
  const mutedRef = useRef(muted);
  useEffect(() => { mutedRef.current = muted; }, [muted]);
  useEffect(() => {
    const markGestured = () => {
      if (hasGesturedRef.current) return;
      hasGesturedRef.current = true;
      // Bug fix (§105): the syncPlayers retry loop below only re-runs on
      // an activeIndex/muted state change, neither of which happens just
      // because a gesture occurred — so without this, a short that was
      // already playing muted (because it autoplayed before any gesture)
      // would stay muted indefinitely even with the sound preference on,
      // until the person happened to change short or hit the mute
      // button themselves. Unmute the currently active player right here
      // instead, the moment we know a real gesture has actually happened.
      if (!mutedRef.current) sendPlayerCommand(activeIndexRef.current, 'unMute');
    };
    window.addEventListener('pointerdown', markGestured, { once: true, capture: true });
    return () => window.removeEventListener('pointerdown', markGestured, true);
  }, [sendPlayerCommand]);

  // The previous slider only changed React state: no YT.Player instance was
  // ever created, so its seek command had nowhere to go. Instantiate the
  // official IFrame Player API for each nearby short and retain the API object
  // for real-time reads and seek calls.
  useEffect(() => {
    if (shorts.length === 0) return;
    let cancelled = false;

    loadYouTubeApi().then(() => {
      if (cancelled) return;
      const api = getYouTubeWindow().YT;
      if (!api) return;

      Object.entries(iframeRefs.current).forEach(([key, element]) => {
        const index = Number(key);
        const short = shorts[index];
        if (!element || !short) return;

        const existing = playerRefs.current[index];
        if (existing && document.contains(existing.getIframe())) return;
        existing?.destroy();

        // Bug fix (§108): this whole effect re-runs on every activeIndex/
        // mountedIndices/muted change (i.e. on basically every scroll),
        // each run getting its own fresh `cancelled` closure. A short
        // already playing hits the `document.contains(...)` check above
        // and is correctly skipped — its YT.Player and event callbacks
        // were built in an *earlier* run. But `onReady`/`onStateChange`
        // below used to check that same-run `cancelled` on every single
        // call, for as long as the player lived — and this effect's own
        // cleanup (bottom of the function) sets that earlier run's
        // `cancelled` to true the moment the effect re-runs, which
        // (thanks to scrolling) is almost immediately. From then on
        // `onStateChange` silently returned on every PLAYING event, so
        // `isPlaying` never flipped true again: our opaque pause-cover
        // (isActive && !isPlaying, a few hundred lines down) stayed up
        // forever with its Play icon showing, even though the underlying
        // player kept genuinely playing — audio audible, picture black.
        // `cancelled` is only meaningful right here, guarding against
        // constructing a *new* player after this run's cleanup already
        // fired; it must not gate the long-lived callbacks of a player
        // that's already alive and still correctly mounted.
        if (cancelled) return;

        // Pass the iframe that is already on screen to YT.Player. This keeps
        // the embed stable in React's DOM while exposing the real seek/time
        // API; replacing a React-owned host <div> left the previous player
        // instance disconnected, which is why the range stayed static.
        playerRefs.current[index] = new api.Player(element.id, {
          events: {
            onReady: (event: { target: YouTubePlayer }) => {
              playerRefs.current[index] = event.target;
              markLoaded(index);
              if (index === activeIndexRef.current) {
                // Bug fix (§105): always start muted here, regardless of
                // the sound preference — see hasGesturedRef above for why.
                // If the preference is unmuted and a gesture has already
                // happened by the time this fires, unmute immediately;
                // otherwise syncPlayers picks it up right after the first
                // gesture.
                if (muted || !hasGesturedRef.current) event.target.mute(); else event.target.unMute();
                event.target.playVideo();
                // Bug fix: playback.duration used to stay 0 until the
                // 250ms polling interval (further below) happened to
                // tick — and until then, both seekTo()'s early-return
                // guard and the range input's `max` fallback treated
                // duration as unknown, rendering the bar with an
                // effectively 1-second range that looked pinned/static
                // and made any drag attempted in that window a silent
                // no-op. onReady already has a real duration available
                // (YouTube resolves it before firing ready), so seed it
                // immediately instead of waiting on the poll.
                const readyDuration = event.target.getDuration();
                if (Number.isFinite(readyDuration) && readyDuration > 0) {
                  setPlayback(prev => ({ ...prev, duration: readyDuration }));
                }
              }
            },
            onStateChange: (event: { data: number }) => {
              if (index !== activeIndexRef.current) return;
              // Bug fix (§103): this used to derive isPlaying from
              // `event.data === PLAYING`, treating every *other* state as
              // "not playing" — including BUFFERING (3), which YouTube
              // fires routinely during completely normal playback (network
              // blips, quality switches, and — since these are looped via
              // `loop=1&playlist=...` — the brief re-buffer right around
              // the loop point). Each of those BUFFERING events flipped
              // isPlaying to false, which (since §101) pops our own
              // pause-cover overlay up over the video even though playback
              // itself never actually stopped — exactly "pause button
              // dikh raha hai, video is not actually paused." isPlaying
              // should only reflect a real, user-facing paused state now:
              // it's set on PLAYING and PAUSED, and left alone (whatever
              // it last was) for every other transient state.
              const state = event.data;
              if (state === api.PlayerState.PLAYING) {
                setIsPlaying(true);
                if (!isSeekingRef.current) {
                  clearControlsTimer();
                  controlsTimerRef.current = setTimeout(() => setShowPlaybackControls(false), 3000);
                }
              } else if (state === api.PlayerState.PAUSED) {
                setIsPlaying(false);
                clearControlsTimer();
                setShowPlaybackControls(true);
              }
            },
          },
        });
      });
    });

    return () => { cancelled = true; };
  }, [activeIndex, clearControlsTimer, markLoaded, mountedIndices, muted, shorts]);

  // Bug fix (§100): eagerly grow mountedIndices to cover whichever shorts
  // should be near the active one — kept as its own effect (rather than
  // computed at render time) so the *shrinking* side (below) can safely
  // lag one render behind actual destroy() calls without also delaying
  // new shorts from mounting quickly. Adding is always safe to do
  // immediately: nothing needs cleanup before an iframe mounts.
  useEffect(() => {
    // Deferred via queueMicrotask rather than called synchronously in the
    // effect body: React's compiler flags synchronous setState-in-effect
    // as a hard build error (cascading-render risk) even though this is
    // the sanctioned "update external systems with the latest state" case
    // — mountedIndices only ever grows here (nothing needs destroying
    // before a new iframe mounts), so no destroy() ordering is at stake;
    // this is purely keeping mountedIndices in sync with activeIndex.
    queueMicrotask(() => {
      setMountedIndices(prev => {
        let changed = false;
        const next = new Set(prev);
        for (let idx = 0; idx < shorts.length; idx++) {
          if (isNearIndex(idx, activeIndex) && !next.has(idx)) {
            next.add(idx);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    });
  }, [activeIndex, shorts.length]);

  // Bug fix: as activeIndex advances, shorts fall out of the ± near
  // window and their iframes unmount (see the isNear render check),
  // but nothing was ever destroying the matching YT.Player instances
  // in playerRefs — they piled up as "zombies" (a live JS object
  // pointing at an iframe no longer in the DOM) for the entire session.
  // syncPlayers below iterates every key in playerRefs on each active-
  // short change, so the longer someone scrolled, the more zombie
  // players it called methods on, each a chance to throw and (before
  // the try/catch added to sendPlayerCommand above) derail that pass's
  // remaining play/pause/mute commands. This effect actually destroys
  // and forgets a player once its short leaves the mounted window, and
  // clears its loadedIdx entry so the thumbnail placeholder reappears
  // if the same short is scrolled back into view later (a re-created
  // iframe fires onLoad again, but loadedIdx would otherwise still
  // claim it was already loaded from before).
  useEffect(() => {
    Object.keys(playerRefs.current).forEach(key => {
      const idx = Number(key);
      if (isNearIndex(idx, activeIndex)) return;

      const player = playerRefs.current[idx];
      if (player) {
        try { player.destroy(); } catch { /* iframe already gone — nothing to clean up on the object itself */ }
      }
      delete playerRefs.current[idx];
      delete iframeRefs.current[idx];
      setLoadedIdx(prev => {
        if (!prev.has(idx)) return prev;
        const next = new Set(prev);
        next.delete(idx);
        return next;
      });
    });

    // Bug fix (§100): only now — after destroy() above has had a chance to
    // run against a still-DOM-attached iframe — do we drop the index from
    // mountedIndices, which is what the render below actually keys off to
    // unmount the <iframe>. This guarantees destroy() always runs before
    // React removes the node, closing the race described where this
    // effect used to run either before or after the render already tore
    // the iframe down (order wasn't guaranteed since both were driven
    // directly off the same activeIndex change).
    //
    // Deferred via queueMicrotask rather than called synchronously here:
    // React's compiler flags synchronous setState-in-effect as a hard
    // build error even for this sanctioned "sync with an external system"
    // case. The queueMicrotask callback still only runs *after* every
    // destroy() call above has already executed synchronously in this
    // effect body, so the ordering this fix depends on (destroy() before
    // the DOM node is allowed to unmount) is unaffected.
    queueMicrotask(() => {
      setMountedIndices(prev => {
        let changed = false;
        const next = new Set(prev);
        prev.forEach(idx => {
          if (!isNearIndex(idx, activeIndex)) {
            next.delete(idx);
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    });
  }, [activeIndex]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    (async () => {
      // Bug fix / feature: this used to be a plain `.limit(50)` reverse-
      // chronological query with no ranking pass at all — every viewer
      // saw the identical 50 newest shorts in the identical order. Pool
      // widened to 150 so there's real material for the ranking algorithm
      // (app/katube/lib/shortsRanking.ts) below to actually work with —
      // still one cheap indexed query, not a meaningfully heavier fetch.
      const { data: rows } = await supabase
        .from('videos')
        .select('id, title, description, youtube_id, views, likes, creator_id, duration_seconds, created_at')
        .eq('is_short', true)
        .order('created_at', { ascending: false })
        .limit(150);

      if (!rows || rows.length === 0) { setLoading(false); return; }

      // Bug fix: this feed only fetches the 50 most-recent shorts, but a
      // deep link (e.g. shared from a creator's page, or opened from an
      // older KaTube video) can point at a short that has since aged out
      // of that window. findIndex on the 50-row list would then return
      // -1, and Math.max(0, -1) silently fell back to index 0 — showing
      // whatever short happens to be newest, not the one the link
      // actually asked for, with no error or indication anything was
      // wrong. If the requested short isn't in the fetched window, fetch
      // it individually and splice it in at the front so it's always
      // reachable by direct link regardless of the main feed's age.
      const rowsIncludeTarget = !initialShortId || rows.some(r => r.id === initialShortId);
      let allRows = rows;
      if (!rowsIncludeTarget) {
        const { data: targetRow } = await supabase
          .from('videos')
          .select('id, title, description, youtube_id, views, likes, creator_id, duration_seconds, created_at')
          .eq('id', initialShortId)
          .eq('is_short', true)
          .maybeSingle();
        if (targetRow) {
          allRows = [targetRow, ...rows];
        }
      }

      const creatorIds = [...new Set(allRows.map(r => r.creator_id))];
      const { data: creators } = await supabase
        .from('creator_profiles').select('user_id, username').in('user_id', creatorIds);
      const creatorMap = new Map((creators || []).map(c => [c.user_id, c.username]));

      // Fetched directly here (not read from the `userId` state set by the
      // separate auth effect above) since the two effects have no
      // guaranteed ordering — the feed ranking below needs the viewer's
      // follows available on this very first pass, not on a possible
      // second render after `userId` happens to resolve.
      const { data: authData } = await supabase.auth.getUser();
      const viewerId = authData.user?.id ?? null;
      let followedCreatorIds: Set<string> | undefined;
      if (viewerId) {
        const { data: follows } = await supabase
          .from('creator_follows').select('creator_id').eq('follower_id', viewerId);
        followedCreatorIds = new Set((follows || []).map(f => f.creator_id));
        setFollowedCreatorIds(followedCreatorIds);
      }

      const unranked: Short[] = allRows.map(r => ({
        id: r.id, title: r.title, description: r.description ?? null, youtube_id: r.youtube_id,
        views: r.views, likes: r.likes, duration_seconds: r.duration_seconds ?? null, created_at: r.created_at,
        creator: creatorMap.get(r.creator_id) || 'MANGAL Creator', creator_id: r.creator_id,
      }));

      // KaTube Fast Tap ranking pass — see app/katube/lib/shortsRanking.ts
      // for the full signal breakdown (freshness-decayed engagement,
      // engagement rate, followed-creator boost, session "already seen"
      // de-prioritization, creator-diversity re-ordering). A direct-link
      // target short (initialShortId) is exempt from re-ordering relative
      // to itself — it isn't moved to the front, the algorithm just ranks
      // around it — since `startIdx` below finds it by id wherever it
      // lands, so a shared link always opens on the intended short
      // regardless of where the algorithm would otherwise rank it.
      const list = rankShorts(unranked, { followedCreatorIds });
      setShorts(list);

      // No more silent fallback to index 0 for a genuinely missing/
      // deleted short id — that case (targetRow also came back null
      // above) still starts at the top of the feed, same as before, but
      // every case where the short does exist now resolves correctly.
      const startIdx = initialShortId
        ? Math.max(0, list.findIndex(s => s.id === initialShortId))
        : 0;
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

  // "Join" — this page's wording for the same creator_follows toggle the
  // rest of KaTube calls "Follow" (watch page, channel page). Founder
  // asked for "Join" specifically here, matching a reference UI's
  // Subscribe/Join button — same underlying table/action, just this
  // page's label. Optimistic toggle with rollback on failure, same
  // pattern already used for follow/like buttons elsewhere in the app.
  const toggleJoin = useCallback((creatorId: string) => {
    if (!userId) {
      setPostLoginRedirect(window.location.pathname);
      window.location.href = '/login?next=' + encodeURIComponent(window.location.pathname);
      return;
    }
    if (joinBusyId === creatorId) return; // double-tap guard
    const alreadyJoined = followedCreatorIds.has(creatorId);
    setJoinBusyId(creatorId);
    setFollowedCreatorIds(prev => {
      const next = new Set(prev);
      if (alreadyJoined) next.delete(creatorId); else next.add(creatorId);
      return next;
    });
    (async () => {
      const { error } = alreadyJoined
        ? await supabase.from('creator_follows').delete().eq('creator_id', creatorId).eq('follower_id', userId)
        : await supabase.from('creator_follows').insert({ creator_id: creatorId, follower_id: userId });
      if (error) {
        // Roll back the optimistic update on failure.
        setFollowedCreatorIds(prev => {
          const next = new Set(prev);
          if (alreadyJoined) next.add(creatorId); else next.delete(creatorId);
          return next;
        });
        showToast('Something went wrong, try again');
      }
      setJoinBusyId(null);
    })();
  }, [userId, joinBusyId, followedCreatorIds, showToast]);

  // A warm iframe is driven through YouTube's player API instead of replacing
  // its src. That preserves the preloaded next clips during fast scrolling.
  useEffect(() => {
    const syncPlayers = () => {
      Object.keys(playerRefs.current).forEach(index => {
        if (Number(index) === activeIndex) {
          sendPlayerCommand(activeIndex, muted ? 'mute' : 'unMute');
          sendPlayerCommand(activeIndex, 'playVideo');
        } else {
          sendPlayerCommand(Number(index), 'pauseVideo');
        }
      });
    };
    const timers = [0, 250, 800, 1500].map(delay => setTimeout(syncPlayers, delay));
    return () => timers.forEach(clearTimeout);
  }, [activeIndex, muted, sendPlayerCommand, shorts.length]);

  // A Shorts feed starts a clip fresh whenever it comes back into view. This
  // prevents a previously watched, still-mounted iframe from resuming midway.
  useEffect(() => {
    if (lastActiveIndexRef.current === activeIndex) return;
    // Ranking feature: the short being scrolled away FROM counts as
    // "seen this session" — feeds it into shortsRanking's de-
    // prioritization so a reload of Fast Tap doesn't just replay the
    // same clips at the top again. Only the previous short (not the new
    // active one) is marked — arriving at a short isn't the same as
    // having actually scrolled past it.
    if (lastActiveIndexRef.current !== null) {
      const previousShort = shorts[lastActiveIndexRef.current];
      if (previousShort) markShortSeen(previousShort.id);
    }
    lastActiveIndexRef.current = activeIndex;
    setPlayback({ currentTime: 0, duration: shorts[activeIndex]?.duration_seconds ?? 0 });
    sendPlayerCommand(activeIndex, 'seekTo', [0, true]);
    const playTimer = setTimeout(() => sendPlayerCommand(activeIndex, 'playVideo'), 150);
    return () => clearTimeout(playTimer);
  }, [activeIndex, sendPlayerCommand, shorts]);

  // Read the actual player clock. A native range input is therefore a true
  // seek bar rather than a decorative timed animation.
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (isSeekingRef.current) return;
      const player = playerRefs.current[activeIndex];
      if (!player) return;
      const currentTime = player.getCurrentTime();
      const duration = player.getDuration();
      if (Number.isFinite(currentTime) && Number.isFinite(duration) && duration > 0) {
        setPlayback({ currentTime, duration });
      }
    }, 250);
    return () => {
      window.clearInterval(interval);
    };
  }, [activeIndex]);

  useEffect(() => () => clearControlsTimer(), [clearControlsTimer]);

  const stopFastForward = useCallback(() => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
    if (!fastForwardingRef.current) return;
    sendPlayerCommand(activeIndex, 'setPlaybackRate', [1]);
    fastForwardingRef.current = false;
    setIsFastForwarding(false);
  }, [activeIndex, sendPlayerCommand]);

  const beginFastForward = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary) return;
    revealPlaybackControls();
    holdPointerRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    pressMovedRef.current = false;
    holdTimerRef.current = setTimeout(() => {
      sendPlayerCommand(activeIndex, 'setPlaybackRate', [2]);
      fastForwardingRef.current = true;
      setIsFastForwarding(true);
    }, 300);
  }, [activeIndex, revealPlaybackControls, sendPlayerCommand]);

  const cancelFastForwardForScroll = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const start = holdPointerRef.current;
    if (!start || start.id !== event.pointerId) return;
    if (Math.abs(event.clientX - start.x) > 10 || Math.abs(event.clientY - start.y) > 10) {
      pressMovedRef.current = true;
      stopFastForward();
    }
  }, [stopFastForward]);

  const finishShortPress = useCallback(() => {
    const wasFastForwarding = fastForwardingRef.current;
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
    stopFastForward();
    holdPointerRef.current = null;
    if (!wasFastForwarding && !pressMovedRef.current) {
      sendPlayerCommand(activeIndex, isPlaying ? 'pauseVideo' : 'playVideo');
      setIsPlaying(previous => !previous);
    }
  }, [activeIndex, isPlaying, sendPlayerCommand, stopFastForward]);

  const seekTo = useCallback((time: number) => {
    // Bug fix: this used to trust only `playback.duration` (state, only
    // set by the poll or onReady) and `shorts[...].duration_seconds`
    // (DB metadata, frequently null — it's only captured at upload time
    // if the moderation step happened to extract it), falling back to 0
    // and silently doing nothing (`if (!duration) return`) if neither
    // was populated yet. That made a drag attempted before the first
    // successful poll a complete no-op — indistinguishable from the bar
    // being broken. Now falls back a third way: read the live player's
    // own getDuration() directly, which is normally available as soon
    // as the player exists, well before the state catches up.
    const liveDuration = playerRefs.current[activeIndex]?.getDuration();
    const duration =
      playback.duration ||
      shorts[activeIndex]?.duration_seconds ||
      (Number.isFinite(liveDuration) && liveDuration! > 0 ? liveDuration! : 0);
    if (!duration) return;
    // `false` avoids a network request while the thumb is being dragged;
    // callers set `true` once it is released, per YouTube's API guidance.
    sendPlayerCommand(activeIndex, 'seekTo', [time, !isSeekingRef.current]);
    setPlayback(previous => ({ ...previous, duration, currentTime: time }));
  }, [activeIndex, playback.duration, sendPlayerCommand, shorts]);

  const startSeeking = useCallback((event: PointerEvent<HTMLInputElement>) => {
    event.stopPropagation();
    isSeekingRef.current = true;
    clearControlsTimer();
    setShowPlaybackControls(true);
    // Explicit capture (rather than relying on the browser's implicit
    // range-input capture, which isn't equally reliable across every
    // mobile browser/WebView) — guarantees pointerup/lostpointercapture
    // fires on this element even if the finger drifts outside its
    // bounds mid-drag, so isSeekingRef always gets released and the
    // bar can never get stuck "frozen" mid-poll-suppression.
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* not supported — implicit capture still applies */ }
  }, [clearControlsTimer]);

  const finishSeeking = useCallback((event: PointerEvent<HTMLInputElement>) => {
    event.stopPropagation();
    isSeekingRef.current = false;
    seekTo(Number(event.currentTarget.value));
    revealPlaybackControls();
  }, [revealPlaybackControls, seekTo]);

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
          background: #18181d; border: 1px solid rgba(225,29,72,0.22); border-radius: 8px;
          box-shadow: 0 18px 48px rgba(0,0,0,0.45);
        }
        .katube-short-details-handle { width: 42px; height: 4px; border-radius: 999px; background: rgba(255,255,255,0.4); margin: -5px auto 16px; }
        .katube-short-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 18px 0; }
        .katube-short-stat { padding: 12px 6px; border-radius: 12px; text-align: center; background: rgba(225,29,72,0.16); color: #fff; }
        .katube-shorts-feed { overscroll-behavior-y: contain; touch-action: pan-y; }
        .katube-shorts-mobile-chrome { display: flex; position: fixed; left: 0; right: 0; z-index: 50; background: #000; box-sizing: border-box; }
        .katube-shorts-mobile-header { top: 0; height: calc(92px + env(safe-area-inset-top)); padding: calc(12px + env(safe-area-inset-top)) 16px 12px; align-items: center; justify-content: space-between; }
        .katube-shorts-mobile-tabs { bottom: 0; height: calc(68px + env(safe-area-inset-bottom)); padding: 8px 18px calc(8px + env(safe-area-inset-bottom)); align-items: center; justify-content: space-between; border-top: 1px solid rgba(255,255,255,0.1); }
        .katube-shorts-back { display: none !important; }
        .katube-short-frame { width: min(100%, calc((100dvh - 208px) * 9 / 16)); height: calc(100% - 208px); margin: calc(92px + env(safe-area-inset-top)) auto calc(116px + env(safe-area-inset-bottom)); }
        .katube-short-caption { top: 100%; bottom: auto; right: 0; padding: 13px 14px 0; background: #000; }
        .katube-short-actions { bottom: 54px; }
        .katube-short-caption, .katube-short-actions { z-index: 30 !important; }
        .katube-short-progress { position: absolute; left: 14px; right: 14px; bottom: calc(8px + env(safe-area-inset-bottom)); z-index: 31; touch-action: none; }
        /* Bug fix (§104): this used to carve out a 136px top strip and a
           108px bottom strip that the gesture layer didn't cover. Our
           own top-title-shield and bottom-share-shield (both z-index 20,
           above this layer's z-index 10) already handle their own bands
           regardless of what this layer covers — so those gaps did
           nothing but let raw taps fall through to the underlying
           cross-origin iframe instead of this layer's pointer handlers
           (the share shield only covers the left 128px of the bottom
           band, leaving its right side open). Any tap reaching the raw
           iframe directly can make YouTube show its own native OSD/
           branding overlay — the controls/title/logo bleed-through kept
           showing up in screenshots. Covering the full frame means every
           tap is always handled by our own code first. */
        .katube-short-gesture-layer { position: absolute; inset: 0; z-index: 10; touch-action: pan-y; }
        .katube-short-speed-indicator { position: absolute; top: 50%; left: 50%; z-index: 32; transform: translate(-50%, -50%); padding: 10px 14px; border-radius: 999px; background: rgba(0,0,0,0.76); color: #fff; font-size: 14px; font-weight: 800; pointer-events: none; }
        .katube-youtube-title-shield { display: block; }
        .katube-youtube-bottom-share-shield { display: block; }
        @media (min-width: 900px) {
          .katube-shorts-mobile-chrome { display: none; }
          .katube-shorts-sidebar {
            display: flex; position: fixed; inset: 0 auto 0 0; z-index: 40; width: 232px;
            flex-direction: column; padding: 22px 12px; box-sizing: border-box;
            background: #0b0b0f; border-right: 1px solid rgba(255,255,255,0.12);
          }
          .katube-shorts-feed { margin-left: 232px; width: calc(100% - 232px) !important; }
          .katube-shorts-back { display: flex !important; }
          .katube-shorts-back { left: 252px !important; }
          .katube-short-details { left: auto; right: 24px; bottom: 24px; width: 320px; margin: 0; }
          .katube-short-frame { max-width: 480px; height: calc(100% - 108px); margin: 0 auto; }
          .katube-short-caption { top: 100%; bottom: auto; left: 0; right: 0; padding: 14px 0 0 !important; background: #000 !important; }
          .katube-short-actions { left: calc(100% + 18px); right: auto !important; bottom: 88px; }
          .katube-short-progress { bottom: 8px; }
          .katube-short-gesture-layer { inset: 0; }
        }
        @media (max-width: 899px) {
          .katube-short-details { left: 0; right: 0; bottom: 0; width: 100%; max-width: none; min-height: 48dvh; max-height: 68dvh; margin: 0; padding: 20px 24px calc(24px + env(safe-area-inset-bottom)); overflow-y: auto; border-radius: 22px 22px 0 0; border-left: 0; border-right: 0; border-bottom: 0; }
        }
      `}</style>

      <aside className="katube-shorts-sidebar" aria-label="KaTube navigation">
        <Link href="/katube" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fff', textDecoration: 'none', padding: '0 12px 24px', fontSize: '18px', fontWeight: 900 }}>
          <Play size={20} fill="#e11d48" color="#e11d48" /> KaTube
        </Link>
        {[
          { href: '/katube', label: 'Home', icon: Home },
          { href: '/katube', label: 'Fast Tap', icon: Zap, active: true },
          { href: '/katube/trending', label: 'Trending', icon: Flame },
          { href: '/katube/subscriptions', label: 'Following', icon: Users },
        ].map(item => {
          const Icon = item.icon;
          return <Link key={item.label} href={item.href} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '11px 12px', borderRadius: '7px', color: item.active ? '#fff' : '#a1a1aa', background: item.active ? 'rgba(225,29,72,0.18)' : 'transparent', textDecoration: 'none', fontSize: '14px', fontWeight: item.active ? 800 : 600 }}><Icon size={19} color={item.active ? '#e11d48' : 'currentColor'} />{item.label}</Link>;
        })}
        <Link href="/katube/upload" style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '11px', borderRadius: '7px', background: '#e11d48', color: '#fff', textDecoration: 'none', fontSize: '13px', fontWeight: 800 }}><PlusSquare size={16} /> Upload</Link>
      </aside>

      <header className="katube-shorts-mobile-chrome katube-shorts-mobile-header">
        <strong style={{ color: '#fff', fontSize: '24px', letterSpacing: '-0.04em' }}>Fast Tap</strong>
        {/* Bug fix (§110): this used to also render a mute/unmute button
            right here, duplicating the "Sound"/"Muted" toggle already in
            the right-edge action rail lower down (see katube-short-actions
            below) — two separate controls for the same on/off state, one
            up top and one down by the video, which is exactly what read as
            confusing/overlapping. The action rail's toggle is the one that
            actually sits next to the video it controls, so it's the one
            that stays. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px', color: '#fff' }}>
          <Search size={27} />
          <MoreVertical size={27} />
        </div>
      </header>

      <nav className="katube-shorts-mobile-chrome katube-shorts-mobile-tabs" aria-label="KaTube mobile navigation">
        {[
          { href: '/katube', label: 'Home', icon: Home },
          { href: '/katube', label: 'Fast Tap', icon: Zap },
          { href: '/katube/upload', label: 'Create', icon: PlusSquare },
          { href: '/katube/subscriptions', label: 'Following', icon: Users },
        ].map(item => {
          const Icon = item.icon;
          return <Link key={item.label} href={item.href} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', color: item.label === 'Fast Tap' ? '#e11d48' : '#fff', textDecoration: 'none', fontSize: '10px', fontWeight: 700 }}><Icon size={22} fill={item.label === 'Fast Tap' ? '#e11d48' : 'none'} />{item.label}</Link>;
        })}
      </nav>

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
          <Link href="/katube" style={{ color: '#e11d48', fontSize: '13px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}><ArrowLeft size={13} strokeWidth={2} /> Back to KaTube</Link>
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
            // fast multi-swipe still reaches an iframe that has begun
            // loading. Bug fix (§100): reads from mountedIndices (state,
            // updated by the effects above) rather than calling
            // isNearIndex(idx, activeIndex) directly here — see the state
            // declaration for why that ordering matters.
            const isNear = mountedIndices.has(idx);
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
                          on a slow network.
                          Bug fix (§101): "underneath" was true in z-order
                          intent but not in practice — neither this <img>
                          nor the <iframe> below it had an explicit
                          z-index, so with both position:absolute and
                          the iframe coming later in the DOM, the iframe
                          painted on top of the thumbnail the instant it
                          mounted (plain DOM-order stacking), regardless
                          of whether it had actually loaded anything
                          visible yet. For however long the iframe's
                          document was blank/loading, that showed as a
                          flat black rectangle instead of the thumbnail
                          underneath it — exactly the "black screen on
                          load" the founder reported on both phone and
                          desktop. Giving the thumbnail a real z-index
                          above the iframe's default stacking makes it
                          actually cover the iframe, not just sit
                          earlier in the DOM, until markLoaded removes
                          it. */}
                      {!loadedIdx.has(idx) && (
                        <img
                          src={`https://img.youtube.com/vi/${short.youtube_id}/hqdefault.jpg`}
                          alt={short.title}
                          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 2 }}
                        />
                      )}
                      <iframe
                        ref={el => { iframeRefs.current[idx] = el; }}
                        id={`katube-short-player-${short.id}`}
                        src={`https://www.youtube.com/embed/${short.youtube_id}?rel=0&playsinline=1&controls=0&disablekb=1&fs=0&enablejsapi=1&autoplay=0&mute=1&loop=1&playlist=${short.youtube_id}${typeof window === 'undefined' ? '' : `&origin=${encodeURIComponent(window.location.origin)}`}`}
                        title={short.title}
                        allow="accelerometer; autoplay; encrypted-media; gyroscope"
                        onLoad={() => markLoaded(idx)}
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
                      />
                      {/* On phones, YouTube renders a title/channel strip at
                          the top of an embed. It can open youtube.com, so it
                          is intentionally covered; KaTube's own title below
                          remains the only title interaction. */}
                      <div className="katube-youtube-title-shield" aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '136px', zIndex: 20, background: 'transparent', pointerEvents: 'auto' }} />
                      {/* The original YouTube Short can itself contain a
                          left-bottom Share graphic. KaTube's Share action is
                          the one in the right rail, so hide this duplicate
                          source-player graphic without adding another action. */}
                      <div className="katube-youtube-bottom-share-shield" aria-hidden="true" style={{ position: 'absolute', left: 0, bottom: 0, width: '128px', height: '108px', zIndex: 20, background: 'transparent', pointerEvents: 'auto' }} />
                      {/* Bug fix (§101): YouTube's embedded player shows its
                          own branded overlay — title, channel name, native
                          prev/play/next buttons, its own progress bar, and
                          a "YouTube" logo — whenever playback is paused via
                          the API, regardless of the controls=0 URL param.
                          This is a long-standing, undocumented behavior of
                          the IFrame Player with no URL parameter that turns
                          it off, and it was bleeding straight through on
                          top of KaTube's own UI every time a short was
                          paused (visible clashing with our own title/
                          caption text and duplicating our own seek bar and
                          Share action with YouTube's native equivalents).
                          Since that overlay is rendered *inside* the
                          cross-origin iframe's own document, it can't be
                          targeted or hidden with CSS from here — the only
                          way to keep it off-screen is to cover the iframe
                          entirely with an opaque layer of our own whenever
                          paused, with our own pause icon standing in for
                          the (also YouTube-branded) one it would otherwise
                          show.
                          Bug fix (§104): that cover was only 55% opaque
                          (`rgba(0,0,0,0.55)`), which dims a video frame but
                          does very little to hide bright white text/icons/
                          logo — so YouTube's title, controls, and branding
                          were all still clearly legible right through it,
                          which is exactly what the founder's follow-up
                          screenshot showed. Raised to a solid, fully
                          opaque background so nothing underneath can show
                          through at all; paired with the gesture-layer fix
                          just above (so most taps never even reach the raw
                          iframe to trigger that overlay in the first
                          place). */}
                      {isActive && !isPlaying && (
                        <div
                          aria-hidden="true"
                          style={{
                            position: 'absolute', inset: 0, zIndex: 15,
                            background: '#000',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            pointerEvents: 'none',
                          }}
                        >
                          <div style={{
                            width: '64px', height: '64px', borderRadius: '50%',
                            background: 'rgba(0,0,0,0.4)', border: '1.5px solid rgba(255,255,255,0.7)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <Play size={26} color="#fff" fill="#fff" style={{ marginLeft: '3px' }} />
                          </div>
                        </div>
                      )}
                      {isActive && (
                        <div
                          className="katube-short-gesture-layer"
                          onPointerDown={beginFastForward}
                          onPointerMove={cancelFastForwardForScroll}
                          onPointerUp={finishShortPress}
                          onPointerCancel={() => { pressMovedRef.current = true; holdPointerRef.current = null; stopFastForward(); }}
                          onPointerLeave={() => { pressMovedRef.current = true; stopFastForward(); }}
                          aria-label="Press and hold for 2x speed"
                        />
                      )}
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

                  {isActive && isFastForwarding && <div className="katube-short-speed-indicator">2×</div>}

                  {isActive && (
                    <div className="katube-short-progress">
                      {/* Bug fix (§98): this used to swap the range input
                          out for a static title <div> once
                          showPlaybackControls went false — three seconds
                          after any resumed playback (see
                          revealPlaybackControls's setTimeout). The title
                          it swapped to is also already shown permanently
                          in the caption block below, so that branch added
                          nothing except making the seek bar vanish and
                          become completely undraggable for as long as the
                          short kept playing uninterrupted, which is the
                          vast majority of watch time — reading exactly
                          like "the bar down there doesn't work." The
                          range input is now always mounted so it can
                          always be held/dragged (left = back, right =
                          forward, via the existing startSeeking/seekTo/
                          finishSeeking handlers below), and it keeps
                          tracking playback on its own via the polling
                          effect above whenever it isn't currently being
                          dragged (isSeekingRef.current false). */}
                      <input
                        type="range"
                        min="0"
                        // Bug fix: falling back to `1` here (when
                        // neither the poll nor the DB's duration_seconds
                        // had resolved yet) made the slider's usable
                        // range effectively 1 second wide — currentTime
                        // ticking past that instantly pinned the thumb
                        // to the far right, looking frozen/static
                        // regardless of actual playback. 60s is a safe
                        // upper bound for a Short; the real duration
                        // (from onReady/polling above) overwrites this
                        // on the very next render once known.
                        max={playback.duration || shorts[idx].duration_seconds || 60}
                        step="0.1"
                        value={Math.min(playback.duration || shorts[idx].duration_seconds || 60, playback.currentTime)}
                        onPointerDown={startSeeking}
                        onPointerUp={finishSeeking}
                        onPointerCancel={finishSeeking}
                        onLostPointerCapture={finishSeeking}
                        onInput={event => seekTo(Number((event.target as HTMLInputElement).value))}
                        onChange={event => seekTo(Number(event.target.value))}
                        aria-label="Seek through Short"
                        // Bug fix (§115): container had no explicit
                        // touch-action, so it inherited `pan-y` from the
                        // feed container above (reserved for the
                        // swipe-between-shorts gesture). A tap is a single
                        // point, no ambiguity, so it always landed fine —
                        // but an actual horizontal drag was ambiguous
                        // between "pan the page" and "drag this control,"
                        // and touch devices resolved that in favor of the
                        // page's pan-only gesture, so our pointermove-
                        // driven seekTo never fired. `touch-action: none`
                        // here (mirrored on the container above) gives
                        // this element 100% ownership of pointer movement
                        // over it.
                        style={{ display: 'block', width: '100%', accentColor: '#e11d48', cursor: 'pointer', pointerEvents: 'auto', touchAction: 'none' }}
                      />
                    </div>
                  )}

                  {/* KaTube-owned metadata. The iframe above keeps YouTube's
                      own player controls and branding available for playback. */}
                  <div className="katube-short-caption" style={{
                    position: 'absolute', left: 0,
                    padding: '16px 16px 12px',
                    background: 'linear-gradient(to top, rgba(0,0,0,0.75), transparent)', zIndex: 5,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '6px' }}>
                      <Link href={`/katube/channel/${encodeURIComponent(short.creator)}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#fff', fontWeight: 800, fontSize: '13.5px', textDecoration: 'none', minWidth: 0 }}>
                        <UserCircle size={22} style={{ flexShrink: 0 }} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{short.creator}</span>
                      </Link>
                      {userId !== short.creator_id && (
                        <button
                          onClick={() => toggleJoin(short.creator_id)}
                          disabled={joinBusyId === short.creator_id}
                          style={{
                            flexShrink: 0, padding: '5px 14px', borderRadius: '999px', fontSize: '11.5px', fontWeight: 800,
                            cursor: 'pointer', whiteSpace: 'nowrap',
                            background: followedCreatorIds.has(short.creator_id) ? 'transparent' : '#22c55e',
                            color: followedCreatorIds.has(short.creator_id) ? '#22c55e' : '#06120a',
                            border: followedCreatorIds.has(short.creator_id) ? '1.5px solid #22c55e' : 'none',
                            opacity: joinBusyId === short.creator_id ? 0.6 : 1,
                          }}
                        >
                          {followedCreatorIds.has(short.creator_id) ? 'Joined' : 'Join'}
                        </button>
                      )}
                    </div>
                    {/* Bug fix (§109): unclamped, this could grow to as
                        many lines as a long title needed. The frame's
                        mobile bottom margin (katube-short-frame) reserves
                        a fixed height for this whole caption block, so a
                        long title pushed the block taller than that
                        reserved space — spilling down behind the fixed
                        bottom tab bar (lower z-index) instead of sitting
                        cleanly above it, which read as the caption/Join
                        row being "overlapped." Clamping to 2 lines keeps
                        the block's height bounded and predictable. */}
                    <button onClick={() => { setActiveIndex(idx); setDetailsOpen(true); }} style={{
                      padding: 0, border: 0, background: 'transparent', color: '#fff', cursor: 'pointer',
                      textAlign: 'left', fontSize: '12.5px', fontWeight: 700, lineHeight: 1.4,
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                    }}>
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
          <div className="katube-short-details-handle" aria-hidden="true" />
          <button onClick={() => setDetailsOpen(false)} aria-label="Close details" title="Close details" style={{ position: 'absolute', top: '12px', right: '12px', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 0, color: '#fff', cursor: 'pointer' }}><X size={18} /></button>
          <h1 style={{ margin: '0 34px 18px 0', color: '#fff', fontSize: '24px', lineHeight: 1.2 }}>Description</h1>
          <p style={{ margin: '0', color: '#fff', fontSize: '16px', fontWeight: 700, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{shorts[activeIndex].description || shorts[activeIndex].title}</p>
          <div className="katube-short-stats">
            <div className="katube-short-stat"><strong style={{ display: 'block', fontSize: '18px' }}>{shorts[activeIndex].likes.toLocaleString()}</strong><span style={{ color: '#d4d4d8', fontSize: '12px' }}>Likes</span></div>
            <div className="katube-short-stat"><strong style={{ display: 'block', fontSize: '18px' }}>{shorts[activeIndex].views.toLocaleString()}</strong><span style={{ color: '#d4d4d8', fontSize: '12px' }}>Views</span></div>
            <div className="katube-short-stat"><strong style={{ display: 'block', fontSize: '16px' }}>{new Date(shorts[activeIndex].created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</strong><span style={{ color: '#d4d4d8', fontSize: '12px' }}>{new Date(shorts[activeIndex].created_at).getFullYear()}</span></div>
          </div>
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
