'use client';

import type { CSSProperties, ReactNode } from 'react';
import {
  CheckSquare, Square, Globe, Lock, EyeOff, Clock, AlertCircle, ArrowUpDown, type LucideIcon,
} from 'lucide-react';

/* -- 135 Unified Content Dashboard table (YouTube Studio-style) --
   Renders the shared data table for both KaTube (video/shorts) and
   WebMangal (novel/manga) rows, swapping the metric columns dynamically. */

export type ContentType = 'katube' | 'webmangal';

export type KatubeRow = {
  id: string; title: string; thumbnailUrl: string | null;
  status: 'published' | 'draft' | 'scheduled' | 'processing';
  visibility: 'public' | 'private' | 'unlisted';
  metrics: { views: number; likes: number; comments: number };
  createdAt: string; isShort: boolean; youtubeId?: string;
};

export type WebMangalRow = {
  id: string; title: string; thumbnailUrl: string | null;
  status: 'published' | 'draft' | 'scheduled';
  visibility: 'public' | 'private' | 'draft' | 'scheduled';
  metrics: { reads: number; bookmarks: number; chapters: number; comments: number };
  createdAt: string; contentType: 'novel' | 'manga'; seriesId: string; seriesTitle?: string;
};

export type AnyRow = KatubeRow | WebMangalRow;

const STATUS_BADGE: Record<string, { label: string; color: string; icon: LucideIcon }> = {
  published: { label: 'Published', color: '#22c55e', icon: Globe },
  public: { label: 'Public', color: '#22c55e', icon: Globe },
  draft: { label: 'Draft', color: '#f59e0b', icon: Clock },
  scheduled: { label: 'Scheduled', color: '#3b82f6', icon: Clock },
  processing: { label: 'Processing', color: '#a78bfa', icon: AlertCircle },
  private: { label: 'Private', color: '#6b7280', icon: Lock },
  unlisted: { label: 'Unlisted', color: '#6b7280', icon: Lock },
};

const VISIBILITY_ICON: Record<string, LucideIcon> = {
  public: Globe, published: Globe, private: Lock, unlisted: EyeOff, draft: Lock, scheduled: Clock,
};

const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : n.toLocaleString());

const cellTd: CSSProperties = { padding: '8px 12px', color: 'var(--text-secondary)', fontSize: '13px' };

type HeaderCellProps = {
  label: string; sortKey: string; currentSort: string; desc: boolean; onSortClick: (key: string) => void;
};
const HeaderCell = ({ label, sortKey: colKey, currentSort, desc, onSortClick }: HeaderCellProps) => (
  <th onClick={() => onSortClick(colKey)}
    style={{ padding: '10px 12px', fontSize: '11.5px', fontWeight: 700, color: 'var(--text-tertiary)',
      textAlign: 'right', whiteSpace: 'nowrap', cursor: 'pointer' }}
    title={`Sort by ${label}`}>
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
      {label}
      <ArrowUpDown size={11} style={{ transform: currentSort === colKey && desc ? 'scaleY(-1)' : undefined,
        opacity: currentSort === colKey ? 1 : 0.35 }} />
    </span>
  </th>
);

