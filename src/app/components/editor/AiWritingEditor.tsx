'use client';

// app/components/editor/AiWritingEditor.tsx
//
// WebMangal AI Writing & Translation Assistant — the creator-facing editor.
//
// Scale architecture baked into this component (see CONTEXT.md §132):
//   1. THRESHOLD-BASED BATCHING — nothing fires on keystrokes or typing
//      pauses. The only path to an AI request is one explicit click on
//      "Check & Polish Page", armed solely once the draft clears a full
//      page (~300 words OR 1,500+ characters). This is what removes >95%
//      of API traffic vs. autosuggest-style designs at 100k creators.
//   2. HYBRID COMPUTE — default engine is ON-DEVICE WebLLM/WebGPU (zero
//      server cost, zero data egress). Cloud mode is opt-in BYOK via
//      /api/ai/editor-assist with the creator's own Gemini/Groq key sent
//      per-request over TLS and never persisted server-side.
//   3. HUMAN-IN-THE-LOOP — results land in a Diff/Review modal; the
//      manuscript changes only after explicit Accept.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  Check,
  CircleAlert,
  Cloud,
  Cpu,
  Info,
  LoaderCircle,
  Lock,
  RefreshCw,
  Settings,
  Sparkles,
  X,
} from 'lucide-react';

import { countWords, estimateReadTime } from '../../lib/novelEditor';
import {
  AI_KEY_HEADER,
  AI_PROVIDER_HEADER,
  buildSystemPrompt,
  MAX_BATCH_WORDS,
  MIN_POLISH_CHARS,
  MIN_POLISH_WORDS,
  meetsBatchThreshold,
  splitIntoPageBatches,
  type AssistMode,
  type EditorAssistErrorResponse,
} from '../../lib/ai/editorAssist';
import { clearAiKeys, decryptApiKey, loadAiSettingsMeta } from '../../lib/ai/byokStorage';
import { getLocalEngine, isWebGpuAvailable } from '../../lib/ai/webllmEngine';
import { docToManuscriptText, manuscriptTextToHtml } from './manuscriptText';
import AiSettingsModal, { CONSENT_TEXT, PRIVACY_NOTICE } from './AiSettingsModal';
import DiffReviewModal, { type DiffReviewResult } from './DiffReviewModal';
import ThresholdPopover from './ThresholdPopover';

type EngineMode = 'local' | 'cloud';
type AssistStatus = 'idle' | 'preparing' | 'running';

interface ToastMsg {
  id: number;
  kind: 'success' | 'error' | 'info';
  text: string;
}

function ToastItem({ toast, onDone }: { toast: ToastMsg; onDone: (id: number) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onDone(toast.id), toast.kind === 'error' ? 7000 : 4500);
    return () => clearTimeout(t);
  }, [toast, onDone]);
  const color = toast.kind === 'success' ? '#22c55e' : toast.kind === 'error' ? '#ef4444' : 'var(--accent)';
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
      {toast.kind === 'success' ? <Check size={14} color={color} style={{ flexShrink: 0, marginTop: '2px' }} /> : <CircleAlert size={14} color={color} style={{ flexShrink: 0, marginTop: '2px' }} />}
      <span style={{ minWidth: 0 }}>{toast.text}</span>
      <button aria-label="Dismiss" onClick={() => onDone(toast.id)} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', padding: 0, marginLeft: 'auto' }}>
        <X size={13} />
      </button>
    </div>
  );
}

export interface AiWritingEditorProps {
  /** Draft text in MANGAL dialect, preloaded before mount (may be ''). */
  initialText: string;
  /** Fired on every edit with the full MANGAL-dialect plain text (autosave). */
  onChange?: (text: string) => void;
  /** Session email of the logged-in creator (SSO key-portal alignment). */
  creatorEmail?: string | null;
}

/** §133 recovery matrix — inline, non-crashing cloud failure states. */
interface CloudAlert {
  kind: 'rate_limited' | 'server_error';
  message: string;
}

