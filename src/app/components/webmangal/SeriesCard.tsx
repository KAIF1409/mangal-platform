'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { formatViews } from '../../lib/format';
import { BookText, ScrollText, Star, Eye } from 'lucide-react';

export interface SeriesCardData {
  id: string;
  title: string;
  genre?: string | null;
  cover_url?: string | null;
  reading_mode?: 'scroll' | 'page';
  content_type: 'mangal' | 'novel';
  completion_status?: 'ongoing' | 'completed' | 'hiatus' | null;
  views?: number;
  chapter_count?: number;
  avg_rating?: number | null;
}

const STATUS_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  completed: { color: '#34d399', bg: 'rgba(6,78,59,0.35)', border: 'rgba(52,211,153,0.4)' },
  hiatus: { color: '#fbbf24', bg: 'rgba(120,53,15,0.3)', border: 'rgba(251,191,36,0.4)' },
};

/**
 * Shared discovery card — used on Home, Search, the landing page, and (soon)
 * Library/Bookmarks/Tags. These previously each hand-rolled their own near-
 * identical card with drifting rank-badge styles, inconsistent rating
 * display, and one page using hardcoded dark colors instead of the site's
 * var(--...) theme system. This is the single source of truth now.
 */
export default function SeriesCard({
  series,
  rank,
  creatorUsername,
}: {
  series: SeriesCardData;
  /** Renders a rank badge. 1-3 get medal styling, 4+ get a plain numbered badge. */
  rank?: number;
  /** Search results show "by @username" — link to the creator's profile */
  creatorUsername?: string;
}) {
  const router = useRouter();
  const [hovered, setHovered] = useState(false);
  const isNovel = series.content_type === 'novel';
  const status = series.completion_status && series.completion_status !== 'ongoing'
    ? STATUS_STYLE[series.completion_status]
    : null;

  return (
    <a
      href={`/WebMangal/series/${series.id}`}
      style={{ textDecoration: 'none', display: 'block' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{
        borderRadius: '12px', overflow: 'hidden',
        background: 'var(--bg-card)', border: `1px solid ${hovered ? 'var(--accent)' : 'var(--border-color)'}`,
        transition: 'border-color 0.2s, transform 0.2s, box-shadow 0.2s',
        transform: hovered ? 'translateY(-3px)' : 'none',
        boxShadow: hovered ? '0 8px 24px rgba(var(--accent-rgb), 0.15)' : 'none',
        height: '100%', display: 'flex', flexDirection: 'column',
      }}>
        {/* Cover */}
        <div style={{ position: 'relative', aspectRatio: '3/4', background: 'var(--bg-input)' }}>
          {series.cover_url ? (
            <Image src={series.cover_url} alt={series.title} fill sizes="(max-width: 768px) 45vw, 220px" style={{ objectFit: 'cover' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)' }}>
              {isNovel ? <BookText size={36} strokeWidth={1.5} /> : <ScrollText size={36} strokeWidth={1.5} />}
            </div>
          )}

          {/* Rank badge: medal gradient for top 3, plain numbered badge otherwise */}
          {rank && (
            <div style={{
              position: 'absolute', top: '8px', left: '8px',
              width: '24px', height: '24px', borderRadius: '6px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '11px', fontWeight: 900,
              color: rank <= 3 ? '#1a1006' : '#fff',
              background: rank === 1 ? 'linear-gradient(135deg, #fbbf24, #d97706)'
                : rank === 2 ? 'linear-gradient(135deg, #e5e7eb, #9ca3af)'
                : rank === 3 ? 'linear-gradient(135deg, #d97706, #92400e)'
                : 'rgba(0,0,0,0.75)',
              boxShadow: rank <= 3 ? '0 2px 8px rgba(217,119,6,0.4)' : 'none',
              border: rank <= 3 ? 'none' : '1px solid var(--border-color)',
            }}>
              {rank <= 3 ? rank : `#${rank}`}
            </div>
          )}

          {/* Rating badge, top-right, only when there's real rating data */}
          {typeof series.avg_rating === 'number' && series.avg_rating > 0 && (
            <div style={{
              position: 'absolute', top: '8px', right: '8px',
              display: 'flex', alignItems: 'center', gap: '3px',
              background: 'rgba(0,0,0,0.65)', borderRadius: '5px', padding: '2px 6px',
              fontSize: '10px', fontWeight: 700, color: '#fbbf24',
            }}>
              <Star size={9} strokeWidth={2} fill="#fbbf24" /> {series.avg_rating.toFixed(1)}
            </div>
          )}

          {/* Completion-status badge, top-right — falls below rating badge if both present */}
          {status && (
            <span style={{
              position: 'absolute', right: '8px',
              top: (typeof series.avg_rating === 'number' && series.avg_rating > 0) ? '30px' : '8px',
              fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
              padding: '2px 7px', borderRadius: '20px',
              color: status.color, background: status.bg, border: `1px solid ${status.border}`,
            }}>
              {series.completion_status}
            </span>
          )}

          {/* Content-type / reading-mode chips over a bottom scrim */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            background: 'linear-gradient(to top, rgba(0,0,0,0.82) 0%, transparent 100%)',
            padding: '20px 8px 6px',
            display: 'flex', alignItems: 'center', gap: '4px',
          }}>
            <span style={{
              fontSize: '9px', fontWeight: 700, color: '#fff',
              background: isNovel ? 'rgba(109,40,217,0.9)' : 'rgba(127,29,29,0.9)',
              padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase',
            }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                {isNovel ? <BookText size={9} strokeWidth={2} /> : <ScrollText size={9} strokeWidth={2} />} {isNovel ? 'Novel' : 'Mangal'}
              </span>
            </span>
            {!isNovel && series.reading_mode && (
              <span style={{
                fontSize: '9px', fontWeight: 700, color: '#d1d5db',
                background: 'rgba(0,0,0,0.6)', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase',
              }}>
                {series.reading_mode === 'scroll' ? 'Scroll' : 'Page'}
              </span>
            )}
          </div>
        </div>

        {/* Title + metadata */}
        <div style={{ padding: '10px 10px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{
            fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {series.title}
          </div>

          {creatorUsername && (
            <div
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(`/WebMangal/creator/${creatorUsername}`); }}
              style={{ fontSize: '10px', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
              onMouseEnter={e => { (e.target as HTMLElement).style.color = 'var(--accent)'; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.color = 'var(--text-tertiary)'; }}
            >
              by @{creatorUsername}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
            {series.genre ? (
              <div style={{ fontSize: '10px', color: 'var(--accent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }}>
                {series.genre}
              </div>
            ) : <span />}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
              {typeof series.chapter_count === 'number' && (
                <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{series.chapter_count} ch</span>
              )}
              <span style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '2px' }}><Eye size={10} strokeWidth={2} /> {formatViews(series.views ?? 0)}</span>
            </div>
          </div>
        </div>
      </div>
    </a>
  );
}
