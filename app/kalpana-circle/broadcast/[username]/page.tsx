'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
import { setPostLoginRedirect } from '../../../lib/authRedirect';
import ThemeToggle from '../../../components/ThemeToggle';
import { useKCircleTheme } from '../../theme';
import { KCircleShellStyle, KCircleRail } from '../../components/Shell';
import { Search, ArrowLeft, Megaphone, Heart, MessageCircle } from 'lucide-react';

// ── K Circle — creator broadcast channel ──
// Discord-style announcement channel: the creator posts, fans can only
// like/comment (no reply-noise from a normal open group). One channel per
// creator, created lazily on first visit. Backend: kcircle_conversations
// (is_broadcast=true, created_by=creator, no participant rows — fans read
// it without being "added"), kcircle_messages, kcircle_broadcast_likes,
// kcircle_broadcast_comments. See
// supabase/migrations/20260813120000_kcircle_broadcast_channels.sql.

const RADIANT = 'linear-gradient(135deg, #71717a 0%, #d4d4d8 45%, #f4f4f5 60%, #a1a1aa 100%)';

function initials(name: string) { return name.slice(0, 2).toUpperCase(); }

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

interface BroadcastMsg {
  id: string;
  text: string;
  created_at: string;
  likeCount: number;
  likedByMe: boolean;
  comments: { id: string; author_id: string; author: string; text: string; created_at: string }[];
  commentDraft: string;
  showComments: boolean;
}

