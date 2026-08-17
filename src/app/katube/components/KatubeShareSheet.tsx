'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Send, MessageCircle, Link2, Check, Users, Lock, Globe, UserPlus, ChevronLeft, Share2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ── KaTube share sheet ──
// Two separate buttons on a KaTube long-video or Shorts page open this same
// component at different starting screens — they are NOT merged into one
// menu (founder correction: Share sends only the URL; Watch with Friends /
// Watch Together is its own button):
//   1. Share icon -> opens on 'main': send to a K Circle friend as a DM,
//      WhatsApp, native share sheet (Instagram/more apps), copy link.
//   2. "Watch with Friends" (video) / "Together" (Shorts) button -> opens
//      straight on 'wt-visibility', skipping the main list — video/short is
//      already picked since we're on it, just choose private/public, then
//      an invite screen.
//
// Backend reused as-is, no schema changes:
//  - kcircle_conversations / kcircle_conversation_participants /
//    kcircle_messages / kcircle_notifications (type 'message') for the DM
//    send — same shape app/kalpana-circle/chat/page.tsx's own send flow
//    uses.
//  - creator_follows (creator_id/follower_id) for the mutual-follow "Your
//    friends" list — same query app/kalpana-circle/watch-together/shorts/
//    [roomId]/page.tsx's loadSuggestedFriends already uses.
//  - watch_rooms / watch_room_members for room creation (video mode: just
//    video_id; shorts mode: video_id + current_short_id both set to this
//    short instead of always defaulting to "most recent short").
//  - kcircle_notifications (type 'watch_invite', room_id) for invites —
//    same as the existing room's own Add Friend picker. Deliberately NOT a
//    DM message: the invitee joins themselves via the self-insert RLS
//    policy on watch_room_members the moment they open the room, same as
//    anyone using a plain share link.

interface Friend { user_id: string; username: string; }

type View = 'main' | 'kcircle-pick' | 'kcircle-sent' | 'wt-visibility' | 'wt-invite';

interface KatubeShareSheetProps {
  open: boolean;
  onClose: () => void;
  video: { id: string; title: string; isShort: boolean };
  url: string;
  /** true on the full-screen black Shorts feed, which has no light/dark theme wrapper of its own */
  dark?: boolean;
  initialView?: View;
}

