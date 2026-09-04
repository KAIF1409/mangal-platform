'use client';

// §153 — Books discovery card. Same visual shell as SeriesCard/SongCard
// (cover + bottom scrim chip + title/meta row) so Books reads as a first-class
// content type in the unified "All" tab on /WebMangal instead of a bolted-on
// extra. The bottom scrim carries the book-specific "Book" tag (with the
// PDF/EPUB format chip next to it) so each kind is clearly labelled in the
// mixed feed, and the price chip stays top-left like the old inline card.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { formatViews } from '../../lib/format';
import { BookOpen, Eye } from 'lucide-react';

export interface BookCardData {
  id: string;
  title: string;
  cover_image_url?: string | null;
  file_type?: 'pdf' | 'epub';
  pricing_type?: 'FREE' | 'PAID';
  price_paise?: number | null;
  category?: string | null;
  views?: number;
}

function formatPaise(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export default function BookCard({
  book,
  authorUsername,
}: {
  book: BookCardData;
  /** Author username from creator_profiles — links to the creator page. */
  authorUsername?: string;
}) {
  const router = useRouter();
  const [hovered, setHovered] = useState(false);

  return (
    <a
      href={`/WebMangal/books/${book.id}`}
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
        {/* Cover — cover_image_url is an /api/media R2 route, same reason the
            rest of the books module passes `unoptimized` to next/image. */}
        <div style={{ position: 'relative', aspectRatio: '3/4', background: 'var(--bg-input)' }}>
          {book.cover_image_url ? (
            <Image src={book.cover_image_url} alt={book.title} fill unoptimized sizes="(max-width: 768px) 45vw, 220px" style={{ objectFit: 'cover' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)' }}>
              <BookOpen size={36} strokeWidth={1.5} />
            </div>
          )}

          {/* Price chip — top-left, same slot SongCard uses for "Based on X" */}
          <div style={{ position: 'absolute', top: '8px', left: '8px' }}>
            <span style={{
              fontSize: '9.5px', fontWeight: 800, color: '#fff',
              background: book.pricing_type === 'PAID' && book.price_paise ? 'rgba(var(--accent-rgb), 0.92)' : 'rgba(16,185,129,0.92)',
              padding: '2px 7px', borderRadius: '20px',
            }}>
              {book.pricing_type === 'PAID' && book.price_paise ? formatPaise(book.price_paise) : 'FREE'}
            </span>
          </div>
          {/* Content-type / format chips over a bottom scrim — the "Book"
              tag is the clear per-kind label the unified All tab needs. */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            background: 'linear-gradient(to top, rgba(0,0,0,0.82) 0%, transparent 100%)',
            padding: '20px 8px 6px',
            display: 'flex', alignItems: 'center', gap: '4px',
          }}>
            <span style={{
              fontSize: '9px', fontWeight: 700, color: '#fff',
              background: 'rgba(29,78,216,0.92)',
              padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase',
            }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                <BookOpen size={9} strokeWidth={2} /> Book
              </span>
            </span>
            {book.file_type && (
              <span style={{
                fontSize: '9px', fontWeight: 700, color: '#d1d5db',
                background: 'rgba(0,0,0,0.6)', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase',
              }}>
                {book.file_type}
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
            {book.title}
          </div>

          {authorUsername && (
            <div
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(`/WebMangal/creator/${authorUsername}`); }}
              style={{ fontSize: '10px', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
              onMouseEnter={e => { (e.target as HTMLElement).style.color = 'var(--accent)'; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.color = 'var(--text-tertiary)'; }}
            >
              by @{authorUsername}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
            {book.category ? (
              <div style={{ fontSize: '10px', color: 'var(--accent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }}>
                {book.category}
              </div>
            ) : <span />}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
              <span style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '2px' }}><Eye size={10} strokeWidth={2} /> {formatViews(book.views ?? 0)}</span>
            </div>
          </div>
        </div>
      </div>
    </a>
  );
}
