'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import NotificationBell from '../../components/NotificationBell';
import ThemeToggle from '../../components/ThemeToggle';
import { useKCircleTheme } from '../theme';

// ── K Circle chat — DMs + group chats. ──
// Backend: kcircle_conversations (is_group/title/created_by),
// kcircle_conversation_participants, kcircle_messages
// (supabase/migrations/20260812_kcircle_social.sql +
// 20260812101451_kcircle_fix_participant_rls_and_groups.sql +
// 20260812110000_kcircle_group_chat_schema_and_rls_fix.sql,
// 20260812130000_kcircle_realtime_chat.sql for the Realtime publication).
// Live via Supabase Realtime (postgres_changes) — open thread, conversation
// list previews/ordering, new conversations, renames, and being
// removed/leaving are all pushed, no polling. First Realtime usage in this
// codebase; see the two useEffect blocks below for the channel setup.

const RADIANT = 'linear-gradient(135deg, #71717a 0%, #d4d4d8 45%, #f4f4f5 60%, #a1a1aa 100%)';
const MAX_GROUP_MEMBERS = 20;

function initials(name: string) { return name.slice(0, 2).toUpperCase(); }

function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: RADIANT, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.36, fontWeight: 800, color: '#27272a',
    }}>{initials(name)}</div>
  );
}

// Small overlapping-circles avatar for group threads.
function GroupAvatar({ names, size = 40 }: { names: string[]; size?: number }) {
  const shown = names.slice(0, 3);
  const sub = size * 0.62;
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      {shown.map((n, i) => (
        <div key={i} style={{
          position: 'absolute', width: sub, height: sub, borderRadius: '50%',
          background: RADIANT, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: sub * 0.36, fontWeight: 800, color: '#27272a',
          border: '2px solid var(--bg-primary)',
          left: i === 0 ? 0 : i === 1 ? size - sub : (size - sub) / 2,
          top: i === 2 ? size - sub : i === 0 ? 0 : size - sub,
          zIndex: 3 - i,
        }}>{initials(n)}</div>
      ))}
    </div>
  );
}

interface ConversationRow {
  id: string;
  isGroup: boolean;
  title: string;
  otherUserId: string; // only meaningful for DMs
  memberUsernames: string[]; // all other members (1 for DM, N for group)
  lastMessage: string;
  lastAt: string;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  text: string | null;
  attachment_url: string | null;
  attachment_type: string | null;
  // Set when this message was sent from the "Chat" tab of a Fast tap
  // (Shorts) Watch Together room — points at which short it was about, so
  // the thread can show a small pointer back to it (see
  // app/kalpana-circle/watch-together/shorts/[roomId]/page.tsx).
  short_ref_id: string | null;
  created_at: string;
}

