'use client';

// app/components/editor/DiffReviewModal.tsx
//
// WebMangal AI assistant — "Diff / Review" modal. Shows Original vs AI
// Corrected text paragraph-by-paragraph with word-level highlighting, plus
// one-click Accept All / Accept Selection / Discard. Nothing is applied to
// the manuscript until the creator explicitly accepts here.

import { useMemo, useState } from 'react';
import { Check, CheckCheck, TriangleAlert, X } from 'lucide-react';
import { buildParagraphPairs, diffWords, type ParagraphPair } from '../../lib/ai/textDiff';

export interface DiffReviewResult {
  /** Full polished text, restricted to the paragraphs the creator accepted. */
  acceptedText: string;
  acceptedCount: number;
  changedCount: number;
}

interface Props {
  open: boolean;
  originalText: string;
  polishedText: string;
  engineLabel: string;
  onAccept: (result: DiffReviewResult) => void;
  onDiscard: () => void;
}

function DiffParagraph({ pair }: { pair: ParagraphPair }) {
  const runs = useMemo(() => diffWords(pair.original, pair.polished), [pair]);
  return (
    <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.7 }}>
      {runs.map((run, i) => {
        if (run.type === 'removed') {
          return (
            <span key={i} style={{ background: 'rgba(239,68,68,0.18)', color: '#f87171', textDecoration: 'line-through', borderRadius: '3px' }}>
              {run.text}
            </span>
          );
        }
        if (run.type === 'added') {
          return (
            <span key={i} style={{ background: 'rgba(34,197,94,0.16)', color: '#4ade80', borderRadius: '3px' }}>
              {run.text}
            </span>
          );
        }
        return <span key={i}>{run.text}</span>;
      })}
    </p>
  );
}

export default function DiffReviewModal({
  open,
  originalText,
  polishedText,
  engineLabel,
  onAccept,
  onDiscard,
}: Props) {
  const pairs = useMemo(
    () => buildParagraphPairs(originalText, polishedText),
    [originalText, polishedText],
  );
  // Selection state: paragraph index → include in the accept. Unchanged
  // paragraphs default OFF (nothing to gain), changed ones default ON.
  const [selected, setSelected] = useState<Record<number, boolean>>({});

  const effectiveSelection = (idx: number, changed: boolean) => selected[idx] ?? changed;

  if (!open) return null;

  const changedCount = pairs.filter((p) => p.changed).length;
  const selectedCount = pairs.filter((p) => effectiveSelection(p.index, p.changed)).length;

  const buildAcceptedText = (): string =>
    // Keep original paragraph order; swap in polished text only for
    // selected+changed pairs, keep the original text otherwise.
    pairs
      .filter((p) => p.original || p.polished)
      .map((p) => (effectiveSelection(p.index, p.changed) ? p.polished : p.original))
      .filter(Boolean)
      .join('\n\n');

  const selectAllChanges = () => {
    const all: Record<number, boolean> = {};
    for (const p of pairs) all[p.index] = true;
    setSelected(all);
  };

  const headerStyle: React.CSSProperties = { padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' };
  const footerBtnBase: React.CSSProperties = { padding: '10px 16px', borderRadius: '9px', fontWeight: 700, fontSize: '12.5px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '7px' };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Review AI changes"
      style={{ position: 'fixed', inset: 0, zIndex: 95, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', padding: '16px' }}
      onClick={onDiscard}
    >
      <div
        className="wm-ai-diff"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(920px, 100%)', maxHeight: '88vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px', overflow: 'hidden' }}
      >
        <div style={headerStyle}>
          <h2 style={{ fontSize: '15px', fontWeight: 900, margin: 0 }}>Review AI suggestions</h2>
          <span style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: 700 }}>{engineLabel}</span>
          <span style={{ marginLeft: 'auto', fontSize: '11.5px', color: 'var(--text-tertiary)' }}>
            {changedCount === 0 ? 'No changes suggested' : `${changedCount} of ${pairs.length} paragraphs edited`}
          </span>
          <button aria-label="Close" onClick={onDiscard} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: '4px' }}>
            <X size={18} />
          </button>
        </div>

        {changedCount === 0 && (
          <div style={{ padding: '14px 20px', background: 'rgba(34,197,94,0.08)', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Check size={15} color="#22c55e" />
            <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
              The AI found your prose already clean — no edits suggested.
            </span>
          </div>
        )}

        <div style={{ overflowY: 'auto', flex: 1, padding: '6px 0' }}>
          {pairs.map((pair) => {
            const checked = effectiveSelection(pair.index, pair.changed);
            return (
              <label
                key={pair.index}
                style={{
                  display: 'flex', gap: '12px', padding: '12px 20px',
                  borderTop: pair.index === 0 ? 'none' : '1px solid var(--divider)',
                  cursor: pair.changed ? 'pointer' : 'default',
                  background: checked && pair.changed ? 'rgba(217,119,6,0.04)' : 'transparent',
                }}
              >
                {pair.changed ? (
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => setSelected((s) => ({ ...s, [pair.index]: e.target.checked }))}
                    style={{ width: '15px', height: '15px', marginTop: '3px', accentColor: '#d97706', flexShrink: 0 }}
                  />
                ) : (
                  <span style={{ width: '15px', flexShrink: 0 }} />
                )}
                <div style={{ minWidth: 0, flex: 1 }}>
                  {!pair.changed && (
                    <span style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.05em', color: 'var(--text-faint)', display: 'block', marginBottom: '2px' }}>UNCHANGED</span>
                  )}
                  <DiffParagraph pair={pair} />
                </div>
              </label>
            );
          })}
        </div>

        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => onAccept({ acceptedText: buildAcceptedText(), acceptedCount: selectedCount, changedCount })}
            disabled={changedCount === 0}
            style={{ ...footerBtnBase, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 800, fontSize: '13px', opacity: changedCount === 0 ? 0.5 : 1 }}
          >
            <CheckCheck size={15} /> Accept selection ({selectedCount})
          </button>
          <button
            onClick={selectAllChanges}
            disabled={changedCount === 0}
            style={{ ...footerBtnBase, border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-secondary)', opacity: changedCount === 0 ? 0.5 : 1 }}
          >
            Select all changes
          </button>
          {changedCount > 0 && selectedCount !== changedCount && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11.5px', color: 'var(--text-faint)' }}>
              <TriangleAlert size={12} /> unselected edits will be discarded
            </span>
          )}
          <button
            onClick={onDiscard}
            style={{ ...footerBtnBase, marginLeft: 'auto', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-secondary)' }}
          >
            Discard
          </button>
        </div>
      </div>
    </div>
  );
}

