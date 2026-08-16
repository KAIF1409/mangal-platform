'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { supabase } from '../../lib/supabase';
import { Save, X, Check, ArrowLeft, ArrowRight, Trash2, Inbox, AlertTriangle } from 'lucide-react';

interface PageRow {
  id: string;
  page_number: number;
  image_url: string;
}

interface ManagePagesModalProps {
  chapterId: string;
  chapterTitle: string;
  seriesId: string;
  onClose: () => void;
  onPagesChanged?: (chapterId: string, newCount: number) => void;
}

// Step 16 — Manage Pages within a chapter.
// Design choices:
//   - Arrow-button reorder (same pattern as upload/page.tsx) — no drag library,
//     zero new dependencies, works perfectly on mobile.
//   - Reorder is local-only until "Save Order" is clicked — bulk-updates all
//     page_numbers in a Promise.all. Supabase JS v2 has no multi-row update
//     with different values, so we fire one .update() per page — fine at
//     chapter scale (typically 10–60 pages).
//   - Delete removes the storage object first, then the DB row, then
//     renumbers remaining pages to keep page_number gapless.
//   - Two-click confirm before any delete (same pattern as dashboard delete).
//   - Dirty tracking: Save Order button only appears when order has changed.
export default function ManagePagesModal({
  chapterId,
  chapterTitle,
  seriesId,
  onClose,
  onPagesChanged,
}: ManagePagesModalProps) {
  const [pages, setPages] = useState<PageRow[]>([]);
  const [originalOrder, setOriginalOrder] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [selectedPage, setSelectedPage] = useState<PageRow | null>(null);

  // Is the current order different from what was loaded from DB?
  const isDirty = pages.map((p) => p.id).join(',') !== originalOrder.join(',');

  const fetchPages = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data, error: fetchError } = await supabase
      .from('pages')
      .select('id, page_number, image_url')
      .eq('chapter_id', chapterId)
      .order('page_number', { ascending: true });

    if (fetchError) {
      setError(fetchError.message);
    } else {
      const rows = data || [];
      setPages(rows);
      setOriginalOrder(rows.map((p) => p.id));
    }
    setLoading(false);
  }, [chapterId]);

  useEffect(() => {
    fetchPages();
  }, [fetchPages]);

  // ── Reorder ────────────────────────────────────────────────────────────────
  const movePage = (index: number, direction: -1 | 1) => {
    setPages((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setSuccessMsg('');
    setConfirmDeleteId(null);
  };

  // ── Save Order ─────────────────────────────────────────────────────────────
  // Bulk-update page_number for all pages in current order.
  const handleSaveOrder = async () => {
    setSaving(true);
    setError('');
    setSuccessMsg('');

    try {
      await Promise.all(
        pages.map((page, i) =>
          supabase
            .from('pages')
            .update({ page_number: i + 1 })
            .eq('id', page.id)
        )
      );
      const reordered = pages.map((p, i) => ({ ...p, page_number: i + 1 }));
      setPages(reordered);
      setOriginalOrder(reordered.map((p) => p.id));
      setSuccessMsg('Order saved!');
    } catch (err) {
      setError(`Failed to save order: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  // Removes from storage first (fire-and-forget on error — DB row is the
  // source of truth; storage orphan is acceptable, missing DB row is not),
  // then deletes the DB row, then renumbers remaining pages to stay gapless.
  const handleDelete = async (page: PageRow) => {
    setDeletingId(page.id);
    setError('');

    // Extract storage path from public URL — everything after /manga-pages/
    try {
      const urlObj = new URL(page.image_url);
      const storagePath = decodeURIComponent(
        urlObj.pathname.split('/manga-pages/')[1] || ''
      );
      if (storagePath) {
        await supabase.storage.from('manga-pages').remove([storagePath]);
      }
    } catch {
      // Storage removal failed or path parse failed — continue to DB delete
    }

    const { error: deleteError } = await supabase
      .from('pages')
      .delete()
      .eq('id', page.id);

    if (deleteError) {
      setError(`Could not delete page: ${deleteError.message}`);
      setDeletingId(null);
      setConfirmDeleteId(null);
      return;
    }

    // Renumber remaining pages gaplessly
    const remaining = pages
      .filter((p) => p.id !== page.id)
      .map((p, i) => ({ ...p, page_number: i + 1 }));

    await Promise.all(
      remaining.map((p) =>
        supabase.from('pages').update({ page_number: p.page_number }).eq('id', p.id)
      )
    );

    setPages(remaining);
    setOriginalOrder(remaining.map((p) => p.id));
    setDeletingId(null);
    setConfirmDeleteId(null);
    if (selectedPage?.id === page.id) setSelectedPage(null);
    onPagesChanged?.(chapterId, remaining.length);
    setSuccessMsg(`Page deleted. ${remaining.length} page${remaining.length === 1 ? '' : 's'} remaining.`);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Styles
  // ─────────────────────────────────────────────────────────────────────────
  const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 200,
    background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)',
    display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end',
  };

  // Slide-in panel from the right — wider than EditSeriesModal since we need
  // a 2-column layout (thumbnails left, preview right on larger screens).
  const panelStyle: React.CSSProperties = {
    width: '100%', maxWidth: '860px', height: '100vh',
    background: '#0a0a10', borderLeft: '1px solid var(--border-color)',
    display: 'flex', flexDirection: 'column',
    boxShadow: '-40px 0 120px rgba(0,0,0,0.8)',
    overflowY: 'hidden',
  };

  const headerStyle: React.CSSProperties = {
    padding: '20px 24px 16px',
    borderBottom: '1px solid var(--border-color)',
    flexShrink: 0,
    background: 'var(--bg-card)',
  };

  const bodyStyle: React.CSSProperties = {
    flex: 1, overflowY: 'auto', padding: '20px 24px',
    display: 'flex', gap: '20px',
  };

  const thumbGridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
    gap: '10px',
    alignContent: 'start',
    flex: 1,
  };

  return (
    <div onClick={onClose} style={overlayStyle}>
      {/* Animated keyframes for delete pulse */}
      <style>{`
        @keyframes mangalDeletePulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
          50% { box-shadow: 0 0 0 4px rgba(239,68,68,0.3); }
        }
        @keyframes mangalSlideIn {
          from { transform: translateX(60px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .mangal-page-thumb:hover .mangal-page-actions {
          opacity: 1 !important;
        }
        .mangal-page-thumb:hover {
          border-color: #2a2a3a !important;
        }
      `}</style>

      <div
        onClick={(e) => e.stopPropagation()}
        style={{ ...panelStyle, animation: 'mangalSlideIn 0.22s ease-out' }}
      >
        {/* ── Header ── */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={{
                  fontSize: '9px', fontWeight: 700, letterSpacing: '0.14em',
                  color: '#d97706', background: 'rgba(120,53,15,0.2)',
                  border: '1px solid rgba(180,83,9,0.25)',
                  padding: '2px 8px', borderRadius: '5px', textTransform: 'uppercase',
                }}>
                  Manage Pages
                </span>
                {!loading && (
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {pages.length} page{pages.length === 1 ? '' : 's'}
                  </span>
                )}
              </div>
              <h2 style={{ fontSize: '16px', fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>
                {chapterTitle}
              </h2>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {/* Save Order — only visible when dirty */}
              {isDirty && (
                <button
                  onClick={handleSaveOrder}
                  disabled={saving}
                  style={{
                    padding: '8px 16px', borderRadius: '8px',
                    background: saving ? 'var(--border-color)' : 'linear-gradient(135deg, #7f1d1d, #991b1b)',
                    border: '1px solid #7f1d1d',
                    color: saving ? 'var(--text-muted)' : '#fff',
                    fontSize: '12px', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
                    transition: 'all 0.15s',
                    display: 'flex', alignItems: 'center', gap: '6px',
                  }}
                >
                  {saving ? 'Saving...' : (<><Save size={14} strokeWidth={2} /> Save Order</>)}
                </button>
              )}
              <button
                onClick={onClose}
                style={{
                  background: 'var(--divider)', border: '1px solid var(--border-light)',
                  color: 'var(--text-tertiary)', cursor: 'pointer',
                  width: '34px', height: '34px', borderRadius: '8px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <X size={16} strokeWidth={2} />
              </button>
            </div>
          </div>

          {/* Feedback messages */}
          {error && (
            <div style={{
              marginTop: '12px', padding: '8px 12px', borderRadius: '7px',
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
              color: '#ef4444', fontSize: '12px',
            }}>
              {error}
            </div>
          )}
          {successMsg && !error && (
            <div style={{
              marginTop: '12px', padding: '8px 12px', borderRadius: '7px',
              background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)',
              color: '#10b981', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px',
            }}>
              <Check size={13} strokeWidth={2.5} /> {successMsg}
            </div>
          )}

          {/* Reorder hint */}
          {!loading && pages.length > 1 && (
            <p style={{ margin: '10px 0 0', fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5, display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
              Use <ArrowLeft size={12} strokeWidth={2} style={{ display: 'inline' }} /> <ArrowRight size={12} strokeWidth={2} style={{ display: 'inline' }} /> to reorder · Changes are local until you hit <strong style={{ color: 'var(--text-secondary)' }}>Save Order</strong> · Click a thumbnail to preview
            </p>
          )}
        </div>

        {/* ── Body ── */}
        <div style={bodyStyle}>
          {loading ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              Loading pages...
            </div>
          ) : pages.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: '8px' }}>
              <Inbox size={32} strokeWidth={1.5} />
              <p style={{ fontSize: '13px', margin: 0 }}>No pages in this chapter yet.</p>
            </div>
          ) : (
            <>
              {/* Page grid */}
              <div style={thumbGridStyle}>
                {pages.map((page, i) => {
                  const isConfirming = confirmDeleteId === page.id;
                  const isDeleting = deletingId === page.id;
                  const isSelected = selectedPage?.id === page.id;

                  return (
                    <div
                      key={page.id}
                      className="mangal-page-thumb"
                      style={{
                        position: 'relative',
                        borderRadius: '9px',
                        overflow: 'hidden',
                        border: isSelected
                          ? '2px solid #d97706'
                          : isConfirming
                          ? '2px solid #ef4444'
                          : '2px solid var(--border-color)',
                        background: 'var(--bg-input)',
                        cursor: 'pointer',
                        transition: 'border-color 0.15s',
                        animation: isConfirming ? 'mangalDeletePulse 1s ease-in-out infinite' : 'none',
                        opacity: isDeleting ? 0.4 : 1,
                      }}
                      onClick={() => {
                        if (!isConfirming) setSelectedPage(isSelected ? null : page);
                      }}
                    >
                      {/* Page image */}
                      <div style={{ position: 'relative', width: '100%', height: '140px' }}>
                        <Image
                          src={page.image_url}
                          alt={`Page ${page.page_number}`}
                          fill
                          sizes="140px"
                          style={{
                            objectFit: 'cover',
                            pointerEvents: 'none',
                          }}
                        />
                      </div>

                      {/* Page number badge */}
                      <div style={{
                        position: 'absolute', top: 5, left: 5,
                        background: isSelected ? '#d97706' : 'rgba(0,0,0,0.75)',
                        color: '#fff', fontSize: '10px', fontWeight: 700,
                        padding: '2px 6px', borderRadius: '5px',
                        transition: 'background 0.15s',
                      }}>
                        #{i + 1}
                      </div>

                      {/* Dirty indicator — shows when this page has moved */}
                      {page.page_number !== i + 1 && (
                        <div style={{
                          position: 'absolute', top: 5, right: 5,
                          background: 'rgba(217,119,6,0.85)',
                          color: '#fff', fontSize: '9px', fontWeight: 700,
                          padding: '2px 5px', borderRadius: '4px',
                        }}>
                          moved
                        </div>
                      )}

                      {/* Action bar */}
                      <div
                        className="mangal-page-actions"
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          background: 'var(--bg-card)',
                          borderTop: '1px solid var(--border-color)',
                          padding: '4px',
                          opacity: isConfirming || isSelected ? 1 : 0.5,
                          transition: 'opacity 0.15s',
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => movePage(i, -1)}
                          disabled={i === 0 || isDeleting}
                          title="Move left"
                          style={{
                            background: 'none', border: 'none',
                            color: i === 0 ? '#2a2a3a' : 'var(--text-tertiary)',
                            cursor: i === 0 ? 'default' : 'pointer',
                            padding: '2px 4px', display: 'flex',
                            transition: 'color 0.1s',
                          }}
                        >
                          <ArrowLeft size={13} strokeWidth={2} />
                        </button>

                        {/* Delete — two-click confirm */}
                        {isConfirming ? (
                          <button
                            onClick={() => handleDelete(page)}
                            disabled={isDeleting}
                            style={{
                              background: '#7f1d1d', border: 'none',
                              color: '#fff', fontSize: '10px', fontWeight: 700,
                              cursor: isDeleting ? 'wait' : 'pointer',
                              padding: '2px 6px', borderRadius: '4px',
                            }}
                          >
                            {isDeleting ? '...' : 'Delete?'}
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setConfirmDeleteId(page.id);
                              setSuccessMsg('');
                            }}
                            disabled={isDeleting}
                            title="Delete page"
                            style={{
                              background: 'none', border: 'none',
                              color: 'var(--text-tertiary)', cursor: 'pointer',
                              padding: '2px 4px', display: 'flex',
                            }}
                          >
                            <Trash2 size={13} strokeWidth={2} />
                          </button>
                        )}

                        <button
                          onClick={() => movePage(i, 1)}
                          disabled={i === pages.length - 1 || isDeleting}
                          title="Move right"
                          style={{
                            background: 'none', border: 'none',
                            color: i === pages.length - 1 ? '#2a2a3a' : 'var(--text-tertiary)',
                            cursor: i === pages.length - 1 ? 'default' : 'pointer',
                            padding: '2px 4px', display: 'flex',
                            transition: 'color 0.1s',
                          }}
                        >
                          <ArrowRight size={13} strokeWidth={2} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Preview panel — shows when a page is selected */}
              {selectedPage && (
                <div style={{
                  width: '240px', flexShrink: 0,
                  position: 'sticky', top: 0, alignSelf: 'flex-start',
                  background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                  borderRadius: '12px', overflow: 'hidden',
                }}>
                  <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-color)' }}>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                      Preview — Page #{pages.findIndex(p => p.id === selectedPage.id) + 1}
                    </span>
                  </div>
                  <Image
                    src={selectedPage.image_url}
                    alt="Preview"
                    width={800}
                    height={1200}
                    sizes="240px"
                    style={{ width: '100%', height: 'auto', display: 'block' }}
                  />
                  <div style={{ padding: '10px 14px' }}>
                    <button
                      onClick={() => setSelectedPage(null)}
                      style={{
                        width: '100%', padding: '8px', borderRadius: '7px',
                        background: 'var(--bg-input)', border: '1px solid var(--border-light)',
                        color: 'var(--text-tertiary)', fontSize: '11px', cursor: 'pointer',
                      }}
                    >
                      Close Preview
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Footer ── */}
        {!loading && pages.length > 0 && (
          <div style={{
            padding: '14px 24px',
            borderTop: '1px solid var(--border-color)',
            background: 'var(--bg-card)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            flexShrink: 0,
          }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '5px' }}>
              {isDirty ? (<><AlertTriangle size={12} strokeWidth={2} /> Unsaved order changes</>) : `${pages.length} pages · order saved`}
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              {confirmDeleteId && (
                <button
                  onClick={() => setConfirmDeleteId(null)}
                  style={{
                    padding: '7px 14px', borderRadius: '7px',
                    background: 'none', border: '1px solid var(--border-light)',
                    color: 'var(--text-tertiary)', fontSize: '11px', cursor: 'pointer',
                  }}
                >
                  Cancel Delete
                </button>
              )}
              {isDirty && (
                <button
                  onClick={handleSaveOrder}
                  disabled={saving}
                  style={{
                    padding: '7px 16px', borderRadius: '7px',
                    background: saving ? 'var(--border-color)' : 'linear-gradient(135deg,#7f1d1d,#991b1b)',
                    border: '1px solid #7f1d1d',
                    color: saving ? 'var(--text-muted)' : '#fff',
                    fontSize: '11px', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: '6px',
                  }}
                >
                  {saving ? 'Saving...' : (<><Save size={13} strokeWidth={2} /> Save Order</>)}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}