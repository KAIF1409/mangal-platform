'use client';

// app/mangal-studio/webmangal/codex/LorePane.tsx
//
// §138 — Lore-codex pane of the Codex tab: entry list + detail form with
// create/edit/delete. The content field is a WebMangalAiEditor drop-in
// (feature="lore", ≥100 words / ≥400 chars batching bar) — the whole shared
// §134 AI pipeline comes with it; this file adds no AI logic of its own.

import { Loader2, Plus, Save, ScrollText, Trash2, X } from 'lucide-react';
import dynamic from 'next/dynamic';

// §141 — client-only boundary; see dashboard/books/page.tsx for the full
// note (WebMangalAiEditor pulls the 6 MB web-llm engine into the SSR graph
// through any static import of it).
const WebMangalAiEditor = dynamic(() => import('../../../components/editor/WebMangalAiEditor'), {
  ssr: false,
  loading: () => (
    <div style={{ padding: '10px 0', color: 'var(--text-tertiary)', fontSize: '13px' }}>
      Loading editor…
    </div>
  ),
});
import { LORE_CATEGORIES, type LoreDraft, type LoreRow } from './codexTypes';

const fieldLabel: React.CSSProperties = {
  display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--text-tertiary)',
  textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 6px',
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '11px 12px', borderRadius: '10px',
  border: '1px solid var(--border-color)', background: 'var(--bg-input)',
  color: 'var(--text-primary)', fontSize: '14px', outline: 'none',
};

interface Props {
  rows: LoreRow[];
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  draft: LoreDraft | null;
  saving: boolean;
  confirmDelete: boolean;
  creatorEmail: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onField: (patch: Partial<LoreDraft>) => void;
  onSave: () => void;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  onDiscard: () => void;
}

export default function LorePane(p: Props) {
  return (
    <div className="codex-panes">
      {/* ── List rail ── */}
      <div style={{ minWidth: 0 }}>
        <button
          type="button" className="codex-btn" onClick={p.onNew}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%', justifyContent: 'center', padding: '11px 12px', borderRadius: '10px', border: '1px dashed var(--border-color)', background: 'transparent', color: 'var(--accent)', fontWeight: 800, fontSize: '12.5px', cursor: 'pointer', marginBottom: '10px' }}
        >
          <Plus size={14} /> New entry
        </button>
        {p.loading ? (
          <p style={{ color: 'var(--text-faint)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 4px' }}>
            <Loader2 size={13} className="mangal-spin" /> Loading…
          </p>
        ) : p.rows.length === 0 ? (
          <p style={{ color: 'var(--text-faint)', fontSize: '12px', padding: '8px 4px', margin: 0 }}>
            No lore entries yet — add your first place, item or faction.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {p.rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button" className="codex-btn"
                  onClick={() => p.onSelect(row.id)}
                  aria-current={p.selectedId === row.id}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '11px 12px', borderRadius: '10px', border: `1px solid ${p.selectedId === row.id ? 'var(--accent)' : 'var(--border-color)'}`, background: p.selectedId === row.id ? 'rgba(var(--accent-rgb), 0.1)' : 'var(--bg-card)', cursor: 'pointer' }}
                >
                  <span style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)' }}>{row.title}</span>
                  <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px', textTransform: 'capitalize' }}>{row.category}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Detail / form ── */}
      <div style={{ minWidth: 0 }}>
        {!p.draft ? (
          <div style={{ border: '1px solid var(--border-color)', borderRadius: '14px', background: 'var(--bg-card)', padding: '28px 20px', textAlign: 'center' }}>
            <ScrollText size={30} style={{ color: 'var(--text-faint)' }} />
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: '10px 0 0' }}>
              Pick an entry from the list, or create a new one.
            </p>
          </div>
        ) : (
          <div style={{ border: '1px solid var(--border-color)', borderRadius: '14px', background: 'var(--bg-card)', padding: '16px' }}>
            <label htmlFor="codex-lore-title" style={fieldLabel}>Title *</label>
            <input
              id="codex-lore-title" className="codex-field" style={inputStyle}
              value={p.draft.title} onChange={(e) => p.onField({ title: e.target.value })}
              placeholder="e.g. The Sunken Temple of Kalpi" maxLength={140} autoComplete="off"
            />

            <label htmlFor="codex-lore-category" style={{ ...fieldLabel, marginTop: '12px' }}>Category</label>
            <select
              id="codex-lore-category" className="codex-field" style={{ ...inputStyle, appearance: 'auto' }}
              value={p.draft.category} onChange={(e) => p.onField({ category: e.target.value as LoreDraft['category'] })}
            >
              {LORE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>

            <div style={{ marginTop: '14px' }}>
              <label htmlFor="codex-lore-content" style={fieldLabel}>Lore content</label>
              <WebMangalAiEditor
                value={p.draft.content}
                onChange={(next) => p.onField({ content: next })}
                feature="lore"
                creatorEmail={p.creatorEmail}
                rows={9}
                ariaLabel="Lore entry content"
                placeholder={"History, appearance, rules, significance…\n\nWrite at least 100 words to unlock the ✨ Polish & Hinglish Convert toolbar."}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginTop: '14px' }}>
              {p.confirmDelete ? (
                <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(239,68,68,0.45)', background: 'rgba(239,68,68,0.07)' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', flex: 1, minWidth: '140px' }}>Delete this entry? This cannot be undone.</span>
                  <button type="button" className="codex-btn" onClick={p.onConfirmDelete} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '9px 14px', borderRadius: '8px', border: 'none', background: '#ef4444', color: '#fff', fontWeight: 800, fontSize: '12px', cursor: p.saving ? 'wait' : 'pointer' }}>
                    <Trash2 size={12} /> {p.saving ? 'Deleting…' : 'Yes, delete'}
                  </button>
                  <button type="button" className="codex-btn" onClick={p.onCancelDelete} aria-label="Cancel delete" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '9px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}>
                    <X size={12} /> Cancel
                  </button>
                </div>
              ) : (
                <>
                  <button
                    type="button" className="codex-btn" onClick={p.onSave}
                    disabled={p.saving || !p.draft.title.trim()}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '11px 16px', borderRadius: '9px', border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 800, fontSize: '12.5px', cursor: p.saving || !p.draft.title.trim() ? 'default' : 'pointer', opacity: p.saving || !p.draft.title.trim() ? 0.55 : 1 }}
                  >
                    {p.saving ? <Loader2 size={13} className="mangal-spin" /> : <Save size={13} />}
                    {p.draft.id ? 'Save changes' : 'Create entry'}
                  </button>
                  <button type="button" className="codex-btn" onClick={p.onDiscard} style={{ padding: '11px 14px', borderRadius: '9px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '12.5px', cursor: 'pointer' }}>
                    Discard
                  </button>
                  {p.draft.id && (
                    <button type="button" className="codex-btn" onClick={p.onRequestDelete} aria-label="Delete entry" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '11px 14px', borderRadius: '9px', border: '1px solid rgba(239,68,68,0.4)', background: 'transparent', color: '#ef4444', fontWeight: 700, fontSize: '12.5px', cursor: 'pointer', marginLeft: 'auto' }}>
                      <Trash2 size={13} /> Delete
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}