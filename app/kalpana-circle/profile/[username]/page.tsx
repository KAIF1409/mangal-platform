'use client';

import { useState, useEffect, useCallback, CSSProperties } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import ThemeToggle from '../../../components/ThemeToggle';
import { useKCircleTheme } from '../../theme';
import {
  ArrowLeft, Menu, Grid3x3, Bookmark, Heart, MessageCircle,
  Settings, LogOut, X, Megaphone, Star,
} from 'lucide-react';

// ── K Circle — Instagram-style profile page ──
// Route: /kalpana-circle/profile/[username]
// Mirrors the Instagram profile pattern the founder asked to copy: avatar +
// bio header, stat row, Edit Profile / Message action, a posts grid, and
// (own profile only) a hamburger menu with Settings/Saved/Close Friends/
// Broadcast Channels/Log Out. Data is real — kcircle_posts + kcircle_post_likes
// + kcircle_post_comments (see supabase/migrations/20260812_kcircle_social.sql)
// and creator_profiles.bio/avatar_url (avatar_url added in
// 20260816150000_creator_profiles_avatar_url.sql). No followers/following
// count is shown because K Circle has no follow-graph table yet — showing
// Posts + Likes instead of fabricating a follower count.

const RADIANT = 'linear-gradient(135deg, #71717a 0%, #d4d4d8 45%, #f4f4f5 60%, #a1a1aa 100%)';
const PURPLE = '#7c3aed';

interface ProfileRow {
  user_id: string;
  username: string;
  bio: string | null;
  avatar_url: string | null;
}

interface GridPost {
  id: string;
  image_url: string | null;
  image_urls: string[] | null;
  caption: string | null;
  created_at: string;
  likeCount: number;
  commentCount: number;
}

function initials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

function Avatar({ name, avatarUrl, size = 40 }: { name: string; avatarUrl?: string | null; size?: number }) {
  if (avatarUrl) {
    return (
      // avatar_url is a user-uploaded Supabase Storage public URL, not a static asset — next/image's domain allowlist adds no benefit here.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={name}
        width={size}
        height={size}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, display: 'block' }}
      />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: RADIANT, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.36, fontWeight: 800, color: '#27272a',
    }}>
      {initials(name)}
    </div>
  );
}

