'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import ThemeToggle from '../../components/ThemeToggle';
import { useKCircleTheme } from '../theme';

// ── K Circle — Broadcast channel discovery feed ──
// Before this page, a fan had to already be on a creator's profile to find
// their "📣 Updates" broadcast link (see CONTEXT.md §12g) — no central place
// to browse channels. This is that central place: every live broadcast
// channel (kcircle_conversations where is_broadcast = true), most recently
// active first, each showing the creator + a preview of their latest post.
// Read-only discovery — posting/reacting still happens on the channel page
// itself (../broadcast/[username]).

const RADIANT = 'linear-gradient(135deg, #71717a 0%, #d4d4d8 45%, #f4f4f5 60%, #a1a1aa 100%)';

interface ChannelRow {
  conversationId: string;
  username: string;
  latestText: string | null;
  latestAt: string | null;
}

function initials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export default function BroadcastDiscoveryPage() {
  const { setIsLight, themeVars, dataTheme } = useKCircleTheme();
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [loading, setLoading] = useState(true);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time auth check on mount, same pattern as ../saved/page.tsx
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user?.id ?? null;
      setUserId(uid);
      setCheckedAuth(true);
      // Broadcast reads are RLS-gated to `authenticated` (see
      // 20260813120000_kcircle_broadcast_channels.sql), so a signed-out
      // visitor would just see an always-empty list — send them to log in
      // instead, same as ../saved and ../chat.
      if (!uid) router.replace('/login?next=/kalpana-circle');
    });
  }, [router]);

  const loadChannels = useCallback(async () => {
    if (!userId) return;
    setLoading(true);

    const { data: convos } = await supabase
      .from('kcircle_conversations')
      .select('id, created_by')
      .eq('is_broadcast', true);

    if (!convos || convos.length === 0) { setChannels([]); setLoading(false); return; }

    const creatorIds = Array.from(new Set(convos.map(c => c.created_by)));
    const convoIds = convos.map(c => c.id);

    const [profilesRes, messagesRes] = await Promise.all([
      supabase.from('creator_profiles').select('user_id, username').in('user_id', creatorIds),
      supabase.from('kcircle_messages').select('conversation_id, text, created_at')
        .in('conversation_id', convoIds).order('created_at', { ascending: false }),
    ]);

    const usernameMap = new Map((profilesRes.data ?? []).map(p => [p.user_id, p.username]));

    // Keep only the newest message per conversation — rows are already
    // sorted newest-first, so the first hit for a conversation id wins.
    const latestByConvo = new Map<string, { text: string; created_at: string }>();
    (messagesRes.data ?? []).forEach(m => {
      if (!latestByConvo.has(m.conversation_id)) {
        latestByConvo.set(m.conversation_id, { text: m.text, created_at: m.created_at });
      }
    });

    const rows: ChannelRow[] = convos
      .map(c => {
        const latest = latestByConvo.get(c.id);
        return {
          conversationId: c.id,
          username: usernameMap.get(c.created_by) ?? 'dreamer',
          latestText: latest?.text ?? null,
          latestAt: latest?.created_at ?? null,
        };
      })
      // Channels with at least one post, most recently active first;
      // channels nobody has posted to yet trail at the end (alphabetical)
      // rather than cluttering the top of a "what's active" feed.
      .sort((a, b) => {
        if (a.latestAt && b.latestAt) return new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime();
        if (a.latestAt) return -1;
        if (b.latestAt) return 1;
        return a.username.localeCompare(b.username);
      });

    setChannels(rows);
    setLoading(false);
  }, [userId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on userId change, same pattern as ../saved/page.tsx
  useEffect(() => { loadChannels(); }, [loadChannels]);

  if (!checkedAuth) return null;

  return (
    <div data-theme={dataTheme} style={{ ...themeVars, minHeight: '100vh', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <style>{`
        .kcb-header { padding: 20px 16px; }
        @media (min-width: 768px) { .kcb-header { padding: 28px 24px 16px; } }
      `}</style>

      <div className="kcb-header" style={{ maxWidth: '640px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
          <Link href="/kalpana-circle" style={{ fontSize: '18px', textDecoration: 'none', color: 'var(--text-primary)' }}>←</Link>
          <h1 style={{ fontSize: '17px', fontWeight: 800, margin: 0 }}>📣 Broadcasts</h1>
          <div style={{ marginLeft: 'auto' }}>
            <ThemeToggle size={26} onChange={setIsLight} defaultLight={false} syncGlobal={false} />
          </div>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: '0 0 18px', paddingLeft: '30px' }}>
          Updates from creators you can follow — like &amp; comment, no reply-noise.
        </p>

        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px', padding: '30px 0' }}>Loading channels…</p>
        ) : channels.length === 0 ? (
          <div style={{ padding: '20px', borderRadius: '12px', background: 'var(--bg-card)', border: '1px dashed var(--border-color)', textAlign: 'center' }}>
            <p style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', margin: 0, lineHeight: 1.6 }}>
              No creators have started broadcasting yet — check back soon.
            </p>
          </div>
        ) : channels.map(ch => (
          <Link key={ch.conversationId} href={`/kalpana-circle/broadcast/${ch.username}`} style={{
            display: 'flex', alignItems: 'center', gap: '12px', textDecoration: 'none', color: 'inherit',
            borderRadius: '14px', background: 'var(--bg-card)', border: '1px solid var(--border-color)',
            marginBottom: '10px', padding: '12px 14px',
          }}>
            <div style={{
              width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
              background: RADIANT, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '13px', fontWeight: 800, color: '#27272a',
            }}>{initials(ch.username)}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                <span style={{ fontSize: '13.5px', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{ch.username}</span>
                {ch.latestAt && <span style={{ fontSize: '10.5px', color: 'var(--text-tertiary)', flexShrink: 0 }}>{timeAgo(ch.latestAt)}</span>}
              </div>
              <div style={{
                fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {ch.latestText ?? 'Hasn\u2019t posted an update yet'}
              </div>
            </div>
            <span style={{ fontSize: '14px', color: 'var(--text-tertiary)', flexShrink: 0 }}>›</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
