'use client';

// app/components/editor/AiAssistOverlays.tsx
//
// Shared modal/toast stack for EVERY AI-assisted text surface. Mount once
// per field with the engine from useAiAssistEngine(); it renders the BYOK
// settings modal, the diff-review handoff, and the toast stack.

import { useEffect } from 'react';
import { Check, CircleAlert, X } from 'lucide-react';

import AiSettingsModal, { PRIVACY_NOTICE } from './AiSettingsModal';
import DiffReviewModal, { type DiffReviewResult } from './DiffReviewModal';
import type { AiAssistEngine, ToastMsg } from './useAiAssistEngine';

function ToastItem({ toast, onDone }: { toast: ToastMsg; onDone: (id: number) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onDone(toast.id), toast.kind === 'error' ? 7000 : 4500);
    return () => clearTimeout(t);
  }, [toast, onDone]);
  const color =
    toast.kind === 'success' ? '#22c55e' : toast.kind === 'error' ? '#ef4444' : 'var(--accent)';
  return (
    <div
      role="status"
      style={{
        display: 'flex', alignItems: 'flex-start', gap: '8px',
        padding: '11px 14px', borderRadius: '10px',
        background: 'var(--bg-card)', border: `1px solid ${color}`,
        boxShadow: '0 8px 24px rgba(0,0,0,0.35)', maxWidth: '360px',
        fontSize: '12.5px', lineHeight: 1.5, color: 'var(--text-primary)',
      }}
    >
      {toast.kind === 'success' ? (
        <Check size={14} color={color} style={{ flexShrink: 0, marginTop: '2px' }} />
      ) : (
        <CircleAlert size={14} color={color} style={{ flexShrink: 0, marginTop: '2px' }} />
      )}
      <span style={{ minWidth: 0 }}>{toast.text}</span>
      <button
        aria-label="Dismiss"
        onClick={() => onDone(toast.id)}
        style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', padding: 0, marginLeft: 'auto' }}
      >
        <X size={13} />
      </button>
    </div>
  );
}

export default function AiAssistOverlays({ engine }: { engine: AiAssistEngine }) {
  return (
    <>
      {/* Toasts */}
      <div
        aria-live="polite"
        style={{ position: 'fixed', right: '18px', bottom: '18px', zIndex: 99, display: 'flex', flexDirection: 'column', gap: '8px' }}
      >
        {engine.toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDone={engine.dismissToast} />
        ))}
      </div>

      {/* BYOK settings */}
      <AiSettingsModal
        open={engine.settingsOpen}
        creatorEmail={engine.creatorEmail}
        onClose={engine.closeSettings}
        onSaved={() => engine.probeEnvironment()}
      />

      {/* Diff / Review handoff */}
      <DiffReviewModal
        open={engine.diffState !== null}
        originalText={engine.diffState?.original ?? ''}
        polishedText={engine.diffState?.polished ?? ''}
        engineLabel={engine.diffState?.label ?? ''}
        onAccept={(result: DiffReviewResult) => engine.acceptPolishedText(result)}
        onDiscard={engine.dismissDiff}
      />
    </>
  );
}

export { PRIVACY_NOTICE };
