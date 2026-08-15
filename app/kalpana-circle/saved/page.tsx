'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { Bookmark } from 'lucide-react';

// ── K Circle — Saved posts (bookmarks) ──
// Private list, backed by kcircle_saved_posts (user_id, post_id), RLS
// owner-only. Same card visuals as the main feed in ../page.tsx, trimmed
// down (no composer/stories/search here — just the saved list + unsave).

const RADIANT = 'linear-gradient(135deg, #71717a 0%, #d4d4d8 45%, #f4f4f5 60%, #a1a1aa 100%)';

interface SavedPost {
  id: string;
  author_id: string;
  caption: string | null;
  image_url: string | null;
  created_at: string;
  username: string;
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

export default function SavedPostsPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [posts, setPosts] = useState<SavedPost[]>([]);
  const [loading, setLoading] = useState(true);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time auth check on mount, same pattern as ../chat/page.tsx
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user?.id ?? null;
      setUserId(uid);
      setCheckedAuth(true);
      if (!uid) router.replace('/login?next=/kalpana-circle');
    });
  }, [router]);

  const loadSaved = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data: saves } = await supabase
      .from('kcircle_saved_posts').select('post_id, created_at')
      .eq('user_id', userId).order('created_at', { ascending: false });

    if (!saves || saves.length === 0) { setPosts([]); setLoading(false); return; }

    const postIds = saves.map(s => s.post_id);
    const { data: rows } = await supabase
      .from('kcircle_posts').select('id, author_id, caption, image_url, created_at')
      .in('id', postIds);
    if (!rows || rows.length === 0) { setPosts([]); setLoading(false); return; }

    const authorIds = Array.from(new Set(rows.map(r => r.author_id)));
    const { data: profiles } = await supabase
      .from('creator_profiles').select('user_id, username').in('user_id', authorIds);
    const usernameMap = new Map((profiles ?? []).map(p => [p.user_id, p.username]));

    // keep saved-order (most recently saved first), not post created_at order
    const byId = new Map(rows.map(r => [r.id, r]));
    const ordered = saves
      .map(s => byId.get(s.post_id))
      .filter((r): r is NonNullable<typeof r> => !!r)
      .map(r => ({ ...r, username: usernameMap.get(r.author_id) ?? 'dreamer' }));

    setPosts(ordered);
    setLoading(false);
  }, [userId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on userId change, same pattern as ../page.tsx
  useEffect(() => { loadSaved(); }, [loadSaved]);

  const unsave = async (postId: string) => {
    if (!userId) return;
    setPosts(prev => prev.filter(p => p.id !== postId));
    await supabase.from('kcircle_saved_posts').delete().eq('post_id', postId).eq('user_id', userId);
  };

  if (!checkedAuth) return null;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <style>{`
        .kcs-header { padding: 20px 16px; }
        @media (min-width: 768px) { .kcs-header { padding: 28px 24px 16px; } }
      `}</style>

      <div className="kcs-header" style={{ maxWidth: '640px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px' }}>
          <Link href="/kalpana-circle" style={{ fontSize: '18px', textDecoration: 'none', color: 'var(--text-primary)' }}>←</Link>
          <h1 style={{ fontSize: '17px', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}><Bookmark size={17} strokeWidth={2} /> Saved</h1>
        </div>

        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px', padding: '30px 0' }}>Loading saved posts…</p>
        ) : posts.length === 0 ? (
          <div style={{ padding: '20px', borderRadius: '12px', background: 'var(--bg-card)', border: '1px dashed var(--border-color)', textAlign: 'center' }}>
            <p style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', margin: 0, lineHeight: 1.6 }}>
              Nothing saved yet — tap the bookmark icon on any post in the feed to bookmark it here.
            </p>
          </div>
        ) : posts.map(post => (
          <div key={post.id} style={{
            borderRadius: '14px', background: 'var(--bg-card)', border: '1px solid var(--border-color)',
            marginBottom: '14px', overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px' }}>
              <Link href={`/creator/${post.username}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none', flex: 1, minWidth: 0 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                  background: RADIANT, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '12px', fontWeight: 800, color: '#27272a',
                }}>{initials(post.username)}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.username}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{timeAgo(post.created_at)} ago</div>
                </div>
              </Link>
              <button onClick={() => unsave(post.id)} title="Unsave" style={{
                background: 'none', border: 'none', cursor: 'pointer', color: '#71717a', padding: '4px', display: 'flex',
              }}><Bookmark size={15} strokeWidth={2} fill="currentColor" /></button>
            </div>

            {post.caption && (
              <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: 1.55, margin: '0 0 10px', padding: '0 14px' }}>
                {post.caption}
              </p>
            )}

            {post.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={post.image_url} alt="" style={{ width: '100%', maxHeight: '520px', objectFit: 'cover', display: 'block' }} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