export default function AiWritingEditor({ initialText, onChange, creatorEmail }: AiWritingEditorProps) {
  // ── Editor + live stats ──────────────────────────────────────────────────
  const [stats, setStats] = useState({ words: 0, chars: 0 });
  const [status, setStatus] = useState<AssistStatus>('idle');
  const [statusDetail, setStatusDetail] = useState<string>('');
  const [mode, setMode] = useState<AssistMode>('auto');
  const [engineMode, setEngineMode] = useState<EngineMode>('local');
  const [webGpuOk, setWebGpuOk] = useState<boolean | null>(null);
  const [cloudReady, setCloudReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showPrivacyBanner, setShowPrivacyBanner] = useState(false);
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const [diffState, setDiffState] = useState<{
    original: string;
    polished: string;
    label: string;
  } | null>(null);
  // §133 recovery matrix state — inline, dismissible failure banner.
  const [cloudAlert, setCloudAlert] = useState<CloudAlert | null>(null);
  const [showThresholdPopover, setShowThresholdPopover] = useState(false);
  const ctaRef = useRef<HTMLButtonElement>(null);
  // Guards async result application against superseded runs.
  const activeRunRef = useRef(0);
  // Plain text of the most recent failed cloud run — powers Retry (§133).
  const lastFailedRunRef = useRef<string | null>(null);

  const toastId = useRef(0);
  const pushToast = useCallback((kind: ToastMsg['kind'], text: string) => {
    setToasts((t) => [...t.slice(-3), { id: ++toastId.current, kind, text }]);
  }, []);
  const dismissToast = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  type EditorInstance = NonNullable<ReturnType<typeof useEditor>>;

  const syncFromEditor = useCallback(
    (ed: EditorInstance) => {
      const plain = ed.getText({ blockSeparator: '\n\n' });
      setStats({ words: countWords(plain), chars: plain.length });
      onChange?.(
        docToManuscriptText(ed.getJSON() as Parameters<typeof docToManuscriptText>[0]),
      );
    },
    [onChange],
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Keep the palette to what MANGAL's reader actually renders.
        codeBlock: false,
        blockquote: false,
        orderedList: false,
        bulletList: false,
        listItem: false,
        link: false,
        strike: false,
        underline: false,
      }),
    ],
    content: manuscriptTextToHtml(initialText),
    immediatelyRender: false, // SSR-safe hydration
    editorProps: {
      attributes: {
        class: 'wm-ai-prose',
        'aria-label': 'Chapter manuscript',
      },
    },
    onUpdate: ({ editor: ed }) => syncFromEditor(ed),
  });

  useEffect(() => {
    if (!editor) return;
    // Post-mount environment probe (browser-only APIs: WebGPU + the local
    // key vault). Deferred to a microtask so no setState happens
    // synchronously inside the effect (react-hooks/set-state-in-effect).
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      syncFromEditor(editor);
      setWebGpuOk(isWebGpuAvailable());
      const meta = loadAiSettingsMeta();
      setCloudReady(meta.hasKey && meta.consentAt !== null);
      setShowPrivacyBanner(!meta.hasKey);
      if (!isWebGpuAvailable()) setEngineMode('cloud');
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per editor instance
  }, [editor]);

  const thresholdMet = useMemo(
    () => stats.words >= MIN_POLISH_WORDS || stats.chars >= MIN_POLISH_CHARS,
    [stats],
  );

  // §133 splitter preview: how many page-blocks a polish run will use at
  // the current length (exact split happens on click from real text).
  const plannedBlocks =
    stats.words > MAX_BATCH_WORDS ? Math.max(2, Math.ceil(stats.words / MAX_BATCH_WORDS)) : 0;

  // ── The ONE explicit assist trigger ─────────────────────────────────────
  const runAssist = async () => {
    if (!editor || status !== 'idle') return;

    const plainText = docToManuscriptText(
      editor.getJSON() as Parameters<typeof docToManuscriptText>[0],
    );

    // Batching guard #1 (UI affordance): below one page → anchored popover,
    // never a request. This is the token-saving policy working as designed.
    if (!meetsBatchThreshold(plainText)) {
      setShowThresholdPopover(true);
      return;
    }

    const runId = ++activeRunRef.current;
    setCloudAlert(null);

    try {
      let polishedParts: string[] = [];
      let label = '';

      if (engineMode === 'local') {
        setStatus('preparing');
        setStatusDetail('Preparing on-device model…');
        const engine = await getLocalEngine((p) => {
          if (p.phase === 'loading') {
            setStatusDetail(
              p.percent !== undefined
                ? `Downloading/compiling model… ${p.percent}%`
                : p.detail ?? 'Preparing on-device model…',
            );
          }
        });
        if (runId !== activeRunRef.current) return;
        const batches = splitIntoPageBatches(plainText);
        polishedParts = [];
        for (let i = 0; i < batches.length; i++) {
          setStatus('running');
          setStatusDetail(
            batches.length > 1
              ? `✨ On-device polishing block ${i + 1} of ${batches.length}…`
              : '✨ WebMangal AI polishing full page (on-device)…',
          );
          const out = await engine.complete([
            { role: 'system', content: buildSystemPrompt(mode) },
            { role: 'user', content: batches[i] },
          ]);
          if (runId !== activeRunRef.current) return;
          polishedParts.push(out.trim());
        }
        label = `On-device · ${engine.modelId}`;
      } else {
        // ── Cloud (BYOK) lane ──────────────────────────────────────────────
        const meta = loadAiSettingsMeta();
        const providerName =
          meta.provider === 'groq' ? 'Groq' : meta.provider === 'openai' ? 'OpenAI' : 'Gemini';
        if (!meta.hasKey || meta.consentAt === null) {
          pushToast(
            'error',
            `Cloud mode needs your own free API key and consent (“${CONSENT_TEXT}”). Open AI settings to add one — or switch to on-device polishing.`,
          );
          setSettingsOpen(true);
          return;
        }
        const apiKey = await decryptApiKey();
        if (!apiKey) {
          // Undecryptable vault = effectively an invalid stored key.
          await handleInvalidKey();
          return;
        }

        const batches = splitIntoPageBatches(plainText);
        polishedParts = [];
        for (let i = 0; i < batches.length; i++) {
          setStatus('running');
          setStatusDetail(
            batches.length > 1
              ? `✨ WebMangal AI polishing block ${i + 1} of ${batches.length} via ${providerName} (your key)…`
              : `✨ WebMangal AI polishing full page via ${providerName} (your key)…`,
          );

          let data: { text?: string; model?: string } | EditorAssistErrorResponse | null = null;
          try {
            const res = await fetch('/api/ai/editor-assist', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                [AI_PROVIDER_HEADER]: meta.provider,
                [AI_KEY_HEADER]: apiKey,
              },
              body: JSON.stringify({ text: batches[i], mode }),
            });
            data = (await res.json().catch(() => null)) as
              | { text?: string; model?: string }
              | EditorAssistErrorResponse
              | null;
            if (res.ok && data && 'text' in data && data.text) {
              if (runId !== activeRunRef.current) return;
              polishedParts.push(data.text);
              continue; // on to the next block
            }
          } catch {
            data = { error: 'Network error.', code: 'upstream_error' };
          }
          if (runId !== activeRunRef.current) return;
          const errCode = (data as EditorAssistErrorResponse | null)?.code ?? 'upstream_error';

          // ── §133 Recovery Matrix ────────────────────────────────────────
          if (errCode === 'invalid_key') {
            // 401 / UNAUTHENTICATED → wipe the dead credential, tell the
            // creator plainly, drop them straight into Settings to fix it.
            await handleInvalidKey();
            return;
          }
          setStatus('idle');
          setStatusDetail('');
          if (errCode === 'rate_limited') {
            // 429 → inline banner + automatic fallback to on-device.
            setCloudAlert({
              kind: 'rate_limited',
              message:
                'API Rate Limit reached for your key. Switching automatically to local WebLLM or try again in a few moments.',
            });
            lastFailedRunRef.current = plainText;
            if (isWebGpuAvailable()) {
              setEngineMode('local');
              pushToast(
                'info',
                'Switched to on-device polishing — press Check & Polish again to continue locally.',
              );
            } else {
              pushToast(
                'error',
                'Rate limited right now, and this browser has no WebGPU. Try again in a few moments.',
              );
            }
            return;
          }
          // payload_too_large is impossible post-splitting; treat every
          // remaining code (500/503/network/empty) as a retryable failure.
          setCloudAlert({
            kind: 'server_error',
            message:
              (data as EditorAssistErrorResponse | null)?.error ||
              'The AI provider could not process this page right now.',
          });
          lastFailedRunRef.current = plainText;
          return;
        }
        label = `${providerName} · BYOK`;
      }

      const polished = polishedParts.join('\n\n');
      if (!polished.trim()) throw new Error('Empty response from the model.');
      lastFailedRunRef.current = null;

      setStatus('idle');
      setStatusDetail('');
      setDiffState({ original: plainText, polished, label });
    } catch (err) {
      setStatus('idle');
      setStatusDetail('');
      pushToast(
        'error',
        err instanceof Error
          ? err.message
          : 'Something went wrong while polishing. Please try again.',
      );
    }
  };

  /**
   * §133 — Invalid/revoked-key recovery (HTTP 401 / UNAUTHENTICATED):
   * clear the dead credential from local storage, toast the required
   * message, and open Settings so re-verification is one click away.
   * The editor itself never crashes or blocks writing.
   */
  const handleInvalidKey = async (): Promise<void> => {
    await clearAiKeys();
    setCloudReady(false);
    setStatus('idle');
    setStatusDetail('');
    pushToast('error', 'API key expired or invalid. Please re-verify your key.');
    setSettingsOpen(true);
  };

  /** Retry button on the inline server-error alert (§133). */
  const retryLastRun = (): void => {
    setCloudAlert(null);
    void runAssist();
  };

  // ── Accepting diff results back into the manuscript ─────────────────────
  const handleAccept = (result: DiffReviewResult) => {
    if (!editor || !diffState) return;
    editor.commands.setContent(manuscriptTextToHtml(result.acceptedText));
    syncFromEditor(editor);
    setDiffState(null);
    if (result.changedCount === 0) {
      pushToast('info', 'Reviewed — prose was already clean, nothing changed.');
    } else {
      pushToast(
        'success',
        `Applied edits to ${result.acceptedCount} paragraph${result.acceptedCount === 1 ? '' : 's'}.`,
      );
    }
  };

  const busy = status !== 'idle';

  const segBtn = (active: boolean): React.CSSProperties => ({
    padding: '6px 12px',
    fontSize: '11.5px',
    fontWeight: 700,
    border: 'none',
    borderRadius: active ? '7px' : '7px',
    cursor: 'pointer',
    background: active ? 'var(--accent)' : 'transparent',
    color: active ? '#fff' : 'var(--text-secondary)',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    opacity: webGpuOk === false && active ? 0.55 : 1,
  });

  const modeBtn = (m: AssistMode): React.CSSProperties => ({
    padding: '6px 11px',
    fontSize: '11.5px',
    fontWeight: 700,
    border: '1px solid var(--border-color)',
    borderRadius: '999px',
    cursor: 'pointer',
    background: mode === m ? 'rgba(217,119,6,0.14)' : 'transparent',
    color: mode === m ? 'var(--accent)' : 'var(--text-tertiary)',
    borderColor: mode === m ? 'rgba(217,119,6,0.4)' : 'var(--border-color)',
  });

  return (
    <div className="wm-ai-editor" style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <style>{`
        .wm-ai-prose { outline: none; min-height: 420px; font-size: 14.5px; line-height: 1.8; color: var(--text-primary); }
        .wm-ai-prose p { margin: 0 0 1em; }
        .wm-ai-prose h3 { font-size: 17px; font-weight: 800; margin: 0.6em 0 0.5em; color: var(--text-primary); }
        .wm-ai-prose hr { border: none; border-top: 1px dashed var(--border-light); margin: 1.4em auto; width: 40%; }
        .wm-ai-prose:focus { outline: none; }
        .wm-ai-prose p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          color: var(--text-faint);
          pointer-events: none;
          float: left;
          height: 0;
        }
      `}</style>

      {/* Privacy banner (shown until a key is saved) */}
      {showPrivacyBanner && (
        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '11px 14px', borderRadius: '11px', background: 'var(--bg-card)', border: '1px solid rgba(217,119,6,0.35)' }}>
          <Lock size={15} color="var(--accent)" style={{ flexShrink: 0, marginTop: '2px' }} />
          <p style={{ flex: 1, margin: 0, fontSize: '11.5px', lineHeight: 1.55, color: 'var(--text-secondary)' }}>{PRIVACY_NOTICE}</p>
          <button onClick={() => setSettingsOpen(true)} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '7px 12px', borderRadius: '8px', border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 800, fontSize: '11.5px', cursor: 'pointer' }}>
            <Settings size={12} /> Add key
          </button>
          <button aria-label="Dismiss privacy notice" onClick={() => setShowPrivacyBanner(false)} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', padding: '2px' }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        {/* Engine segmented control */}
        <div role="radiogroup" aria-label="AI engine" style={{ display: 'inline-flex', padding: '3px', gap: '2px', borderRadius: '9px', background: 'var(--bg-input)', border: '1px solid var(--border-color)' }}>
          <button role="radio" aria-checked={engineMode === 'local'} onClick={() => (webGpuOk ? setEngineMode('local') : pushToast('error', 'WebGPU is not available in this browser — cloud mode with your own key is the fallback.'))} style={segBtn(engineMode === 'local')} title={webGpuOk === false ? 'WebGPU unavailable' : 'Free, private, runs in your browser'}>
            <Cpu size={12} /> On-device{webGpuOk === false ? ' (n/a)' : ''}
          </button>
          <button role="radio" aria-checked={engineMode === 'cloud'} onClick={() => setEngineMode('cloud')} style={segBtn(engineMode === 'cloud')} title="Uses your own Gemini/Groq key">
            <Cloud size={12} /> Cloud (BYOK){cloudReady ? ' ✓' : ''}
          </button>
        </div>

        {/* Assist mode pills */}
        <div style={{ display: 'inline-flex', gap: '6px' }} role="group" aria-label="Assist focus">
          <button onClick={() => setMode('auto')} style={modeBtn('auto')}>Auto-detect</button>
          <button onClick={() => setMode('polish')} style={modeBtn('polish')}>Polish English</button>
          <button onClick={() => setMode('hinglish')} style={modeBtn('hinglish')}>Hinglish → English</button>
        </div>

        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '11.5px', color: thresholdMet ? '#22c55e' : 'var(--text-tertiary)', fontWeight: 700 }} title={`One full page ≈ ${MIN_POLISH_WORDS}+ words or ${MIN_POLISH_CHARS.toLocaleString()}+ characters`}>
            {thresholdMet
              ? `${stats.words.toLocaleString()} words — page ready for batch AI check`
              : `${stats.words} / ${MIN_POLISH_WORDS} words required for batch AI check`}
          </span>
          <button onClick={() => setSettingsOpen(true)} aria-label="AI settings" style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-secondary)', cursor: 'pointer', padding: '6px', display: 'inline-flex' }}>
            <Settings size={15} />
          </button>
        </span>
      </div>

      {/* Writing surface */}
      <div style={{ position: 'relative', background: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: '13px', padding: '18px 20px' }}>
        {!busy && editor?.isEmpty && (
          <div aria-hidden style={{ position: 'absolute', top: '20px', left: '22px', right: '22px', pointerEvents: 'none', fontSize: '13px', color: 'var(--text-faint)', fontStyle: 'italic', lineHeight: 1.7 }}>
            Start writing your chapter here… or paste a full page (~300 words). Hinglish is welcome — flip on “Hinglish → English” and hit Check &amp; Polish when you have a complete page.
          </div>
        )}
        <EditorContent editor={editor} />
      </div>

      {/* §133 recovery matrix — inline, dismissible, never blocking */}
      {cloudAlert && (
        <div
          role="alert"
          style={{
            display: 'flex', alignItems: 'flex-start', gap: '10px',
            padding: '11px 14px', borderRadius: '11px',
            background: cloudAlert.kind === 'rate_limited' ? 'rgba(234,179,8,0.08)' : 'rgba(239,68,68,0.07)',
            border: `1px solid ${cloudAlert.kind === 'rate_limited' ? 'rgba(234,179,8,0.5)' : 'rgba(239,68,68,0.45)'}`,
          }}
        >
          <CircleAlert size={15} color={cloudAlert.kind === 'rate_limited' ? '#eab308' : '#ef4444'} style={{ flexShrink: 0, marginTop: '2px' }} />
          <p style={{ flex: 1, margin: 0, fontSize: '12px', lineHeight: 1.55, color: 'var(--text-secondary)' }}>{cloudAlert.message}</p>
          {cloudAlert.kind === 'server_error' && (
            <span style={{ display: 'inline-flex', gap: '8px', flexShrink: 0 }}>
              <button
                onClick={retryLastRun}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '7px 12px', borderRadius: '8px', border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 800, fontSize: '11.5px', cursor: 'pointer' }}
              >
                <RefreshCw size={12} /> Retry
              </button>
              {webGpuOk && (
                <button
                  onClick={() => {
                    setCloudAlert(null);
                    setEngineMode('local');
                    pushToast('info', 'Switched to on-device polishing.');
                  }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '7px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '11.5px', cursor: 'pointer' }}
                >
                  <Cpu size={12} /> Run on-device instead
                </button>
              )}
            </span>
          )}
          <button aria-label="Dismiss alert" onClick={() => setCloudAlert(null)} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', padding: '2px', flexShrink: 0 }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* CTA + status bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', padding: '12px 14px', borderRadius: '12px', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <div style={{ position: 'relative' }}>
          <ThresholdPopover open={showThresholdPopover} onClose={() => setShowThresholdPopover(false)} anchorRef={ctaRef} />
          <button
            ref={ctaRef}
            onClick={runAssist}
          disabled={busy}
          title={
            thresholdMet
              ? 'Runs one batched AI pass over this full page'
              : `Unlocks at ${MIN_POLISH_WORDS} words or ${MIN_POLISH_CHARS.toLocaleString()} characters`
          }
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '11px 20px',
            borderRadius: '10px',
            border: 'none',
            background: busy ? 'var(--border-color)' : 'var(--accent)',
            color: '#fff',
            fontWeight: 900,
            fontSize: '13.5px',
            cursor: busy ? 'wait' : thresholdMet ? 'pointer' : 'not-allowed',
            opacity: busy || !thresholdMet ? 0.55 : 1,
            transition: 'opacity .15s ease',
          }}
        >
          {busy ? <LoaderCircle size={15} className="mangal-spin" /> : <Sparkles size={15} />}
          {busy
            ? engineMode === 'local'
              ? 'Polishing on-device…'
              : 'Polishing via your key…'
            : '✨ Check & Polish Page'}
        </button>
        </div>

        <div style={{ minWidth: 0, flex: 1 }}>
          {busy ? (
            <div>
              <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--accent)' }}>{statusDetail}</div>
              {(status === 'preparing' || engineMode === 'local') && (
                <div style={{ marginTop: '6px', height: '4px', borderRadius: '4px', background: 'var(--divider)', overflow: 'hidden' }}>
                  <div className="mangal-spin" style={{ width: '40%', height: '100%', background: 'var(--accent)', borderRadius: '4px', animationDuration: '1.4s' }} />
                </div>
              )}
            </div>
          ) : (
            <span style={{ fontSize: '11.5px', color: 'var(--text-faint)', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <Info size={12} />
              {thresholdMet
                ? `${stats.words.toLocaleString()} words · ${stats.chars.toLocaleString()} chars · ${estimateReadTime(stats.words)} — one click sends ONE batched request (never per keystroke).`
                : `Batching rule: AI runs on explicit clicks over ≥1 page (${MIN_POLISH_WORDS}+ words or ${MIN_POLISH_CHARS.toLocaleString()}+ chars) — never on typing pauses.`}
              {plannedBlocks > 0 && (
                <strong style={{ color: 'var(--accent)' }}>
                  {' '}Long chapter detected — it will be split into ~{plannedBlocks} page-sized blocks automatically.
                </strong>
              )}
            </span>
          )}
        </div>
      </div>

      {/* Toasts */}
      <div aria-live="polite" style={{ position: 'fixed', right: '18px', bottom: '18px', zIndex: 99, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDone={dismissToast} />
        ))}
      </div>

      {/* Modals */}
      <AiSettingsModal
        open={settingsOpen}
        creatorEmail={creatorEmail}
        onClose={() => setSettingsOpen(false)}
        onSaved={() => {
          const meta = loadAiSettingsMeta();
          setCloudReady(meta.hasKey && meta.consentAt !== null);
          // A freshly verified key invalidates any stale failure banner.
          setCloudAlert(null);
        }}
      />
      <DiffReviewModal
        open={diffState !== null}
        originalText={diffState?.original ?? ''}
        polishedText={diffState?.polished ?? ''}
        engineLabel={diffState?.label ?? ''}
        onAccept={handleAccept}
        onDiscard={() => {
          setDiffState(null);
          pushToast('info', 'Discarded — your original text is untouched.');
        }}
      />
    </div>
  );
}