// Chat attachments reuse the kcircle-media bucket (public read,
// authenticated insert — same bucket posts/stories already use) under a
// new messages/{userId}-{ts}.ext prefix. 5MB cap kept client-side, no
// server-side enforcement yet (matches the trust level of post/story
// uploads elsewhere in this file).
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export default function KCircleChatPage() {
  const { setIsLight, themeVars, dataTheme } = useKCircleTheme();
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [checkedAuth, setCheckedAuth] = useState(false);

  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [active, setActive] = useState<ConversationRow | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [draft, setDraft] = useState('');
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const [attachPreview, setAttachPreview] = useState<string | null>(null);
  const [attachError, setAttachError] = useState('');
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [senderNames, setSenderNames] = useState<Map<string, string>>(new Map());

  const [showNew, setShowNew] = useState(false);
  const [groupMode, setGroupMode] = useState(false);
  const [groupTitle, setGroupTitle] = useState('');
  const [selected, setSelected] = useState<{ user_id: string; username: string }[]>([]);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<{ user_id: string; username: string }[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── group settings: rename, add/remove member, leave ──
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [members, setMembers] = useState<{ user_id: string; username: string }[]>([]);
  const [renameValue, setRenameValue] = useState('');
  const [addMemberQuery, setAddMemberQuery] = useState('');
  const [addMemberResults, setAddMemberResults] = useState<{ user_id: string; username: string }[]>([]);
  const [groupBusy, setGroupBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
      setCheckedAuth(true);
    });
  }, []);

  useEffect(() => {
    if (checkedAuth && !userId) router.replace('/login?next=/kalpana-circle/chat');
  }, [checkedAuth, userId, router]);

  const loadConversations = useCallback(async () => {
    if (!userId) return;
    setLoadingList(true);
    const { data: myRows } = await supabase.from('kcircle_conversation_participants').select('conversation_id').eq('user_id', userId);
    const convoIds = (myRows ?? []).map(r => r.conversation_id);
    if (convoIds.length === 0) { setConversations([]); setLoadingList(false); return; }

    const { data: convoMeta } = await supabase.from('kcircle_conversations').select('id, is_group, title').in('id', convoIds);
    const metaById = new Map((convoMeta ?? []).map(c => [c.id, c]));

    const { data: allParticipants } = await supabase.from('kcircle_conversation_participants').select('conversation_id, user_id').in('conversation_id', convoIds);
    const othersByConvo = new Map<string, string[]>();
    (allParticipants ?? []).forEach(p => {
      if (p.user_id === userId) return;
      const list = othersByConvo.get(p.conversation_id) ?? [];
      list.push(p.user_id);
      othersByConvo.set(p.conversation_id, list);
    });

    const otherUserIds = Array.from(new Set(Array.from(othersByConvo.values()).flat()));
    const { data: profiles } = otherUserIds.length
      ? await supabase.from('creator_profiles').select('user_id, username').in('user_id', otherUserIds)
      : { data: [] as { user_id: string; username: string }[] };
    const usernameMap = new Map((profiles ?? []).map(p => [p.user_id, p.username]));

    const { data: lastMessages } = await supabase.from('kcircle_messages').select('conversation_id, text, attachment_url, created_at').in('conversation_id', convoIds).order('created_at', { ascending: false });
    const lastByConvo = new Map<string, { text: string; created_at: string }>();
    (lastMessages ?? []).forEach(m => {
      if (!lastByConvo.has(m.conversation_id)) {
        lastByConvo.set(m.conversation_id, { text: m.text ?? (m.attachment_url ? '📷 Photo' : ''), created_at: m.created_at });
      }
    });

    const rows: ConversationRow[] = convoIds.map(id => {
      const meta = metaById.get(id);
      const otherIds = othersByConvo.get(id) ?? [];
      const memberUsernames = otherIds.map(uid => usernameMap.get(uid) ?? 'dreamer');
      const isGroup = !!meta?.is_group;
      return {
        id,
        isGroup,
        title: isGroup ? (meta?.title || memberUsernames.join(', ') || 'Group') : (memberUsernames[0] ?? 'dreamer'),
        otherUserId: isGroup ? '' : (otherIds[0] ?? ''),
        memberUsernames,
        lastMessage: lastByConvo.get(id)?.text ?? 'Say hi 👋',
        lastAt: lastByConvo.get(id)?.created_at ?? '',
      };
    }).sort((a, b) => (b.lastAt || '').localeCompare(a.lastAt || ''));

    setConversations(rows);
    setLoadingList(false);
  }, [userId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount/userId change
  useEffect(() => { loadConversations(); }, [loadConversations]);

  const loadMessages = useCallback(async (conversationId: string) => {
    const { data } = await supabase.from('kcircle_messages').select('id, conversation_id, sender_id, text, attachment_url, attachment_type, short_ref_id, created_at').eq('conversation_id', conversationId).order('created_at', { ascending: true });
    setMessages(data ?? []);
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 50);
  }, []);

  // ── open-thread messages: Supabase Realtime, not polling ──
  // Was `setInterval(() => loadMessages(active.id), 3000)` — up to 3s of
  // lag, and a full re-fetch of the whole thread every tick whether or not
  // anything changed. Now: one initial loadMessages() for history, then a
  // channel subscribed to INSERTs on kcircle_messages for this
  // conversation_id, appending each new row as it lands (including the
  // sender's own — sendMessage() below no longer appends locally, this
  // channel is the single path a message reaches the UI through, so there's
  // no double-insert to dedupe). Requires the conversation_id=eq filter's
  // table to be in the supabase_realtime publication — see
  // supabase/migrations/20260812130000_kcircle_realtime_chat.sql.
  /* eslint-disable react-hooks/set-state-in-effect -- initial history fetch when active thread changes */
  useEffect(() => {
    if (!active) return;
    loadMessages(active.id);
    const channel = supabase
      .channel(`kcircle-thread-${active.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'kcircle_messages', filter: `conversation_id=eq.${active.id}` },
        (payload) => {
          const row = payload.new as MessageRow;
          setMessages(prev => (prev.some(m => m.id === row.id) ? prev : [...prev, row]));
          setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 50);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [active, loadMessages]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // ── inbox: live previews/ordering + new conversations, also Realtime ──
  // Previously the conversation list only ever loaded once (on mount /
  // userId change) — a new incoming DM or group add never appeared, and an
  // existing thread's preview/order never moved, until a full page reload.
  // Two subscriptions: (1) any INSERT on kcircle_messages updates that
  // conversation's preview text + re-sorts the list by lastAt, scoped to
  // conversations already in `conversations` (RLS also independently
  // limits delivery to rows this user's SELECT policy allows, i.e.
  // conversations they're actually a participant of — see the migration
  // comment above); (2) an INSERT on kcircle_conversation_participants for
  // my own user_id (a rename lands here too via a plain conversations
  // reload, cheap enough not to special-case) means I've been added to a
  // conversation I don't have yet, so re-run loadConversations() to pick
  // it up. Both no-ops harmlessly if the row isn't one I can see.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`kcircle-inbox-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'kcircle_messages' },
        (payload) => {
          const row = payload.new as MessageRow;
          const preview = row.text ?? (row.attachment_url ? '📷 Photo' : '');
          setConversations(prev => {
            if (!prev.some(c => c.id === row.conversation_id)) return prev;
            return prev
              .map(c => c.id === row.conversation_id ? { ...c, lastMessage: preview, lastAt: row.created_at } : c)
              .sort((a, b) => (b.lastAt || '').localeCompare(a.lastAt || ''));
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'kcircle_conversation_participants', filter: `user_id=eq.${userId}` },
        () => { loadConversations(); }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'kcircle_conversations' },
        (payload) => {
          const row = payload.new as { id: string; title: string };
          setConversations(prev => prev.map(c => c.id === row.id ? { ...c, title: row.title } : c));
          setActive(prev => (prev && prev.id === row.id ? { ...prev, title: row.title } : prev));
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'kcircle_conversation_participants', filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.old as { conversation_id: string };
          // Someone removed me (or I left from another device/tab) —
          // drop it from the list here too and back out of the thread if
          // it was open.
          setConversations(prev => prev.filter(c => c.id !== row.conversation_id));
          setActive(prev => (prev && prev.id === row.conversation_id ? null : prev));
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, loadConversations]);

  // For group threads, resolve sender_id -> username so messages can be labeled.
  /* eslint-disable react-hooks/set-state-in-effect -- derived lookup for the active group thread */
  useEffect(() => {
    if (!active || !active.isGroup) { setSenderNames(new Map()); return; }
    (async () => {
      const { data } = await supabase.from('kcircle_conversation_participants').select('user_id').eq('conversation_id', active.id);
      const ids = (data ?? []).map(r => r.user_id);
      if (!ids.length) return;
      const { data: profiles } = await supabase.from('creator_profiles').select('user_id, username').in('user_id', ids);
      setSenderNames(new Map((profiles ?? []).map(p => [p.user_id, p.username])));
    })();
  }, [active]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleAttachPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow picking the same file again later
    if (!file) return;
    setAttachError('');
    if (!file.type.startsWith('image/')) { setAttachError('Only images for now.'); return; }
    if (file.size > MAX_ATTACHMENT_BYTES) { setAttachError('Image too large (5MB max).'); return; }
    setAttachFile(file);
    setAttachPreview(URL.createObjectURL(file));
  };

  const clearAttach = () => { setAttachFile(null); setAttachPreview(null); setAttachError(''); };

  const sendMessage = async () => {
    if (!active || !userId || (!draft.trim() && !attachFile)) return;
    const text = draft.trim();
    const file = attachFile;
    setDraft(''); clearAttach();
    setSending(true);

    let attachmentUrl: string | null = null;
    let attachmentType: string | null = null;
    if (file) {
      const ext = file.name.split('.').pop();
      const path = `messages/${userId}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('kcircle-media').upload(path, file, { upsert: true });
      if (upErr) { setSending(false); setDraft(text); setAttachError(`Upload failed: ${upErr.message}`); return; }
      attachmentUrl = supabase.storage.from('kcircle-media').getPublicUrl(path).data.publicUrl;
      attachmentType = 'image';
    }

    // No local append and no loadMessages() call here anymore — the
    // kcircle-thread-{id} Realtime channel above is subscribed to INSERTs
    // on this same conversation_id and receives this exact row back
    // (including for the sender), so appending it here too would just
    // double it up in the bubble list.
    const { error } = await supabase.from('kcircle_messages').insert({
      conversation_id: active.id, sender_id: userId,
      text: text || null, attachment_url: attachmentUrl, attachment_type: attachmentType,
    });
    setSending(false);
    if (error) { setDraft(text); return; }
    await supabase.from('kcircle_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', active.id);

    // Notify the other participant(s) — actor-scoped insert per
    // kcircle_notifications_actor_insert, one row per recipient so a
    // group message notifies every other member, not just one.
    const { data: participantRows } = await supabase.from('kcircle_conversation_participants')
      .select('user_id').eq('conversation_id', active.id).neq('user_id', userId);
    const recipients = (participantRows ?? []).map(r => r.user_id);
    if (recipients.length) {
      await supabase.from('kcircle_notifications').insert(
        recipients.map(recipientId => ({
          recipient_id: recipientId, actor_id: userId, type: 'message' as const,
          conversation_id: active.id, preview: (text || 'Sent a photo').slice(0, 80),
        }))
      );
    }
  };

  const searchUsers = async (q: string) => {
    setSearch(q);
    if (!q.trim()) { setSearchResults([]); return; }
    const { data } = await supabase.from('creator_profiles').select('user_id, username').ilike('username', `%${q.trim()}%`).limit(8);
    setSearchResults((data ?? []).filter(u => u.user_id !== userId && !selected.some(s => s.user_id === u.user_id)));
  };

  const resetComposer = () => {
    setShowNew(false); setGroupMode(false); setGroupTitle('');
    setSelected([]); setSearch(''); setSearchResults([]);
  };

  const startDirectMessage = async (otherUserId: string, otherUsername: string) => {
    if (!userId) return;
    const existing = conversations.find(c => !c.isGroup && c.otherUserId === otherUserId);
    if (existing) { setActive(existing); resetComposer(); return; }

    const { data: convo, error } = await supabase.from('kcircle_conversations').insert({ is_group: false, created_by: userId }).select('id').single();
    if (error || !convo) return;
    await supabase.from('kcircle_conversation_participants').insert([
      { conversation_id: convo.id, user_id: userId },
      { conversation_id: convo.id, user_id: otherUserId },
    ]);
    const newConvo: ConversationRow = { id: convo.id, isGroup: false, title: otherUsername, otherUserId, memberUsernames: [otherUsername], lastMessage: 'Say hi 👋', lastAt: '' };
    setConversations(prev => [newConvo, ...prev]);
    setActive(newConvo);
    resetComposer();
  };

  const createGroup = async () => {
    if (!userId || selected.length < 2) return; // 2+ others = group of 3+
    const title = groupTitle.trim() || selected.map(s => s.username).join(', ');
    const { data: convo, error } = await supabase.from('kcircle_conversations').insert({ is_group: true, title, created_by: userId }).select('id').single();
    if (error || !convo) return;
    await supabase.from('kcircle_conversation_participants').insert([
      { conversation_id: convo.id, user_id: userId },
      ...selected.map(s => ({ conversation_id: convo.id, user_id: s.user_id })),
    ]);
    const newConvo: ConversationRow = {
      id: convo.id, isGroup: true, title, otherUserId: '',
      memberUsernames: selected.map(s => s.username), lastMessage: 'Group created 🎉', lastAt: '',
    };
    setConversations(prev => [newConvo, ...prev]);
    setActive(newConvo);
    resetComposer();
    await supabase.from('kcircle_notifications').insert(
      selected.map(s => ({ recipient_id: s.user_id, actor_id: userId, type: 'group_add' as const, conversation_id: convo.id }))
    );
  };

  const openGroupSettings = async () => {
    if (!active) return;
    setRenameValue(active.title);
    setShowGroupSettings(true);
    const { data } = await supabase.from('kcircle_conversation_participants').select('user_id').eq('conversation_id', active.id);
    const ids = (data ?? []).map(r => r.user_id);
    const { data: profiles } = ids.length
      ? await supabase.from('creator_profiles').select('user_id, username').in('user_id', ids)
      : { data: [] as { user_id: string; username: string }[] };
    setMembers((profiles ?? []).filter(p => p.user_id !== userId));
  };

  const closeGroupSettings = () => {
    setShowGroupSettings(false); setMembers([]); setAddMemberQuery(''); setAddMemberResults([]);
  };

  const saveRename = async () => {
    if (!active || !renameValue.trim()) return;
    const title = renameValue.trim();
    setGroupBusy(true);
    const { error } = await supabase.from('kcircle_conversations').update({ title }).eq('id', active.id);
    setGroupBusy(false);
    if (error) return;
    setActive(prev => prev ? { ...prev, title } : prev);
    setConversations(prev => prev.map(c => c.id === active.id ? { ...c, title } : c));
  };

  const searchAddMember = async (q: string) => {
    setAddMemberQuery(q);
    if (!q.trim() || !active) { setAddMemberResults([]); return; }
    const { data } = await supabase.from('creator_profiles').select('user_id, username').ilike('username', `%${q.trim()}%`).limit(8);
    const existingIds = new Set([userId, ...members.map(m => m.user_id)]);
    setAddMemberResults((data ?? []).filter(u => !existingIds.has(u.user_id)));
  };

  const addMember = async (u: { user_id: string; username: string }) => {
    if (!active) return;
    const { error } = await supabase.from('kcircle_conversation_participants').insert({ conversation_id: active.id, user_id: u.user_id });
    if (error) return;
    setMembers(prev => [...prev, u]);
    setConversations(prev => prev.map(c => c.id === active.id ? { ...c, memberUsernames: [...c.memberUsernames, u.username] } : c));
    setAddMemberQuery(''); setAddMemberResults([]);
    if (userId) await supabase.from('kcircle_notifications').insert({ recipient_id: u.user_id, actor_id: userId, type: 'group_add', conversation_id: active.id });
  };

  const removeMember = async (u: { user_id: string; username: string }) => {
    if (!active) return;
    const { error } = await supabase.from('kcircle_conversation_participants').delete().eq('conversation_id', active.id).eq('user_id', u.user_id);
    if (error) return;
    setMembers(prev => prev.filter(m => m.user_id !== u.user_id));
    setConversations(prev => prev.map(c => c.id === active.id ? { ...c, memberUsernames: c.memberUsernames.filter(n => n !== u.username) } : c));
  };

  const leaveGroup = async () => {
    if (!active || !userId) return;
    const { error } = await supabase.from('kcircle_conversation_participants').delete().eq('conversation_id', active.id).eq('user_id', userId);
    if (error) return;
    setConversations(prev => prev.filter(c => c.id !== active.id));
    closeGroupSettings();
    setActive(null);
  };

  if (!checkedAuth) return null;

  return (
    <div data-theme={dataTheme} style={{ ...themeVars, minHeight: '100vh', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @media (max-width: 480px) {
          .kc-chat-nav-title { font-size: 14px !important; max-width: 46vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .kc-chat-new-btn { font-size: 11px !important; padding: 6px 10px !important; }
        }
      `}</style>
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100, background: 'var(--nav-bg)', backdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--border-color)', padding: '0 14px', height: '56px',
        display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0,
      }}>
        {active ? (
          <button onClick={() => setActive(null)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--text-primary)' }}>←</button>
        ) : (
          <Link href="/kalpana-circle" style={{ fontSize: '18px', textDecoration: 'none', color: 'var(--text-primary)' }}>←</Link>
        )}
        <span className="kc-chat-nav-title" style={{ fontWeight: 800, fontSize: '15px' }}>{active ? active.title : 'K Circle Chat'}</span>
        {active && active.isGroup && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <Link href={`/kalpana-circle/group/${active.id}`} style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-tertiary)', textDecoration: 'none' }} title="Channels &amp; roles">
              # Channels
            </Link>
            <button onClick={openGroupSettings} style={{
              background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--text-primary)',
            }} title="Group settings">ⓘ</button>
            <ThemeToggle size={26} onChange={setIsLight} defaultLight={false} syncGlobal={false} />
          </div>
        )}
        {active && !active.isGroup && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
            <ThemeToggle size={26} onChange={setIsLight} defaultLight={false} syncGlobal={false} />
          </div>
        )}
        {!active && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <NotificationBell userId={userId} iconSize={18} />
            <ThemeToggle size={26} onChange={setIsLight} defaultLight={false} syncGlobal={false} />
            <button className="kc-chat-new-btn" onClick={() => { setShowNew(v => !v); if (showNew) resetComposer(); }} style={{
              fontSize: '12px', fontWeight: 800, padding: '6px 12px', borderRadius: '8px', border: 'none',
              background: RADIANT, color: '#27272a', cursor: 'pointer',
            }}>+ New</button>
          </div>
        )}
      </nav>

      {showGroupSettings && active && (
        <div onClick={closeGroupSettings} style={{
          position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.45)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '8vh',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: '92%', maxWidth: '440px', maxHeight: '78vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px',
            background: 'var(--bg-primary)', borderRadius: '14px', border: '1px solid var(--border-color)', padding: '16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 800, fontSize: '14px' }}>Group settings</span>
              <button onClick={closeGroupSettings} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--text-primary)' }}>✕</button>
            </div>

            <div>
              <label style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--text-tertiary)', letterSpacing: '0.05em' }}>GROUP NAME</label>
              <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                <input value={renameValue} onChange={e => setRenameValue(e.target.value)} style={{
                  flex: 1, fontSize: '13px', padding: '8px 12px', borderRadius: '8px', boxSizing: 'border-box',
                  border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', outline: 'none',
                }} />
                <button onClick={saveRename} disabled={groupBusy || !renameValue.trim()} style={{
                  fontSize: '12px', fontWeight: 800, padding: '8px 14px', borderRadius: '8px', border: 'none',
                  background: RADIANT, color: '#27272a', cursor: 'pointer', flexShrink: 0,
                }}>Save</button>
              </div>
            </div>

            <div>
              <label style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--text-tertiary)', letterSpacing: '0.05em' }}>MEMBERS · {members.length + 1}</label>
              <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0' }}>
                  <Avatar name="you" size={28} />
                  <span style={{ fontSize: '12.5px', fontWeight: 700 }}>You</span>
                </div>
                {members.map(m => (
                  <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0' }}>
                    <Avatar name={m.username} size={28} />
                    <span style={{ fontSize: '12.5px', fontWeight: 700, flex: 1 }}>{m.username}</span>
                    <button onClick={() => removeMember(m)} style={{
                      fontSize: '11px', fontWeight: 700, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer',
                    }}>Remove</button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--text-tertiary)', letterSpacing: '0.05em' }}>ADD MEMBER</label>
              <input
                value={addMemberQuery}
                onChange={e => searchAddMember(e.target.value)}
                placeholder="Search username…"
                style={{
                  width: '100%', fontSize: '13px', padding: '8px 12px', borderRadius: '8px', marginTop: '6px', boxSizing: 'border-box',
                  border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', outline: 'none',
                }}
              />
              {addMemberResults.map(u => (
                <div key={u.user_id} onClick={() => addMember(u)} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 2px', cursor: 'pointer' }}>
                  <Avatar name={u.username} size={26} />
                  <span style={{ fontSize: '12.5px', fontWeight: 700 }}>{u.username}</span>
                </div>
              ))}
            </div>

            <button onClick={leaveGroup} style={{
              fontSize: '12.5px', fontWeight: 800, padding: '10px 0', borderRadius: '8px',
              border: '1px solid #ef4444', background: 'none', color: '#ef4444', cursor: 'pointer',
            }}>Leave group</button>
          </div>
        </div>
      )}

      {!active && showNew && (
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-color)', maxWidth: '640px', width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
            <button onClick={() => { setGroupMode(false); setSelected([]); }} style={{
              flex: 1, fontSize: '12px', fontWeight: 800, padding: '7px 0', borderRadius: '8px', cursor: 'pointer',
              border: groupMode ? '1px solid var(--border-color)' : 'none',
              background: groupMode ? 'var(--bg-card)' : RADIANT, color: groupMode ? 'var(--text-secondary)' : '#27272a',
            }}>Direct message</button>
            <button onClick={() => setGroupMode(true)} style={{
              flex: 1, fontSize: '12px', fontWeight: 800, padding: '7px 0', borderRadius: '8px', cursor: 'pointer',
              border: groupMode ? 'none' : '1px solid var(--border-color)',
              background: groupMode ? RADIANT : 'var(--bg-card)', color: groupMode ? '#27272a' : 'var(--text-secondary)',
            }}>Group chat</button>
          </div>

          {groupMode && selected.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
              {selected.map(s => (
                <span key={s.user_id} onClick={() => setSelected(prev => prev.filter(p => p.user_id !== s.user_id))} style={{
                  fontSize: '11.5px', fontWeight: 700, padding: '5px 10px', borderRadius: '999px', cursor: 'pointer',
                  background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                }}>{s.username} ✕</span>
              ))}
            </div>
          )}

          {groupMode && (
            <input
              value={groupTitle}
              onChange={e => setGroupTitle(e.target.value)}
              placeholder="Group name (optional)"
              style={{
                width: '100%', fontSize: '13px', padding: '9px 12px', borderRadius: '8px', marginBottom: '8px',
                border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box',
              }}
            />
          )}

          <input
            value={search}
            onChange={e => searchUsers(e.target.value)}
            placeholder="Search username…"
            style={{
              width: '100%', fontSize: '13px', padding: '9px 12px', borderRadius: '8px', boxSizing: 'border-box',
              border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', outline: 'none',
            }}
          />
          {searchResults.map(u => (
            <div key={u.user_id} onClick={() => {
              if (groupMode) {
                if (selected.length >= MAX_GROUP_MEMBERS) return;
                setSelected(prev => [...prev, u]);
                setSearch(''); setSearchResults([]);
              } else {
                startDirectMessage(u.user_id, u.username);
              }
            }} style={{
              display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 4px', cursor: 'pointer',
            }}>
              <Avatar name={u.username} size={30} />
              <span style={{ fontSize: '13px', fontWeight: 700 }}>{u.username}</span>
            </div>
          ))}

          {groupMode && (
            <button
              onClick={createGroup}
              disabled={selected.length < 2}
              style={{
                marginTop: '10px', width: '100%', fontSize: '13px', fontWeight: 800, padding: '10px 0', borderRadius: '8px', border: 'none',
                background: selected.length < 2 ? 'var(--bg-card)' : RADIANT,
                color: selected.length < 2 ? 'var(--text-tertiary)' : '#27272a',
                cursor: selected.length < 2 ? 'not-allowed' : 'pointer',
              }}
            >{selected.length < 2 ? `Pick at least 2 people (${selected.length}/2)` : `Create group with ${selected.length} people`}</button>
          )}
        </div>
      )}

      {!active ? (
        <div style={{ flex: 1, overflowY: 'auto', maxWidth: '640px', width: '100%', margin: '0 auto' }}>
          {loadingList ? (
            <p style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px', padding: '30px 0' }}>Loading chats…</p>
          ) : conversations.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center' }}>
              <p style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
                No conversations yet. Tap <b>+ New</b> to message someone or start a group.
              </p>
            </div>
          ) : conversations.map(c => (
            <div key={c.id} onClick={() => setActive(c)} style={{
              display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', cursor: 'pointer',
              borderBottom: '1px solid var(--border-color)',
            }}>
              {c.isGroup ? <GroupAvatar names={c.memberUsernames} size={44} /> : <Avatar name={c.title} size={44} />}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '13.5px', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.title}{c.isGroup && <span style={{ marginLeft: '6px', fontSize: '10.5px', fontWeight: 700, color: 'var(--text-tertiary)' }}>· {c.memberUsernames.length + 1} members</span>}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.lastMessage}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '14px', maxWidth: '640px', width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
            {messages.map(m => {
              const mine = m.sender_id === userId;
              return (
                <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start', marginBottom: '8px' }}>
                  {!mine && active.isGroup && (
                    <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--text-tertiary)', margin: '0 4px 2px' }}>
                      {senderNames.get(m.sender_id) ?? 'dreamer'}
                    </span>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '75%', alignItems: mine ? 'flex-end' : 'flex-start' }}>
                    {m.short_ref_id && (
                      <Link href={`/katube/shorts/${m.short_ref_id}`} style={{
                        fontSize: '10px', color: 'var(--text-tertiary)', textDecoration: 'none',
                        display: 'flex', alignItems: 'center', gap: '4px',
                      }}>📎 About a Short — open it →</Link>
                    )}
                    {m.attachment_url && (
                      <img
                        src={m.attachment_url}
                        alt="attachment"
                        onClick={() => window.open(m.attachment_url!, '_blank')}
                        style={{
                          display: 'block', maxWidth: '240px', maxHeight: '320px', borderRadius: '14px',
                          cursor: 'pointer', objectFit: 'cover',
                          border: mine ? 'none' : '1px solid var(--border-color)',
                        }}
                      />
                    )}
                    {m.text && (
                      <div style={{
                        padding: '9px 13px', borderRadius: '16px', fontSize: '13.5px', lineHeight: 1.4,
                        background: mine ? RADIANT : 'var(--bg-card)',
                        color: mine ? '#27272a' : 'var(--text-primary)',
                        border: mine ? 'none' : '1px solid var(--border-color)',
                      }}>{m.text}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{
            borderTop: '1px solid var(--border-color)', maxWidth: '640px', width: '100%', margin: '0 auto',
            boxSizing: 'border-box', flexShrink: 0,
          }}>
            {attachPreview && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px 0' }}>
                <div style={{ position: 'relative' }}>
                  <img src={attachPreview} alt="preview" style={{ width: '52px', height: '52px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border-color)' }} />
                  <button onClick={clearAttach} style={{
                    position: 'absolute', top: '-6px', right: '-6px', width: '18px', height: '18px', borderRadius: '50%',
                    border: 'none', background: '#ef4444', color: '#fff', fontSize: '11px', fontWeight: 800, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                  }}>✕</button>
                </div>
                <span style={{ fontSize: '11.5px', color: 'var(--text-tertiary)' }}>Photo attached</span>
              </div>
            )}
            {attachError && <p style={{ fontSize: '11.5px', color: '#ef4444', padding: '6px 14px 0', margin: 0 }}>{attachError}</p>}
            <div style={{ display: 'flex', gap: '8px', padding: '10px 14px', alignItems: 'center' }}>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAttachPick} style={{ display: 'none' }} />
              <button
                onClick={() => fileInputRef.current?.click()}
                title="Attach photo"
                style={{
                  width: '36px', height: '36px', borderRadius: '50%', border: '1px solid var(--border-color)',
                  background: 'var(--bg-card)', color: 'var(--text-secondary)', cursor: 'pointer', flexShrink: 0,
                  fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >📷</button>
              <input
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') sendMessage(); }}
                placeholder="Message…"
                style={{
                  flex: 1, minWidth: 0, fontSize: '13.5px', padding: '10px 14px', borderRadius: '20px',
                  border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', outline: 'none',
                }}
              />
              <button
                onClick={sendMessage}
                disabled={sending || (!draft.trim() && !attachFile)}
                style={{
                  fontSize: '13px', fontWeight: 800, padding: '10px 18px', borderRadius: '20px', border: 'none',
                  background: RADIANT, color: '#27272a', cursor: sending ? 'default' : 'pointer', flexShrink: 0,
                  opacity: (sending || (!draft.trim() && !attachFile)) ? 0.5 : 1,
                }}
              >{sending ? '…' : 'Send'}</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
