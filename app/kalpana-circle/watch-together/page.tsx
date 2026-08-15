'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import ThemeToggle from '../../components/ThemeToggle';
import { useKCircleTheme } from '../theme';
import { supabase } from '../../lib/supabase';

// ── Kalpana Circle — Watch Together tab ──
// Second entry point into Sync-Play Watch Rooms (the first is the
// "Watch with Friends" button on each KaTube video). This tab is where
// public rooms are actually discoverable — KaTube's own "Watch with
// Friends" always makes a private room, per the founder's spec, since
// KaTube already IS the public-watching surface. Kalpana Circle is the
// community space, so a browsable "anyone can join" room list belongs
// here instead.

const RADIANT_SOLID = '#7c3aed';

type RoomMode = 'video' | 'shorts';

interface PublicRoom {
  id: string;
  title: string;
  video_id: string | null;
  host_id: string;
  hostName: string;
  memberCount: number;
  mode: RoomMode;
}

interface MyRoom {
  id: string;
  video_id: string | null;
  title: string;
  is_host: boolean;
  mode: RoomMode;
}

interface VideoOption {
  id: string;
  title: string;
  youtube_id: string;
}

interface WatchThread {
  id: string;
  otherNames: string[];
  lastMessageAt: string;
  lastMessagePreview: string;
}

// Where a room's "open" link points — video-mode rooms use the existing
// KaTube synced-player room; shorts-mode rooms get their own feed-style
// room page (video-left/chat-right on desktop, Reels-style bottom sheet on
// mobile — see app/kalpana-circle/watch-together/shorts/[roomId]/page.tsx).
function roomHref(r: { mode: RoomMode; video_id: string | null; id: string }) {
  return r.mode === 'shorts'
    ? `/kalpana-circle/watch-together/shorts/${r.id}`
    : `/katube/watch/${r.video_id}/room/${r.id}`;
}

