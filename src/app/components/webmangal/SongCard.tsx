'use client';

// §85 — Songs discovery card. Same visual shell as SeriesCard (cover +
// bottom scrim chip + title/meta row) so Songs reads as a real third
// content type on Home/Library/Bookmarks/Search, not a bolted-on extra.
// No chapter_count/reading_mode here (doesn't apply to songs) — shows
// block count instead, plus a "based on X" badge when linked.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { formatViews } from '../../lib/format';
import { Music, Eye, BookOpen } from 'lucide-react';

export interface SongCardData {
  id: string;
  title: string;
  genre?: string | null;
  cover_url?: string | null;
  views?: number;
  block_count?: number;
  linked_series_title?: string | null;
}

export default function SongCard({
  song,
  creatorUsername,
}: {
  song: SongCardData;
  creatorUsername?: string;
}) {
  const router = useRouter();
  const [hovered, setHovered] = useState(false);

  return (
    <a
      href={`/WebMangal/songs/${song.id}`}
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
        <div style={{ position: 'relative', aspectRatio: '3/4', background: 'var(--bg-input)' }}>
          {song.cover_url ? (
            <Image src={song.cover_url} alt={song.title} fill sizes="(max-width: 768px) 45vw, 220px" style={{ objectFit: 'cover' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)' }}>
              <Music size={36} strokeWidth={1.5} />
            </div>
          )}

          {song.linked_series_title && (
            <div style={{
              position: 'absolute', top: '8px', left: '8px', right: '8px',
              display: 'flex', alignItems: 'center', gap: '3px',
              background: 'rgba(0,0,0,0.7)', borderRadius: '5px', padding: '3px 6px',
              fontSize: '9px', fontWeight: 700, color: '#a78bfa',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              <BookOpen size={9} strokeWidth={2} style={{ flexShrink: 0 }} /> Based on {song.linked_series_title}
            </div>
          )}

          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            background: 'linear-gradient(to top, rgba(0,0,0,0.82) 0%, transparent 100%)',
            padding: '20px 8px 6px',
            display: 'flex', alignItems: 'center', gap: '4px',
          }}>
            <span style={{
              fontSize: '9px', fontWeight: 700, color: '#fff',
              background: 'rgba(124,58,237,0.9)',
              padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase',
            }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                <Music size={9} strokeWidth={2} /> Song
              </span>
            </span>
          </div>
        </div>

        <div style={{ padding: '10px 10px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{
            fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {song.title}
          </div>

          {creatorUsername && (
            <div
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(`/kalpana-circle/broadcast/${creatorUsername}`); }}
              style={{ fontSize: '10px', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
              onMouseEnter={e => { (e.target as HTMLElement).style.color = 'var(--accent)'; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.color = 'var(--text-tertiary)'; }}
            >
              by @{creatorUsername}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
            {song.genre ? (
              <div style={{ fontSize: '10px', color: 'var(--accent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }}>
                {song.genre}
              </div>
            ) : <span />}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
              {typeof song.block_count === 'number' && (
                <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{song.block_count} blocks</span>
              )}
              <span style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '2px' }}><Eye size={10} strokeWidth={2} /> {formatViews(song.views ?? 0)}</span>
            </div>
          </div>
        </div>
      </div>
    </a>
  );
}
