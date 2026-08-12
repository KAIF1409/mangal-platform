'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';

// ── K Circle chat — DMs + group chats. ──
// Backend: kcircle_conversations (is_group/title/created_by),
// kcircle_conversation_participants, kcircle_messages
// (supabase/migrations/20260812_kcircle_social.sql +
// 20260812101451_kcircle_fix_participant_rls_and_groups.sql +
// 20260812110000_kcircle_group_chat_schema_and_rls_fix.sql).
// Polling every 3s on the open thread instead of Supabase Realtime, to keep
// this to patterns already proven in this codebase (no realtime channel
// usage elsewhere yet).

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
  text: string;
  created_at: string;
}

export default function KCircleChatPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [checkedAuth, setCheckedAuth] = useState(false);

  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [active, setActive] = useState<ConversationRow | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [draft, setDraft] = useState('');
  const [senderNames, setSenderNames] = useState<Map<string, string>>(new Map());

  const [showNew, setShowNew] = useState(false);
  const [groupMode, setGroupMode] = useState(false);
  const [groupTitle, setGroupTitle] = useState('');
  const [selected, setSelected] = useState<{ user_id: string; username: string }[]>([]);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<{ user_id: string; username: string }[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

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

    const { data: lastMessages } = await supabase.from('kcircle_messages').select('conversation_id, text, created_at').in('conversation_id', convoIds).order('created_at', { ascending: false });
    const lastByConvo = new Map<string, { text: string; created_at: string }>();
    (lastMessages ?? []).forEach(m => { if (!lastByConvo.has(m.conversation_id)) lastByConvo.set(m.conversation_id, m); });

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
    const { data } = await supabase.from('kcircle_messages').select('id, conversation_id, sender_id, text, created_at').eq('conversation_id', conversationId).order('created_at', { ascending: true });
    setMessages(data ?? []);
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 50);
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect -- polling data fetch when active thread changes */
  useEffect(() => {
    if (!active) return;
    loadMessages(active.id);
    const interval = setInterval(() => loadMessages(active.id), 3000);
    return () => clearInterval(interval);
  }, [active, loadMessages]);
  /* eslint-enable react-hooks/set-state-in-effect */

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

  const sendMessage = async () => {
    if (!active || !userId || !draft.trim()) return;
    const text = draft.trim();
    setDraft('');
    await supabase.from('kcircle_messages').insert({ conversation_id: active.id, sender_id: userId, text });
    await supabase.from('kcircle_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', active.id);
    loadMessages(active.id);
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
  };

  if (!checkedAuth) return null;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', display: 'flex', flexDirection: 'column' }}>
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
        {!active && (
          <button className="kc-chat-new-btn" onClick={() => { setShowNew(v => !v); if (showNew) resetComposer(); }} style={{
            marginLeft: 'auto', fontSize: '12px', fontWeight: 800, padding: '6px 12px', borderRadius: '8px', border: 'none',
            background: RADIANT, color: '#27272a', cursor: 'pointer',
          }}>+ New</button>
        )}
      </nav>

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
                  <div style={{
                    maxWidth: '75%', padding: '9px 13px', borderRadius: '16px', fontSize: '13.5px', lineHeight: 1.4,
                    background: mine ? RADIANT : 'var(--bg-card)',
                    color: mine ? '#27272a' : 'var(--text-primary)',
                    border: mine ? 'none' : '1px solid var(--border-color)',
                  }}>{m.text}</div>
                </div>
              );
            })}
          </div>
          <div style={{
            display: 'flex', gap: '8px', padding: '10px 14px', borderTop: '1px solid var(--border-color)',
            maxWidth: '640px', width: '100%', margin: '0 auto', boxSizing: 'border-box', flexShrink: 0,
          }}>
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
            <button onClick={sendMessage} style={{
              fontSize: '13px', fontWeight: 800, padding: '10px 18px', borderRadius: '20px', border: 'none',
              background: RADIANT, color: '#27272a', cursor: 'pointer', flexShrink: 0,
            }}>Send</button>
          </div>
        </>
      )}
    </div>
  );
}
