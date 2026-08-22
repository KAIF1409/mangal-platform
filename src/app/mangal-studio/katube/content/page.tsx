'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { supabase } from '../../../lib/supabase';
import { useStudioAuth } from '../lib/useStudioAuth';
import { Bell, ChevronLeft, ChevronRight, Clapperboard, Plus, RefreshCw, Search } from 'lucide-react';
import type { ContentType, AnyRow, KatubeRow, WebMangalRow } from './ContentTable';

// The unified data table is the heaviest module on this dashboard — load it
// through next/dynamic so it's code-split into its own chunk (ssr:false keeps
// it out of the server bundle and splits the client payload on demand).
const ContentTable = dynamic(() => import('./ContentTable').then(m => m.ContentTable), {
  ssr: false,
});

/* -- 135 Mangal Studio Content Dashboard (YouTube Studio-style) --
   Horizontal tab navigation switches between KaTube (videos/shorts) and
   WebMangal (novels/manga); the unified ContentTable re-renders its metric
   columns dynamically. KaTube rows come from the live `videos` table;
   WebMangal Studio is Phase 3, so its rows use curated demo data. */

const KA_TUBE_TABS = ['Videos', 'Shorts', 'Live', 'Posts', 'Playlists'];
const WEBMANGAL_TABS = ['Novels', 'Manga/Comics', 'Chapters', 'Drafts'];
const PER_PAGE = 20;

const CHANNEL_NAV: { label: string; katubeTab?: string; webmangalTab?: string; href?: string }[] = [
  { label: 'Inspiration' },
  { label: 'Videos', katubeTab: 'Videos' },
  { label: 'Shorts', katubeTab: 'Shorts' },
  { label: 'WebMangal / Series', webmangalTab: 'Novels' },
  { label: 'Posts', katubeTab: 'Posts' },
  { label: 'Analytics', href: '/mangal-studio/katube/analytics' },
];

async function fetchKatubeRows(tab: string): Promise<KatubeRow[]> {
  let q = supabase
    .from('videos')
    .select('id,title,views,likes,is_short,created_at')
    .order('created_at', { ascending: false });
  if (tab === 'Shorts') q = q.eq('is_short', true);
  else if (tab === 'Videos') q = q.eq('is_short', false);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(v => ({
    id: String(v.id),
    title: String(v.title ?? 'Untitled').slice(0, 140),
    thumbnailUrl: null,
    status: 'published' as const,
    visibility: 'public' as const,
    metrics: { views: v.views ?? 0, likes: v.likes ?? 0, comments: 0 },
    createdAt: v.created_at ?? new Date().toISOString(),
    isShort: !!v.is_short,
  }));
}

// WebMangal Studio ships in Phase 2 — curated demo rows keep the tab real
// until the live `manga_books` query lands (see CONTEXT.md 114).
function fetchWebMangalRows(tab: string): Promise<WebMangalRow[]> {
  const demo: WebMangalRow[] = [
    { id: 'wm-1', title: 'The Night of Ayodhya — Ghost One', thumbnailUrl: null, status: 'published', visibility: 'public', metrics: { reads: 4820, bookmarks: 1260, chapters: 42, comments: 87 }, createdAt: '2026-02-18T10:00:00Z', contentType: 'novel', seriesId: 'wm-1', seriesTitle: 'The Night of Ayodhya' },
    { id: 'wm-2', title: 'Yran Cranes Rising — One-Shot', thumbnailUrl: null, status: 'published', visibility: 'public', metrics: { reads: 3910, bookmarks: 933, chapters: 1, comments: 41 }, createdAt: '2026-04-06T11:30:00Z', contentType: 'manga', seriesId: 'wm-2', seriesTitle: 'Paper Cranes Rising' },
    { id: 'wm-3', title: 'Embers of the Ghats — Part II', thumbnailUrl: null, status: 'scheduled', visibility: 'scheduled', metrics: { reads: 0, bookmarks: 0, chapters: 0, comments: 0 }, createdAt: '2026-08-30T09:00:00Z', contentType: 'novel', seriesId: 'wm-3', seriesTitle: 'Embers of the Ghats' },
    { id: 'wm-4', title: 'Monsoon Circuits (Draft)', thumbnailUrl: null, status: 'draft', visibility: 'private', metrics: { reads: 12, bookmarks: 3, chapters: 5, comments: 1 }, createdAt: '2026-05-21T16:45:00Z', contentType: 'manga', seriesId: 'wm-4', seriesTitle: 'Monsoon Circuits' },
    { id: 'wm-5', title: 'Letters from Bandra', thumbnailUrl: null, status: 'published', visibility: 'public', metrics: { reads: 15400, bookmarks: 2210, chapters: 24, comments: 208 }, createdAt: '2026-01-10T08:00:00Z', contentType: 'novel', seriesId: 'wm-5', seriesTitle: 'Letters from Bandra' },
  ];
  const filtered = tab === 'Novels' ? demo.filter(d => d.contentType === 'novel')
    : tab === 'Manga/Comics' ? demo.filter(d => d.contentType === 'manga')
    : tab === 'Drafts' ? demo.filter(d => d.status === 'draft')
    : demo.filter(d => d.status === 'published');
  return Promise.resolve(filtered);
}

