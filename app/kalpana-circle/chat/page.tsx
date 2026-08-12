'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';

// ── K Circle chat — DMs between two users. ──
// Backend: kcircle_conversations, kcircle_conversation_participants, kcircle_messages
// (supabase/migrations/20260812_kcircle_social.sql). Polling every 3s on the open
// thread instead of Supabase Realtime, to keep this to patterns already proven in
// this codebase (no realtime channel usage elsewhere yet).

const RADIANT = 'linear-gradient(135deg, #71717a 0%, #d4d4d8 45%, #f4f4f5 60%, #a1a1aa 100%)';

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

interface ConversationRow {
  id: string;
  otherUserId: string;
  otherUsername: string;
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

  const [showNew, setShowNew] = useState(false);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<{ user_id: string; username: string }[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- auth check on mount */
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
      setCheckedAuth(true);
    });
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (checkedAuth && !userId) router.replace('/login?next=/kalpana-circle/chat');
  }, [checkedAuth, userId, router]);

  const loadConversations = useCallback(async () => {
    if (!userId) return;
    setLoadingList(true);
    const { data: myRows } = await supabase.from('kcircle_conversation_participants').select('conversation_id').eq('user_id', userId);
    const convoIds = (myRows ?? []).map(r => r.conversation_id);
    if (convoIds.length === 0) { setConversations([]); setLoadingList(false); return; }

    const { data: allParticipants } = await supabase.from('kcircle_conversation_participants').select('conversation_id, user_id').in('conversation_id', convoIds);
    const otherIdByConvo = new Map<string, string>();
    (allParticipants ?? []).forEach(p => { if (p.user_id !== userId) otherIdByConvo.set(p.conversation_id, p.user_id); });

    const otherUserIds = Array.from(new Set(Array.from(otherIdByConvo.values())));
    const { data: profiles } = otherUserIds.length
      ? await supabase.from('creator_profiles').select('user_id, username').in('user_id', otherUserIds)
      : { data: [] as { user_id: string; username: string }[] };
    const usernameMap = new Map((profiles ?? []).map(p => [p.user_id, p.username]));

    const { data: lastMessages } = await supabase.from('kcircle_messages').select('conversation_id, text, created_at').in('conversation_id', convoIds).order('created_at', { ascending: false });
    const lastByConvo = new Map<string, { text: string; created_at: string }>();
    (lastMessages ?? []).forEach(m => { if (!lastByConvo.has(m.conversation_id)) lastByConvo.set(m.conversation_id, m); });

    const rows: ConversationRow[] = convoIds.map(id => ({
      id,
      otherUserId: otherIdByConvo.get(id) ?? '',
      otherUsername: usernameMap.get(otherIdByConvo.get(id) ?? '') ?? 'dreamer',
      lastMessage: lastByConvo.get(id)?.text ?? 'Say hi 👋',
      lastAt: lastByConvo.get(id)?.created_at ?? '',
    })).sort((a, b) => (b.lastAt || '').localeCompare(a.lastAt || ''));

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
    setSearchResults((data ?? []).filter(u => u.user_id !== userId));
  };

  const startConversation = async (otherUserId: string, otherUsername: string) => {
    if (!userId) return;
    // check for an existing conversation with exactly these two participants
    const existing = conversations.find(c => c.otherUserId === otherUserId);
    if (existing) { setActive(existing); setShowNew(false); setSearch(''); setSearchResults([]); return; }

    const { data: convo, error } = await supabase.from('kcircle_conversations').insert({}).select('id').single();
    if (error || !convo) return;
    await supabase.from('kcircle_conversation_participants').insert([
      { conversation_id: convo.id, user_id: userId },
      { conversation_id: convo.id, user_id: otherUserId },
    ]);
    const newConvo: ConversationRow = { id: convo.id, otherUserId, otherUsername, lastMessage: 'Say hi 👋', lastAt: '' };
    setConversations(prev => [newConvo, ...prev]);
    setActive(newConvo);
    setShowNew(false); setSearch(''); setSearchResults([]);
  };

  if (!checkedAuth) return null;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', display: 'flex', flexDirection: 'column' }}>
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
        <span style={{ fontWeight: 800, fontSize: '15px' }}>{active ? active.otherUsername : 'K Circle Chat'}</span>
        {!active && (
          <button onClick={() => setShowNew(v => !v)} style={{
            marginLeft: 'auto', fontSize: '12px', fontWeight: 800, padding: '6px 12px', borderRadius: '8px', border: 'none',
            background: RADIANT, color: '#27272a', cursor: 'pointer',
          }}>+ New</button>
        )}
      </nav>

      {!active && showNew && (
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-color)' }}>
          <input
            value={search}
            onChange={e => searchUsers(e.target.value)}
            placeholder="Search username…"
            style={{
              width: '100%', fontSize: '13px', padding: '9px 12px', borderRadius: '8px',
              border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', outline: 'none',
            }}
          />
          {searchResults.map(u => (
            <div key={u.user_id} onClick={() => startConversation(u.user_id, u.username)} style={{
              display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 4px', cursor: 'pointer',
            }}>
              <Avatar name={u.username} size={30} />
              <span style={{ fontSize: '13px', fontWeight: 700 }}>{u.username}</span>
            </div>
          ))}
        </div>
      )}

      {!active ? (
        <div style={{ flex: 1, overflowY: 'auto', maxWidth: '640px', width: '100%', margin: '0 auto' }}>
          {loadingList ? (
            <p style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px', padding: '30px 0' }}>Loading chats…</p>
          ) : conversations.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center' }}>
              <p style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
                No conversations yet. Tap <b>+ New</b> and search a username to start one.
              </p>
            </div>
          ) : conversations.map(c => (
            <div key={c.id} onClick={() => setActive(c)} style={{
              display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', cursor: 'pointer',
              borderBottom: '1px solid var(--border-color)',
            }}>
              <Avatar name={c.otherUsername} size={44} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '13.5px', fontWeight: 800 }}>{c.otherUsername}</div>
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
                <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', marginBottom: '8px' }}>
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
