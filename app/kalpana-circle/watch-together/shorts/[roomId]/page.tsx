'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../../lib/supabase';

// ── Kalpana Circle — Fast tap (Shorts) Watch Together ──
//
// The Shorts sibling of the long-video Sync-Play room
// (app/katube/watch/[videoId]/room/[roomId]/page.tsx). Same
// host-authoritative sync philosophy, but what's synced is different:
// there's no play/pause/seek to track — a "short" is just autoplay-until-
// done — so the only thing that needs to stay in lockstep across everyone
// in the room is *which short is currently on screen*. Host scrolls/swipes,
// everyone else's feed follows.
//
// The other real difference from the long-video room: two distinct message
// types instead of one "room chat" —
//   - "Comment" -> public, writes into video_comments (the same table the
//     normal watch page uses) — visible to anyone, tied to that one short.
//   - "Chat" -> private, writes into kcircle_messages for a Watch Together
//     thread resolved automatically from whoever's actually present in the
//     room right now (Realtime Presence on the sync channel) — the
//     "Participant-Set" approach: exact set of online user_ids -> a
//     deterministic thread (kcircle_get_or_create_watch_thread RPC,
//     see migration 20260815210000). Same set reunites -> same thread
//     reused; set changes -> a different thread. Needs >=2 people present
//     (1:1 is just the 2-person case). Real, permanent chat history —
//     visible later from the "Watch Together chats" list on the parent
//     page — tagged with short_ref_id so it can point back at which short
//     a message was about.
//
// Layout: desktop is a flex row — short feed on the LEFT, chat/comment
// panel on the RIGHT (deliberately the mirror of the long-video room,
// which is video-top/chat-bottom — see that file's header comment).
// Mobile is full-bleed vertical video (matches KaTube's own Shorts feed,
// app/katube/shorts/[shortId]/page.tsx) with the chat/comment panel
// collapsed into a Reels-style bottom sheet, toggled by a floating button —
// there's no room for a persistent side panel at 9:16 full-screen, and a
// bottom sheet is the pattern viewers already know from Instagram/YouTube.

const HEARTBEAT_MS = 5000;
const DESKTOP_BREAKPOINT = 860;

interface RoomInfo {
  id: string;
  host_id: string;
  visibility: 'private' | 'public';
  title: string;
}

interface ShortItem {
  id: string;
  title: string;
  youtube_id: string;
  creator: string;
}

interface ChatMsg {
  id: string;
  sender_id: string;
  text: string | null;
  short_ref_id: string | null;
  created_at: string;
  senderName: string;
}

interface CommentMsg {
  id: string;
  commenter_id: string;
  comment_text: string;
  created_at: string;
  commenterName: string;
}

interface RoomMember {
  user_id: string;
  username: string;
}

type PanelTab = 'chat' | 'comment';

export default function FastTapWatchTogetherRoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.roomId as string;

  const [userId, setUserId] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Watch Together Chat — who's actually present right now (Presence),
  // and the thread that set of people resolves to (null until >=2 are
  // present and the RPC has resolved a thread id).
  const [presentIds, setPresentIds] = useState<string[]>([]);
  const [chatThreadId, setChatThreadId] = useState<string | null>(null);
  const [busyMsgId, setBusyMsgId] = useState<string | null>(null);

  const [shorts, setShorts] = useState<ShortItem[]>([]);
  const [shortsLoading, setShortsLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);

  const [members, setMembers] = useState<RoomMember[]>([]);
  const [tab, setTab] = useState<PanelTab>('chat');
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [comments, setComments] = useState<CommentMsg[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState('');
  const [copied, setCopied] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false); // mobile bottom sheet
  const [muted, setMuted] = useState(true);

  const isHost = !!(room && userId && room.host_id === userId);
  const isHostRef = useRef(false);
  const activeIndexRef = useRef(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const iframeRefs = useRef<Record<number, HTMLIFrameElement | null>>({});
  const syncChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const usernameCacheRef = useRef<Map<string, string>>(new Map());
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const activeShort = shorts[activeIndex] as ShortItem | undefined;

  // ── auth + room load + auto-join ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push(`/login?next=/kalpana-circle/watch-together/shorts/${roomId}`); return; }
      if (cancelled) return;
      setUserId(user.id);

      const { data: profile } = await supabase.from('creator_profiles').select('username').eq('user_id', user.id).single();
      if (profile?.username) usernameCacheRef.current.set(user.id, profile.username);

      // Shareable link IS the invite, same as the long-video room.
      await supabase.from('watch_room_members').upsert(
        { room_id: roomId, user_id: user.id },
        { onConflict: 'room_id,user_id', ignoreDuplicates: true }
      );

      const { data: roomRow, error } = await supabase
        .from('watch_rooms')
        .select('id, host_id, visibility, title, is_active, mode, current_short_id, video_id')
        .eq('id', roomId)
        .single();

      if (error || !roomRow || !roomRow.is_active || roomRow.mode !== 'shorts') {
        if (!cancelled) setLoadError("This room doesn't exist, has ended, or isn't a Fast tap room.");
        return;
      }
      if (cancelled) return;

      setRoom({
        id: roomRow.id, host_id: roomRow.host_id, visibility: roomRow.visibility, title: roomRow.title,
      });
      isHostRef.current = roomRow.host_id === user.id;

      // Load the Shorts feed + land on wherever the room currently is
      // (current_short_id — falls back to video_id for a room created
      // before that column existed, then to the first short).
      const { data: shortRows } = await supabase
        .from('videos').select('id, title, youtube_id, creator_id')
        .eq('is_short', true).order('created_at', { ascending: false }).limit(50);
      if (cancelled || !shortRows) return;

      const creatorIds = [...new Set(shortRows.map(r => r.creator_id))];
      const { data: creators } = await supabase.from('creator_profiles').select('user_id, username').in('user_id', creatorIds);
      const creatorMap = new Map((creators || []).map(c => [c.user_id, c.username]));
      const list: ShortItem[] = shortRows.map(r => ({
        id: r.id, title: r.title, youtube_id: r.youtube_id, creator: creatorMap.get(r.creator_id) || 'MANGAL Creator',
      }));
      setShorts(list);

      const landingId = roomRow.current_short_id ?? roomRow.video_id;
      const startIdx = Math.max(0, list.findIndex(s => s.id === landingId));
      setActiveIndex(startIdx);
      activeIndexRef.current = startIdx;
      setShortsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [roomId, router]);

  // Scroll to the starting short once mounted.
  useEffect(() => {
    if (shortsLoading || shorts.length === 0) return;
    sectionRefs.current[activeIndex]?.scrollIntoView({ behavior: 'auto' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortsLoading]);

  const resolveUsername = useCallback(async (uid: string): Promise<string> => {
    if (usernameCacheRef.current.has(uid)) return usernameCacheRef.current.get(uid)!;
    const { data } = await supabase.from('creator_profiles').select('username').eq('user_id', uid).single();
    const name = data?.username ?? 'viewer';
    usernameCacheRef.current.set(uid, name);
    return name;
  }, []);

  // ── member list (postgres_changes, same pattern as the long-video room) ──
  useEffect(() => {
    if (!room || !userId) return;
    let cancelled = false;
    (async () => {
      const { data: memberRows } = await supabase.from('watch_room_members').select('user_id').eq('room_id', room.id);
      if (memberRows) {
        const withNames = await Promise.all(memberRows.map(async m => ({ user_id: m.user_id, username: await resolveUsername(m.user_id) })));
        if (!cancelled) setMembers(withNames);
      }
    })();
    const channel = supabase
      .channel(`watch-room-shorts-members-${room.id}`)
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

  // ── presence — who's actually here right now, drives the Chat thread ──
  // Separate small channel from the nav-sync one (below) so presence
  // tracking/untracking doesn't get tangled with the broadcast-heavy
  // navigate/heartbeat traffic on that channel.
  useEffect(() => {
    if (!room || !userId) return;
    const presenceChannel = supabase.channel(`watch-room-shorts-presence-${room.id}`, { config: { presence: { key: userId } } });
    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        setPresentIds(Object.keys(state));
      })
      .subscribe(async (status: string) => {
        if (status === 'SUBSCRIBED') await presenceChannel.track({ user_id: userId, online_at: new Date().toISOString() });
      });
    return () => { supabase.removeChannel(presenceChannel); };
  }, [room, userId]);

  // Resolve the current present set to a thread id whenever it changes
  // (debounced by only re-calling when the sorted key actually changes —
  // presence 'sync' can fire more than once for the same effective set).
  const lastResolvedKeyRef = useRef<string>('');
  useEffect(() => {
    if (!userId) return;
    const sorted = [...new Set(presentIds)].sort();
    if (sorted.length < 2) {
      lastResolvedKeyRef.current = '';
      /* eslint-disable-next-line react-hooks/set-state-in-effect */
      setChatThreadId(null);
      return;
    }
    const key = sorted.join(',');
    if (key === lastResolvedKeyRef.current) return;
    lastResolvedKeyRef.current = key;
    (async () => {
      const { data, error } = await supabase.rpc('kcircle_get_or_create_watch_thread', { p_participant_ids: sorted });
      if (!error && data) setChatThreadId(data as string);
    })();
  }, [presentIds, userId]);

  // ── navigation sync — ephemeral Broadcast channel, host-authoritative ──
  // Mirrors the long-video room's playback sync channel (see that file's
  // header comment for why Broadcast rather than Postgres), but the
  // payload here is just "which short" instead of play/pause/seek/time.
  useEffect(() => {
    if (!room || !userId || shorts.length === 0) return;

    const syncChannel = supabase.channel(`watch-room-shorts-sync-${room.id}`, { config: { broadcast: { self: false } } });
    syncChannelRef.current = syncChannel;

    const broadcastNav = (index: number) => {
      if (!isHostRef.current) return;
      const short = shorts[index];
      if (!short) return;
      syncChannel.send({ type: 'broadcast', event: 'navigate', payload: { index, shortId: short.id } });
      // Persist so a late joiner lands on the current short, not the first.
      supabase.from('watch_rooms').update({ current_short_id: short.id }).eq('id', room.id);
    };

    syncChannel
      .on('broadcast', { event: 'navigate' }, ({ payload }) => {
        if (isHostRef.current) return;
        const { index } = payload as { index: number; shortId: string };
        if (index === activeIndexRef.current || !sectionRefs.current[index]) return;
        activeIndexRef.current = index;
        setActiveIndex(index);
        sectionRefs.current[index]?.scrollIntoView({ behavior: 'smooth' });
      })
      .on('broadcast', { event: 'request-sync' }, () => {
        if (isHostRef.current) broadcastNav(activeIndexRef.current);
      })
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED' && !isHostRef.current) {
          syncChannel.send({ type: 'broadcast', event: 'request-sync', payload: {} });
        }
      });

    // Periodic re-broadcast so a viewer who joined mid-way (missed the
    // 'navigate' event and whose 'request-sync' raced the host's own
    // subscribe) still converges within one heartbeat.
    const heartbeat = setInterval(() => broadcastNav(activeIndexRef.current), HEARTBEAT_MS);

    return () => { clearInterval(heartbeat); supabase.removeChannel(syncChannel); };
  }, [room, userId, shorts]);

  // ── host's own IntersectionObserver drives navigation ──
  // Only the host's scroll actually moves the room (see header comment) —
  // a non-host's container still scrolls locally (feels responsive) but
  // any observed index change from a non-host is a no-op; the broadcast
  // channel above is what actually keeps everyone in sync, and pulls a
  // wandering viewer back within one heartbeat.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || shorts.length === 0) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
          const idx = Number((entry.target as HTMLElement).dataset.index);
          activeIndexRef.current = idx;
          setActiveIndex(idx);
          if (isHostRef.current) {
            const short = shorts[idx];
            if (short) {
              syncChannelRef.current?.send({ type: 'broadcast', event: 'navigate', payload: { index: idx, shortId: short.id } });
              supabase.from('watch_rooms').update({ current_short_id: short.id }).eq('id', room?.id);
            }
          }
        }
      });
    }, { root: container, threshold: 0.5 });
    sectionRefs.current.forEach(el => el && observer.observe(el));
    return () => observer.disconnect();
  }, [shorts, room?.id]);

  // ── chat history + realtime — keyed on the resolved participant-set thread ──
  useEffect(() => {
    if (!chatThreadId || !userId) {
      // Reacting to a prop change (thread not resolved yet / <2 present)
      // by clearing stale messages is the same legitimate synchronous
      // setState-in-effect exception already used elsewhere in this
      // codebase (see app/kalpana-circle/watch-together/page.tsx's
      // video-search clear).
      /* eslint-disable-next-line react-hooks/set-state-in-effect */
      setChatMessages([]);
      return;
    }
    let cancelled = false;
    const conversationId = chatThreadId;
    (async () => {
      const [{ data: rows }, { data: hidden }] = await Promise.all([
        supabase.from('kcircle_messages').select('id, sender_id, text, short_ref_id, created_at')
          .eq('conversation_id', conversationId).order('created_at', { ascending: true }).limit(200),
        supabase.from('kcircle_message_hidden_for').select('message_id').eq('user_id', userId),
      ]);
      if (cancelled || !rows) return;
      const hiddenIds = new Set((hidden ?? []).map(h => h.message_id));
      const visible = rows.filter(r => !hiddenIds.has(r.id));
      const withNames = await Promise.all(visible.map(async r => ({ ...r, senderName: await resolveUsername(r.sender_id) })));
      if (!cancelled) setChatMessages(withNames);
    })();
    const channel = supabase
      .channel(`watch-room-shorts-chat-${conversationId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'kcircle_messages', filter: `conversation_id=eq.${conversationId}` },
        async (payload) => {
          const row = payload.new as { id: string; sender_id: string; text: string | null; short_ref_id: string | null; created_at: string };
          const senderName = await resolveUsername(row.sender_id);
          setChatMessages(prev => (prev.some(m => m.id === row.id) ? prev : [...prev, { ...row, senderName }]));
          setTimeout(() => chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' }), 50);
        })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'kcircle_messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const row = payload.old as { id: string };
          setChatMessages(prev => prev.filter(m => m.id !== row.id));
        })
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [chatThreadId, userId, resolveUsername]);

  // ── public comments for the current short ──
  useEffect(() => {
    if (!activeShort) return;
    let cancelled = false;
    (async () => {
      const { data: rows } = await supabase
        .from('video_comments').select('id, commenter_id, comment_text, created_at')
        .eq('video_id', activeShort.id).order('created_at', { ascending: false }).limit(100);
      if (cancelled || !rows) return;
      const withNames = await Promise.all(rows.map(async r => ({ ...r, commenterName: await resolveUsername(r.commenter_id) })));
      if (!cancelled) setComments(withNames);
    })();
    return () => { cancelled = true; };
  }, [activeShort, resolveUsername]);

  const sendChat = async () => {
    if (!draft.trim() || !chatThreadId || !userId || !activeShort) return;
    const text = draft.trim();
    setDraft(''); setChatError(''); setSending(true);
    const { error } = await supabase.from('kcircle_messages').insert({
      conversation_id: chatThreadId, sender_id: userId, text, short_ref_id: activeShort.id,
    });
    if (!error) await supabase.from('kcircle_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', chatThreadId);
    setSending(false);
    if (error) { setDraft(text); setChatError("Couldn't send — try again."); }
  };

  const deleteMsgForMe = async (messageId: string) => {
    if (!userId) return;
    setBusyMsgId(messageId);
    await supabase.from('kcircle_message_hidden_for').insert({ message_id: messageId, user_id: userId });
    setChatMessages(prev => prev.filter(m => m.id !== messageId));
    setBusyMsgId(null);
  };

  const deleteMsgForBoth = async (messageId: string) => {
    setBusyMsgId(messageId);
    await supabase.from('kcircle_messages').delete().eq('id', messageId);
    setChatMessages(prev => prev.filter(m => m.id !== messageId));
    setBusyMsgId(null);
  };

  const sendComment = async () => {
    if (!draft.trim() || !userId || !activeShort) return;
    const text = draft.trim();
    setDraft(''); setSending(true);
    const { error, data } = await supabase.from('video_comments').insert({
      video_id: activeShort.id, commenter_id: userId, comment_text: text,
    }).select('id, created_at').single();
    setSending(false);
    if (error) { setDraft(text); return; }
    setComments(prev => [{ id: data.id, commenter_id: userId, comment_text: text, created_at: data.created_at, commenterName: usernameCacheRef.current.get(userId) ?? 'you' }, ...prev]);
  };

  const send = () => { if (tab === 'chat') { sendChat(); } else { sendComment(); } };

  const copyInvite = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const leaveRoom = async () => {
    if (userId && room) await supabase.from('watch_room_members').delete().eq('room_id', room.id).eq('user_id', userId);
    router.push('/kalpana-circle/watch-together');
  };

  // Short title lookup for the "📎 About this Short" chat pointer.
  const shortTitleFor = useCallback((id: string | null) => {
    if (!id) return null;
    return shorts.find(s => s.id === id)?.title ?? null;
  }, [shorts]);

  const toggleMuted = () => setMuted(m => !m);
  useEffect(() => {
    const frame = iframeRefs.current[activeIndex];
    if (!frame) return;
    const send2 = () => frame.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: muted ? 'mute' : 'unMute', args: [] }), '*');
    const timers = [0, 300, 800, 1500].map(d => setTimeout(send2, d));
    return () => timers.forEach(clearTimeout);
  }, [activeIndex, muted, shorts.length]);

  if (loadError) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px', background: '#000', color: '#fff' }}>
        <p style={{ fontSize: '15px' }}>{loadError}</p>
        <Link href="/kalpana-circle/watch-together" style={{ color: '#f97316' }}>← Back to Watch Together</Link>
      </div>
    );
  }
  if (!room) return <div style={{ minHeight: '100vh', background: '#000' }} />;

  const PanelInner = (
    <>
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
        <button onClick={() => setTab('chat')} style={{
          flex: 1, padding: '11px 0', fontSize: '12.5px', fontWeight: 800, cursor: 'pointer', border: 'none',
          background: tab === 'chat' ? 'rgba(124,58,237,0.18)' : 'transparent',
          color: tab === 'chat' ? '#c4b5fd' : 'rgba(255,255,255,0.6)',
          borderBottom: tab === 'chat' ? '2px solid #7c3aed' : '2px solid transparent',
        }}>💬 Chat</button>
        <button onClick={() => setTab('comment')} style={{
          flex: 1, padding: '11px 0', fontSize: '12.5px', fontWeight: 800, cursor: 'pointer', border: 'none',
          background: tab === 'comment' ? 'rgba(124,58,237,0.18)' : 'transparent',
          color: tab === 'comment' ? '#c4b5fd' : 'rgba(255,255,255,0.6)',
          borderBottom: tab === 'comment' ? '2px solid #7c3aed' : '2px solid transparent',
        }}>🗨️ Comments</button>
      </div>

      {tab === 'chat' ? (
        !chatThreadId ? (
          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', padding: '16px', lineHeight: 1.5 }}>
            👋 Waiting for at least one more person to join this room — Chat saves automatically as a Watch Together
            chat with whoever&apos;s actually watching with you. Use Comment meanwhile, it&apos;s public.
          </p>
        ) : (
          <>
            <div ref={chatScrollRef} style={{ flex: 1, overflowY: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <p style={{ fontSize: '10.5px', color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
                Saved as a Watch Together chat — view it anytime from K Circle&apos;s Watch Together tab.
              </p>
              {chatMessages.map(m => {
                const refTitle = shortTitleFor(m.short_ref_id);
                return (
                  <div key={m.id} style={{ fontSize: '12.5px' }}>
                    {refTitle && (
                      <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginBottom: '2px' }}>
                        📎 About this Short: {refTitle}
                      </div>
                    )}
                    <span style={{ fontWeight: 700, color: 'rgba(255,255,255,0.75)' }}>{m.senderName}: </span>
                    <span style={{ color: '#fff' }}>{m.text}</span>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '2px' }}>
                      <button disabled={busyMsgId === m.id} onClick={() => deleteMsgForMe(m.id)} style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Delete for me</button>
                      <button disabled={busyMsgId === m.id} onClick={() => deleteMsgForBoth(m.id)} style={{ fontSize: '9px', color: '#f87171', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Delete for both</button>
                    </div>
                  </div>
                );
              })}
              {chatMessages.length === 0 && <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>Say hi 👋</p>}
            </div>
            {chatError && <p style={{ fontSize: '11px', color: '#f87171', padding: '0 14px' }}>{chatError}</p>}
          </>
        )
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <p style={{ fontSize: '10.5px', color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
            Public comments on this Short — visible to anyone.
          </p>
          {comments.map(c => (
            <div key={c.id} style={{ fontSize: '12.5px' }}>
              <span style={{ fontWeight: 700, color: 'rgba(255,255,255,0.75)' }}>{c.commenterName}: </span>
              <span style={{ color: '#fff' }}>{c.comment_text}</span>
            </div>
          ))}
          {comments.length === 0 && <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>No comments yet.</p>}
        </div>
      )}

      <div style={{ padding: '10px', borderTop: '1px solid rgba(255,255,255,0.12)', display: 'flex', gap: '8px', flexShrink: 0 }}>
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') send(); }}
          disabled={tab === 'chat' && !chatThreadId}
          placeholder={tab === 'chat' ? 'Message…' : 'Add a public comment…'}
          style={{
            flex: 1, fontSize: '13px', padding: '8px 10px', borderRadius: '8px',
            border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.06)', color: '#fff',
          }}
        />
        <button onClick={send} disabled={sending || (tab === 'chat' && !chatThreadId)} style={{
          fontSize: '13px', padding: '8px 14px', borderRadius: '8px', border: 'none',
          background: '#f97316', color: '#000', cursor: 'pointer', fontWeight: 700,
        }}>Send</button>
      </div>
    </>
  );

  return (
    <div style={{ height: '100vh', width: '100%', background: '#000', color: '#fff', overflow: 'hidden' }}>
      <style>{`
        .ktroom-shell { display: flex; height: 100vh; }
        .ktroom-side-panel { display: flex; flex-direction: column; width: 340px; flex-shrink: 0; border-left: 1px solid rgba(255,255,255,0.12); }
        .ktroom-mobile-toggle { display: none; }
        .ktroom-mobile-sheet { display: none; }
        @media (max-width: ${DESKTOP_BREAKPOINT}px) {
          .ktroom-side-panel { display: none; }
          .ktroom-mobile-toggle { display: flex; }
          .ktroom-mobile-sheet.open { display: flex; }
        }
      `}</style>

      <div className="ktroom-shell">
        <div style={{ position: 'relative', flex: 1, minWidth: 0, height: '100vh' }}>
          <Link href="/kalpana-circle/watch-together" style={{
            position: 'absolute', top: '16px', left: '16px', zIndex: 20,
            width: '38px', height: '38px', borderRadius: '50%', background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '16px', textDecoration: 'none',
          }}>←</Link>

          <div style={{
            position: 'absolute', top: '16px', left: '64px', right: '16px', zIndex: 20,
            display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: '12.5px', fontWeight: 800, background: 'rgba(0,0,0,0.5)', padding: '6px 10px', borderRadius: '14px' }}>
              ⚡ {room.title}
            </span>
            <span style={{ fontSize: '10.5px', fontWeight: 700, background: 'rgba(0,0,0,0.5)', padding: '5px 9px', borderRadius: '12px', color: 'rgba(255,255,255,0.7)' }}>
              {room.visibility === 'private' ? '🔒 Private' : '🌐 Public'} · {members.length} watching
            </span>
          </div>

          <div style={{ position: 'absolute', top: '16px', right: '16px', zIndex: 20, display: 'flex', gap: '8px' }}>
            <button onClick={copyInvite} style={{
              fontSize: '11px', fontWeight: 700, padding: '7px 10px', borderRadius: '14px', border: 'none',
              background: 'rgba(0,0,0,0.5)', color: '#fff', cursor: 'pointer',
            }}>{copied ? '✓' : '🔗'}</button>
            <button onClick={leaveRoom} style={{
              fontSize: '11px', fontWeight: 700, padding: '7px 10px', borderRadius: '14px', border: 'none',
              background: 'rgba(0,0,0,0.5)', color: '#fff', cursor: 'pointer',
            }}>Leave</button>
          </div>

          {!isHost && (
            <div style={{
              position: 'absolute', bottom: '14px', left: '50%', transform: 'translateX(-50%)', zIndex: 20,
              fontSize: '10.5px', fontWeight: 700, color: 'rgba(255,255,255,0.65)', background: 'rgba(0,0,0,0.45)',
              padding: '5px 12px', borderRadius: '12px', whiteSpace: 'nowrap',
            }}>Following the host&apos;s scroll</div>
          )}

          {shortsLoading ? (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.6)', fontSize: '13px' }}>Loading…</div>
          ) : shorts.length === 0 ? (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>No Shorts yet.</div>
          ) : (
            <div ref={containerRef} style={{ height: '100%', width: '100%', overflowY: 'scroll', scrollSnapType: 'y mandatory', scrollBehavior: 'smooth' }}>
              {shorts.map((short, idx) => {
                const isNear = Math.abs(idx - activeIndex) <= 1;
                const isActive = idx === activeIndex;
                return (
                  <div key={short.id} ref={el => { sectionRefs.current[idx] = el; }} data-index={idx} style={{
                    height: '100%', width: '100%', scrollSnapAlign: 'start',
                    position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000',
                  }}>
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
                        <img src={`https://img.youtube.com/vi/${short.youtube_id}/hqdefault.jpg`} alt={short.title}
                          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                      )}
                      <div style={{
                        position: 'absolute', bottom: 0, left: 0, right: '70px', padding: '16px 60px 20px 16px',
                        background: 'linear-gradient(to top, rgba(0,0,0,0.75), transparent)', zIndex: 5,
                      }}>
                        <div style={{ color: '#fff', fontWeight: 800, fontSize: '13.5px', marginBottom: '4px' }}>@{short.creator}</div>
                        <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: '12.5px', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{short.title}</div>
                      </div>

                      {/* Right-edge icons — mute + mobile-only Chat/Comment toggle that opens the bottom sheet */}
                      <div style={{ position: 'absolute', bottom: '20px', right: '10px', zIndex: 5, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '18px' }}>
                        <button onClick={() => { setTab('comment'); setSheetOpen(true); }} className="ktroom-mobile-toggle" style={{ background: 'none', border: 0, cursor: 'pointer', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                          <span style={{ fontSize: '24px' }}>🗨️</span>
                          <span style={{ color: '#fff', fontSize: '11px', fontWeight: 700 }}>Comment</span>
                        </button>
                        <button onClick={() => { setTab('chat'); setSheetOpen(true); }} className="ktroom-mobile-toggle" style={{ background: 'none', border: 0, cursor: 'pointer', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                          <span style={{ fontSize: '24px' }}>💬</span>
                          <span style={{ color: '#fff', fontSize: '11px', fontWeight: 700 }}>Chat</span>
                        </button>
                        {isActive && (
                          <button onClick={toggleMuted} style={{ background: 'none', border: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
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
        </div>

        {/* Desktop: persistent right-side panel, video LEFT / chat RIGHT per spec */}
        <div className="ktroom-side-panel">{PanelInner}</div>
      </div>

      {/* Mobile: Reels-style bottom sheet instead of a persistent side panel — full 9:16
          screen has no room for one, and a sheet is the pattern viewers already know. */}
      <div className={`ktroom-mobile-sheet${sheetOpen ? ' open' : ''}`} onClick={() => setSheetOpen(false)} style={{
        position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.5)', alignItems: 'flex-end', flexDirection: 'column',
      }}>
        <div onClick={e => e.stopPropagation()} style={{
          width: '100%', maxHeight: '62vh', background: '#0a0a0a', borderTopLeftRadius: '18px', borderTopRightRadius: '18px',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 0' }}>
            <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.25)' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '4px 10px 0' }}>
            <button onClick={() => setSheetOpen(false)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '18px', cursor: 'pointer' }}>✕</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: '340px' }}>{PanelInner}</div>
        </div>
      </div>
    </div>
  );
}
