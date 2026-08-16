'use client';

// §27 item 9 — Creator leaderboard. Cross-product ranking (WebMangal series
// views + KaTube video views combined, same framing as the Earnings
// Performance section, §45) via the `creator_leaderboard` RPC
// (20260816200000_creator_leaderboard.sql) — a single aggregate query, no
// client-side joining. Verified badge reuses the existing
// `verified_youtube_channel_id` signal (§6/§10), no new column.
//
// Deliberately its own /leaderboard route rather than a new tab bolted onto
// /rankings — that page ranks *series*, this ranks *creators*; different
// row shape (avatar/username/follow count vs. cover/genre), so a shared tab
// switcher would need two incompatible row components behind one state
// anyway. Cross-linked from /rankings's top nav instead (see edit there).

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { supabase } from '../lib/supabase';
import Navbar from '../components/shared/Navbar';
import Footer from '../components/shared/Footer';
import VerifiedBadge from '../components/shared/VerifiedBadge';
import { Trophy, Eye, Users, Search } from 'lucide-react';

interface LeaderboardRow {
  creator_id: string;
  username: string;
  avatar_url: string | null;
  verified_youtube_channel_id: string | null;
  series_views: number;
  video_views: number;
  total_views: number;
  follower_count: number;
}

function formatCount(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString('en-IN');
}

export default function LeaderboardPage() {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .rpc('creator_leaderboard', { result_limit: 50 })
      .then(({ data }) => {
        setRows((data ?? []) as LeaderboardRow[]);
        setLoading(false);
      });
  }, []);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <style>{`
        @media (max-width: 640px) {
          .mangal-lb-content { padding: 28px 16px 60px !important; }
        }
        @media (max-width: 480px) {
          .mangal-lb-row { gap: 10px !important; padding: 10px 6px !important; }
          .mangal-lb-avatar { width: 40px !important; height: 40px !important; font-size: 15px !important; }
          .mangal-lb-num { width: 20px !important; font-size: 14px !important; }
        }
      `}</style>
      <Navbar
        variant="custom"
        platformName="WebMangal"
        logoSrc="/webmangal-logo.png"
        href="/WebMangal"
        centerSlot={
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            {[
              { label: 'Browse', href: '/WebMangal', icon: null as typeof Trophy | null },
              { label: 'Rankings', href: '/WebMangal/rankings', icon: Trophy },
              { label: 'Creators', href: '/leaderboard', icon: Users },
              { label: 'Search', href: '/WebMangal/search', icon: Search },
              { label: 'Tags', href: '/WebMangal/tags', icon: null as typeof Trophy | null },
            ].map(link => (
              <a key={link.label} href={link.href} style={{
                padding: '8px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                color: link.href === '/leaderboard' ? '#d97706' : 'var(--text-secondary)', textDecoration: 'none',
                display: 'inline-flex', alignItems: 'center', gap: '6px',
              }}>{link.icon && <link.icon size={13} strokeWidth={2} />}{link.label}</a>
            ))}
          </div>
        }
      />

      <div className="mangal-lb-content" style={{ maxWidth: '900px', margin: '0 auto', padding: '40px 24px 80px' }}>
        <h1 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 900, margin: '0 0 6px', letterSpacing: '-0.02em' }}>
          Creator Leaderboard
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--text-tertiary)', margin: '0 0 28px' }}>
          Ranked by combined views across WebMangal and KaTube — the whole
          MANGAL ecosystem, not just one product.
        </p>

        {loading ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-faint)' }}>Loading leaderboard...</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-faint)' }}>
            Not enough data yet — check back once creators have published views.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {rows.map((r, i) => (
              <LeaderRow key={r.creator_id} row={r} rank={i + 1} />
            ))}
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}

function LeaderRow({ row, rank }: { row: LeaderboardRow; rank: number }) {
  const [hovered, setHovered] = useState(false);
  const rankColor = rank === 1 ? '#d97706' : rank === 2 ? 'var(--text-secondary)' : rank === 3 ? '#92400e' : 'var(--text-faint)';

  return (
    <Link
      href={`/creator/${row.username}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: '16px', padding: '12px 10px',
        textDecoration: 'none', borderBottom: '1px solid #14141c',
        background: hovered ? 'var(--bg-card)' : 'transparent', borderRadius: '8px',
        transition: 'background 0.15s',
      }}
      className="mangal-lb-row"
    >
      <div className="mangal-lb-num" style={{
        width: '28px', flexShrink: 0, textAlign: 'center', fontSize: rank <= 3 ? '20px' : '15px',
        fontWeight: 900, fontStyle: 'italic', color: rankColor,
      }}>
        {rank}
      </div>

      <div className="mangal-lb-avatar" style={{
        width: '46px', height: '46px', flexShrink: 0, borderRadius: '50%', overflow: 'hidden', position: 'relative',
        background: 'linear-gradient(135deg, #7f1d1d, #d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '17px', fontWeight: 800, color: '#fff',
      }}>
        {row.avatar_url ? (
          <Image src={row.avatar_url} alt={row.username} fill sizes="46px" style={{ objectFit: 'cover' }} />
        ) : (
          row.username.slice(0, 2).toUpperCase()
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '14px', fontWeight: 700, color: hovered ? '#d97706' : 'var(--text-primary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '4px',
          transition: 'color 0.15s', display: 'flex', alignItems: 'center', gap: '5px',
        }}>
          @{row.username}
          {row.verified_youtube_channel_id && <VerifiedBadge size={14} />}
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '11px', color: 'var(--text-tertiary)' }}>
          <Users size={11} strokeWidth={2} /> {formatCount(row.follower_count)} followers
        </div>
      </div>

      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-soft)', display: 'inline-flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
          <Eye size={12} strokeWidth={2} /> {formatCount(row.total_views)}
        </div>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>total views</div>
      </div>
    </Link>
  );
}
