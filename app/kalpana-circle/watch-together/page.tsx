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

interface GroupOption {
  id: string;
  name: string;
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
  // tap/long video) -> 'pick-video' (Slow tap) or 'pick-group' (Fast tap,
  // choosing which K Circle group a Fast tap room's "Chat" replies land in).
  const [createStep, setCreateStep] = useState<'closed' | 'pick-mode' | 'pick-video' | 'pick-group'>('closed');
  const [videoQuery, setVideoQuery] = useState('');
  const [videoResults, setVideoResults] = useState<VideoOption[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [creating, setCreating] = useState(false);

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

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login?next=/kalpana-circle/watch-together'); return; }
      setUserId(user.id);
      loadRooms(user.id);
    })();
  }, [router, loadRooms]);

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

  // Fast tap step 2 — load the K Circle groups I'm in, so I can pick which
  // one a room's "Chat" replies get tagged into. Only groups (not 1:1 DMs)
  // are offered, matching the founder's "goes to their group room" spec.
  async function openPickGroup() {
    setCreateStep('pick-group');
    if (!userId || groups.length > 0) return;
    setLoadingGroups(true);
    const { data: memberships } = await supabase
      .from('kcircle_conversation_participants').select('conversation_id').eq('user_id', userId);
    const convoIds = (memberships ?? []).map(m => m.conversation_id);
    if (convoIds.length > 0) {
      const { data: convos } = await supabase
        .from('kcircle_conversations').select('id, title, is_group').in('id', convoIds).eq('is_group', true);
      setGroups((convos ?? []).map(c => ({ id: c.id, name: c.title || 'Untitled group' })));
    }
    setLoadingGroups(false);
  }

  // Fast tap — a shorts-mode room isn't tied to one video. It starts on the
  // most recent KaTube short; video_id is set to that same short purely so
  // any code that assumes a room always has a video_id (e.g. an "open
  // room's underlying video" link elsewhere) doesn't need a mode branch.
  async function createShortsRoom(groupConversationId: string, visibility: 'public' | 'private') {
    if (!userId || creating) return;
    setCreating(true);
    const { data: firstShort } = await supabase
      .from('videos').select('id, title').eq('is_short', true).order('created_at', { ascending: false }).limit(1).single();
    if (!firstShort) { setCreating(false); return; }
    const { data: newRoom, error } = await supabase
      .from('watch_rooms')
      .insert({
        video_id: firstShort.id, current_short_id: firstShort.id, host_id: userId, visibility,
        title: 'Shorts together', mode: 'shorts', linked_conversation_id: groupConversationId,
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
                  <button onClick={openPickGroup} style={{
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

            {createStep === 'pick-group' && (
              <>
                <h3 style={{ fontSize: '15px', fontWeight: 800, marginBottom: '4px' }}>Where should Chat replies go?</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '12px' }}>
                  While scrolling Shorts, anyone can tap Comment (public, on the Short itself) or Chat — Chat messages
                  land right here, in this group&rsquo;s own chat, tagged with which Short they were about.
                </p>
                {loadingGroups ? (
                  <p style={{ fontSize: '12.5px', color: 'var(--text-tertiary)' }}>Loading your groups...</p>
                ) : groups.length === 0 ? (
                  <p style={{ fontSize: '12.5px', color: 'var(--text-tertiary)' }}>
                    You&rsquo;re not in any K Circle groups yet — create one from the Chat tab first.
                  </p>
                ) : (
                  <div style={{ maxHeight: '260px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {groups.map(g => (
                      <div key={g.id} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
                        padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)',
                      }}>
                        <span style={{ fontSize: '12.5px', flex: 1, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>👥 {g.name}</span>
                        <button disabled={creating} onClick={() => createShortsRoom(g.id, 'private')} style={{
                          fontSize: '11px', fontWeight: 700, padding: '5px 9px', borderRadius: '14px',
                          border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', cursor: 'pointer',
                        }}>🔒 Private</button>
                        <button disabled={creating} onClick={() => createShortsRoom(g.id, 'public')} style={{
                          fontSize: '11px', fontWeight: 700, padding: '5px 9px', borderRadius: '14px',
                          border: 'none', background: RADIANT_SOLID, color: '#fff', cursor: 'pointer',
                        }}>🌐 Public</button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