export interface ContentTableProps {
  contentType: ContentType;
  rows: AnyRow[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (checked: boolean) => void;
  sortKey: string;
  sortDesc: boolean;
  onSortClick: (key: string) => void;
  emptyTitle?: string;
  emptyAction?: ReactNode;
}

export function ContentTable({
  contentType, rows, selected, onToggle, onToggleAll, sortKey, sortDesc, onSortClick,
  emptyTitle = 'content', emptyAction,
}: ContentTableProps) {
  const allSelected = rows.length > 0 && rows.every(r => selected.has(r.id));
  const isKatube = contentType === 'katube';
  const colSpan = isKatube ? 8 : 9;

  const renderMetrics = (row: AnyRow) => {
    if (isKatube) {
      const { views, likes, comments } = (row as KatubeRow).metrics;
      return (
        <>
          <td style={cellTd}>{fmt(views)}</td>
          <td style={cellTd}>{fmt(likes)}</td>
          <td style={cellTd}>{fmt(comments)}</td>
        </>
      );
    }
    const { reads, bookmarks, chapters, comments } = (row as WebMangalRow).metrics;
    return (
      <>
        <td style={cellTd}>{fmt(reads)}</td>
        <td style={cellTd}>{fmt(bookmarks)}</td>
        <td style={cellTd}>{chapters}</td>
        <td style={cellTd}>{fmt(comments)}</td>
      </>
    );
  };

  return (
    <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-card)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: isKatube ? '860px' : '980px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
            <th style={{ padding: '10px 12px', textAlign: 'center', width: '34px' }}>
              {rows.length > 0 && (allSelected ? (
                <CheckSquare size={15} style={{ cursor: 'pointer', color: 'var(--accent)' }}
                  onClick={() => onToggleAll(false)} />
              ) : (
                <Square size={15} style={{ cursor: 'pointer', color: 'var(--text-tertiary)' }}
                  onClick={() => onToggleAll(true)} />
              ))}
            </th>
            <th style={{ padding: '10px 12px', fontSize: '11.5px', fontWeight: 700, color: 'var(--text-tertiary)', textAlign: 'left' }}>
              {isKatube ? 'Video / Short' : 'Title / Series'}
            </th>
            <th style={{ padding: '10px 12px', fontSize: '11.5px', fontWeight: 700, color: 'var(--text-tertiary)', textAlign: 'left' }}>Status</th>
            <th style={{ padding: '10px 12px', fontSize: '11.5px', fontWeight: 700, color: 'var(--text-tertiary)', textAlign: 'right' }}>Visibility</th>
            {isKatube ? (
              <>
                <HeaderCell label="Views" sortKey="views" currentSort={sortKey} desc={sortDesc} onSortClick={onSortClick} />
                <HeaderCell label="Likes" sortKey="likes" currentSort={sortKey} desc={sortDesc} onSortClick={onSortClick} />
                <HeaderCell label="Comments" sortKey="comments" currentSort={sortKey} desc={sortDesc} onSortClick={onSortClick} />
              </>
            ) : (
              <>
                <HeaderCell label="Reads" sortKey="reads" currentSort={sortKey} desc={sortDesc} onSortClick={onSortClick} />
                <HeaderCell label="Bookmarks" sortKey="bookmarks" currentSort={sortKey} desc={sortDesc} onSortClick={onSortClick} />
                <HeaderCell label="Chapters" sortKey="chapters" currentSort={sortKey} desc={sortDesc} onSortClick={onSortClick} />
                <HeaderCell label="Reviews" sortKey="comments" currentSort={sortKey} desc={sortDesc} onSortClick={onSortClick} />
              </>
            )}
            <HeaderCell label="Date" sortKey="createdAt" currentSort={sortKey} desc={sortDesc} onSortClick={onSortClick} />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={colSpan} style={{ padding: '40px 24px', textAlign: 'center' }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  No {emptyTitle}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '16px' }}>
                  Items you publish will show up here.
                </div>
                {emptyAction}
              </td>
            </tr>
          ) : rows.map(row => {
            const badge = STATUS_BADGE[row.status] ?? STATUS_BADGE.draft;
            const visIcon = VISIBILITY_ICON[row.visibility] ?? Lock;
            const isSelected = selected.has(row.id);
            return (
              <tr key={row.id}
                style={{ borderBottom: '1px solid var(--border-color)', background: isSelected ? 'rgba(124,58,237,0.06)' : undefined }}>
                <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                  {isSelected ? (
                    <CheckSquare size={15} style={{ color: 'var(--accent)', cursor: 'pointer' }} onClick={() => onToggle(row.id)} />
                  ) : (
                    <Square size={15} style={{ color: 'var(--text-tertiary)', cursor: 'pointer' }} onClick={() => onToggle(row.id)} />
                  )}
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {row.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- user-uploaded storage thumbnails (same pattern as RailAvatar)
                      <img src={row.thumbnailUrl} alt=""
                        style={{ width: '56px', height: '38px', objectFit: 'cover', borderRadius: '4px', flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: '56px', height: '38px', background: 'var(--bg-input)', borderRadius: '4px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ color: 'var(--text-tertiary)', fontSize: '9px' }}>no img</span>
                      </div>
                    )}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.title}>{row.title}</div>
                      {!isKatube && (row as WebMangalRow).seriesTitle && (
                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Series: {(row as WebMangalRow).seriesTitle}</div>
                      )}
                    </div>
                  </div>
                </td>
                <td style={{ padding: '10px 12px' }}>
                  {(() => { const I = badge.icon; return (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11.5px', fontWeight: 600,
                      background: `${badge.color}1f`, color: badge.color, padding: '3px 9px', borderRadius: '999px', whiteSpace: 'nowrap' }}>
                      <I size={11} /> {badge.label}
                    </span>
                  ); })()}
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'right' }} title={row.visibility}>
                  {(() => { const I = visIcon; return <I size={15} style={{ color: 'var(--text-tertiary)' }} />; })()}
                </td>
                {renderMetrics(row)}
                <td style={cellTd}>{new Date(row.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}