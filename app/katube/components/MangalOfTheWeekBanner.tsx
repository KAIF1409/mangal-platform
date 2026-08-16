'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { Trophy, IndianRupee, ArrowRight } from 'lucide-react';

// Phase 2 "Unique for Mangal" (CONTEXT.md §0c, build step 4) — spotlight
// banner on KaTube home for the most recently finalized week's #1 video.
// Reads the same get_mangal_of_the_week() RPC the K Circle voting page
// uses, so this and the Top 5 list there always agree. Self-contained,
// "returns null when empty" pattern (same as MangalIdeasRow /
// ContinueWatchingRow) — no banner at all until a week has been
// finalized at least once.

interface Winner {
  rank: number;
  video_id: string;
  video_title: string;
  youtube_id: string;
  votes_count: number;
  prize_note: string | null;
  creator_username: string | null;
  collab_writer_username: string | null;
  tier: number;
}

export default function MangalOfTheWeekBanner() {
  const [winner, setWinner] = useState<Winner | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc('get_mangal_of_the_week');
      if (error || !data || data.length === 0) { setLoading(false); return; }
      const top = (data as Winner[]).find(w => w.rank === 1) ?? null;
      setWinner(top);
      setLoading(false);
    })();
  }, []);

  if (loading || !winner) return null;

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto 28px', padding: '0 20px' }}>
      <Link
        href="/kalpana-circle/mangal-of-the-week"
        style={{
          display: 'flex', alignItems: 'center', gap: '16px', textDecoration: 'none',
          padding: '16px 20px', borderRadius: '16px', flexWrap: 'wrap',
          background: 'linear-gradient(120deg, rgba(245,158,11,0.14), rgba(245,158,11,0.04))',
          border: '1px solid rgba(245,158,11,0.35)',
        }}
      >
        <span style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          width: '38px', height: '38px', borderRadius: '50%', background: '#f59e0b',
        }}><Trophy size={18} strokeWidth={2.5} color="#27272a" /></span>

        {/* eslint-disable-next-line @next/next/no-img-element -- YouTube CDN thumbnail, same pattern used across KaTube */}
        <img
          src={`https://img.youtube.com/vi/${winner.youtube_id}/hqdefault.jpg`}
          alt=""
          style={{ width: '96px', height: '54px', objectFit: 'cover', borderRadius: '9px', flexShrink: 0 }}
        />

        <div style={{ flex: 1, minWidth: '180px' }}>
          <div style={{ fontSize: '10.5px', fontWeight: 800, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>
            Mangal of the Week
          </div>
          <div style={{
            fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.3,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{winner.video_title}</div>
          <div style={{ fontSize: '11.5px', color: 'var(--text-tertiary)' }}>
            by @{winner.creator_username ?? 'dreamer'}
            {winner.tier === 1 && winner.collab_writer_username && <> · collab with @{winner.collab_writer_username}</>}
            {' · '}{winner.votes_count} votes
          </div>
        </div>

        {winner.prize_note && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '3px', fontSize: '12px', fontWeight: 800, color: '#22c55e',
            background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.3)',
            padding: '5px 11px', borderRadius: '20px', flexShrink: 0,
          }}>
            <IndianRupee size={12} strokeWidth={2.5} />{winner.prize_note}
          </div>
        )}

        <span style={{
          display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', fontWeight: 700,
          color: '#f59e0b', flexShrink: 0,
        }}>See Top 5<ArrowRight size={13} strokeWidth={2.5} /></span>
      </Link>
    </div>
  );
}
