'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
import { useStudioAuth } from '../../katube/lib/useStudioAuth';
import { Info, Star } from 'lucide-react';

// §114/§131 follow-up — WebMangal doesn't have a "channel setup" concept
// (no channel-verify flow like KaTube), so the founder asked for a
// Comments-shaped moderation tab here instead: WebMangal's equivalent of
// reader feedback is `ratings` (stars, optional review_title/review_text
// — see 20260809_written_reviews.sql), not a separate comments table.
// Same honesty rule as KatubeStudioComments: `ratings` only has a public
// SELECT policy plus "reader can update/insert their own row" — there is
// no creator-delete policy today, so this stays read-only, same as
// KaTube's Comments tab, rather than implying a moderation action that
// doesn't actually exist in the database yet.

interface ReviewRow {
  id: string;
  series_id: string;
  seriesTitle: string;
  stars: number;
  review_title: string | null;
  review_text: string | null;
  created_at: string;
}

export default function WebMangalStudioReviews() {
  const { user, loading } = useStudioAuth('/mangal-studio/webmangal/reviews');
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data: series } = await supabase.from('series').select('id, title').eq('creator_id', user.id);
      const seriesMap = new Map((series ?? []).map(s => [s.id, s.title]));
      const ids = (series ?? []).map(s => s.id);
      if (ids.length === 0) { setDataLoading(false); return; }

      const { data: reviews } = await supabase
        .from('ratings')
        .select('id, series_id, stars, review_title, review_text, created_at')
        .in('series_id', ids)
        .order('created_at', { ascending: false })
        .limit(100);

      setRows((reviews ?? []).map(r => ({ ...r, seriesTitle: seriesMap.get(r.series_id) ?? 'Untitled' })));
      setDataLoading(false);
    };
    load();
  }, [user]);

  if (loading || dataLoading) {
    return <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px' }}>Loading…</div>;
  }

  return (
    <div style={{ maxWidth: '760px' }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '12px 14px', borderRadius: '10px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', marginBottom: '18px', fontSize: '12px', color: 'var(--text-tertiary)' }}>
        <Info size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
        Read-only for now — removing a reader&apos;s rating/review needs a new moderation permission that
        hasn&apos;t been added yet, so this view is for keeping an eye on reader feedback, not moderating it.
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: '30px', textAlign: 'center', borderRadius: '12px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-tertiary)', fontSize: '13px' }}>
          No ratings or reviews yet across your series.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {rows.map(r => (
            <div key={r.id} style={{ padding: '14px 16px', borderRadius: '12px', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginBottom: '6px' }}>
                <Link href={`/WebMangal/series/${r.series_id}`} style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--accent)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.seriesTitle}
                </Link>
                <span style={{ fontSize: '11px', color: 'var(--text-faint, var(--text-tertiary))', flexShrink: 0 }}>
                  {new Date(r.created_at).toLocaleDateString()}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '2px', marginBottom: r.review_title || r.review_text ? '6px' : 0 }}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} size={13} fill={i < r.stars ? 'var(--accent)' : 'none'} color="var(--accent)" strokeWidth={1.5} />
                ))}
              </div>
              {r.review_title && <p style={{ fontSize: '13px', fontWeight: 700, margin: '0 0 4px' }}>{r.review_title}</p>}
              {r.review_text && <p style={{ fontSize: '13px', color: 'var(--text-primary)', margin: 0, lineHeight: 1.5 }}>{r.review_text}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
