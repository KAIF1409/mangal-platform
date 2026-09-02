'use client';

// app/mangal-studio/webmangal/codex/CharacterPane.tsx
//
// §138 — Characters pane: list rail + profile form. The backstory field is a
// WebMangalAiEditor drop-in (feature="character") — batching bars (≥100 w /
// ≥400 c), Polish & Hinglish toolbar, BYOK settings, diff review and the
// recovery matrix all come from the shared §134 pipeline; no AI logic here.
// Portrait is placeholder-only (upload/serve wiring out of scope) — no <img>.

import { ImagePlus, Loader2, Plus, Save, Trash2, UserRound, X } from 'lucide-react';
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
import { type CharacterDraft, type CharacterRow } from './codexTypes';

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
  rows: CharacterRow[];
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  draft: CharacterDraft | null;
  saving: boolean;
  confirmDelete: boolean;
  creatorEmail: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onField: (patch: Partial<CharacterDraft>) => void;
  onSave: () => void;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  onDiscard: () => void;
}

export default function CharacterPane(p: Props) {
  return (
    <div className="codex-panes">
      <div style={{ minWidth: 0 }}>
        <button
          type="button" className="codex-btn" onClick={p.onNew}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%', justifyContent: 'center', padding: '11px 12px', borderRadius: '10px', border: '1px dashed var(--border-color)', background: 'transparent', color: 'var(--accent)', fontWeight: 800, fontSize: '12.5px', cursor: 'pointer', marginBottom: '10px' }}
        >
          <Plus size={14} /> New character
        </button>
        {p.loading ? (
          <p style={{ color: 'var(--text-faint)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 4px' }}>
            <Loader2 size={13} className="mangal-spin" /> Loading…
          </p>
        ) : p.rows.length === 0 ? (
          <p style={{ color: 'var(--text-faint)', fontSize: '12px', padding: '8px 4px', margin: 0 }}>
            No characters yet — create your first one.
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
                  <span style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)' }}>{row.name}</span>
                  {row.role && <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>{row.role}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div style={{ minWidth: 0 }}>
        {!p.draft ? (
          <div style={{ border: '1px solid var(--border-color)', borderRadius: '14px', background: 'var(--bg-card)', padding: '28px 20px', textAlign: 'center' }}>
            <UserRound size={30} style={{ color: 'var(--text-faint)' }} />
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: '10px 0 0' }}>
              Pick a character from the list, or create a new one.
            </p>
          </div>
        ) : (
          <div style={{ border: '1px solid var(--border-color)', borderRadius: '14px', background: 'var(--bg-card)', padding: '16px' }}>
            <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', marginBottom: '14px' }}>
              {/* Portrait placeholder — image_url column exists; upload/serve
                  wiring is out of scope this session, so this is a labelled
                  placeholder block, not an <img>. */}
              <div
                aria-hidden="true"
                style={{ width: '96px', height: '96px', flexShrink: 0, borderRadius: '12px', border: '1px dashed var(--border-color)', background: 'var(--bg-input)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
              >
                <ImagePlus size={20} style={{ color: 'var(--text-faint)' }} />
                <span style={{ fontSize: '8.5px', color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Portrait</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label htmlFor="codex-char-name" style={fieldLabel}>Name *</label>
                <input
                  id="codex-char-name" className="codex-field" style={inputStyle}
                  value={p.draft.name} onChange={(e) => p.onField({ name: e.target.value })}
                  placeholder="e.g. Riya Sharma" maxLength={120} autoComplete="off"
                />
                <label htmlFor="codex-char-role" style={{ ...fieldLabel, marginTop: '12px' }}>Role</label>
                <input
                  id="codex-char-role" className="codex-field" style={inputStyle}
                  value={p.draft.role} onChange={(e) => p.onField({ role: e.target.value })}
                  placeholder="Protagonist, Antagonist, Mentor…" maxLength={80} autoComplete="off"
                />
              </div>
            </div>

            <label htmlFor="codex-char-tags" style={fieldLabel}>Tags (comma-separated)</label>
            <input
              id="codex-char-tags" className="codex-field" style={inputStyle}
              value={p.draft.tagsText} onChange={(e) => p.onField({ tagsText: e.target.value })}
              placeholder="brave, sharp-tongued, ex-soldier" autoComplete="off"
            />

            <div style={{ marginTop: '14px' }}>
              <label htmlFor="codex-char-backstory" style={fieldLabel}>Backstory &amp; lore notes</label>
              <WebMangalAiEditor
                value={p.draft.backstory}
                onChange={(next) => p.onField({ backstory: next })}
                feature="character"
                creatorEmail={p.creatorEmail}
                rows={9}
                ariaLabel="Character backstory"
                placeholder={'Who they are, where they came from, how they talk…\n\nWrite at least 100 words to unlock the ✨ Polish & Hinglish Convert toolbar.'}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginTop: '14px' }}>
              {p.confirmDelete ? (
                <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(239,68,68,0.45)', background: 'rgba(239,68,68,0.07)' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', flex: 1, minWidth: '140px' }}>Delete this character? This cannot be undone.</span>
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
                    disabled={p.saving || !p.draft.name.trim()}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '11px 16px', borderRadius: '9px', border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 800, fontSize: '12.5px', cursor: p.saving || !p.draft.name.trim() ? 'default' : 'pointer', opacity: p.saving || !p.draft.name.trim() ? 0.55 : 1 }}
                  >
                    {p.saving ? <Loader2 size={13} className="mangal-spin" /> : <Save size={13} />}
                    {p.draft.id ? 'Save changes' : 'Create character'}
                  </button>
                  <button type="button" className="codex-btn" onClick={p.onDiscard} style={{ padding: '11px 14px', borderRadius: '9px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '12.5px', cursor: 'pointer' }}>
                    Discard
                  </button>
                  {p.draft.id && (
                    <button type="button" className="codex-btn" onClick={p.onRequestDelete} aria-label="Delete character" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '11px 14px', borderRadius: '9px', border: '1px solid rgba(239,68,68,0.4)', background: 'transparent', color: '#ef4444', fontWeight: 700, fontSize: '12.5px', cursor: 'pointer', marginLeft: 'auto' }}>
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