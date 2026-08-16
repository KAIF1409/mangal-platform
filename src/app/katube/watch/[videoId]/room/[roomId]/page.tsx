'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import ThemeToggle from '../../../../../components/ThemeToggle';
import { supabase } from '../../../../../lib/supabase';
import { setPostLoginRedirect } from '../../../../../lib/authRedirect';
import { Users, Lock, Globe, Check, Link2, Crown, MessageCircle, ArrowLeft } from 'lucide-react';

// ── Sync-Play Watch Rooms ──
// Third of the three retention-strategy ideas from CONTEXT.md §25 (Review
// Hub and §26 Visual Quests were the first two, both done). Lets a KaTube
// "Watch with Friends" click or a Kalpana Circle "Watch Together" room land
// here: a synced YouTube player + live chat + member list.
//
// Sync model: host-authoritative. The room's host_id is the only client
// whose play/pause/seek actually drives the shared state — everyone else's
// player is remote-controlled to match via an ephemeral Realtime Broadcast
// channel (not Postgres — see the migration header comment for why).
// Viewers can still use their own YouTube controls (volume, fullscreen,
// captions), but any play/pause/seek they trigger gets silently corrected
// back to the host's state on the next sync tick — this is a deliberate
// simplification for a first version (see CONTEXT.md "not done" note) since
// letting every viewer control playback invites control fights.
//
// The IFrame API has no native "user seeked" event (confirmed against
// Google's own docs), so a host-side seek is detected by comparing the
// expected current time (last known time + elapsed) against the actual
// time on each heartbeat tick — a jump bigger than the tolerance means the
// host scrubbed the bar.

const HEARTBEAT_MS = 4000;
const DRIFT_TOLERANCE_SEC = 1.5;

// Minimal surface of the YouTube IFrame Player API actually used here —
// typed narrowly instead of `any` so drift-correction math stays type-safe.
interface YTPlayerLike {
  getCurrentTime: () => number;
  getPlayerState: () => number;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  playVideo: () => void;
  pauseVideo: () => void;
}
interface YTNamespace {
  Player: new (elementId: string, options: Record<string, unknown>) => YTPlayerLike;
  PlayerState: { PLAYING: number; PAUSED: number };
}

declare global {
  interface Window {
    YT: YTNamespace;
    onYouTubeIframeAPIReady: () => void;
  }
}

interface RoomInfo {
  id: string;
  video_id: string;
  host_id: string;
  visibility: 'private' | 'public';
  title: string;
  youtube_id: string;
}

interface RoomMessage {
  id: string;
  sender_id: string;
  message_text: string;
  created_at: string;
  senderName: string;
}

interface RoomMember {
  user_id: string;
  username: string;
}

