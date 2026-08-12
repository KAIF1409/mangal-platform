'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';

// ── K Circle notification bell — dropdown panel + unread badge ──
// Backend: supabase/migrations/20260813120000_kcircle_notifications.sql
// (kcircle_notifications: recipient_id/actor_id/type/post_id/conversation_id).
// Live unread count via Supabase Realtime (same postgres_changes pattern
// as kcircle chat, see 20260812130000_kcircle_realtime_chat.sql) rather
// than polling. Dropped into both the K Circle main page nav and the chat
// page nav so it's visible wherever a founder-facing user is in K Circle.

interface Notification {
  id: string;
  actor_id: string | null;
  type: 'like' | 'comment' | 'message' | 'group_add';
  post_id: string | null;
  conversation_id: string | null;
  preview: string | null;
  read: boolean;
  created_at: string;
  actorUsername?: string;
}

function timeAgo(iso: string) {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function labelFor(n: Notification) {
  const who = n.actorUsername ?? 'Someone';
  switch (n.type) {
    case 'like': return `${who} liked your post`;
    case 'comment': return `${who} commented: ${n.preview ?? ''}`.trim();
    case 'message': return `${who} sent you a message`;
    case 'group_add': return `${who} added you to a group`;
    default: return `${who} did something`;
  }
}

export default function NotificationBell({ userId, iconSize = 19, color = 'var(--text-tertiary)' }: {
  userId: string | null;
  iconSize?: number;
  color?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    const { data: rows } = await supabase.from('kcircle_notifications')
      .select('id, actor_id, type, post_id, conversation_id, preview, read, created_at')
      .eq('recipient_id', userId).order('created_at', { ascending: false }).limit(20);
    const actorIds = Array.from(new Set((rows ?? []).map(r => r.actor_id).filter(Boolean))) as string[];
    const { data: profs } = actorIds.length
      ? await supabase.from('creator_profiles').select('user_id, username').in('user_id', actorIds)
      : { data: [] as { user_id: string; username: string }[] };
    const usernameMap = new Map((profs ?? []).map(p => [p.user_id, p.username]));
    const withNames = (rows ?? []).map(r => ({ ...r, actorUsername: r.actor_id ? usernameMap.get(r.actor_id) : undefined }));
    setItems(withNames as Notification[]);
    setUnread(withNames.filter(n => !n.read).length);
  }, [userId]);

  useEffect(() => { load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect

  // Live badge count + fresh items on new notifications — no polling.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase.channel(`kcircle-notifications-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'kcircle_notifications', filter: `recipient_id=eq.${userId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, load]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const openPanel = async () => {
    setOpen(prev => !prev);
    if (!open && unread > 0 && userId) {
      const unreadIds = items.filter(n => !n.read).map(n => n.id);
      setItems(prev => prev.map(n => ({ ...n, read: true })));
      setUnread(0);
      if (unreadIds.length) await supabase.from('kcircle_notifications').update({ read: true }).in('id', unreadIds);
    }
  };

  const goTo = (n: Notification) => {
    setOpen(false);
    if (n.type === 'message' || n.type === 'group_add') router.push('/kalpana-circle/chat');
    else if (n.post_id) router.push('/kalpana-circle');
  };

  if (!userId) return null;

  return (
    <div ref={panelRef} style={{ position: 'relative' }}>
      <button onClick={openPanel} title="Notifications" style={{
        background: 'none', border: 'none', cursor: 'pointer', position: 'relative',
        fontSize: `${iconSize}px`, color, display: 'flex', alignItems: 'center', padding: 0,
      }}>
        🔔
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -6, minWidth: '15px', height: '15px', borderRadius: '8px',
            background: '#ef4444', color: '#fff', fontSize: '9.5px', fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', lineHeight: 1,
          }}>{unread > 9 ? '9+' : unread}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 10px)', right: 0, width: '320px', maxWidth: '85vw',
          maxHeight: '420px', overflowY: 'auto', background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
          borderRadius: '12px', boxShadow: '0 12px 32px rgba(0,0,0,0.18)', zIndex: 300,
        }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-color)', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
            Notifications
          </div>
          {items.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '12.5px', padding: '24px 14px' }}>
              Nothing yet — likes, comments, and messages will show up here.
            </p>
          ) : items.map(n => (
            <button key={n.id} onClick={() => goTo(n)} style={{
              display: 'block', width: '100%', textAlign: 'left', background: n.read ? 'transparent' : 'var(--bg-card)',
              border: 'none', borderBottom: '1px solid var(--border-color)', padding: '10px 14px', cursor: 'pointer',
            }}>
              <div style={{ fontSize: '12.5px', color: 'var(--text-primary)', lineHeight: 1.4 }}>{labelFor(n)}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>{timeAgo(n.created_at)} ago</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
