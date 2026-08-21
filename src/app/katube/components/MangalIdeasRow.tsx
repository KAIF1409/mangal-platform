'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { Sparkles, BookOpen, Users, ArrowRight, Handshake, Check } from 'lucide-react';

// §0/Phase 1 "Unique for Mangal" — Mangal Ideas feed, build steps 6+7 (see
// CONTEXT.md §0c). Reads the get_mangal_ideas_feed(max_cards) RPC — min 1,
// max 4 cards, mixing three source types: company (admin-authored),
// story_demand (trending WebMangal series with no/low KaTube adaptation),
// audience (top Kalpana Circle idea post by engagement). Same
// "self-contained, returns null when empty" pattern as ContinueWatchingRow.
//
// Each card renders its "connection link": story_demand → the WebMangal
// series page, audience → the post author's Kalpana Circle profile (no
// single-post permalink route exists yet), company → admin-set link_url
// if present.
//
// "Collaborate karna chahta hoon" button (story_demand cards only) reuses
// Kalpana Circle's DM infra (kcircle_conversations / _participants /
// _messages — same tables/pattern as startDirectMessage in
// app/kalpana-circle/chat/page.tsx) to open or reuse a 1:1 thread with the
// series' writer and drop in a starter message, then routes to the chat
// page with ?open=<conversationId> so the right thread is pre-selected.

interface MangalIdeaRow {
  id: string;
  type: 'company' | 'story_demand' | 'audience';
  series_id: string | null;
  source_post_id: string | null;
  title: string;
  description: string | null;
  link_url: string | null;
}

interface CardData extends MangalIdeaRow {
  connectionHref: string | null;
  connectionLabel: string;
  coverUrl: string | null;
  writerId: string | null; // story_demand only — who "Collaborate" messages
  writerName: string | null;
}

const TYPE_META: Record<MangalIdeaRow['type'], { label: string; color: string; bg: string; icon: typeof Sparkles }> = {
  company: { label: 'MANGAL', color: '#e11d48', bg: 'rgba(225,29,72,0.14)', icon: Sparkles },
  story_demand: { label: 'In demand', color: '#a855f7', bg: 'rgba(168,85,247,0.14)', icon: BookOpen },
  audience: { label: 'Audience idea', color: '#10b981', bg: 'rgba(16,185,129,0.14)', icon: Users },
};