export default function KCircleProfilePage() {
  const params = useParams();
  const username = decodeURIComponent(String(params?.username ?? ''));
  const router = useRouter();
  const { setIsLight, themeVars, dataTheme } = useKCircleTheme();

  const [viewerId, setViewerId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [posts, setPosts] = useState<GridPost[]>([]);
  const [likeTotal, setLikeTotal] = useState(0);

  const [menuOpen, setMenuOpen] = useState(false);
  const [lightbox, setLightbox] = useState<GridPost | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setViewerId(data.user?.id ?? null));
  }, []);

  const load = useCallback(async () => {
    if (!username) return;
    setLoaded(false);
    setNotFound(false);

    const { data: prof } = await supabase
      .from('creator_profiles')
      .select('user_id, username, bio, avatar_url')
      .eq('username', username)
      .maybeSingle();

    if (!prof) {
      setProfile(null);
      setNotFound(true);
      setLoaded(true);
      return;
    }
    setProfile(prof);

    const { data: postRows } = await supabase
      .from('kcircle_posts')
      .select('id, image_url, image_urls, caption, created_at')
      .eq('author_id', prof.user_id)
      .order('created_at', { ascending: false });

    const ids = (postRows ?? []).map(p => p.id);
    const likesByPost = new Map<string, number>();
    const commentsByPost = new Map<string, number>();
    let totalLikes = 0;

    if (ids.length) {
      const [{ data: likeRows }, { data: commentRows }] = await Promise.all([
        supabase.from('kcircle_post_likes').select('post_id').in('post_id', ids),
        supabase.from('kcircle_post_comments').select('post_id').in('post_id', ids),
      ]);
      for (const r of likeRows ?? []) {
        likesByPost.set(r.post_id, (likesByPost.get(r.post_id) ?? 0) + 1);
        totalLikes++;
      }
      for (const r of commentRows ?? []) {
        commentsByPost.set(r.post_id, (commentsByPost.get(r.post_id) ?? 0) + 1);
      }
    }

    setPosts((postRows ?? []).map(p => ({
      ...p,
      likeCount: likesByPost.get(p.id) ?? 0,
      commentCount: commentsByPost.get(p.id) ?? 0,
    })));
    setLikeTotal(totalLikes);
    setLoaded(true);
  }, [username]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on username change, same pattern as app/kalpana-circle/page.tsx's userId-driven fetch effects
  useEffect(() => { load(); }, [load]);

  const isOwn = !!viewerId && !!profile && viewerId === profile.user_id;

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  const gridImage = (p: GridPost) => p.image_urls?.[0] ?? p.image_url ?? null;

  return (
    <div data-theme={dataTheme} style={{ ...themeVars, minHeight: '100vh', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' } as CSSProperties}>
      <style>{`
        .kcp-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3px; }
        @media (min-width: 600px) { .kcp-grid { gap: 4px; } }
        .kcp-tile { position: relative; aspect-ratio: 1 / 1; overflow: hidden; background: var(--bg-card); cursor: pointer; }
        .kcp-tile img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .kcp-overlay {
          position: absolute; inset: 0; background: rgba(0,0,0,0.45); opacity: 0;
          display: flex; align-items: center; justify-content: center; gap: 18px;
          color: #fff; font-weight: 700; font-size: 13px; transition: opacity 0.15s ease;
        }
        @media (hover: hover) { .kcp-tile:hover .kcp-overlay { opacity: 1; } }
        .kcp-icon-btn {
          display: flex; align-items: center; justify-content: center;
          width: 38px; height: 38px; margin: -8px; border-radius: 50%;
          background: none; border: none; color: var(--text-primary); cursor: pointer;
        }
        @media (max-width: 359px) {
          .kcp-page-pad { padding-left: 14px !important; padding-right: 14px !important; }
        }
      `}</style>

      {/* ── TOP BAR ── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'var(--nav-bg)', backdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--border-color)',
        padding: '0 14px', height: '56px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
          <Link href="/kalpana-circle" className="kcp-icon-btn" title="Back">
            <ArrowLeft size={22} />
          </Link>
          <span style={{ fontWeight: 800, fontSize: '16px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {profile?.username ?? username}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <ThemeToggle size={26} onChange={setIsLight} defaultLight={false} syncGlobal={false} />
          {isOwn && (
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setMenuOpen(v => !v)}
                className="kcp-icon-btn"
                title="Menu"
              >
                <Menu size={22} />
              </button>
              {menuOpen && (
                <>
                  <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 149 }} />
                  <div style={{
                    position: 'absolute', top: '36px', right: 0, zIndex: 150,
                    background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
                    borderRadius: '12px', boxShadow: '0 12px 32px rgba(0,0,0,0.3)',
                    width: 'min(230px, calc(100vw - 28px))', padding: '6px', display: 'flex', flexDirection: 'column', gap: '2px',
                  }}>
                    <MenuLink href="/kalpana-circle/settings" icon={<Settings size={16} />} label="Settings" onClick={() => setMenuOpen(false)} />
                    <MenuLink href="/kalpana-circle/saved" icon={<Bookmark size={16} />} label="Saved" onClick={() => setMenuOpen(false)} />
                    <MenuLink href="/kalpana-circle/close-friends" icon={<Star size={16} />} label="Close Friends" onClick={() => setMenuOpen(false)} />
                    <MenuLink href="/kalpana-circle/broadcasts" icon={<Megaphone size={16} />} label="Broadcast Channels" onClick={() => setMenuOpen(false)} />
                    <div style={{ height: '1px', background: 'var(--border-color)', margin: '4px 6px' }} />
                    <button
                      onClick={handleSignOut}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                        borderRadius: '8px', fontSize: '13px', fontWeight: 700, color: '#ef4444',
                        background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                      }}
                    >
                      <LogOut size={16} /> Log Out
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </nav>

      {!loaded && (
        <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading...</div>
      )}

      {loaded && notFound && (
        <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
          <div style={{ fontSize: '17px', fontWeight: 700, marginBottom: '6px', color: 'var(--text-primary)' }}>User not found</div>
          This dreamer doesn&apos;t seem to exist.
        </div>
      )}

      {loaded && profile && (
        <div className="kcp-page-pad" style={{ maxWidth: '640px', margin: '0 auto', padding: '20px 20px 60px', boxSizing: 'border-box' }}>
          {/* ── HEADER — avatar + stats row (same pattern Instagram uses on
              its own mobile web), followed by a full-width text/button
              block. Using one layout at every width (no stack↔row
              breakpoint switch) keeps this predictable on phones instead
              of needing a separate mobile variant. ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
            <Avatar name={profile.username} avatarUrl={profile.avatar_url} size={76} />
            <div style={{ flex: 1, minWidth: 0, display: 'flex', gap: '20px' }}>
              <Stat value={posts.length} label="Posts" />
              <Stat value={likeTotal} label="Likes" />
            </div>
          </div>
          <div style={{ marginTop: '14px' }}>
            <div style={{ fontWeight: 800, fontSize: '15px' }}>{profile.username}</div>
            {profile.bio && (
              <div style={{ fontSize: '13.5px', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: '4px' }}>
                {profile.bio}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
            {isOwn ? (
              <Link href="/kalpana-circle/settings" style={{
                flex: 1, textAlign: 'center', padding: '9px 16px', borderRadius: '8px',
                background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                color: 'var(--text-primary)', fontWeight: 700, fontSize: '13px', textDecoration: 'none',
              }}>
                Edit Profile
              </Link>
            ) : (
              <Link href="/kalpana-circle/chat" style={{
                flex: 1, textAlign: 'center', padding: '9px 16px', borderRadius: '8px',
                background: RADIANT, border: 'none',
                color: '#27272a', fontWeight: 800, fontSize: '13px', textDecoration: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              }}>
                <MessageCircle size={14} /> Message
              </Link>
            )}
          </div>

          {/* ── TABS ── */}
          <div style={{
            display: 'flex', borderTop: '1px solid var(--border-color)', marginTop: '22px',
          }}>
            <div style={{
              flex: 1, textAlign: 'center', padding: '12px 0', fontSize: '12px', fontWeight: 800,
              letterSpacing: '0.04em', color: PURPLE, borderTop: `2px solid ${PURPLE}`, marginTop: '-1px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            }}>
              <Grid3x3 size={14} /> POSTS
            </div>
            {isOwn && (
              <Link href="/kalpana-circle/saved" style={{
                flex: 1, textAlign: 'center', padding: '12px 0', fontSize: '12px', fontWeight: 800,
                letterSpacing: '0.04em', color: 'var(--text-tertiary)', textDecoration: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              }}>
                <Bookmark size={14} /> SAVED
              </Link>
            )}
          </div>

          {/* ── GRID ── */}
          {posts.length === 0 ? (
            <div style={{ padding: '50px 10px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13.5px' }}>
              {isOwn ? "You haven't posted anything yet." : `${profile.username} hasn't posted anything yet.`}
            </div>
          ) : (
            <div className="kcp-grid">
              {posts.map(p => {
                const img = gridImage(p);
                return (
                  <div key={p.id} className="kcp-tile" onClick={() => setLightbox(p)}>
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element -- user-uploaded kcircle-media URL
                      <img src={img} alt={p.caption ?? 'post'} />
                    ) : (
                      <div style={{
                        width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: '8px', fontSize: '11px', color: 'var(--text-secondary)', textAlign: 'center', overflow: 'hidden',
                      }}>
                        {p.caption ?? ''}
                      </div>
                    )}
                    <div className="kcp-overlay">
                      <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><Heart size={16} fill="#fff" /> {p.likeCount}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><MessageCircle size={16} fill="#fff" /> {p.commentCount}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── LIGHTBOX ── */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
        >
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg-primary)', borderRadius: '14px', overflow: 'hidden',
            maxWidth: '440px', width: '100%', border: '1px solid var(--border-color)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Avatar name={profile?.username ?? '?'} avatarUrl={profile?.avatar_url} size={26} />
                <span style={{ fontWeight: 700, fontSize: '13px' }}>{profile?.username}</span>
              </div>
              <button onClick={() => setLightbox(null)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', display: 'flex' }}>
                <X size={18} />
              </button>
            </div>
            {gridImage(lightbox) && (
              // eslint-disable-next-line @next/next/no-img-element -- user-uploaded kcircle-media URL
              <img src={gridImage(lightbox)!} alt={lightbox.caption ?? 'post'} style={{ width: '100%', display: 'block', maxHeight: '55vh', objectFit: 'contain', background: '#000' }} />
            )}
            <div style={{ padding: '12px 14px' }}>
              {lightbox.caption && <div style={{ fontSize: '13.5px', marginBottom: '8px' }}>{lightbox.caption}</div>}
              <div style={{ display: 'flex', gap: '16px', fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><Heart size={14} /> {lightbox.likeCount}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><MessageCircle size={14} /> {lightbox.commentCount}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <span style={{ fontWeight: 800, fontSize: '16px' }}>{value}</span>
      <span style={{ fontSize: '11.5px', color: 'var(--text-tertiary)' }}>{label}</span>
    </div>
  );
}

function MenuLink({ href, icon, label, onClick }: { href: string; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
        borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)',
        textDecoration: 'none',
      }}
    >
      {icon} {label}
    </Link>
  );
}