export default function WatchRoomPage() {
  const params = useParams();
  const router = useRouter();
  const videoId = params.videoId as string;
  const roomId = params.roomId as string;

  const [userId, setUserId] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [draft, setDraft] = useState('');
  const [copied, setCopied] = useState(false);

  // Host status is derived from room + userId, never stored on its own —
  // both are already in scope everywhere it's needed, so a plain
  // comparison (not a ref, not a separate state) stays correct with zero
  // sync-up-with-two-sources-of-truth risk, and is safe to read at render
  // time (unlike a ref, which React's purity rules disallow reading during
  // render).
  const isHost = !!(room && userId && room.host_id === userId);

  const playerRef = useRef<YTPlayerLike | null>(null);
  const syncChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  // Separate from the `isHost` const above: that one is safe to read
  // during render (derived straight from state), this ref is for reading
  // inside event-handler/effect closures (YT player callbacks, broadcast
  // handlers) where a plain closure-captured boolean would go stale
  // between renders — refs are fine to read there, just not during render.
  const isHostRef = useRef(false);
  // ts: 0 sentinel means "no state observed yet" — deliberately not
  // Date.now() here, since calling an impure function during the initial
  // render (which is what a useRef initializer runs in) breaks React's
  // component-purity rules. Every real read of this ref happens inside an
  // effect/callback, never render, so the sentinel is only ever compared
  // against, not rendered.
  const lastKnownRef = useRef({ time: 0, ts: 0, playing: false });
  const scrollRef = useRef<HTMLDivElement>(null);
  const usernameCacheRef = useRef<Map<string, string>>(new Map());

  // ── auth + room load + auto-join ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setPostLoginRedirect(window.location.pathname); router.push('/login?next=' + encodeURIComponent(window.location.pathname)); return; }
      if (cancelled) return;
      setUserId(user.id);

      const { data: profile } = await supabase.from('creator_profiles').select('username').eq('user_id', user.id).single();
      if (profile?.username) usernameCacheRef.current.set(user.id, profile.username);

      // The shareable room link IS the invite for a private room — joining
      // is just adding yourself as a member, which the RLS policy allows
      // for any authenticated user (see migration comment). Do this before
      // fetching the room row, since a private room's SELECT policy only
      // allows host/existing-members through.
      await supabase.from('watch_room_members').upsert(
        { room_id: roomId, user_id: user.id },
        { onConflict: 'room_id,user_id', ignoreDuplicates: true }
      );

      const { data: roomRow, error } = await supabase
        .from('watch_rooms')
        .select('id, video_id, host_id, visibility, title, is_active, videos(youtube_id)')
        .eq('id', roomId)
        .single();

      if (error || !roomRow || !roomRow.is_active) {
        if (!cancelled) setLoadError("This room doesn't exist or has ended.");
        return;
      }
      if (cancelled) return;

      const videoRow = Array.isArray(roomRow.videos) ? roomRow.videos[0] : roomRow.videos;
      setRoom({
        id: roomRow.id,
        video_id: roomRow.video_id,
        host_id: roomRow.host_id,
        visibility: roomRow.visibility,
        title: roomRow.title,
        youtube_id: videoRow?.youtube_id ?? '',
      });
      isHostRef.current = roomRow.host_id === user.id;
    })();
    return () => { cancelled = true; };
  }, [roomId, router]);

  // ── username lookup helper (batched cache, same pattern as watch page) ──
  const resolveUsername = useCallback(async (uid: string): Promise<string> => {
    if (usernameCacheRef.current.has(uid)) return usernameCacheRef.current.get(uid)!;
    const { data } = await supabase.from('creator_profiles').select('username').eq('user_id', uid).single();
    const name = data?.username ?? 'viewer';
    usernameCacheRef.current.set(uid, name);
    return name;
  }, []);

  // ── chat history + postgres_changes for new messages/members ──
  useEffect(() => {
    if (!room || !userId) return;
    let cancelled = false;

    (async () => {
      const { data: rows } = await supabase
        .from('watch_room_messages')
        .select('id, sender_id, message_text, created_at')
        .eq('room_id', room.id)
        .order('created_at', { ascending: true });
      if (cancelled || !rows) return;
      const withNames = await Promise.all(rows.map(async r => ({
        ...r, senderName: await resolveUsername(r.sender_id),
      })));
      if (!cancelled) setMessages(withNames);

      const { data: memberRows } = await supabase.from('watch_room_members').select('user_id').eq('room_id', room.id);
      if (memberRows) {
        const withNames2 = await Promise.all(memberRows.map(async m => ({
          user_id: m.user_id, username: await resolveUsername(m.user_id),
        })));
        if (!cancelled) setMembers(withNames2);
      }
    })();

    const channel = supabase
      .channel(`watch-room-db-${room.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'watch_room_messages', filter: `room_id=eq.${room.id}` },
        async (payload) => {
          const row = payload.new as { id: string; sender_id: string; message_text: string; created_at: string };
          const senderName = await resolveUsername(row.sender_id);
          setMessages(prev => (prev.some(m => m.id === row.id) ? prev : [...prev, { ...row, senderName }]));
          setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 50);
        })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'watch_room_members', filter: `room_id=eq.${room.id}` },
        async (payload) => {
          const row = payload.new as { user_id: string };
          const username = await resolveUsername(row.user_id);
          setMembers(prev => (prev.some(m => m.user_id === row.user_id) ? prev : [...prev, { user_id: row.user_id, username }]));
        })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'watch_room_members', filter: `room_id=eq.${room.id}` },
        (payload) => {
          const row = payload.old as { user_id: string };
          setMembers(prev => prev.filter(m => m.user_id !== row.user_id));
        })
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [room, userId, resolveUsername]);

  // ── YouTube IFrame API + playback sync channel ──
  useEffect(() => {
    if (!room || !userId || !room.youtube_id) return;

    const syncChannel = supabase.channel(`watch-room-sync-${room.id}`, { config: { broadcast: { self: false } } });
    syncChannelRef.current = syncChannel;

    const sendState = (action: 'play' | 'pause' | 'seek' | 'sync') => {
      if (!playerRef.current || !isHostRef.current) return;
      const time = playerRef.current.getCurrentTime();
      const playing = action !== 'pause';
      lastKnownRef.current = { time, ts: Date.now(), playing };
      syncChannel.send({ type: 'broadcast', event: 'playback', payload: { action, time, ts: Date.now(), playing } });
    };

    syncChannel
      .on('broadcast', { event: 'playback' }, ({ payload }) => {
        if (isHostRef.current || !playerRef.current) return;
        const { time, ts, playing } = payload as { time: number; ts: number; playing: boolean };
        const latency = playing ? Math.max(0, (Date.now() - ts) / 1000) : 0;
        const target = time + latency;
        const current = playerRef.current.getCurrentTime?.() ?? 0;
        if (Math.abs(current - target) > DRIFT_TOLERANCE_SEC) {
          playerRef.current.seekTo(target, true);
        }
        const state = playerRef.current.getPlayerState?.();
        if (playing && state !== 1) playerRef.current.playVideo();
        if (!playing && state === 1) playerRef.current.pauseVideo();
      })
      .on('broadcast', { event: 'request-sync' }, () => {
        if (isHostRef.current) sendState('sync');
      })
      .subscribe(async (status: string) => {
        if (status === 'SUBSCRIBED' && !isHostRef.current) {
          syncChannel.send({ type: 'broadcast', event: 'request-sync', payload: {} });
        }
      });

    const initPlayer = () => {
      if (!document.getElementById('yt-sync-player')) return;
      playerRef.current = new window.YT.Player('yt-sync-player', {
        videoId: room.youtube_id,
        playerVars: { rel: 0, playsinline: 1 },
        events: {
          onStateChange: (e: { data: number }) => {
            if (!isHostRef.current) return;
            if (e.data === window.YT.PlayerState.PLAYING) sendState('play');
            if (e.data === window.YT.PlayerState.PAUSED) sendState('pause');
          },
        },
      });
    };

    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.body.appendChild(tag);
      window.onYouTubeIframeAPIReady = initPlayer;
    }

    // Heartbeat: host broadcasts a periodic sync tick while playing (so
    // late joiners / drift correct even with no play/pause/seek event),
    // and this is also how a host-side seek gets detected — the IFrame API
    // has no seek event, so a jump vs. the expected time on this tick IS
    // the seek signal.
    const heartbeat = setInterval(() => {
      if (!isHostRef.current || !playerRef.current?.getPlayerState) return;
      const state = playerRef.current.getPlayerState();
      if (state !== 1) return; // only while actually playing
      const actual = playerRef.current.getCurrentTime();
      const expected = lastKnownRef.current.playing
        ? lastKnownRef.current.time + (Date.now() - lastKnownRef.current.ts) / 1000
        : actual;
      if (Math.abs(actual - expected) > DRIFT_TOLERANCE_SEC) {
        sendState('seek');
      } else {
        sendState('sync');
      }
    }, HEARTBEAT_MS);

    return () => {
      clearInterval(heartbeat);
      supabase.removeChannel(syncChannel);
    };
  }, [room, userId]);

  const sendMessage = async () => {
    if (!draft.trim() || !room || !userId) return;
    const text = draft.trim();
    setDraft('');
    await supabase.from('watch_room_messages').insert({ room_id: room.id, sender_id: userId, message_text: text });
  };

  const copyInvite = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const leaveRoom = async () => {
    if (userId && room) await supabase.from('watch_room_members').delete().eq('room_id', room.id).eq('user_id', userId);
    router.push(`/katube/watch/${videoId}`);
  };

  if (loadError) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
        <p style={{ fontSize: '15px' }}>{loadError}</p>
        <Link href={`/katube/watch/${videoId}`} style={{ color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><ArrowLeft size={14} strokeWidth={2} /> Back to video</Link>
      </div>
    );
  }

  if (!room) {
    return <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }} />;
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 10, background: 'var(--nav-bg)', borderBottom: '1px solid var(--border-color)',
        padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <Link href={`/katube/watch/${videoId}`} style={{ color: 'var(--text-tertiary)', textDecoration: 'none', display: 'flex' }}><ArrowLeft size={18} strokeWidth={2} /></Link>
          <span style={{ fontWeight: 700, fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <Users size={14} /> {room.title}
          </span>
          <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: 'var(--bg-card)', color: 'var(--text-tertiary)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            {room.visibility === 'private' ? <Lock size={10} /> : <Globe size={10} />} {room.visibility === 'private' ? 'Private' : 'Public'} room
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button onClick={copyInvite} style={{
            fontSize: '12px', padding: '7px 12px', borderRadius: '8px', border: '1px solid var(--border-color)',
            background: 'var(--bg-card)', color: 'var(--text-primary)', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: '6px',
          }}>{copied ? <><Check size={13} /> Copied</> : <><Link2 size={13} /> Invite a friend</>}</button>
          <button onClick={leaveRoom} style={{
            fontSize: '12px', padding: '7px 12px', borderRadius: '8px', border: '1px solid var(--border-color)',
            background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer',
          }}>Leave</button>
          <ThemeToggle />
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', maxWidth: '1400px', margin: '0 auto', padding: '16px', gap: '16px' }}>
        <div style={{ flex: '2 1 640px', minWidth: 0 }}>
          <div style={{ position: 'relative', paddingTop: '56.25%', borderRadius: '12px', overflow: 'hidden', background: '#000' }}>
            <div id="yt-sync-player" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '10px' }}>
            {isHost
              ? "You're the host — your play/pause/seek controls what everyone else sees."
              : "Playback follows the room host — your controls stay local and self-correct back in sync."}
          </p>
          <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {members.map(m => (
              <span key={m.user_id} style={{
                fontSize: '11px', padding: '4px 10px', borderRadius: '12px', background: 'var(--bg-card)',
                border: '1px solid var(--border-color)', color: 'var(--text-secondary)',
              }}>
                {m.user_id === room.host_id ? <Crown size={11} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '3px' }} /> : ''}{m.username}
              </span>
            ))}
          </div>
        </div>

        <div style={{
          flex: '1 1 300px', minWidth: '280px', display: 'flex', flexDirection: 'column',
          border: '1px solid var(--border-color)', borderRadius: '12px', background: 'var(--bg-card)', maxHeight: '560px',
        }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-color)', fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <MessageCircle size={14} /> Room chat
          </div>
          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {messages.map(m => (
              <div key={m.id} style={{ fontSize: '12.5px' }}>
                <span style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>{m.senderName}: </span>
                <span style={{ color: 'var(--text-primary)' }}>{m.message_text}</span>
              </div>
            ))}
            {messages.length === 0 && <p style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Say hi 👋</p>}
          </div>
          <div style={{ padding: '10px', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '8px' }}>
            <input
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') sendMessage(); }}
              placeholder="Message the room..."
              style={{
                flex: 1, fontSize: '13px', padding: '8px 10px', borderRadius: '8px',
                border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)',
              }}
            />
            <button onClick={sendMessage} style={{
              fontSize: '13px', padding: '8px 14px', borderRadius: '8px', border: 'none',
              background: 'var(--text-primary)', color: 'var(--bg-primary)', cursor: 'pointer', fontWeight: 700,
            }}>Send</button>
          </div>
        </div>
      </div>
    </div>
  );
}
