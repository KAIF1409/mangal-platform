'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import { supabase } from '../../lib/supabase';
import { isDeveloperRole } from '../../lib/roles';

interface Series {
  id: string;
  title: string;
  synopsis: string;
  genre: string | null;
  language: string | null;
  cover_url: string | null;
  reading_mode: 'scroll' | 'page';
  views: number;
  completion_status?: 'ongoing' | 'completed' | 'hiatus';
}

interface CreatorInfo {
  user_id: string;
  username: string;
}

function formatViews(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

// Same initials-avatar pattern as ProfileMenu.tsx, but built from the public
// username instead of email/full_name — those aren't available for other
// users (and shouldn't be, since this page is public/unauthenticated-visible).
function initialsFromUsername(username: string): string {
  return username.slice(0, 2).toUpperCase();
}

function Footer() {
  return (
    <footer style={{ borderTop: '1px solid #1a1a26', padding: '24px', textAlign: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', flexWrap: 'wrap' as const }}>
        {[
          { label: 'Home', href: '/' },
          { label: 'Privacy Policy', href: '/privacy' },
          { label: 'Terms of Service', href: '/terms' },
          { label: 'Grievance Officer', href: '/grievance' },
        ].map(link => (
          <a key={link.href} href={link.href} style={{ fontSize: '11px', color: '#4b5563', textDecoration: 'none' }}>
            {link.label}
          </a>
        ))}
      </div>
    </footer>
  );
}

export default function CreatorProfilePage() {
  const params = useParams();
  const username = decodeURIComponent(params.username as string);

  const [creator, setCreator] = useState<CreatorInfo | null>(null);
  const [series, setSeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Bug fix: developers had no direct way to ban a user from their profile
  // page — the only path was Report -> Admin Reports -> Ban User, which
  // requires the offending content to still exist to report against. This
  // lets a developer act straight from the creator's public profile.
  const [isDeveloper, setIsDeveloper] = useState(false);
  const [accountActive, setAccountActive] = useState(true);
  const [banConfirm, setBanConfirm] = useState(false);
  const [banning, setBanning] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setNotFound(false);

      // creator_profiles only stores user_id + username today — no bio or
      // avatar_url column yet. If those get added later (quick migration),
      // this query just needs .select('user_id, username, bio, avatar_url').
      const { data: creatorRow } = await supabase
        .from('creator_profiles')
        .select('user_id, username')
        .ilike('username', username)
        .single();

      if (!creatorRow) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setCreator(creatorRow);

      // Check the viewer's own role — only developers see the Ban button —
      // and this creator's current account_active status, so a developer
      // visiting an already-banned profile sees that instead of a stale
      // "Ban User" button.
      const { data: viewer } = await supabase.auth.getUser();
      if (viewer.user) {
        const { data: viewerProfile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', viewer.user.id)
          .single();
        setIsDeveloper(isDeveloperRole(viewerProfile?.role));
      }

      const { data: creatorProfile } = await supabase
        .from('profiles')
        .select('account_active')
        .eq('id', creatorRow.user_id)
        .single();
      setAccountActive(creatorProfile?.account_active ?? true);

      // Only published series — drafts stay private to the creator's own dashboard
      const { data: seriesData } = await supabase
        .from('series')
        .select('id, title, synopsis, genre, language, cover_url, reading_mode, views, completion_status')
        .eq('creator_id', creatorRow.user_id)
        .eq('status', 'published')
        .order('created_at', { ascending: false });

      setSeries(seriesData || []);
      setLoading(false);
    };
    load();
  }, [username]);

  const totalViews = series.reduce((sum, s) => sum + (s.views ?? 0), 0);

  const handleBanUser = async () => {
    if (!creator) return;
    if (!banConfirm) {
      setBanConfirm(true);
      return;
    }
    setBanning(true);
    const { error } = await supabase
      .from('profiles')
      .update({ account_active: false })
      .eq('id', creator.user_id);

    if (error) {
      alert(`Failed to ban user: ${error.message}`);
      setBanning(false);
      setBanConfirm(false);
      return;
    }
    setAccountActive(false);
    setBanning(false);
    setBanConfirm(false);
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#07070a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4b5563', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '13px' }}>
        Loading creator profile...
      </div>
    );
  }

  if (notFound || !creator) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' as const, backgroundColor: '#07070a', color: '#f9fafb', fontFamily: 'Arial, Helvetica, sans-serif' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div style={{ width: '100%', maxWidth: '420px', background: '#0d0d14', border: '1px solid #1a1a26', borderRadius: '20px', padding: '40px 32px', textAlign: 'center' as const, boxShadow: '0 32px 80px rgba(0,0,0,0.6)' }}>
            <div style={{ fontSize: '36px', marginBottom: '14px' }}>🔍</div>
            <h2 style={{ fontSize: '20px', fontWeight: 900, color: '#fff', margin: '0 0 8px' }}>Creator Not Found</h2>
            <p style={{ fontSize: '13px', color: '#9ca3af', lineHeight: 1.6, margin: '0 0 28px' }}>
              No creator with the username &ldquo;@{username}&rdquo; exists.
            </p>
            <a href="/" style={{
              display: 'inline-block', padding: '12px 28px', borderRadius: '10px',
              background: 'linear-gradient(135deg, #7f1d1d, #991b1b)',
              color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: '13px',
            }}>
              ← Back to Browse
            </a>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#07070a', color: '#f9fafb', fontFamily: "'Segoe UI', Arial, sans-serif" }}>

      {/* ── NAV ── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(7,7,10,0.97)', backdropFilter: 'blur(16px)',
        borderBottom: '1px solid #1a1a26',
        padding: '0 24px', height: '64px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none', flexShrink: 0 }}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '10px',
            background: 'linear-gradient(135deg, #7f1d1d, #d97706)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px',
          }}>🔥</div>
          <span style={{ fontWeight: 900, fontSize: '20px', color: '#fff', letterSpacing: '-0.03em' }}>MANGAL</span>
        </a>
        <a href="/" style={{ fontSize: '12px', color: '#6b7280', textDecoration: 'none' }}>← Back to Browse</a>
      </nav>

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '40px 24px 60px' }}>

        {/* ── CREATOR HEADER ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '20px',
          padding: '28px', borderRadius: '20px',
          background: '#0d0d14', border: '1px solid #1a1a26',
          marginBottom: '32px',
        }}>
          <div style={{
            width: '72px', height: '72px', borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(135deg, #7f1d1d, #d97706)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '26px', fontWeight: 800, color: '#fff',
          }}>
            {initialsFromUsername(creator.username)}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' as const, marginBottom: '4px' }}>
              <h1 style={{ fontSize: '24px', fontWeight: 900, color: '#fff', margin: 0, letterSpacing: '-0.02em' }}>
                @{creator.username}
              </h1>
              {!accountActive && (
                <span style={{
                  fontSize: '10px', fontWeight: 700, color: '#ef4444', background: 'rgba(239,68,68,0.12)',
                  border: '1px solid rgba(239,68,68,0.3)', padding: '3px 9px', borderRadius: '12px',
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                }}>
                  Banned
                </span>
              )}
            </div>
            {/* No bio column yet on creator_profiles — placeholder keeps the
                layout settled now and is a one-line swap once bio exists */}
            <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 12px' }}>
              Creator on MANGAL
            </p>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' as const }}>
              <div>
                <span style={{ fontSize: '15px', fontWeight: 800, color: '#fff' }}>{series.length}</span>
                <span style={{ fontSize: '11px', color: '#6b7280', marginLeft: '5px' }}>series</span>
              </div>
              <div>
                <span style={{ fontSize: '15px', fontWeight: 800, color: '#fff' }}>👁 {formatViews(totalViews)}</span>
                <span style={{ fontSize: '11px', color: '#6b7280', marginLeft: '5px' }}>total views</span>
              </div>
              {isDeveloper && accountActive && (
                banConfirm ? (
                  <div style={{ display: 'inline-flex', gap: '6px' }}>
                    <button
                      onClick={handleBanUser}
                      disabled={banning}
                      style={{
                        padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                        background: '#7f1d1d', border: '1px solid #991b1b', color: '#fff',
                        cursor: banning ? 'wait' : 'pointer', opacity: banning ? 0.7 : 1,
                      }}
                    >
                      {banning ? 'Banning...' : '⚠️ Confirm Ban'}
                    </button>
                    <button
                      onClick={() => setBanConfirm(false)}
                      disabled={banning}
                      style={{
                        padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                        background: '#08080c', border: '1px solid #1a1a26', color: '#9ca3af', cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleBanUser}
                    title="Ban this user's account"
                    style={{
                      padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                      background: 'rgba(153,27,27,0.1)', border: '1px solid rgba(153,27,27,0.3)',
                      color: '#ef4444', cursor: 'pointer',
                    }}
                  >
                    🚫 Ban User
                  </button>
                )
              )}
            </div>
          </div>
        </div>

        {/* ── SERIES GRID ── */}
        <h2 style={{ fontSize: '16px', fontWeight: 800, marginBottom: '16px', color: '#fff' }}>
          Series by @{creator.username}
        </h2>

        {series.length === 0 ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: '#374151' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>📖</div>
            <div style={{ fontSize: '13px', color: '#6b7280' }}>No published series yet.</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '16px' }}>
            {series.map(s => (
              <SeriesCard key={s.id} series={s} />
            ))}
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}

function SeriesCard({ series }: { series: Series }) {
  const [hovered, setHovered] = useState(false);
  return (
    <a href={`/series/${series.id}`} style={{ textDecoration: 'none' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}>
      <div style={{
        borderRadius: '12px', overflow: 'hidden',
        background: '#0d0d14', border: `1px solid ${hovered ? '#d97706' : '#1a1a26'}`,
        transition: 'border-color 0.2s, transform 0.2s',
        transform: hovered ? 'translateY(-3px)' : 'none',
      }}>
        <div style={{ position: 'relative', aspectRatio: '3/4', background: '#1a0a0a' }}>
          {series.cover_url ? (
            <Image src={series.cover_url} alt={series.title} fill sizes="(max-width: 768px) 45vw, 200px" style={{ objectFit: 'cover' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '36px' }}>📜</div>
          )}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%)',
            padding: '20px 8px 6px',
          }}>
            <span style={{
              fontSize: '9px', fontWeight: 700, color: '#fff', background: 'rgba(127,29,29,0.9)',
              padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase',
            }}>
              {series.reading_mode === 'scroll' ? 'SCROLL' : 'PAGE'}
            </span>
          </div>
        </div>
        <div style={{ padding: '10px 10px 12px' }}>
          <div style={{
            fontSize: '12px', fontWeight: 700, color: '#fff', lineHeight: 1.3, marginBottom: '4px',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {series.title}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {series.genre ? <div style={{ fontSize: '10px', color: '#d97706' }}>{series.genre}</div> : <span />}
            <span style={{ fontSize: '9px', color: '#4b5563' }}>👁 {formatViews(series.views ?? 0)}</span>
          </div>
        </div>
      </div>
    </a>
  );
}