export default function WatchTogetherPage() {
  const { setIsLight, themeVars, dataTheme } = useKCircleTheme();
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [publicRooms, setPublicRooms] = useState<PublicRoom[]>([]);
  const [myRooms, setMyRooms] = useState<MyRoom[]>([]);
  const [loading, setLoading] = useState(true);

  // Create-room flow: 'closed' -> 'pick-mode' (Fast tap/Shorts vs Slow
  // tap/long video) -> 'pick-video' (Slow tap) or 'pick-visibility' (Fast
  // tap — no group-picker step anymore; a Fast tap room's Chat now forms
  // its own thread automatically from whoever's actually watching, see
  // shorts/[roomId]/page.tsx).
  const [createStep, setCreateStep] = useState<'closed' | 'pick-mode' | 'pick-video' | 'pick-visibility'>('closed');
  const [videoQuery, setVideoQuery] = useState('');
  const [videoResults, setVideoResults] = useState<VideoOption[]>([]);
  const [creating, setCreating] = useState(false);

  // Watch Together chat history — participant-set threads I'm part of.
  const [watchThreads, setWatchThreads] = useState<WatchThread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [saveHistory, setSaveHistory] = useState(true);

  const loadRooms = useCallback(async (uid: string) => {
    const { data: publicRows } = await supabase
      .from('watch_rooms')
      .select('id, title, video_id, host_id, mode')
      .eq('visibility', 'public')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(30);

    if (publicRows) {
      const withDetails = await Promise.all(publicRows.map(async r => {
        const [{ data: hostProfile }, { count }] = await Promise.all([
          supabase.from('creator_profiles').select('username').eq('user_id', r.host_id).single(),
          supabase.from('watch_room_members').select('user_id', { count: 'exact', head: true }).eq('room_id', r.id),
        ]);
        return { ...r, hostName: hostProfile?.username ?? 'someone', memberCount: count ?? 0 };
      }));
      setPublicRooms(withDetails);
    }

    // "My rooms" — rooms I host or am a member of, so a private room I
    // created (or was invited into) is easy to jump back into without
    // needing the original link again.
    const { data: memberRows } = await supabase.from('watch_room_members').select('room_id').eq('user_id', uid);
    const roomIds = (memberRows ?? []).map(m => m.room_id);
    if (roomIds.length > 0) {
      const { data: rooms } = await supabase.from('watch_rooms').select('id, video_id, title, host_id, is_active, mode').in('id', roomIds).eq('is_active', true);
      if (rooms) setMyRooms(rooms.map(r => ({ id: r.id, video_id: r.video_id, title: r.title, is_host: r.host_id === uid, mode: r.mode })));
    }
    setLoading(false);
  }, []);

  // Watch Together threads — conversations flagged is_watch_thread that
  // I'm a participant in, with history_enabled true on MY row (so a
  // thread I opted out of saving simply doesn't show up in my own list,
  // even if it's still visible to the other side — see migration
  // 20260815210000's header comment on why that's the chosen tradeoff).
  const loadWatchThreads = useCallback(async (uid: string) => {
    setThreadsLoading(true);
    const { data: myRows } = await supabase
      .from('kcircle_conversation_participants')
      .select('conversation_id, history_enabled')
      .eq('user_id', uid)
      .eq('history_enabled', true);
    const convoIds = (myRows ?? []).map(r => r.conversation_id);
    if (convoIds.length === 0) { setWatchThreads([]); setThreadsLoading(false); return; }

    const { data: convos } = await supabase
      .from('kcircle_conversations')
      .select('id, last_message_at')
      .in('id', convoIds)
      .eq('is_watch_thread', true)
      .order('last_message_at', { ascending: false });
    if (!convos || convos.length === 0) { setWatchThreads([]); setThreadsLoading(false); return; }

    const withDetails = await Promise.all(convos.map(async c => {
      const { data: participants } = await supabase
        .from('kcircle_conversation_participants').select('user_id').eq('conversation_id', c.id);
      const otherIds = (participants ?? []).map(p => p.user_id).filter(id => id !== uid);
      const { data: profiles } = otherIds.length > 0
        ? await supabase.from('creator_profiles').select('username').in('user_id', otherIds)
        : { data: [] as { username: string }[] };
      const { data: lastMsg } = await supabase
        .from('kcircle_messages').select('text').eq('conversation_id', c.id)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      return {
        id: c.id,
        otherNames: (profiles ?? []).map(p => p.username),
        lastMessageAt: c.last_message_at,
        lastMessagePreview: lastMsg?.text ?? '',
      };
    }));
    setWatchThreads(withDetails);
    setThreadsLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login?next=/kalpana-circle/watch-together'); return; }
      setUserId(user.id);
      loadRooms(user.id);
      loadWatchThreads(user.id);
      const { data: pref } = await supabase.from('kcircle_watch_history_prefs').select('save_history').eq('user_id', user.id).maybeSingle();
      setSaveHistory(pref?.save_history ?? true);
    })();
  }, [router, loadRooms, loadWatchThreads]);

  async function toggleSaveHistory() {
    if (!userId) return;
    const next = !saveHistory;
    setSaveHistory(next);
    await supabase.from('kcircle_watch_history_prefs').upsert({ user_id: userId, save_history: next, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  }

  // Debounced video title search for the "pick a video" step of room
  // creation — same ilike-on-title pattern KaTube's own search uses.
  useEffect(() => {
    if (videoQuery.trim().length < 2) {
      // Clearing stale results when the query shrinks below the search
      // threshold is a reaction to a prop change, not new derived data —
      // legitimate synchronous setState-in-effect, same exception pattern
      // used elsewhere in this codebase for initial-fetch-on-prop-change
      // effects (see app/kalpana-circle/chat/page.tsx).
      /* eslint-disable-next-line react-hooks/set-state-in-effect */
      setVideoResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('videos').select('id, title, youtube_id').ilike('title', `%${videoQuery.trim()}%`).limit(8);
      setVideoResults(data ?? []);
    }, 300);
    return () => clearTimeout(t);
  }, [videoQuery]);

  // Slow tap — unchanged room-per-video flow.
  async function createRoom(video: VideoOption, visibility: 'public' | 'private') {
    if (!userId || creating) return;
    setCreating(true);
    const { data: newRoom, error } = await supabase
      .from('watch_rooms')
      .insert({ video_id: video.id, host_id: userId, visibility, title: video.title, mode: 'video' })
      .select('id')
      .single();
    if (error || !newRoom) { setCreating(false); return; }
    await supabase.from('watch_room_members').insert({ room_id: newRoom.id, user_id: userId });
    router.push(`/katube/watch/${video.id}/room/${newRoom.id}`);
  }

  // Fast tap — a shorts-mode room isn't tied to one video. It starts on the
  // most recent KaTube short; video_id is set to that same short purely so
  // any code that assumes a room always has a video_id (e.g. an "open
  // room's underlying video" link elsewhere) doesn't need a mode branch.
  // No group is chosen here anymore — the room's Chat resolves its own
  // participant-set thread once people are actually in the room (see
  // shorts/[roomId]/page.tsx), so creation only needs a visibility choice.
  async function createShortsRoom(visibility: 'public' | 'private') {
    if (!userId || creating) return;
    setCreating(true);
    const { data: firstShort } = await supabase
      .from('videos').select('id, title').eq('is_short', true).order('created_at', { ascending: false }).limit(1).single();
    if (!firstShort) { setCreating(false); return; }
    const { data: newRoom, error } = await supabase
      .from('watch_rooms')
      .insert({
        video_id: firstShort.id, current_short_id: firstShort.id, host_id: userId, visibility,
        title: 'Shorts together', mode: 'shorts',
      })
      .select('id')
      .single();
    if (error || !newRoom) { setCreating(false); return; }
    await supabase.from('watch_room_members').insert({ room_id: newRoom.id, user_id: userId });
    router.push(`/kalpana-circle/watch-together/shorts/${newRoom.id}`);
  }

  return (
    <div data-theme={dataTheme} style={{ ...themeVars, minHeight: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 10, background: 'var(--nav-bg)', borderBottom: '1px solid var(--border-color)',
        padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Link href="/kalpana-circle" style={{ display: 'flex' }}>
            <Image src="/kcircle-logo.png" alt="K Circle" width={130} height={56} style={{ height: '28px', width: 'auto', objectFit: 'contain' }} />
          </Link>
          <span style={{ fontSize: '15px', fontWeight: 800 }}>🎬 Watch Together</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => setCreateStep('pick-mode')} style={{
            fontSize: '13px', fontWeight: 700, color: '#fff', background: RADIANT_SOLID,
            border: 'none', borderRadius: '20px', padding: '8px 16px', cursor: 'pointer',
          }}>+ Create Room</button>
          <ThemeToggle onChange={setIsLight} defaultLight={false} syncGlobal={false} />
        </div>
      </div>

      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '20px' }}>
        {myRooms.length > 0 && (
          <div style={{ marginBottom: '26px' }}>
            <h2 style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '10px' }}>
              Your rooms
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {myRooms.map(r => (
                <Link key={r.id} href={roomHref(r)} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px',
                  borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-card)',
                  textDecoration: 'none', color: 'var(--text-primary)',
                }}>
                  <span style={{ fontSize: '13.5px', fontWeight: 600 }}>
                    {r.is_host ? '👑 ' : ''}{r.mode === 'shorts' ? '⚡ ' : '🎬 '}{r.title}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Rejoin →</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginBottom: '26px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <h2 style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0 }}>
              Watch Together chats
            </h2>
            <button onClick={toggleSaveHistory} title="Save watch-together chat history" style={{
              display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10.5px', fontWeight: 700,
              color: saveHistory ? RADIANT_SOLID : 'var(--text-tertiary)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
            }}>
              <span style={{
                width: '30px', height: '17px', borderRadius: '9px', position: 'relative', transition: 'background 0.15s',
                background: saveHistory ? RADIANT_SOLID : 'var(--border-color)',
              }}>
                <span style={{
                  position: 'absolute', top: '2px', left: saveHistory ? '15px' : '2px', width: '13px', height: '13px',
                  borderRadius: '50%', background: '#fff', transition: 'left 0.15s',
                }} />
              </span>
              Save history
            </button>
          </div>
          {threadsLoading ? (
            <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>Loading chats...</p>
          ) : watchThreads.length === 0 ? (
            <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>
              No Watch Together chats yet — chat while scrolling Shorts together in a Fast tap room and it&rsquo;ll show up here.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflowY: 'auto' }}>
              {watchThreads.map(t => (
                <button key={t.id} onClick={() => setOpenThreadId(t.id)} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', textAlign: 'left',
                  borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', cursor: 'pointer', width: '100%',
                }}>
                  <span>
                    <span style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      💬 You{t.otherNames.length > 0 ? `, ${t.otherNames.join(', ')}` : ''}
                    </span>
                    {t.lastMessagePreview && (
                      <span style={{ display: 'block', fontSize: '11.5px', color: 'var(--text-tertiary)', marginTop: '2px', maxWidth: '440px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.lastMessagePreview}
                      </span>
                    )}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', flexShrink: 0 }}>Open →</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <h2 style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '10px' }}>
          Open public rooms
        </h2>
        {loading ? (
          <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>Loading rooms...</p>
        ) : publicRooms.length === 0 ? (
          <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>No public rooms open right now — start one and invite your circle.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {publicRooms.map(r => (
              <div key={r.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px',
                borderRadius: '12px', border: '1px solid var(--border-color)', background: 'var(--bg-card)',
              }}>
                <div>
                  <p style={{ fontSize: '14px', fontWeight: 700, margin: 0 }}>{r.mode === 'shorts' ? '⚡ ' : '🎬 '}{r.title}</p>
                  <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: '4px 0 0' }}>
                    Hosted by {r.hostName} · {r.memberCount} watching
                  </p>
                </div>
                <button
                  onClick={async () => {
                    if (!userId) return;
                    await supabase.from('watch_room_members').upsert({ room_id: r.id, user_id: userId }, { onConflict: 'room_id,user_id', ignoreDuplicates: true });
                    router.push(roomHref(r));
                  }}
                  style={{
                    fontSize: '12.5px', fontWeight: 700, color: RADIANT_SOLID, background: 'transparent',
                    border: `1px solid ${RADIANT_SOLID}`, borderRadius: '18px', padding: '7px 14px', cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >Join</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {createStep !== 'closed' && (
        <div onClick={() => setCreateStep('closed')} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '20px',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg-card)', borderRadius: '14px', padding: '20px', width: '100%', maxWidth: '440px',
            border: '1px solid var(--border-color)',
          }}>
            {createStep === 'pick-mode' && (
              <>
                <h3 style={{ fontSize: '15px', fontWeight: 800, marginBottom: '4px' }}>What are you watching together?</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '14px' }}>
                  Pick a mode — each has its own room layout.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <button onClick={() => setCreateStep('pick-visibility')} style={{
                    display: 'flex', alignItems: 'center', gap: '12px', padding: '14px', borderRadius: '12px',
                    border: `1px solid ${RADIANT_SOLID}`, background: 'var(--bg-primary)', cursor: 'pointer', textAlign: 'left',
                  }}>
                    <span style={{ fontSize: '26px' }}>⚡</span>
                    <span>
                      <span style={{ display: 'block', fontSize: '13.5px', fontWeight: 800, color: 'var(--text-primary)' }}>Fast tap — Shorts</span>
                      <span style={{ display: 'block', fontSize: '11.5px', color: 'var(--text-tertiary)' }}>Scroll Shorts together, side-by-side chat</span>
                    </span>
                  </button>
                  <button onClick={() => setCreateStep('pick-video')} style={{
                    display: 'flex', alignItems: 'center', gap: '12px', padding: '14px', borderRadius: '12px',
                    border: '1px solid var(--border-color)', background: 'var(--bg-primary)', cursor: 'pointer', textAlign: 'left',
                  }}>
                    <span style={{ fontSize: '26px' }}>🎬</span>
                    <span>
                      <span style={{ display: 'block', fontSize: '13.5px', fontWeight: 800, color: 'var(--text-primary)' }}>Slow tap — Long video</span>
                      <span style={{ display: 'block', fontSize: '11.5px', color: 'var(--text-tertiary)' }}>Synced player, chat below</span>
                    </span>
                  </button>
                </div>
              </>
            )}

            {createStep === 'pick-video' && (
              <>
                <h3 style={{ fontSize: '15px', fontWeight: 800, marginBottom: '12px' }}>Pick a video to watch together</h3>
                <input
                  value={videoQuery}
                  onChange={e => setVideoQuery(e.target.value)}
                  placeholder="Search KaTube videos..."
                  autoFocus
                  style={{
                    width: '100%', fontSize: '13px', padding: '10px 12px', borderRadius: '8px',
                    border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', marginBottom: '12px',
                  }}
                />
                <div style={{ maxHeight: '260px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {videoResults.map(v => (
                    <div key={v.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
                      padding: '8px', borderRadius: '8px', border: '1px solid var(--border-color)',
                    }}>
                      <span style={{ fontSize: '12.5px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.title}</span>
                      <button disabled={creating} onClick={() => createRoom(v, 'private')} style={{
                        fontSize: '11px', fontWeight: 700, padding: '5px 9px', borderRadius: '14px',
                        border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', cursor: 'pointer',
                      }}>🔒 Private</button>
                      <button disabled={creating} onClick={() => createRoom(v, 'public')} style={{
                        fontSize: '11px', fontWeight: 700, padding: '5px 9px', borderRadius: '14px',
                        border: 'none', background: RADIANT_SOLID, color: '#fff', cursor: 'pointer',
                      }}>🌐 Public</button>
                    </div>
                  ))}
                  {videoQuery.trim().length >= 2 && videoResults.length === 0 && (
                    <p style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>No videos found.</p>
                  )}
                </div>
              </>
            )}

            {createStep === 'pick-visibility' && (
              <>
                <h3 style={{ fontSize: '15px', fontWeight: 800, marginBottom: '4px' }}>Start a Fast tap room</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '14px' }}>
                  Comment stays public on the Short itself. Chat is private — it&rsquo;ll automatically link to whoever
                  you&rsquo;re actually watching with, saved as its own Watch Together chat below.
                </p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button disabled={creating} onClick={() => createShortsRoom('private')} style={{
                    flex: 1, fontSize: '12.5px', fontWeight: 700, padding: '10px 9px', borderRadius: '10px',
                    border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', cursor: 'pointer',
                  }}>🔒 Private</button>
                  <button disabled={creating} onClick={() => createShortsRoom('public')} style={{
                    flex: 1, fontSize: '12.5px', fontWeight: 700, padding: '10px 9px', borderRadius: '10px',
                    border: 'none', background: RADIANT_SOLID, color: '#fff', cursor: 'pointer',
                  }}>🌐 Public</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {openThreadId && userId && (
        <WatchThreadModal threadId={openThreadId} userId={userId} onClose={() => { setOpenThreadId(null); loadWatchThreads(userId); }} />
      )}
    </div>
  );
}

// ── Watch Together thread history modal ──
// Full message history for one participant-set thread, opened from the
// "Watch Together chats" list above. Each message can be tapped through to
// the Short it was about; each of MY OWN messages (and, per spec, ANY
// message — "delete for both" isn't sender-restricted) can be removed
// either just for me (kcircle_message_hidden_for) or for both sides (a
// real delete, RLS-scoped to watch threads only — see migration).
interface ThreadMessage {
  id: string;
  sender_id: string;
  text: string | null;
  short_ref_id: string | null;
  created_at: string;
  senderName: string;
}

function WatchThreadModal({ threadId, userId, onClose }: { threadId: string; userId: string; onClose: () => void }) {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: rows }, { data: hidden }] = await Promise.all([
        supabase.from('kcircle_messages').select('id, sender_id, text, short_ref_id, created_at').eq('conversation_id', threadId).order('created_at', { ascending: true }),
        supabase.from('kcircle_message_hidden_for').select('message_id').eq('user_id', userId),
      ]);
      if (cancelled || !rows) return;
      const hiddenIds = new Set((hidden ?? []).map(h => h.message_id));
      const visible = rows.filter(r => !hiddenIds.has(r.id));
      const senderIds = [...new Set(visible.map(r => r.sender_id))];
      const { data: profiles } = senderIds.length > 0 ? await supabase.from('creator_profiles').select('user_id, username').in('user_id', senderIds) : { data: [] as { user_id: string; username: string }[] };
      const nameMap = new Map((profiles ?? []).map(p => [p.user_id, p.username]));
      if (!cancelled) setMessages(visible.map(r => ({ ...r, senderName: r.sender_id === userId ? 'You' : (nameMap.get(r.sender_id) ?? 'someone') })));
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [threadId, userId]);

  async function deleteForMe(messageId: string) {
    setBusyId(messageId);
    await supabase.from('kcircle_message_hidden_for').insert({ message_id: messageId, user_id: userId });
    setMessages(prev => prev.filter(m => m.id !== messageId));
    setBusyId(null);
  }

  async function deleteForBoth(messageId: string) {
    setBusyId(messageId);
    await supabase.from('kcircle_messages').delete().eq('id', messageId);
    setMessages(prev => prev.filter(m => m.id !== messageId));
    setBusyId(null);
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: '20px' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card)', borderRadius: '14px', width: '100%', maxWidth: '460px', maxHeight: '78vh', display: 'flex', flexDirection: 'column', border: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--border-color)' }}>
          <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)' }}>Watch Together chat</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--text-tertiary)' }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {loading ? (
            <p style={{ fontSize: '12.5px', color: 'var(--text-tertiary)' }}>Loading...</p>
          ) : messages.length === 0 ? (
            <p style={{ fontSize: '12.5px', color: 'var(--text-tertiary)' }}>No messages here.</p>
          ) : messages.map(m => (
            <div key={m.id} style={{ fontSize: '13px' }}>
              {m.short_ref_id && (
                <Link href={`/katube/shorts/${m.short_ref_id}`} style={{ display: 'block', fontSize: '10.5px', color: 'var(--text-tertiary)', marginBottom: '2px', textDecoration: 'none' }}>
                  📎 About this Short — open it →
                </Link>
              )}
              <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{m.senderName}: </span>
              <span style={{ color: 'var(--text-primary)' }}>{m.text}</span>
              <div style={{ display: 'flex', gap: '10px', marginTop: '2px' }}>
                <button disabled={busyId === m.id} onClick={() => deleteForMe(m.id)} style={{ fontSize: '10px', color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Delete for me</button>
                <button disabled={busyId === m.id} onClick={() => deleteForBoth(m.id)} style={{ fontSize: '10px', color: '#f87171', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Delete for both</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
