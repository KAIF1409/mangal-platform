'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { getBackNav } from '../../lib/backNav';
import Image from 'next/image';
import { supabase } from '../../lib/supabase';
import { isDeveloperRole } from '../../lib/roles';
import Link from 'next/link';
import { Search, ArrowLeft, Flame, Eye, Megaphone, AlertTriangle, Ban, BookOpen, ScrollText, PenLine } from 'lucide-react';
import VerifiedBadge from '../../components/VerifiedBadge';

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
  verified_youtube_channel_id: string | null;
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
    <footer style={{ borderTop: '1px solid var(--footer-border)', background: 'var(--footer-bg)', padding: '24px', textAlign: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', flexWrap: 'wrap' as const }}>
        {[
          { label: 'Home', href: '/' },
          { label: 'Privacy Policy', href: '/privacy' },
          { label: 'Terms of Service', href: '/terms' },
          { label: 'Grievance Officer', href: '/grievance' },
        ].map(link => (
          <a key={link.href} href={link.href} style={{ fontSize: '11px', color: 'var(--footer-link)', textDecoration: 'none' }}>
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

  // Phase 3 "Unique for Mangal" (CONTEXT.md §0c) — profile-level "WebMangal
  // Writer of the Month" flair, same "read get_*_of_the_*() once, compare
  // to this profile's user_id" pattern as the KaTube channel page's
  // "Mangal of the Week" flair.
  const [isWriterOfMonth, setIsWriterOfMonth] = useState(false);

  // Bug fix: "Back to Browse" was hardcoded to "/" (platform home), so
  // visitors who arrived here from KaTube or Kalpana Circle (both link to
  // creator profiles) got bounced to WebMangal instead of back where they
  // came from. getBackNav() reads document.referrer to send them back to
  // the right product, falling back to "/" for direct visits.
  const [backNav] = useState(getBackNav());

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setNotFound(false);

      // Note: the "no bio/avatar_url column yet" comment that used to sit
      // here is stale — both were added since (avatar_url per
      // 20260816150000_creator_profiles_avatar_url.sql; bio predates that).
      // Not pulling them into this query yet since this page doesn't render
      // them — flagged rather than silently left wrong, see §13b-style drift
      // note. verified_youtube_channel_id added now for the §27 item 9 badge.
      const { data: creatorRow } = await supabase
        .from('creator_profiles')
        .select('user_id, username, verified_youtube_channel_id')
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

      // Phase 3 "Unique for Mangal" (CONTEXT.md §0c) — is this creator the
      // most recently finalized month's #1 writer? Same single-RPC-call,
      // compare-to-this-profile pattern as the KaTube channel page's
      // bestOwnRank check, just keyed on writer_id instead of a rank map
      // since get_writer_of_the_month() only ever returns the #1 writer.
      const { data: writerOfMonth } = await supabase.rpc('get_writer_of_the_month');
      const wom = (writerOfMonth ?? [])[0] as { writer_id: string } | undefined;
      setIsWriterOfMonth(!!wom && wom.writer_id === creatorRow.user_id);

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
      <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
        Loading creator profile...
      </div>
    );
  }

  if (notFound || !creator) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' as const, backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div style={{ width: '100%', maxWidth: '420px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '20px', padding: '40px 32px', textAlign: 'center' as const, boxShadow: '0 32px 80px rgba(0,0,0,0.6)' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '14px' }}><Search size={36} strokeWidth={1.5} color="var(--text-tertiary)" /></div>
            <h2 style={{ fontSize: '20px', fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 8px' }}>Creator Not Found</h2>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 28px' }}>
              No creator with the username &ldquo;@{username}&rdquo; exists.
            </p>
            <Link href={backNav.href} style={{
              display: 'inline-block', padding: '12px 28px', borderRadius: '10px',
              background: 'linear-gradient(135deg, #7f1d1d, #991b1b)',
              color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: '13px',
            }}>
              <ArrowLeft size={12} strokeWidth={2} style={{ display: 'inline', verticalAlign: 'middle' }} /> {backNav.label}
            </Link>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', }}>

      {/* Mobile pass (§13 sweep): this page had zero @media rules. The
          2-item nav (logo | Back to Browse) is small enough it was already
          safe, and the flex patterns elsewhere (flexShrink:0 avatar +
          flex:1/minWidth:0 info column, flexWrap on the stats row) already
          absorbed most of the squeeze — but the header card's fixed 28px
          padding plus the 72px avatar left very little room for the
          username/stats column on a ~320-360px phone. Tightens padding and
          shrinks the avatar under 480px, same .mangal-* + <style> pattern
          used elsewhere in this sweep. */}
      <style>{`
        @media (max-width: 480px) {
          .mangal-creator-header { padding: 18px !important; gap: 14px !important; }
          .mangal-creator-avatar { width: 56px !important; height: 56px !important; font-size: 20px !important; }
          .mangal-creator-name { font-size: 19px !important; }
          .mangal-creator-grid { padding: 0 16px 48px !important; }
        }
      `}</style>

      {/* ── NAV ── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'var(--nav-bg)', backdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--border-color)',
        padding: '0 24px', height: '64px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none', flexShrink: 0 }}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '10px',
            background: 'linear-gradient(135deg, #7f1d1d, #d97706)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px',
          }}><Flame size={18} strokeWidth={2} color="#fff" /></div>
          <span style={{ fontWeight: 900, fontSize: '20px', color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>MANGAL</span>
        </Link>
        <Link href={backNav.href} style={{ fontSize: '12px', color: 'var(--text-tertiary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}><ArrowLeft size={12} strokeWidth={2} /> {backNav.label}</Link>
      </nav>

      <div className="mangal-creator-grid" style={{ maxWidth: '1100px', margin: '0 auto', padding: '40px 24px 60px' }}>

        {/* ── CREATOR HEADER ── */}
        <div className="mangal-creator-header" style={{
          display: 'flex', alignItems: 'center', gap: '20px',
          padding: '28px', borderRadius: '20px',
          background: 'var(--bg-card)', border: '1px solid var(--border-color)',
          marginBottom: '32px',
        }}>
          <div className="mangal-creator-avatar" style={{
            width: '72px', height: '72px', borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(135deg, #7f1d1d, #d97706)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '26px', fontWeight: 800, color: '#fff',
          }}>
            {initialsFromUsername(creator.username)}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' as const, marginBottom: '4px' }}>
              <h1 className="mangal-creator-name" style={{ fontSize: '24px', fontWeight: 900, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                @{creator.username}
                {creator.verified_youtube_channel_id && <VerifiedBadge size={18} />}
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
            <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: '0 0 12px' }}>
              Creator on MANGAL
            </p>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' as const }}>
              <div>
                <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>{series.length}</span>
                <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginLeft: '5px' }}>series</span>
              </div>
              <div>
                <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Eye size={14} strokeWidth={2} /> {formatViews(totalViews)}</span>
                <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginLeft: '5px' }}>total views</span>
              </div>
              <Link href={`/kalpana-circle/broadcast/${creator.username}`} style={{
                fontSize: '11.5px', fontWeight: 700, color: '#a78bfa', textDecoration: 'none',
                padding: '6px 12px', borderRadius: '8px', background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.3)',
                display: 'inline-flex', alignItems: 'center', gap: '5px',
              }}>
                <Megaphone size={12} strokeWidth={2} /> Updates
              </Link>
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
                        display: 'inline-flex', alignItems: 'center', gap: '5px',
                      }}
                    >
                      {banning ? 'Banning...' : (<><AlertTriangle size={13} strokeWidth={2} /> Confirm Ban</>)}
                    </button>
                    <button
                      onClick={() => setBanConfirm(false)}
                      disabled={banning}
                      style={{
                        padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                        background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', cursor: 'pointer',
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
                      display: 'inline-flex', alignItems: 'center', gap: '5px',
                    }}
                  >
                    <Ban size={13} strokeWidth={2} /> Ban User
                  </button>
                )
              )}
            </div>
          </div>
        </div>

        {/* ── SERIES GRID ── */}
        <h2 style={{ fontSize: '16px', fontWeight: 800, marginBottom: '16px', color: 'var(--text-primary)' }}>
          Series by @{creator.username}
        </h2>

        {series.length === 0 ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-faint)' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}><BookOpen size={32} strokeWidth={1.5} color="var(--text-faint)" /></div>
            <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>No published series yet.</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 200px))', gap: '16px' }}>
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
        background: 'var(--bg-card)', border: `1px solid ${hovered ? '#d97706' : 'var(--border-color)'}`,
        transition: 'border-color 0.2s, transform 0.2s',
        transform: hovered ? 'translateY(-3px)' : 'none',
      }}>
        <div style={{ position: 'relative', aspectRatio: '3/4', background: '#1a0a0a' }}>
          {series.cover_url ? (
            <Image src={series.cover_url} alt={series.title} fill sizes="(max-width: 768px) 45vw, 200px" style={{ objectFit: 'cover' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ScrollText size={36} strokeWidth={1.5} color="var(--text-faint)" /></div>
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
            fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3, marginBottom: '4px',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {series.title}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {series.genre ? <div style={{ fontSize: '10px', color: '#d97706' }}>{series.genre}</div> : <span />}
            <span style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}><Eye size={10} strokeWidth={2} /> {formatViews(series.views ?? 0)}</span>
          </div>
        </div>
      </div>
    </a>
  );
}