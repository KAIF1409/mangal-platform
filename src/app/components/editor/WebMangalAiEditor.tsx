'use client';

// app/components/editor/WebMangalAiEditor.tsx
//
// §134 — THE universal AI-assisted text field. A drop-in replacement for any
// plain <textarea> where creators write platform content:
//   • novel chapter writer (+ focus mode)     → feature="chapter"
//   • series synopsis / metadata description  → feature="synopsis"
//   • author's notes                          → feature="author-note"
//   • book descriptions                       → feature="book-description"
//   • song lyric blocks                       → feature="lyrics"
//   • future character-lore / scene-script /
//     webtoon-dialogue editors                → feature="character" | "lore" | "script"
//
// Every instance shares ONE pipeline (useAiAssistEngine): batching policy,
// over-length splitting, hybrid on-device/BYOK lanes, recovery matrix,
// diff review, and encrypted-key settings.
//
// `useAiAssistant` is re-exported as the public hook alias for custom
// integrations that build their own surfaces around the same engine.

import { useEffect, useRef, useState } from 'react';
import { CircleAlert, Cloud, Cpu, Languages, LoaderCircle, RefreshCw, Settings, Sparkles, X } from 'lucide-react';

import {
  ASSIST_MODE_LABELS,
  MIN_POLISH_CHARS,
  MIN_POLISH_WORDS,
  type AssistMode,
} from '../../lib/ai/editorAssist';
import { estimateReadTime } from '../../lib/novelEditor';
import ThresholdPopover from './ThresholdPopover';
import AiAssistOverlays from './AiAssistOverlays';
import { useAiAssistEngine } from './useAiAssistEngine';

export { useAiAssistEngine as useAiAssistant } from './useAiAssistEngine';

export type AiFeature =
  | 'chapter'
  | 'synopsis'
  | 'author-note'
  | 'book-description'
  | 'lyrics'
  | 'character'
  | 'lore'
  | 'script';

/**
 * Per-feature batching bars. Prose keeps the platform default (≥300 words /
 * ≥1500 chars ≈ one full page). Short metadata fields get proportionally
 * smaller bars so the action is actually reachable there — still click-
 * gated, never keystroke-triggered, and still auto-split past 4k words.
 */
export const FEATURE_THRESHOLDS: Record<AiFeature, { minWords: number; minChars: number }> = {
  chapter: { minWords: MIN_POLISH_WORDS, minChars: MIN_POLISH_CHARS },
  synopsis: { minWords: 60, minChars: 250 },
  'author-note': { minWords: 40, minChars: 160 },
  'book-description': { minWords: 60, minChars: 250 },
  lyrics: { minWords: 60, minChars: 220 },
  character: { minWords: 100, minChars: 400 },
  lore: { minWords: 100, minChars: 400 },
  script: { minWords: MIN_POLISH_WORDS, minChars: MIN_POLISH_CHARS },
};

// §144 — labels moved to ASSIST_MODE_LABELS in lib/ai/editorAssist.ts so the
// engine (diff-review header) and every toolbar render the same wording.

interface Props {
  value: string;
  onChange: (next: string) => void;
  feature?: AiFeature;
  /** Forwarded to the underlying <textarea> (selection tooling etc.). */
  innerRef?: React.RefObject<HTMLTextAreaElement | null>;
  placeholder?: string;
  rows?: number;
  onKeyDown?: React.KeyboardEventHandler<HTMLTextAreaElement>;
  style?: React.CSSProperties;
  className?: string;
  spellCheck?: boolean;
  autoFocus?: boolean;
  ariaLabel?: string;
  maxLength?: number;
  creatorEmail?: string | null;
}