export default function MangalIdeasRow({ userId }: { userId: string | null }) {
  const [cards, setCards] = useState<CardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [collabState, setCollabState] = useState<Record<string, 'idle' | 'sending' | 'sent'>>({});
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const { data: rows, error } = await supabase.rpc('get_mangal_ideas_feed', { max_cards: 4 });
      if (error || !rows || rows.length === 0) { setLoading(false); return; }

      const ideas = rows as MangalIdeaRow[];
      const seriesIds = Array.from(new Set(ideas.filter(i => i.series_id).map(i => i.series_id as string)));
      const postIds = Array.from(new Set(ideas.filter(i => i.source_post_id).map(i => i.source_post_id as string)));

      const [{ data: seriesRows }, { data: postRows }] = await Promise.all([
        seriesIds.length
          ? supabase.from('series').select('id, title, cover_url, creator_id').in('id', seriesIds)
          : Promise.resolve({ data: [] as { id: string; title: string; cover_url: string | null; creator_id: string }[] }),
        postIds.length
          ? supabase.from('kcircle_posts').select('id, image_url, author_id').in('id', postIds)
          : Promise.resolve({ data: [] as { id: string; image_url: string | null; author_id: string }[] }),
      ]);

      const seriesMap = new Map((seriesRows ?? []).map(s => [s.id, s]));
      const postMap = new Map((postRows ?? []).map(p => [p.id, p]));

      const profileIds = Array.from(new Set([
        ...(seriesRows ?? []).map(s => s.creator_id),
        ...(postRows ?? []).map(p => p.author_id),
      ]));
      const { data: profileRows } = profileIds.length
        ? await supabase.from('creator_profiles').select('user_id, username').in('user_id', profileIds)
        : { data: [] as { user_id: string; username: string }[] };
      const usernameMap = new Map((profileRows ?? []).map(p => [p.user_id, p.username]));

      const built: CardData[] = ideas.map(idea => {
        if (idea.type === 'story_demand' && idea.series_id) {
          const s = seriesMap.get(idea.series_id);
          return {
            ...idea,
            connectionHref: `/WebMangal/series/${idea.series_id}`,
            connectionLabel: 'View on WebMangal',
            coverUrl: s?.cover_url ?? null,
            writerId: s?.creator_id ?? null,
            writerName: s ? (usernameMap.get(s.creator_id) ?? 'the writer') : null,
          };
        }
        if (idea.type === 'audience' && idea.source_post_id) {
          const p = postMap.get(idea.source_post_id);
          const uname = p ? usernameMap.get(p.author_id) : undefined;
          return {
            ...idea,
            connectionHref: uname ? `/kalpana-circle/profile/${uname}` : null,
            connectionLabel: 'View on Kalpana Circle',
            coverUrl: p?.image_url ?? null,
            writerId: null,
            writerName: null,
          };
        }
        return {
          ...idea,
          connectionHref: idea.link_url,
          connectionLabel: 'Learn more',
          coverUrl: null,
          writerId: null,
          writerName: null,
        };
      });

      setCards(built);
      setLoading(false);
    })();
  }, []);

  const handleCollaborate = async (card: CardData) => {
    if (!userId) { router.push('/login'); return; }
    if (!card.writerId) return;
    if (card.writerId === userId) return; // can't DM yourself

    setCollabState(prev => ({ ...prev, [card.id]: 'sending' }));

    // Reuse an existing 1:1 thread if one already exists between these two
    // users, same lookup pattern as startDirectMessage in kalpana-circle/chat.
    const { data: myConvos } = await supabase
      .from('kcircle_conversation_participants')
      .select('conversation_id')
      .eq('user_id', userId);
    const myConvoIds = (myConvos ?? []).map(r => r.conversation_id);

    let conversationId: string | null = null;
    if (myConvoIds.length > 0) {
      const { data: sharedRows } = await supabase
        .from('kcircle_conversation_participants')
        .select('conversation_id')
        .eq('user_id', card.writerId)
        .in('conversation_id', myConvoIds);
      conversationId = sharedRows?.[0]?.conversation_id ?? null;
    }

    if (!conversationId) {
      const { data: convo, error } = await supabase
        .from('kcircle_conversations')
        .insert({ is_group: false, created_by: userId })
        .select('id')
        .single();
      if (error || !convo) { setCollabState(prev => ({ ...prev, [card.id]: 'idle' })); return; }
      conversationId = convo.id;
      await supabase.from('kcircle_conversation_participants').insert([
        { conversation_id: conversationId, user_id: userId },
        { conversation_id: conversationId, user_id: card.writerId },
      ]);
    }

    await supabase.from('kcircle_messages').insert({
      conversation_id: conversationId,
      sender_id: userId,
      text: `Collaborate karna chahta hoon — I'd love to bring "${card.title.replace(' is in demand — bring it to life on KaTube', '')}" to KaTube. Let's team up!`,
    });
    await supabase.from('kcircle_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId);

    setCollabState(prev => ({ ...prev, [card.id]: 'sent' }));
    router.push(`/kalpana-circle/chat?open=${conversationId}`);
  };

  if (loading || cards.length === 0) return null;

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto 28px', padding: '0 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '14px' }}>
        <Sparkles size={16} strokeWidth={2.5} color="#e11d48" />
        <h2 style={{ fontSize: '16px', fontWeight: 900, margin: 0, letterSpacing: '-0.02em' }}>Mangal Ideas</h2>
      </div>
      <div style={{ display: 'flex', gap: '14px', overflowX: 'auto', paddingBottom: '4px' }}>
        {cards.map(card => {
          const meta = TYPE_META[card.type];
          const Icon = meta.icon;
          const state = collabState[card.id] ?? 'idle';
          return (
            <div
              key={card.id}
              style={{
                flexShrink: 0, width: '280px', borderRadius: '14px', overflow: 'hidden',
                background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                display: 'flex', flexDirection: 'column',
              }}
            >
              <div style={{ position: 'relative', aspectRatio: '16/9', background: 'linear-gradient(135deg, #1c1917, #292524)' }}>
                {card.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={card.coverUrl} alt={card.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={28} strokeWidth={1.5} color={meta.color} style={{ opacity: 0.5 }} />
                  </div>
                )}
                <span style={{
                  position: 'absolute', top: '8px', left: '8px', display: 'inline-flex', alignItems: 'center', gap: '4px',
                  fontSize: '9.5px', fontWeight: 800, color: meta.color, background: 'rgba(0,0,0,0.55)',
                  padding: '3px 9px', borderRadius: '12px', textTransform: 'uppercase', letterSpacing: '0.05em',
                  backdropFilter: 'blur(4px)',
                }}>
                  <Icon size={10} strokeWidth={2.5} />{meta.label}
                </span>
              </div>

              <div style={{ padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', flex: 1 }}>
                <div style={{
                  fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '4px', lineHeight: 1.3,
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                }}>{card.title}</div>
                {card.description && (
                  <p style={{
                    fontSize: '11.5px', color: 'var(--text-muted)', margin: '0 0 10px', lineHeight: 1.4, flex: 1,
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  }}>{card.description}</p>
                )}
                {card.type === 'story_demand' && card.writerName && (
                  <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', margin: '0 0 10px' }}>by @{card.writerName}</p>
                )}

                <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
                  {card.connectionHref && (
                    <Link
                      href={card.connectionHref}
                      target={card.connectionHref.startsWith('http') ? '_blank' : undefined}
                      style={{
                        flex: card.type === 'story_demand' ? 'none' : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                        padding: '7px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 700,
                        color: 'var(--text-secondary)', background: 'var(--bg-input)', border: '1px solid var(--border-color)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {card.connectionLabel}<ArrowRight size={11} strokeWidth={2.5} />
                    </Link>
                  )}

                  {card.type === 'story_demand' && card.writerId && card.writerId !== userId && (
                    <button
                      onClick={() => handleCollaborate(card)}
                      disabled={state !== 'idle'}
                      style={{
                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                        padding: '7px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 800,
                        cursor: state === 'idle' ? 'pointer' : 'default',
                        background: state === 'sent' ? 'rgba(16,185,129,0.14)' : '#e11d48',
                        border: state === 'sent' ? '1px solid rgba(16,185,129,0.3)' : 'none',
                        color: state === 'sent' ? '#10b981' : '#fff',
                      }}
                    >
                      {state === 'sent' ? (<><Check size={12} strokeWidth={2.5} />Sent</>) : (<><Handshake size={12} strokeWidth={2.5} />{state === 'sending' ? 'Sending…' : 'Collaborate karna chahta hoon'}</>)}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