export default function MangalStudioContentPage() {
  const { user, loading: authLoading } = useStudioAuth('/mangal-studio/katube/content');
  const [contentType, setContentType] = useState<ContentType>('katube');
  const [activeTab, setActiveTab] = useState('Videos');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState('createdAt');
  const [sortDesc, setSortDesc] = useState(true);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<AnyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  useEffect(() => {
    if (!user) return;
    let disposed = false;
    const load = async () => {
      const data = contentType === 'katube' ? await fetchKatubeRows(activeTab) : await fetchWebMangalRows(activeTab);
      if (!disposed) { setRows(data); setLoading(false); setPage(1); }
    };
    load().catch(() => { if (!disposed) { setRows([]); setLoading(false); } });
    return () => { disposed = true; };
  }, [user, contentType, activeTab]);

  const tabs = contentType === 'katube' ? KA_TUBE_TABS : WEBMANGAL_TABS;

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return rows.filter(r => {
      if (term && !r.title.toLowerCase().includes(term)
        && !r.status.toLowerCase().includes(term)
        && !r.visibility.toLowerCase().includes(term)) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      return true;
    });
  }, [rows, query, statusFilter]);

  const sorted = useMemo(() => {
    const direction = sortDesc ? -1 : 1;
    return [...filtered].sort((a, b) => {
      if (sortKey === 'createdAt') {
        return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * direction;
      }
      const am = (a as KatubeRow & WebMangalRow).metrics as Record<string, number>;
      const bm = (b as KatubeRow & WebMangalRow).metrics as Record<string, number>;
      return ((am[sortKey] ?? 0) - (bm[sortKey] ?? 0)) * direction;
    });
  }, [filtered, sortKey, sortDesc]);

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const paged = sorted.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const allPagedSelected = paged.length > 0 && paged.every(r => selected.has(r.id));
  const toggleSelect = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAll = (checked: boolean) => setSelected(checked ? new Set(paged.map(r => r.id)) : new Set());

  const refresh = () => {
    setLoading(true);
    const load = async () => {
      const data = contentType === 'katube' ? await fetchKatubeRows(activeTab) : await fetchWebMangalRows(activeTab);
      setRows(data); setLoading(false); setPage(1);
    };
    load().catch(() => { setRows([]); setLoading(false); });
  };

  const handleCreate = () => {
    const title = newTitle.trim();
    if (!title) return;
    const now = new Date().toISOString();
    const id = `draft-${Date.now()}`;
    if (contentType === 'katube') {
      const draft: KatubeRow = {
        id, title, thumbnailUrl: null, status: 'draft', visibility: 'private',
        metrics: { views: 0, likes: 0, comments: 0 }, createdAt: now, isShort: activeTab === 'Shorts',
      };
      setRows(prev => [draft, ...prev]);
    } else {
      const draft: WebMangalRow = {
        id, title, thumbnailUrl: null, status: 'draft', visibility: 'private',
        metrics: { reads: 0, bookmarks: 0, chapters: 0, comments: 0 }, createdAt: now,
        contentType: activeTab === 'Manga/Comics' ? 'manga' : 'novel', seriesId: id, seriesTitle: title,
      };
      setRows(prev => [draft, ...prev]);
    }
    setNewTitle('');
    setShowCreate(false);
  };

  if (authLoading || !user || loading) {
    return <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px' }}>Loading…</div>;
  }

  const channelName = user.email ?? 'Your channel';
  const iconBtn: React.CSSProperties = {
    width: '36px', height: '36px', borderRadius: '50%', border: '1px solid var(--border-color)',
    background: 'var(--bg-card)', color: 'var(--text-secondary)', display: 'inline-flex',
    alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
  };
  const accentBtn: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 18px', borderRadius: '999px',
    border: 'none', background: 'var(--accent)', color: '#fff', fontSize: '13px', fontWeight: 800,
    cursor: 'pointer', textDecoration: 'none', flexShrink: 0,
  };
  const ghostBtn: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px',
    border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-secondary)',
    fontSize: '12px', fontWeight: 600, cursor: 'pointer', flexShrink: 0,
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button style={{ ...iconBtn }} aria-label="Previous page"><ChevronLeft size={18} /></button>
          <h1 style={{ fontSize: '18px', fontWeight: 900, margin: 0, letterSpacing: '-0.02em' }}>
            Content
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-tertiary)', background: 'var(--bg-input)', padding: '3px 10px', borderRadius: '999px', marginLeft: '10px', verticalAlign: 'middle' }}>
              {contentType === 'katube' ? 'KaTube' : 'WebMangal'}
            </span>
          </h1>
          <button style={{ ...iconBtn, marginLeft: '2px' }} aria-label="Next page"><ChevronRight size={18} /></button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '9px', flex: '1 1 auto', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 280px', minWidth: '220px', maxWidth: '420px' }}>
            <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
            <input
              type="search" value={query}
              onChange={e => { setQuery(e.target.value); setPage(1); }}
              placeholder="Search across your content…"
              style={{ width: '100%', padding: '9px 12px 9px 34px', fontSize: '13px', borderRadius: '999px',
                border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none' }}
            />
          </div>
          <button title="Notifications" aria-label="Notifications" style={iconBtn}><Bell size={17} /></button>
          <button onClick={() => setShowCreate(v => !v)} style={accentBtn}><Plus size={15} /> Create</button>
        </div>
      </div>

      {showCreate && (
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', padding: '12px 14px',
          borderRadius: '12px', border: '1px dashed var(--border-color)', background: 'var(--bg-card)', marginBottom: '12px' }}>
          <Clapperboard size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <input
            value={newTitle} onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
            placeholder="Draft title…"
            autoFocus
            style={{ flex: '1 1 220px', minWidth: '180px', padding: '8px 12px', fontSize: '13px', borderRadius: '8px',
              border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none' }}
          />
          <span style={{ fontSize: '11.5px', color: 'var(--text-tertiary)' }}>
            Will save as a {contentType === 'katube' ? 'video' : 'series'} draft
          </span>
          <button onClick={handleCreate} style={accentBtn}>Save draft</button>
          <button onClick={() => setShowCreate(false)} style={ghostBtn}>Cancel</button>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 14px', borderRadius: '12px',
        border: '1px solid var(--border-color)', background: 'var(--bg-card)', marginBottom: '12px', overflowX: 'auto' }}>
        <div style={{ width: '40px', height: '40px', borderRadius: '50%', flexShrink: 0, background: 'var(--accent)',
          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '14px' }}>
          {channelName.slice(0, 2).toUpperCase()}
        </div>
        <div style={{ flexShrink: 0, minWidth: '120px' }}>
          <div style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--accent)', letterSpacing: '0.08em' }}>CHANNEL</div>
          <div style={{ fontSize: '13.5px', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px' }}>{channelName}</div>
        </div>
        <nav style={{ display: 'flex', gap: '4px', flex: 1, minWidth: 0 }}>
          {CHANNEL_NAV.map(item => item.href ? (
            <Link key={item.label} href={item.href} style={{ padding: '8px 12px', fontSize: '12.5px', fontWeight: 700,
              color: 'var(--text-secondary)', textDecoration: 'none', whiteSpace: 'nowrap', borderRadius: '8px',
              border: '1px solid transparent', flexShrink: 0 }}>
              {item.label}
            </Link>
          ) : (
            <button key={item.label} onClick={() => {
              if (item.katubeTab) { setContentType('katube'); setActiveTab(item.katubeTab); }
              if (item.webmangalTab) { setContentType('webmangal'); setActiveTab(item.webmangalTab); }
              setPage(1);
            }} style={{ padding: '8px 12px', fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)',
              background: 'transparent', border: '1px solid transparent', borderRadius: '8px', whiteSpace: 'nowrap',
              cursor: 'pointer', flexShrink: 0, textAlign: 'left' }}>
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      <div style={{ display: 'flex', gap: '6px', padding: '6px', borderRadius: '12px', border: '1px solid var(--border-color)',
        background: 'var(--bg-card)', marginBottom: '10px', overflowX: 'auto' }}>
        {(['KaTube', 'WebMangal'] as const).map(ct => {
          const value = ct.toLowerCase() as ContentType;
          const active = contentType === value;
          return (
            <button key={ct} onClick={() => {
              setContentType(value);
              setActiveTab(value === 'katube' ? 'Videos' : 'Novels');
              setPage(1);
            }} style={{ padding: '8px 16px', fontSize: '12.5px', fontWeight: 700, borderRadius: '8px', border: 'none',
              cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
              background: active ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'transparent',
              color: active ? 'var(--accent)' : 'var(--text-secondary)' }}>
              {ct}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: '6px', padding: '6px', borderRadius: '12px', border: '1px solid var(--border-color)',
        background: 'var(--bg-card)', marginBottom: '12px', overflowX: 'auto' }}>
        {tabs.map(t => {
          const active = activeTab === t;
          return (
            <button key={t} onClick={() => { setActiveTab(t); setPage(1); }} style={{ padding: '7px 14px', fontSize: '12px',
              fontWeight: 700, borderRadius: '8px', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
              background: active ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'transparent',
              color: active ? 'var(--accent)' : 'var(--text-tertiary)' }}>
              {t}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', padding: '10px 12px',
        borderRadius: '12px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', marginBottom: '12px' }}>
        <span style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--text-tertiary)', letterSpacing: '0.08em' }}>FILTER</span>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          style={{ padding: '7px 10px', fontSize: '12px', borderRadius: '8px', border: '1px solid var(--border-color)',
            background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none' }}>
          <option value="all">All statuses</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
          <option value="scheduled">Scheduled</option>
          {contentType === 'katube' && <option value="processing">Processing</option>}
        </select>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{selected.size} selected</span>
        <button onClick={() => toggleAll(!allPagedSelected)} style={ghostBtn}>
          {allPagedSelected ? 'Deselect all' : 'Select all'}
        </button>
        <button onClick={refresh} style={ghostBtn}><RefreshCw size={14} /> Refresh</button>
      </div>

      <ContentTable
        contentType={contentType}
        rows={paged}
        selected={selected}
        onToggle={toggleSelect}
        onToggleAll={toggleAll}
        sortKey={sortKey}
        sortDesc={sortDesc}
        onSortClick={(key) => { if (key !== sortKey) { setSortKey(key); setSortDesc(true); } else { setSortDesc(d => !d); } }}
        emptyTitle={contentType === 'katube' ? 'videos or shorts yet' : 'series yet'}
        emptyAction={contentType === 'katube' ? (
          <Link href="/katube/upload" style={{ ...accentBtn, padding: '8px 16px', fontSize: '12px' }}>Upload a video</Link>
        ) : (
          <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Publish your first series and it will appear here.</span>
        )}
      />

      {total > 0 && (
        <footer style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', padding: '16px 6px', fontSize: '12.5px', color: 'var(--text-tertiary)' }}>
          <span>{(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, total)} of {total}</span>
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={ghostBtn}>Prev</button>
            <span style={{ padding: '0 6px' }}>{page} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={ghostBtn}>Next</button>
          </div>
        </footer>
      )}
    </div>
  );
}