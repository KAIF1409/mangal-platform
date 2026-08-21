'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { supabase } from '../../lib/supabase';

// §28a — Notification bell for new uploads. K Circle already has a
// notifications system (kcircle_notifications, CONTEXT.md §14) — this
// reuses that exact pattern (actor-scoped inserts, no DB trigger fan-out)
// but on its own `katube_notifications` table so it surfaces inside
// KaTube's own chrome instead of only inside K Circle's UI.

interface NotifRow {
  id: string;
  video_id: string | null;
  actor_id: string | null;
  read: boolean;
  created_at: string;
  videoTitle: string;
  actorName: string;
}

export default function NotificationBell({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState<NotifRow[]>([]);
  const [loading, setLoading] = useState(false);
  const loadedOnceRef = useRef(false);

  const unreadCount = notifs.filter(n => !n.read).length;

  async function load() {
    setLoading(true);
    const { data: rows } = await supabase.from('katube_notifications')
      .select('id, video_id, actor_id, read, created_at')
      .eq('recipient_id', userId)
      .order('created_at', { ascending: false })
      .limit(30);

    if (!rows || rows.length === 0) { setNotifs([]); setLoading(false); return; }

    const videoIds = [...new Set(rows.map(r => r.video_id).filter(Boolean))] as string[];
    const actorIds = [...new Set(rows.map(r => r.actor_id).filter(Boolean))] as string[];
    const [videosRes, actorsRes] = await Promise.all([
      videoIds.length ? supabase.from('videos').select('id, title').in('id', videoIds) : Promise.resolve({ data: [] as { id: string; title: string }[] }),
      actorIds.length ? supabase.from('creator_profiles').select('user_id, username').in('user_id', actorIds) : Promise.resolve({ data: [] as { user_id: string; username: string }[] }),
    ]);
    const videoMap = new Map((videosRes.data || []).map(v => [v.id, v.title]));
    const actorMap = new Map((actorsRes.data || []).map(a => [a.user_id, a.username]));

    setNotifs(rows.map(r => ({
      id: r.id, video_id: r.video_id, actor_id: r.actor_id, read: r.read, created_at: r.created_at,
      videoTitle: (r.video_id && videoMap.get(r.video_id)) || 'a new video',
      actorName: (r.actor_id && actorMap.get(r.actor_id)) || 'A creator you follow',
    })));
    setLoading(false);
  }

  // Poll-on-open rather than a permanent realtime subscription, keeping
  // this component cheap for the common case (bell closed most of the
  // time) — the table is realtime-enabled (replica identity full +
  // supabase_realtime publication) so a future badge-without-opening
  // upgrade can subscribe directly if wanted.
  /* eslint-disable react-hooks/set-state-in-effect -- opening the dropdown
     triggers a fetch; same "just opened, fetch once" pattern this codebase
     already grants an exception elsewhere (see KatubeShareSheet.tsx). */
  useEffect(() => {
    if (open && !loadedOnceRef.current) { loadedOnceRef.current = true; load(); }
    else if (open) { load(); }
  }, [open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Lightweight unread-count check on mount so the badge shows without
  // requiring the viewer to open the dropdown first.
  useEffect(() => {
    (async () => {
      const { count } = await supabase.from('katube_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', userId)
        .eq('read', false);
      if (count && count > 0) {
        setNotifs(prev => prev.length ? prev : Array.from({ length: count }, (_, i) => ({
          id: `placeholder-${i}`, video_id: null, actor_id: null, read: false, created_at: new Date().toISOString(),
          videoTitle: '', actorName: '',
        })));
      }
    })();
  }, [userId]);

  async function markAllRead() {
    setNotifs(ns => ns.map(n => ({ ...n, read: true })));
    await supabase.from('katube_notifications').update({ read: true }).eq('recipient_id', userId).eq('read', false);
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        aria-label="Notifications"
        style={{
          position: 'relative', width: '34px', height: '34px', borderRadius: '50%', border: 'none',
          background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-secondary)', cursor: 'pointer', flexShrink: 0,
        }}
      >
        <Bell size={17} />
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: '-2px', right: '-2px', minWidth: '15px', height: '15px', padding: '0 3px',
            borderRadius: '999px', background: '#e11d48', color: '#fff', fontSize: '9.5px', fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
          }}>{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />
          <div style={{
            position: 'absolute', top: 'calc(100% + 10px)', right: 0, zIndex: 31, width: '320px', maxHeight: '420px',
            overflowY: 'auto', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px',
            boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '13px', fontWeight: 800 }}>Notifications</span>
              {unreadCount > 0 && (
                <button onClick={markAllRead} style={{ background: 'none', border: 'none', color: '#e11d48', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer' }}>
                  Mark all read
                </button>
              )}
            </div>
            {loading ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '12.5px' }}>Loading…</div>
            ) : notifs.filter(n => n.video_id).length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '12.5px' }}>
                No notifications yet. Follow creators and you&apos;ll see their new uploads here.
              </div>
            ) : (
              notifs.filter(n => n.video_id).map(n => (
                <Link
                  key={n.id}
                  href={`/katube/watch/${n.video_id}`}
                  onClick={() => setOpen(false)}
                  style={{
                    display: 'block', padding: '12px 14px', textDecoration: 'none', color: 'var(--text-primary)',
                    borderBottom: '1px solid var(--border-color)', background: n.read ? 'transparent' : 'rgba(225,29,72,0.06)',
                  }}
                >
                  <div style={{ fontSize: '12.5px', fontWeight: n.read ? 500 : 700 }}>
                    <strong>{n.actorName}</strong> uploaded <strong>{n.videoTitle}</strong>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '3px' }}>
                    {new Date(n.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </div>
                </Link>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
