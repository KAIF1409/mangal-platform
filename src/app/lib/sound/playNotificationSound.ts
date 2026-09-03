'use client';

import { useCallback, useEffect, useState } from 'react';

// §151 — the single notification-sound player for every realtime surface on
// the platform. Before this, incoming realtime events were completely
// silent: K Circle chat's open-thread + inbox channels (postgres_changes on
// kcircle_messages), NotificationBell's kcircle_notifications channel,
// watch-together shorts room chat, and the KaTube watch-room chat all just
// mutated state. Every surface calls THIS module's useNotificationSound()
// hook — no per-page playback logic, no second sound system.
//
// Sound approach: a tiny two-tone "ding" synthesized at runtime with the
// Web Audio API (option a from the task spec) — deliberately NOT a bundled
// asset, so there is zero bundle-size cost and zero licensing risk (no
// copyrighted/CC0 file to vet or ship). Two soft sine partials (A5 + E6)
// through a gentle lowpass, ~0.4s total, quiet master gain — noticeable,
// not annoying (Discord/WhatsApp-style subtlety).
//
// Browser autoplay rules: an AudioContext starts 'suspended' until a user
// gesture has interacted with the page. primeAudioUnlock() installs one-time
// pointer/key/touch listeners (per document, not per surface) that resume
// the context as soon as ANY interaction happens. If a realtime event lands
// before any interaction, playNotificationSound() attempts one resume(); if
// the browser still refuses, it bails SILENTLY — no console errors on first
// load before interaction.
//
// Suppression rules (the two classic chat-sound bugs, both handled here or
// at the call sites):
//   1. Own outgoing messages: kcircle_messages realtime INSERTs come back
//      for the sender too (sendMessage() has no local append — the channel
//      is the single path a message reaches the UI). Call sites MUST check
//      sender_id !== current user's id before calling play(); this module
//      additionally refuses to play twice within NOTIFICATION_SOUND_COOLDOWN_MS.
//   2. Already looking at the exact conversation: call sites pass on the
//      "document.hidden" check (see each wired surface). A focused tab that
//      is actively showing the thread/room the message landed in stays
//      silent; background conversations, hidden tabs, and NotificationBell
//      events still play.
// The cooldown ALSO dedupes across mounted instances and tabs: a single
// incoming DM legitimately fires up to three handlers at once on the
// recipient's machine (thread channel + inbox channel + notification INSERT),
// and NotificationBell is mounted twice on K Circle's main page (mobile +
// desktop nav) — the localStorage timestamp below collapses all of them
// into one audible ding, same-origin across tabs.
//
// Mute toggle: 'mangal_notification_sound' in localStorage ('off' = muted,
// absent/'on' = audible). The always-visible toggle lives in NotificationBell
// (rendered next to the bell on K Circle's navs/rail and KaTube home), which
// is the one component every sound-producing surface shares. Mute changes
// propagate to other instances/tabs via the custom event + 'storage' listener
// in the hook below.

const MUTED_KEY = 'mangal_notification_sound';
const LAST_PLAYED_KEY = 'mangal_notification_sound_at';
const MUTED_CHANGED_EVENT = 'mangal-notification-sound-muted-changed';
// One incoming DM fires thread + inbox + bell handlers within ~0-300ms of
// each other; 400ms collapses them into one ding without swallowing
// genuinely distinct events (a second message >400ms later still sounds).
export const NOTIFICATION_SOUND_COOLDOWN_MS = 400;

let ctx: AudioContext | null = null;
let unlockInstalled = false;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  } catch {
    ctx = null;
  }
  return ctx;
}

// Called once on mount by useNotificationSound() — resumes the shared
// AudioContext on the first user gesture so later realtime events (which
// arrive with no gesture of their own) can sound.
export function primeAudioUnlock(): void {
  const c = getCtx();
  if (!c || unlockInstalled) return;
  unlockInstalled = true;
  const unlock = () => {
    if (c.state === 'suspended') {
      c.resume().catch(() => { /* still gesture-locked; try again next gesture */ });
    }
    if (c.state === 'running') {
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
      document.removeEventListener('touchstart', unlock);
    }
  };
  document.addEventListener('pointerdown', unlock);
  document.addEventListener('keydown', unlock);
  document.addEventListener('touchstart', unlock);
}