export default function BroadcastChannelPage() {
  const { setIsLight, themeVars, dataTheme } = useKCircleTheme();
  const params = useParams();
  const router = useRouter();
  const username = decodeURIComponent(params.username as string);

  const [userId, setUserId] = useState<string | null>(null);
  const [creator, setCreator] = useState<{ user_id: string; username: string } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<BroadcastMsg[]>([]);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');
  // Viewer's own username/avatar — this page never needed these before, but
  // the shared K Circle rail's profile icon does (see components/Shell.tsx, §66).
  const [myUsername, setMyUsername] = useState<string | null>(null);
  const [myAvatarUrl, setMyAvatarUrl] = useState<string | null>(null);

  const isOwner = !!userId && !!creator && userId === creator.user_id;

  const loadMessages = useCallback(async (convoId: string) => {
    const { data: rows } = await supabase
      .from('kcircle_messages').select('id, text, created_at')
      .eq('conversation_id', convoId).order('created_at', { ascending: false }).limit(50);
    if (!rows || rows.length === 0) { setMessages([]); return; }

    const msgIds = rows.map(r => r.id);
    const [likesRes, commentsRes, myLikesRes] = await Promise.all([
      supabase.from('kcircle_broadcast_likes').select('message_id').in('message_id', msgIds),
      supabase.from('kcircle_broadcast_comments').select('id, message_id, author_id, text, created_at').in('message_id', msgIds).order('created_at', { ascending: true }),
      userId
        ? supabase.from('kcircle_broadcast_likes').select('message_id').eq('liker_id', userId).in('message_id', msgIds)
        : Promise.resolve({ data: [] as { message_id: string }[] }),
    ]);

    const commentAuthorIds = Array.from(new Set((commentsRes.data ?? []).map(c => c.author_id)));
    const { data: authorRows } = commentAuthorIds.length
      ? await supabase.from('creator_profiles').select('user_id, username').in('user_id', commentAuthorIds)
      : { data: [] as { user_id: string; username: string }[] };
    const usernameMap = new Map((authorRows ?? []).map(a => [a.user_id, a.username]));

    const likeCounts = new Map<string, number>();
    (likesRes.data ?? []).forEach(l => likeCounts.set(l.message_id, (likeCounts.get(l.message_id) ?? 0) + 1));
    const myLiked = new Set((myLikesRes.data ?? []).map(l => l.message_id));
    const commentsByMsg = new Map<string, BroadcastMsg['comments']>();
    (commentsRes.data ?? []).forEach(c => {
      const list = commentsByMsg.get(c.message_id) ?? [];
      list.push({ id: c.id, author_id: c.author_id, author: usernameMap.get(c.author_id) ?? 'dreamer', text: c.text, created_at: c.created_at });
      commentsByMsg.set(c.message_id, list);
    });

    setMessages(rows.map(r => ({
      id: r.id, text: r.text, created_at: r.created_at,
      likeCount: likeCounts.get(r.id) ?? 0,
      likedByMe: myLiked.has(r.id),
      comments: commentsByMsg.get(r.id) ?? [],
      commentDraft: '',
      showComments: false,
    })));
  }, [userId]);

  /* eslint-disable react-hooks/set-state-in-effect -- data fetch on userId change, same pattern as ../../chat/page.tsx */
  useEffect(() => {
    if (!userId) { setMyUsername(null); setMyAvatarUrl(null); return; }
    supabase.from('creator_profiles').select('username, avatar_url').eq('user_id', userId).maybeSingle()
      .then(({ data }) => { setMyUsername(data?.username ?? null); setMyAvatarUrl(data?.avatar_url ?? null); });
  }, [userId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    const load = async () => {
      setLoading(true); setNotFound(false);

      const { data: authUser } = await supabase.auth.getUser();
      const uid = authUser.user?.id ?? null;
      setUserId(uid);
      // Eager cookie set (same fix as kalpana-circle/page.tsx and
      // katube/upload) — covers the "Log in to comment" <Link> below
      // without relying on the ?next= query param surviving Next.js's
      // Link/prefetch quirk.
      if (!uid) setPostLoginRedirect(`/kalpana-circle/broadcast/${username}`);

      const { data: creatorRow } = await supabase
        .from('creator_profiles').select('user_id, username').ilike('username', username).single();
      if (!creatorRow) { setNotFound(true); setLoading(false); return; }
      setCreator(creatorRow);

      const { data: convoRow } = await supabase
        .from('kcircle_conversations').select('id')
        .eq('created_by', creatorRow.user_id).eq('is_broadcast', true).maybeSingle();

      let convoId = convoRow?.id ?? null;

      // Lazily create the channel the first time its owner visits.
      if (!convoId && uid === creatorRow.user_id) {
        const { data: created, error: createErr } = await supabase
          .from('kcircle_conversations')
          .insert({ is_broadcast: true, is_group: true, created_by: uid, title: `Updates from ${creatorRow.username}` })
          .select('id').single();
        if (!createErr) convoId = created.id;
      }

      setConversationId(convoId);
      if (convoId) await loadMessages(convoId);
      setLoading(false);
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per username; loadMessages intentionally not in deps to avoid re-running the whole load() on every userId change
  }, [username]);

  const postBroadcast = async () => {
    if (!userId || !conversationId || !draft.trim()) return;
    setPosting(true); setError('');
    const { error: err } = await supabase.from('kcircle_messages').insert({
      conversation_id: conversationId, sender_id: userId, text: draft.trim(),
    });
    if (err) { setError(err.message); setPosting(false); return; }
    setDraft(''); setPosting(false);
    await loadMessages(conversationId);

    // Notify everyone who follows any of this creator's series — the
    // closest thing to a "subscriber list" that already exists (no
    // broadcast-specific subscription table). Fire-and-forget, same
    // pattern as app/kalpana-circle/page.tsx's `notify`.
    const { data: seriesRows } = await supabase.from('series').select('id').eq('creator_id', userId);
    const seriesIds = (seriesRows ?? []).map(s => s.id);
    if (seriesIds.length > 0) {
      const { data: followRows } = await supabase.from('follows').select('reader_id').in('series_id', seriesIds);
      const recipientIds = Array.from(new Set((followRows ?? []).map(f => f.reader_id))).filter(id => id !== userId);
      if (recipientIds.length > 0) {
        const preview = draft.trim().slice(0, 80);
        supabase.from('kcircle_notifications').insert(
          recipientIds.map(recipientId => ({
            recipient_id: recipientId, actor_id: userId, type: 'broadcast',
            conversation_id: conversationId, preview,
          }))
        ).then();
      }
    }
  };

  const toggleLike = async (msg: BroadcastMsg) => {
    if (!userId) { setPostLoginRedirect('/kalpana-circle'); router.push(`/login?next=${encodeURIComponent('/kalpana-circle')}`); return; }
    setMessages(prev => prev.map(m => m.id === msg.id
      ? { ...m, likedByMe: !m.likedByMe, likeCount: m.likeCount + (m.likedByMe ? -1 : 1) }
      : m));
    if (msg.likedByMe) {
      await supabase.from('kcircle_broadcast_likes').delete().eq('message_id', msg.id).eq('liker_id', userId);
    } else {
      await supabase.from('kcircle_broadcast_likes').insert({ message_id: msg.id, liker_id: userId });
    }
  };

  const submitComment = async (msg: BroadcastMsg) => {
    if (!userId || !msg.commentDraft.trim()) return;
    const text = msg.commentDraft.trim();
    const { data, error: err } = await supabase
      .from('kcircle_broadcast_comments')
      .insert({ message_id: msg.id, author_id: userId, text })
      .select('id, author_id, text, created_at').single();
    if (err || !data) return;
    setMessages(prev => prev.map(m => m.id === msg.id
      ? { ...m, commentDraft: '', comments: [...m.comments, { id: data.id, author_id: data.author_id, author: 'you', text: data.text, created_at: data.created_at }] }
      : m));
  };

  if (loading) {
    return <div data-theme={dataTheme} style={{ ...themeVars, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', background: 'var(--bg-primary)' }}>Loading…</div>;
  }

  if (notFound || !creator) {
    return (
      <div data-theme={dataTheme} style={{ ...themeVars, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', color: 'var(--text-primary)', padding: '24px', textAlign: 'center' }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '10px' }}><Search size={32} strokeWidth={1.5} color="var(--text-tertiary)" /></div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>No creator named &ldquo;@{username}&rdquo; found.</p>
          <Link href="/kalpana-circle" style={{ color: '#a78bfa', fontSize: '12px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}><ArrowLeft size={12} strokeWidth={2} /> Back to Kalpana Circle</Link>
        </div>
      </div>
    );
  }

  return (
    <div data-theme={dataTheme} style={{ ...themeVars, minHeight: '100vh', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <KCircleShellStyle />
      <div className="kc-shell">
        <KCircleRail
          active="broadcasts"
          userId={userId}
          myUsername={myUsername}
          myAvatarUrl={myAvatarUrl}
          profileHref={userId ? (myUsername ? `/kalpana-circle/profile/${myUsername}` : '/kalpana-circle/settings') : '/login?next=/kalpana-circle'}
          navHref={(path) => (userId ? path : `/login?next=${encodeURIComponent(path)}`)}
          setIsLight={setIsLight}
        />
        <div className="kc-main">
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100, background: 'var(--nav-bg)', backdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--border-color)', padding: '0 16px', height: '58px',
        display: 'flex', alignItems: 'center', gap: '12px',
      }}>
        <Link href="/kalpana-circle" style={{ textDecoration: 'none', color: 'var(--text-tertiary)', display: 'flex' }}><ArrowLeft size={18} strokeWidth={2} /></Link>
        <div style={{
          width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0, background: RADIANT,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 800, color: '#27272a',
        }}>{initials(creator.username)}</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: '13.5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px' }}><Megaphone size={13} strokeWidth={2} /> Updates from @{creator.username}</div>
          <div style={{ fontSize: '10.5px', color: 'var(--text-tertiary)' }}>Broadcast channel · read + react</div>
        </div>
        <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
          <ThemeToggle size={26} onChange={setIsLight} defaultLight={false} syncGlobal={false} />
        </div>
      </nav>

      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '16px 14px 80px' }}>
        {isOwner && (
          <div style={{
            padding: '12px 14px', borderRadius: '14px', background: 'var(--bg-card)',
            border: '1px solid var(--border-color)', marginBottom: '18px',
          }}>
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder="Post an update to your fans…"
              rows={2}
              style={{
                width: '100%', border: 'none', outline: 'none', resize: 'none', background: 'transparent',
                color: 'var(--text-primary)', fontSize: '13.5px', fontFamily: 'inherit', boxSizing: 'border-box',
              }}
            />
            {error && <p style={{ fontSize: '12px', color: '#ef4444', margin: '6px 0 0' }}>{error}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button onClick={postBroadcast} disabled={posting || !draft.trim()} style={{
                fontSize: '12.5px', fontWeight: 800, padding: '8px 20px', borderRadius: '8px', border: 'none',
                background: RADIANT, color: '#27272a', cursor: posting ? 'wait' : 'pointer', opacity: draft.trim() ? 1 : 0.6,
                display: 'inline-flex', alignItems: 'center', gap: '6px',
              }}>{posting ? 'Posting…' : (<><Megaphone size={13} strokeWidth={2} /> Broadcast</>)}</button>
            </div>
          </div>
        )}

        {!conversationId ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-faint)' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '10px' }}><Megaphone size={32} strokeWidth={1.5} color="var(--text-faint)" /></div>
            <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>@{creator.username} hasn&apos;t started broadcasting yet.</div>
          </div>
        ) : messages.length === 0 ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-faint)' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>No updates yet — check back soon.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {messages.map(msg => (
              <div key={msg.id} style={{ padding: '14px 16px', borderRadius: '14px', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 800 }}>@{creator.username}</span>
                  <span style={{ fontSize: '10.5px', color: 'var(--text-tertiary)' }}>{timeAgo(msg.created_at)}</span>
                </div>
                <p style={{ fontSize: '13.5px', lineHeight: 1.5, margin: '0 0 10px', whiteSpace: 'pre-wrap' }}>{msg.text}</p>
                <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--text-tertiary)' }}>
                  <button onClick={() => toggleLike(msg)} style={{
                    background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px',
                    color: msg.likedByMe ? '#a78bfa' : 'var(--text-tertiary)', fontWeight: msg.likedByMe ? 800 : 500,
                    display: 'flex', alignItems: 'center', gap: '4px',
                  }}><Heart size={13} strokeWidth={2} fill={msg.likedByMe ? '#a78bfa' : 'none'} /> {msg.likeCount > 0 ? msg.likeCount : ''}</button>
                  <button onClick={() => setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, showComments: !m.showComments } : m))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--text-tertiary)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <MessageCircle size={13} strokeWidth={2} /> {msg.comments.length > 0 ? msg.comments.length : 'Comment'}
                  </button>
                </div>

                {msg.showComments && (
                  <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border-color)' }}>
                    {msg.comments.map(c => (
                      <div key={c.id} style={{ fontSize: '12px', marginBottom: '6px' }}>
                        <span style={{ fontWeight: 700 }}>@{c.author}</span>{' '}
                        <span style={{ color: 'var(--text-secondary)' }}>{c.text}</span>
                      </div>
                    ))}
                    {userId ? (
                      <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                        <input
                          value={msg.commentDraft}
                          onChange={e => setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, commentDraft: e.target.value } : m))}
                          onKeyDown={e => { if (e.key === 'Enter') submitComment(msg); }}
                          placeholder="Add a comment…"
                          style={{
                            flex: 1, minWidth: 0, padding: '6px 10px', borderRadius: '8px', fontSize: '12px',
                            border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-primary)', outline: 'none',
                          }}
                        />
                        <button onClick={() => submitComment(msg)} disabled={!msg.commentDraft.trim()} style={{
                          fontSize: '11.5px', fontWeight: 700, padding: '6px 12px', borderRadius: '8px', border: 'none',
                          background: RADIANT, color: '#27272a', cursor: 'pointer', opacity: msg.commentDraft.trim() ? 1 : 0.6,
                        }}>Send</button>
                      </div>
                    ) : (
                      <Link href={`/login?next=${encodeURIComponent(`/kalpana-circle/broadcast/${username}`)}`} style={{ fontSize: '11.5px', color: '#a78bfa' }}>Log in to comment</Link>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
        </div>{/* /.kc-main */}
      </div>{/* /.kc-shell */}
    </div>
  );
}