export default function WebMangalAiEditor({
  value,
  onChange,
  feature = 'chapter',
  innerRef,
  placeholder,
  rows = 6,
  onKeyDown,
  style,
  className,
  spellCheck,
  autoFocus,
  ariaLabel,
  maxLength,
  creatorEmail,
}: Props) {
  const thresholds = FEATURE_THRESHOLDS[feature] ?? FEATURE_THRESHOLDS.chapter;
  const [probed, setProbed] = useState(false);

  const engine = useAiAssistEngine({
    text: value,
    onApplyText: onChange,
    minWords: thresholds.minWords,
    minChars: thresholds.minChars,
    creatorEmail,
  });

  const ctaRef = useRef<HTMLButtonElement>(null);
  const localRef = useRef<HTMLTextAreaElement | null>(null);
  const setTextareaRef = (el: HTMLTextAreaElement | null) => {
    localRef.current = el;
    if (innerRef) innerRef.current = el;
  };

  // Post-mount environment probe (browser-only APIs), microtask-deferred.
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        engine.probeEnvironment();
        setProbed(true);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per mount
  }, []);

  const busy = engine.busy;
  const badge = engine.thresholdMet
    ? { color: '#22c55e', text: `${engine.wordCount.toLocaleString()} words — ready for batch AI check` }
    : {
        color: 'var(--text-tertiary)',
        text: `${engine.wordCount} / ${thresholds.minWords} words required for batch AI check`,
      };

  const segBtn = (active: boolean): React.CSSProperties => ({
    padding: '4px 9px',
    fontSize: '10.5px',
    fontWeight: 700,
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    background: active ? 'var(--accent)' : 'transparent',
    color: active ? '#fff' : 'var(--text-secondary)',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
  });

  return (
    <div className="wm-ai-field" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* AI toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <div
          role="radiogroup"
          aria-label="AI engine"
          style={{ display: 'inline-flex', padding: '2px', gap: '2px', borderRadius: '8px', background: 'var(--bg-input)', border: '1px solid var(--border-color)' }}
        >
          <button
            type="button"
            role="radio"
            aria-checked={engine.engineMode === 'local'}
            onClick={() =>
              engine.webGpuOk
                ? engine.setEngineMode('local')
                : engine.pushToast('error', 'WebGPU is not available in this browser — cloud mode with your own key is the fallback.')
            }
            style={segBtn(engine.engineMode === 'local')}
            title="Free, private, runs in your browser"
          >
            <Cpu size={11} /> On-device{engine.webGpuOk === false && probed ? ' (n/a)' : ''}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={engine.engineMode === 'cloud'}
            onClick={() => engine.setEngineMode('cloud')}
            style={segBtn(engine.engineMode === 'cloud')}
            title="Uses your own Gemini/Groq/OpenAI key"
          >
            <Cloud size={11} /> Cloud{engine.cloudReady ? ' ✓' : ''}
          </button>
        </div>

        <div role="group" aria-label="Assist focus" style={{ display: 'inline-flex', gap: '5px' }}>
          {(['auto', 'polish', 'hinglish', 'translate'] as AssistMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => engine.setMode(m)}
              style={{
                padding: '4px 9px',
                fontSize: '10.5px',
                fontWeight: 700,
                border: `1px solid ${engine.mode === m ? 'rgba(217,119,6,0.4)' : 'var(--border-color)'}`,
                borderRadius: '999px',
                cursor: 'pointer',
                background: engine.mode === m ? 'rgba(217,119,6,0.14)' : 'transparent',
                color: engine.mode === m ? 'var(--accent)' : 'var(--text-tertiary)',
              }}
            >
              {ASSIST_MODE_LABELS[m]}
            </button>
          ))}
        </div>

        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{ fontSize: '10.5px', fontWeight: 700, color: badge.color }}
            title={`Batch minimums for this field: ${thresholds.minWords}+ words or ${thresholds.minChars.toLocaleString()}+ characters`}
          >
            {badge.text}
          </span>
          <button
            type="button"
            onClick={engine.openSettings}
            aria-label="AI settings"
            style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: '7px', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px', display: 'inline-flex' }}
          >
            <Settings size={13} />
          </button>
        </span>
      </div>

      {/* The actual text surface */}
      <textarea
        ref={setTextareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        rows={rows}
        maxLength={maxLength}
        spellCheck={spellCheck}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        className={className}
        style={
          style ?? {
            width: '100%',
            padding: '10px 12px',
            borderRadius: '9px',
            border: '1px solid var(--border-color)',
            background: 'var(--bg-input)',
            color: 'var(--text-primary)',
            fontSize: '13px',
            outline: 'none',
            resize: 'vertical' as const,
          }
        }
      />

      {/* Status / action row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative' }}>
          <ThresholdPopover
            open={engine.showThresholdPopover}
            onClose={engine.closeThresholdPopover}
            anchorRef={ctaRef}
          />
          <button
            ref={ctaRef}
            type="button"
            onClick={() => void engine.runAssist()}
            disabled={busy}
            title="AI assistant: batched grammar/style polish, Hinglish → English conversion"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '8px 15px', borderRadius: '9px', border: 'none',
              background: busy ? 'var(--border-color)' : 'var(--accent)',
              color: '#fff', fontWeight: 800, fontSize: '12px',
              cursor: busy ? 'wait' : 'pointer',
              opacity: busy || !engine.thresholdMet ? 0.55 : 1,
            }}
          >
            {busy && engine.runningMode !== 'translate' ? (
              <LoaderCircle size={13} className="mangal-spin" />
            ) : (
              <Sparkles size={13} />
            )}
            {busy && engine.runningMode !== 'translate'
              ? 'Polishing…'
              : '✨ Polish & Hinglish Convert'}
          </button>

          {/* §144 — the explicit SECOND AI action: full translation. Rides the
              same batching/splitting/BYOK pipeline; forces mode='translate'
              for this run via the engine's override param. */}
          <button
            type="button"
            onClick={() => void engine.runAssist('translate')}
            disabled={busy}
            title="AI translation: English → Hindi, or Hindi/Hinglish → English (auto-detected)"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '7px 14px', borderRadius: '9px',
              border: '1px solid var(--accent)',
              background: busy && engine.runningMode === 'translate' ? 'var(--border-color)' : 'transparent',
              color: busy && engine.runningMode === 'translate' ? 'var(--text-muted)' : 'var(--accent)',
              fontWeight: 800, fontSize: '12px',
              cursor: busy ? 'wait' : 'pointer',
              opacity: busy || !engine.thresholdMet ? 0.55 : 1,
            }}
          >
            {busy && engine.runningMode === 'translate' ? (
              <LoaderCircle size={13} className="mangal-spin" />
            ) : (
              <Languages size={13} />
            )}
            {busy && engine.runningMode === 'translate' ? 'Translating…' : '🌐 AI Translation'}
          </button>
        </div>

        <span style={{ minWidth: 0, flex: 1, fontSize: '11px', color: 'var(--text-faint)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          {busy ? (
            <>
              <LoaderCircle size={11} className="mangal-spin" />
              <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{engine.statusDetail}</span>
            </>
          ) : (
            <>
              {estimateReadTime(engine.wordCount)}
              {engine.plannedBlocks > 0 && (
                <strong style={{ color: 'var(--accent)' }}>· auto-splits into ~{engine.plannedBlocks} blocks</strong>
              )}
            </>
          )}
        </span>
      </div>

      {/* §133 recovery matrix — inline alert */}
      {engine.cloudAlert && (
        <div
          role="alert"
          style={{
            display: 'flex', alignItems: 'flex-start', gap: '8px',
            padding: '9px 12px', borderRadius: '10px',
            background: engine.cloudAlert.kind === 'rate_limited' ? 'rgba(234,179,8,0.08)' : 'rgba(239,68,68,0.07)',
            border: `1px solid ${engine.cloudAlert.kind === 'rate_limited' ? 'rgba(234,179,8,0.5)' : 'rgba(239,68,68,0.45)'}`,
          }}
        >
          <CircleAlert size={14} color={engine.cloudAlert.kind === 'rate_limited' ? '#eab308' : '#ef4444'} style={{ flexShrink: 0, marginTop: '2px' }} />
          <p style={{ flex: 1, margin: 0, fontSize: '11.5px', lineHeight: 1.5, color: 'var(--text-secondary)' }}>{engine.cloudAlert.message}</p>
          {engine.cloudAlert.kind === 'server_error' && (
            <span style={{ display: 'inline-flex', gap: '6px', flexShrink: 0 }}>
              <button
                type="button"
                onClick={engine.retryAfterServerAlert}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '6px 10px', borderRadius: '7px', border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 800, fontSize: '11px', cursor: 'pointer' }}
              >
                <RefreshCw size={11} /> Retry
              </button>
              {engine.webGpuOk && (
                <button
                  type="button"
                  onClick={engine.switchToLocalEngine}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '6px 10px', borderRadius: '7px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '11px', cursor: 'pointer' }}
                >
                  <Cpu size={11} /> On-device
                </button>
              )}
            </span>
          )}
          <button
            type="button"
            aria-label="Dismiss alert"
            onClick={engine.dismissCloudAlert}
            style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', padding: '2px', flexShrink: 0 }}
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* Shared modals + toasts */}
      <AiAssistOverlays engine={engine} />
    </div>
  );
}