export default function KatubeShareSheet({ open, onClose, video, url, dark = false, initialView = 'main' }: KatubeShareSheetProps) {
  const router = useRouter();
  const [view, setView] = useState<View>('main');
  const [userId, setUserId] = useState<string | null>(null);

  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Friend[]>([]);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busyFriendId, setBusyFriendId] = useState<string | null>(null);

  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect -- resetting the sheet's
     own local state when it opens, same exception this codebase already
     grants app/kalpana-circle/close-friends/page.tsx and .../shorts/[roomId]
     /page.tsx for this kind of "modal just opened, kick off state + fetch"
     effect */
  useEffect(() => {
    if (!open) return;
    setView(initialView);
    setQuery('');
    setSearchResults([]);
    setSentTo(null);
    setRoomId(null);
    setInvitedIds(new Set());
    setVisibility('private');
    setCopied(false);
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUserId(data.user?.id ?? null);
    })();
  }, [open, initialView]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Mutual follows (you follow them, they follow you back) — same query
  // app/kalpana-circle/watch-together/shorts/[roomId]/page.tsx's
  // loadSuggestedFriends uses, so the common case (an actual mutual) needs
  // no typing.
  const loadFriends = useCallback(async (uid: string) => {
    setFriendsLoading(true);
    const [{ data: following }, { data: followers }] = await Promise.all([
      supabase.from('creator_follows').select('creator_id').eq('follower_id', uid),
      supabase.from('creator_follows').select('follower_id').eq('creator_id', uid),
    ]);
    const followingIds = new Set((following ?? []).map(r => r.creator_id));
    const mutualIds = [...new Set((followers ?? []).map(r => r.follower_id))].filter(id => followingIds.has(id));
    if (mutualIds.length === 0) { setFriends([]); setFriendsLoading(false); return; }
    const { data: profiles } = await supabase.from('creator_profiles').select('user_id, username').in('user_id', mutualIds);
    setFriends(profiles ?? []);
    setFriendsLoading(false);
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect -- same "screen just
     opened, fetch once" exception as loadSuggestedFriends' own call site */
  useEffect(() => {
    if ((view === 'kcircle-pick' || view === 'wt-invite') && userId && friends.length === 0 && !friendsLoading) {
      loadFriends(userId);
    }
  }, [view, userId, friends.length, friendsLoading, loadFriends]);

  // Debounced username search — falls through for anyone not a mutual yet,
  // same pattern as chat/page.tsx's searchUsers.
  useEffect(() => {
    const q = query.trim();
    if (!q || !userId) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('creator_profiles').select('user_id, username').ilike('username', `%${q}%`).limit(10);
      const friendIds = new Set(friends.map(f => f.user_id));
      setSearchResults((data ?? []).filter(r => r.user_id !== userId && !friendIds.has(r.user_id)));
    }, 300);
    return () => clearTimeout(t);
  }, [query, userId, friends]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function getOrCreateConversation(otherId: string): Promise<string | null> {
    if (!userId) return null;
    const { data: mine } = await supabase.from('kcircle_conversation_participants').select('conversation_id').eq('user_id', userId);
    const myIds = (mine ?? []).map(r => r.conversation_id);
    if (myIds.length > 0) {
      const { data: theirs } = await supabase.from('kcircle_conversation_participants').select('conversation_id').eq('user_id', otherId).in('conversation_id', myIds);
      const candidateIds = (theirs ?? []).map(r => r.conversation_id);
      if (candidateIds.length > 0) {
        const { data: existing } = await supabase.from('kcircle_conversations').select('id').in('id', candidateIds).eq('is_group', false).limit(1).maybeSingle();
        if (existing) return existing.id;
      }
    }
    const { data: convo, error } = await supabase.from('kcircle_conversations').insert({ is_group: false, created_by: userId }).select('id').single();
    if (error || !convo) return null;
    await supabase.from('kcircle_conversation_participants').insert([
      { conversation_id: convo.id, user_id: userId },
      { conversation_id: convo.id, user_id: otherId },
    ]);
    return convo.id;
  }

  async function handleSendToFriend(friend: Friend) {
    if (!userId || busyFriendId) return;
    setBusyFriendId(friend.user_id);
    const text = video.isShort ? `Sent a Short: ${video.title}` : `Check this out on KaTube: ${video.title} — ${url}`;
    const convoId = await getOrCreateConversation(friend.user_id);
    if (convoId) {
      await supabase.from('kcircle_messages').insert({
        conversation_id: convoId, sender_id: userId, text,
        // short_ref_id only makes sense for shorts — its existing rendering
        // (chat.tsx, watch-together/page.tsx) always links to
        // /katube/shorts/:id, so a long-video share stays plain text+URL.
        short_ref_id: video.isShort ? video.id : null,
      });
      await supabase.from('kcircle_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', convoId);
      await supabase.from('kcircle_notifications').insert({
        recipient_id: friend.user_id, actor_id: userId, type: 'message', conversation_id: convoId, preview: text.slice(0, 80),
      });
      setSentTo(friend.username);
      setView('kcircle-sent');
    }
    setBusyFriendId(null);
  }

  async function startWatchTogetherRoom() {
    if (!userId || creatingRoom) return;
    setCreatingRoom(true);
    const { data: newRoom, error } = video.isShort
      ? await supabase.from('watch_rooms')
          .insert({ video_id: video.id, current_short_id: video.id, host_id: userId, visibility, title: video.title, mode: 'shorts' as const })
          .select('id').single()
      : await supabase.from('watch_rooms')
          .insert({ video_id: video.id, host_id: userId, visibility, title: video.title, mode: 'video' as const })
          .select('id').single();
    if (error || !newRoom) { setCreatingRoom(false); return; }
    await supabase.from('watch_room_members').insert({ room_id: newRoom.id, user_id: userId });
    setRoomId(newRoom.id);
    setCreatingRoom(false);
    setView('wt-invite');
  }

  function roomHref(id: string) {
    return video.isShort ? `/kalpana-circle/watch-together/shorts/${id}` : `/katube/watch/${video.id}/room/${id}`;
  }

  // Invite = a notification, not a DM — same as the room's own Add Friend
  // picker. The invitee's own watch_room_members row only ever gets
  // inserted by them (self-insert RLS), when they actually open the room.
  async function sendInvite(friendId: string) {
    if (!userId || !roomId) return;
    setBusyFriendId(friendId);
    const { error } = await supabase.from('kcircle_notifications').insert({
      recipient_id: friendId, actor_id: userId, type: 'watch_invite', room_id: roomId, preview: video.title,
    });
    setBusyFriendId(null);
    if (!error) setInvitedIds(prev => new Set(prev).add(friendId));
  }

  function enterRoom() {
    if (!roomId) return;
    router.push(roomHref(roomId));
    onClose();
  }

  if (!open) return null;

  const shareText = video.isShort ? `Check out this Short on KaTube! ${url}` : `Check out "${video.title}" on KaTube! ${url}`;
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

  function copyLink() {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const bg = dark ? 'rgba(24,24,27,0.98)' : 'var(--bg-card)';
  const fg = dark ? '#fff' : 'var(--text-primary)';
  const sub = dark ? 'rgba(255,255,255,0.55)' : 'var(--text-tertiary)';
  const border = dark ? 'rgba(255,255,255,0.12)' : 'var(--border-color)';

  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '12px', width: '100%', textAlign: 'left',
    padding: '13px 16px', background: 'transparent', border: 'none', borderBottom: `1px solid ${border}`,
    color: fg, fontSize: '14px', fontWeight: 700, cursor: 'pointer', textDecoration: 'none',
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '480px', background: bg, borderRadius: '16px 16px 0 0', maxHeight: '78vh', overflowY: 'auto', paddingBottom: '10px' }}>
        <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: border, margin: '10px auto' }} />

        {view === 'main' && (
          <>
            <button style={rowStyle} onClick={() => setView('kcircle-pick')}>
              <Send size={18} /> <span>Send to K Circle friend</span>
            </button>
            <a style={rowStyle} href={whatsappHref} target="_blank" rel="noopener noreferrer" onClick={onClose}>
              <MessageCircle size={18} /> <span>WhatsApp</span>
            </a>
            <button
              style={rowStyle}
              onClick={() => {
                const nav = navigator as Navigator & { share?: (d: { title: string; url: string }) => Promise<void> };
                if (nav.share) nav.share({ title: video.title, url }).catch(() => {});
                else copyLink();
              }}
            >
              <Share2 size={18} /> <span>Instagram / more apps</span>
            </button>
            <button style={{ ...rowStyle, borderBottom: 'none' }} onClick={() => { copyLink(); if (copied) onClose(); else setTimeout(onClose, 600); }}>
              {copied ? <Check size={18} /> : <Link2 size={18} />} <span>{copied ? 'Copied!' : 'Copy link'}</span>
            </button>
          </>
        )}

        {view === 'kcircle-pick' && (
          <div style={{ padding: '0 16px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <button onClick={() => setView('main')} style={{ background: 'none', border: 'none', color: sub, cursor: 'pointer', display: 'flex' }}><ChevronLeft size={18} /></button>
              <span style={{ fontWeight: 800, fontSize: '13.5px', color: fg }}>Send to…</span>
            </div>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search username…"
              style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', fontSize: '13px', border: `1px solid ${border}`, background: 'transparent', color: fg, outline: 'none', boxSizing: 'border-box', marginBottom: '10px' }}
            />
            <FriendRows
              title={query.trim() ? 'Search results' : 'Your friends'}
              friends={query.trim() ? searchResults : friends}
              loading={!query.trim() && friendsLoading}
              busyId={busyFriendId}
              doneIds={null}
              fg={fg} sub={sub}
              onPick={handleSendToFriend}
              actionLabel="Send"
            />
          </div>
        )}

        {view === 'kcircle-sent' && (
          <div style={{ padding: '30px 20px', textAlign: 'center' }}>
            <Check size={28} color="#22c55e" style={{ margin: '0 auto 8px' }} />
            <p style={{ color: fg, fontWeight: 700, fontSize: '14px' }}>Sent to {sentTo}</p>
            <button onClick={onClose} style={{ marginTop: '14px', padding: '9px 20px', borderRadius: '10px', border: `1px solid ${border}`, background: 'transparent', color: fg, fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>Done</button>
          </div>
        )}

        {view === 'wt-visibility' && (
          <div style={{ padding: '0 16px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <button onClick={onClose} style={{ background: 'none', border: 'none', color: sub, cursor: 'pointer', display: 'flex' }}><ChevronLeft size={18} /></button>
              <span style={{ fontWeight: 800, fontSize: '13.5px', color: fg }}>Watch Together — {video.isShort ? 'this Short' : video.title}</span>
            </div>
            <p style={{ fontSize: '12px', color: sub, marginBottom: '12px' }}>
              {video.isShort ? 'Starts right here — friends scroll Shorts together with you.' : 'Video is already picked — just choose who can join.'}
            </p>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              {(['private', 'public'] as const).map(v => (
                <button key={v} onClick={() => setVisibility(v)} style={{
                  flex: 1, padding: '10px', borderRadius: '10px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer',
                  border: `1px solid ${visibility === v ? '#7c3aed' : border}`,
                  background: visibility === v ? 'rgba(124,58,237,0.15)' : 'transparent',
                  color: visibility === v ? '#7c3aed' : fg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                }}>
                  {v === 'private' ? <Lock size={13} /> : <Globe size={13} />} {v === 'private' ? 'Private' : 'Public'}
                </button>
              ))}
            </div>
            <button onClick={startWatchTogetherRoom} disabled={creatingRoom} style={{
              width: '100%', padding: '12px', borderRadius: '10px', border: 'none', fontSize: '13.5px', fontWeight: 800,
              background: '#7c3aed', color: '#fff', cursor: creatingRoom ? 'default' : 'pointer', opacity: creatingRoom ? 0.7 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            }}>
              <Users size={16} /> {creatingRoom ? 'Setting up room…' : 'Start room'}
            </button>
          </div>
        )}

        {view === 'wt-invite' && (
          <div style={{ padding: '0 16px 16px' }}>
            <div style={{ marginBottom: '10px' }}>
              <span style={{ fontWeight: 800, fontSize: '13.5px', color: fg }}>Invite friends</span>
              <p style={{ fontSize: '12px', color: sub, margin: '4px 0 0' }}>Room&apos;s live — pick who to bring in (optional).</p>
            </div>
            <FriendRows
              title="Your friends"
              friends={friends}
              loading={friendsLoading}
              busyId={busyFriendId}
              doneIds={invitedIds}
              fg={fg} sub={sub}
              onPick={f => sendInvite(f.user_id)}
              actionLabel="Invite"
            />
            <button onClick={enterRoom} style={{
              width: '100%', marginTop: '14px', padding: '11px', borderRadius: '10px', border: 'none', background: '#7c3aed',
              color: '#fff', fontWeight: 800, fontSize: '13px', cursor: 'pointer',
            }}>
              Enter room →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function FriendRows({ title, friends, loading, busyId, doneIds, fg, sub, onPick, actionLabel }: {
  title: string; friends: Friend[]; loading: boolean; busyId: string | null; doneIds: Set<string> | null;
  fg: string; sub: string; onPick: (f: Friend) => void; actionLabel: string;
}) {
  return (
    <div>
      <div style={{ fontSize: '10.5px', fontWeight: 800, color: sub, textTransform: 'uppercase', letterSpacing: '0.04em', margin: '4px 0 6px' }}>{title}</div>
      {loading ? (
        <p style={{ fontSize: '12.5px', color: sub }}>Loading…</p>
      ) : friends.length === 0 ? (
        <p style={{ fontSize: '12.5px', color: sub }}>No one here yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', maxHeight: '260px', overflowY: 'auto' }}>
          {friends.map(f => {
            const done = doneIds?.has(f.user_id) ?? false;
            return (
              <button key={f.user_id} onClick={() => onPick(f)} disabled={busyId === f.user_id || done} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
                padding: '9px 6px', background: 'transparent', border: 'none', cursor: done ? 'default' : 'pointer', textAlign: 'left',
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, color: fg }}>
                  <span style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#7c3aed', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800 }}>
                    {f.username.slice(0, 2).toUpperCase()}
                  </span>
                  @{f.username}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', fontWeight: 700, color: done ? '#22c55e' : '#7c3aed' }}>
                  {busyId === f.user_id ? '…' : done ? (<><Check size={13} /> Invited</>) : (<>{actionLabel === 'Invite' ? <UserPlus size={13} /> : <Send size={13} />} {actionLabel}</>)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
