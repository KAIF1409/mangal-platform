'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { PenLine, IndianRupee, ArrowRight } from 'lucide-react';

// Phase 3 "Unique for Mangal" (CONTEXT.md §0c, build step 2) — spotlight
// banner on KaTube home for the most recently finalized month's WebMangal
// Writer of the Month. Reads get_writer_of_the_month(), the same RPC the
// Kalpana Circle announcement uses. Self-contained, "returns null when
// empty" pattern (same as MangalOfTheWeekBanner/MangalIdeasRow) — no
// banner at all until a month has been finalized at least once.

interface WriterOfMonth {
  writer_id: string;
  writer_username: string | null;
  series_title: string;
  score: number;
  prize_note: string | null;
}

export default function WriterOfTheMonthBanner() {
  const [winner, setWinner] = useState<WriterOfMonth | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc('get_writer_of_the_month');
      if (error || !data || data.length === 0) { setLoading(false); return; }
      setWinner((data as WriterOfMonth[])[0]);
      setLoading(false);
    })();
  }, []);

  if (loading || !winner) return null;

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto 28px', padding: '0 20px' }}>
      <Link
        href={winner.writer_username ? `/creator/${winner.writer_username}` : '/kalpana-circle/mangal-of-the-week'}
        style={{
          display: 'flex', alignItems: 'center', gap: '16px', textDecoration: 'none',
          padding: '16px 20px', borderRadius: '16px', flexWrap: 'wrap',
          background: 'linear-gradient(120deg, rgba(167,139,250,0.14), rgba(167,139,250,0.04))',
          border: '1px solid rgba(167,139,250,0.35)',
        }}
      >
        <span style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          width: '38px', height: '38px', borderRadius: '50%', background: '#a78bfa',
        }}><PenLine size={18} strokeWidth={2.5} color="#27272a" /></span>

        <div style={{ flex: 1, minWidth: '180px' }}>
          <div style={{ fontSize: '10.5px', fontWeight: 800, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>
            WebMangal Writer of the Month
          </div>
          <div style={{
            fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.3,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>@{winner.writer_username ?? 'dreamer'}</div>
          <div style={{ fontSize: '11.5px', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            for &ldquo;{winner.series_title}&rdquo;
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
          color: '#a78bfa', flexShrink: 0,
        }}>View profile<ArrowRight size={13} strokeWidth={2.5} /></span>
      </Link>
    </div>
  );
}
