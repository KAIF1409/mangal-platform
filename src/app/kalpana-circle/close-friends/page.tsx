'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { setPostLoginRedirect } from '../../lib/authRedirect';
import { useKCircleTheme } from '../theme';
import { KCircleShellStyle, KCircleRail } from '../components/Shell';
import { ArrowLeft } from 'lucide-react';

// ── K Circle — manage close friends (story audience) ──
// Backend: kcircle_close_friends (user_id -> friend_id, owner-only RLS —
// nobody but you can see or edit your own list, same as Instagram).
// Used by kcircle_stories.close_friends_only, see
// supabase/migrations/20260813150000_kcircle_close_friends_story_audience.sql.

const RADIANT = 'linear-gradient(135deg, #71717a 0%, #d4d4d8 45%, #f4f4f5 60%, #a1a1aa 100%)';
const GREEN = '#22c55e';

function initials(name: string) { return name.slice(0, 2).toUpperCase(); }

interface Friend { user_id: string; username: string; }

export default function CloseFriendsPage() {
  const { setIsLight, themeVars, dataTheme } = useKCircleTheme();
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Friend[]>([]);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Own username/avatar — this page never needed these before, but the
  // shared K Circle rail's profile icon does (see components/Shell.tsx, §66).
  const [myUsername, setMyUsername] = useState<string | null>(null);
  const [myAvatarUrl, setMyAvatarUrl] = useState<string | null>(null);

  const loadFriends = useCallback(async (uid: string) => {
    const { data: rows } = await supabase.from('kcircle_close_friends').select('friend_id').eq('user_id', uid);
    const friendIds = (rows ?? []).map(r => r.friend_id);
    if (friendIds.length === 0) { setFriends([]); return; }
    const { data: profiles } = await supabase.from('creator_profiles').select('user_id, username').in('user_id', friendIds);
    setFriends(profiles ?? []);
  }, []);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      if (!uid) { setPostLoginRedirect('/kalpana-circle'); router.push('/login?next=/kalpana-circle'); return; }
      setUserId(uid);
      await loadFriends(uid);
      const { data: profile } = await supabase.from('creator_profiles').select('username, avatar_url').eq('user_id', uid).maybeSingle();
      setMyUsername(profile?.username ?? null);
      setMyAvatarUrl(profile?.avatar_url ?? null);
      setLoading(false);
    };
    load();
  }, [router, loadFriends]);

  // debounced username search, excludes people already on the list + self
  /* eslint-disable react-hooks/set-state-in-effect -- clearing/loading state for a debounced search, same pattern as app/kalpana-circle/page.tsx */
  useEffect(() => {
    const q = query.trim();
    if (!q || !userId) { setResults([]); setSearching(false); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      const { data } = await supabase.from('creator_profiles').select('user_id, username').ilike('username', `%${q}%`).limit(10);
      const friendIds = new Set(friends.map(f => f.user_id));
      setResults((data ?? []).filter(r => r.user_id !== userId && !friendIds.has(r.user_id)));
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [query, userId, friends]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const addFriend = async (friend: Friend) => {
    if (!userId) return;
    setBusyId(friend.user_id);
    const { error } = await supabase.from('kcircle_close_friends').insert({ user_id: userId, friend_id: friend.user_id });
    if (!error) {
      setFriends(prev => [...prev, friend]);
      setResults(prev => prev.filter(r => r.user_id !== friend.user_id));
    }
    setBusyId(null);
  };

  const removeFriend = async (friend: Friend) => {
    if (!userId) return;
    setBusyId(friend.user_id);
    const { error } = await supabase.from('kcircle_close_friends').delete().eq('user_id', userId).eq('friend_id', friend.user_id);
    if (!error) setFriends(prev => prev.filter(f => f.user_id !== friend.user_id));
    setBusyId(null);
  };

  if (loading) {
    return <div data-theme={dataTheme} style={{ ...themeVars, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', background: 'var(--bg-primary)' }}>Loading…</div>;
  }

  return (
    <div data-theme={dataTheme} style={{ ...themeVars, minHeight: '100vh', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <KCircleShellStyle />
      <div className="kc-shell">
        <KCircleRail
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
        <div>
          <div style={{ fontWeight: 800, fontSize: '13.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: GREEN, display: 'inline-block' }} />
            Close Friends
          </div>
          <div style={{ fontSize: '10.5px', color: 'var(--text-tertiary)' }}>Only these people see your Close Friends stories</div>
        </div>
      </nav>

      <div style={{ maxWidth: '520px', margin: '0 auto', padding: '18px 14px 60px' }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by username to add…"
          style={{
            width: '100%', padding: '10px 14px', borderRadius: '10px', fontSize: '13px',
            border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)',
            outline: 'none', boxSizing: 'border-box', marginBottom: '18px',
          }}
        />

        {query.trim() && (
          <div style={{ marginBottom: '22px' }}>
            {searching ? (
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', padding: '8px 0' }}>Searching…</div>
            ) : results.length === 0 ? (
              <div style={{ fontSize: '12px', color: 'var(--text-faint)', padding: '8px 0' }}>No matching dreamers.</div>
            ) : (
              results.map(r => (
                <div key={r.user_id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0' }}>
                  <div style={{
                    width: '34px', height: '34px', borderRadius: '50%', flexShrink: 0, background: RADIANT,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 800, color: '#27272a',
                  }}>{initials(r.username)}</div>
                  <span style={{ flex: 1, fontSize: '13px', fontWeight: 600 }}>@{r.username}</span>
                  <button onClick={() => addFriend(r)} disabled={busyId === r.user_id} style={{
                    fontSize: '11.5px', fontWeight: 800, padding: '6px 14px', borderRadius: '8px', border: 'none',
                    background: GREEN, color: '#fff', cursor: 'pointer', opacity: busyId === r.user_id ? 0.6 : 1,
                  }}>+ Add</button>
                </div>
              ))
            )}
          </div>
        )}

        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
          {friends.length === 0 ? 'No close friends yet' : `${friends.length} close friend${friends.length === 1 ? '' : 's'}`}
        </div>
        {friends.length === 0 ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-faint)', fontSize: '12.5px' }}>
            Add people here, then choose &ldquo;Close Friends&rdquo; when posting a story to share with only them.
          </div>
        ) : (
          friends.map(f => (
            <div key={f.user_id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0' }}>
              <div style={{
                width: '34px', height: '34px', borderRadius: '50%', flexShrink: 0, background: RADIANT,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 800, color: '#27272a',
              }}>{initials(f.username)}</div>
              <span style={{ flex: 1, fontSize: '13px', fontWeight: 600 }}>@{f.username}</span>
              <button onClick={() => removeFriend(f)} disabled={busyId === f.user_id} style={{
                fontSize: '11.5px', fontWeight: 700, padding: '6px 14px', borderRadius: '8px',
                border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-secondary)',
                cursor: 'pointer', opacity: busyId === f.user_id ? 0.6 : 1,
              }}>Remove</button>
            </div>
          ))
        )}
      </div>
        </div>{/* /.kc-main */}
      </div>{/* /.kc-shell */}
    </div>
  );
}