function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === 'off';
  } catch {
    return false;
  }
}

function writeMuted(muted: boolean): void {
  try {
    if (muted) localStorage.setItem(MUTED_KEY, 'off');
    else localStorage.removeItem(MUTED_KEY);
  } catch { /* ignore (private mode etc.) — mute just won't persist */ }
}

// One soft sine partial with a quick attack + exponential decay.
function tone(parent: AudioNode, ac: AudioContext, freq: number, at: number, peak: number, decay: number): void {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.linearRampToValueAtTime(peak, at + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  osc.connect(gain);
  gain.connect(parent);
  osc.start(at);
  osc.stop(at + decay + 0.05);
  osc.onended = () => {
    gain.disconnect();
    osc.disconnect();
  };
}

// Fire-and-forget: never throws, never logs on the happy path, and stays
// completely silent when muted, in cooldown, or before audio is unlocked.
export function playNotificationSound(): void {
  if (typeof window === 'undefined') return;
  try {
    if (readMuted()) return;
    const now = Date.now();
    const last = Number(localStorage.getItem(LAST_PLAYED_KEY) ?? 0);
    if (Number.isFinite(last) && now - last < NOTIFICATION_SOUND_COOLDOWN_MS) return;
    localStorage.setItem(LAST_PLAYED_KEY, String(now));
  } catch { /* ignore — localStorage unavailable must never block playback */ }

  const c = getCtx();
  if (!c) return;
  try {
    if (c.state !== 'running') {
      // No user gesture yet (autoplay policy) — try to resume; if the
      // browser refuses, drop the sound silently instead of erroring.
      c.resume()
        .then(() => { if (c.state === 'running') scheduleDing(c); })
        .catch(() => { /* gesture-locked; surface stays silent until first interaction */ });
      return;
    }
    scheduleDing(c);
  } catch { /* ignore — audio must never break the page */ }
}

function scheduleDing(c: AudioContext): void {
  const t0 = c.currentTime + 0.01;
  const master = c.createGain();
  master.gain.value = 0.5;
  master.connect(c.destination);
  const soften = c.createBiquadFilter();
  soften.type = 'lowpass';
  soften.frequency.value = 4400;
  soften.connect(master);
  tone(soften, c, 880, t0, 0.14, 0.32);          // A5 — the "pop"
  tone(soften, c, 1318.51, t0 + 0.09, 0.1, 0.3); // E6 — the "ping" tail
  // Detach the per-play master chain once the tail is done.
  setTimeout(() => { soften.disconnect(); master.disconnect(); }, 600);
}

// The one hook every realtime surface uses:
//   const { play } = useNotificationSound();   // chat/room INSERT handlers
//   const { muted, toggleMuted } = useNotificationSound(); // mute toggle UI
export function useNotificationSound(): {
  play: () => void;
  muted: boolean;
  toggleMuted: () => void;
} {
  // Start unmuted on both server and first client render (no hydration
  // mismatch), then sync the real persisted value after mount.
  const [muted, setMuted] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect -- mount-time sync from
     localStorage: reading the persisted mute flag during render/initializer
     would desync SSR from client first paint (hydration mismatch), so it
     lands after mount — same pattern as the auth/profile fetch effects in
     kalpana-circle/chat/page.tsx. */
  useEffect(() => {
    setMuted(readMuted());
    primeAudioUnlock();
    // Another instance in THIS tab (NotificationBell mounts twice on K
    // Circle's main page) toggled mute → custom event. Another TAB toggled
    // mute → 'storage' event. Both keep every icon honest.
    const sync = () => setMuted(readMuted());
    window.addEventListener(MUTED_CHANGED_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(MUTED_CHANGED_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const play = useCallback(() => { playNotificationSound(); }, []);
  const toggleMuted = useCallback(() => {
    const next = !readMuted();
    writeMuted(next);
    setMuted(next);
    try { window.dispatchEvent(new Event(MUTED_CHANGED_EVENT)); } catch { /* ignore */ }
  }, []);

  return { play, muted, toggleMuted };
}
