'use client';

// app/components/editor/useAiAssistEngine.ts
//
// §134 — ONE orchestration brain for the AI Writing Assistant, shared by
// EVERY text-entry surface on the platform (Tiptap studio writer, novel
// chapter textareas, synopsis/author-note/lyrics/book-description fields,
// and any future character-lore or scene-script editor).
//
// Owns: batching thresholds + over-length splitting, hybrid compute lanes
// (on-device WebLLM first, BYOK cloud fallback), the §133 recovery matrix
// (401 wipe-and-reopen-settings / 429 auto-switch-to-local / 5xx retry),
// toast stack, threshold popover state, and the diff-review handoff.
//
// Components render their own surfaces (rich editor vs plain textarea) but
// all delegate every AI decision here — there is exactly one policy.

import { useCallback, useMemo, useRef, useState } from 'react';

import { countWords } from '../../lib/novelEditor';
import {
  AI_KEY_HEADER,
  AI_PROVIDER_HEADER,
  ASSIST_MODE_LABELS,
  buildSystemPrompt,
  MAX_BATCH_WORDS,
  MIN_POLISH_CHARS,
  MIN_POLISH_WORDS,
  meetsBatchThresholdWith,
  splitIntoPageBatches,
  type AssistMode,
  type EditorAssistErrorResponse,
} from '../../lib/ai/editorAssist';
import { clearAiKeys, decryptApiKey, loadAiSettingsMeta } from '../../lib/ai/byokStorage';
import { getLocalEngine, isWebGpuAvailable } from '../../lib/ai/webllmEngine';

export type EngineMode = 'local' | 'cloud';
export type AssistStatus = 'idle' | 'preparing' | 'running';

export interface ToastMsg {
  id: number;
  kind: 'success' | 'error' | 'info';
  text: string;
}

export interface CloudAlert {
  kind: 'rate_limited' | 'server_error';
  message: string;
}

export interface DiffState {
  original: string;
  polished: string;
  label: string;
}

export interface AiAssistEngineOptions {
  /** Current plain text (MANGAL dialect), kept fresh by the component. */
  text: string;
  /** Replace the whole text with an accepted polished version. */
  onApplyText: (next: string) => void;
  /** Batching minimums — omit for platform defaults (300 w / 1500 c). */
  minWords?: number;
  minChars?: number;
  creatorEmail?: string | null;
}

export function useAiAssistEngine({
  text,
  onApplyText,
  minWords = MIN_POLISH_WORDS,
  minChars = MIN_POLISH_CHARS,
  creatorEmail,
}: AiAssistEngineOptions) {
  const [status, setStatus] = useState<AssistStatus>('idle');
  const [statusDetail, setStatusDetail] = useState('');
  const [mode, setMode] = useState<AssistMode>('auto');
  // §144 — mode of the active/most recent run. Drives per-button busy labels
  // now that the toolbar has TWO actions (assistant + AI translation).
  const [runningMode, setRunningMode] = useState<AssistMode | null>(null);
  const [engineMode, setEngineMode] = useState<EngineMode>('local');
  const [webGpuOk, setWebGpuOk] = useState<boolean | null>(null);
  const [cloudReady, setCloudReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const [cloudAlert, setCloudAlert] = useState<CloudAlert | null>(null);
  const [showThresholdPopover, setShowThresholdPopover] = useState(false);
  const [diffState, setDiffState] = useState<DiffState | null>(null);

  const toastId = useRef(0);
  const activeRunRef = useRef(0);
  // §144 — mode used by the last run so "Retry" repeats the SAME action
  // (e.g. a translation) even if the pill selection changed meanwhile.
  const lastRunModeRef = useRef<AssistMode | null>(null);

  const pushToast = useCallback((kind: ToastMsg['kind'], toastText: string) => {
    setToasts((t) => [...t.slice(-3), { id: ++toastId.current, kind, text: toastText }]);
  }, []);
  const dismissToast = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const probeEnvironment = useCallback(() => {
    setWebGpuOk(isWebGpuAvailable());
    const meta = loadAiSettingsMeta();
    setCloudReady(meta.hasKey && meta.consentAt !== null);
    if (!isWebGpuAvailable()) setEngineMode('cloud');
  }, []);

  const wordCount = useMemo(() => countWords(text), [text]);
  const charCount = useMemo(() => text.length, [text]);
  const thresholdMet = wordCount >= minWords || charCount >= minChars;
  const plannedBlocks =
    wordCount > MAX_BATCH_WORDS ? Math.max(2, Math.ceil(wordCount / MAX_BATCH_WORDS)) : 0;

  /** §133 — 401 recovery: wipe credential, toast, open Settings. */
  const handleInvalidKey = useCallback(async (): Promise<void> => {
    await clearAiKeys();
    setCloudReady(false);
    setStatus('idle');
    setRunningMode(null);
    setStatusDetail('');
    pushToast('error', 'API key expired or invalid. Please re-verify your key.');
    setSettingsOpen(true);
  }, [pushToast]);

  /**
   * The ONE explicit assist trigger — shared by every surface.
   * §144: `modeOverride` lets a dedicated action button (e.g. AI
   * Translation) force a mode for this run without touching the pill
   * selection. Batching policy is mode-independent by design.
   */
  const runAssist = useCallback(async (modeOverride?: AssistMode): Promise<void> => {
    if (status !== 'idle') return;
    const activeMode: AssistMode = modeOverride ?? mode;
    lastRunModeRef.current = activeMode;
    setRunningMode(activeMode);
    const verb = activeMode === 'translate' ? 'translating' : 'polishing';
    const Verb = activeMode === 'translate' ? 'Translating' : 'Polishing';
    const plainText = text;

    if (!meetsBatchThresholdWith(plainText, minWords, minChars)) {
      setShowThresholdPopover(true);
      setRunningMode(null);
      return;
    }

    const runId = ++activeRunRef.current;
    setCloudAlert(null);

    try {
      const polishedParts: string[] = [];
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
        for (let i = 0; i < batches.length; i++) {
          setStatus('running');
          setStatusDetail(
            batches.length > 1
              ? `✨ On-device ${verb} block ${i + 1} of ${batches.length}…`
              : `✨ WebMangal AI ${verb} full page (on-device)…`,
          );
          const out = await engine.complete([
            { role: 'system', content: buildSystemPrompt(activeMode) },
            { role: 'user', content: batches[i] },
          ]);
          if (runId !== activeRunRef.current) return;
          polishedParts.push(out.trim());
        }
        label = `On-device · ${engine.modelId}`;
      } else {
        // ── Cloud (BYOK) lane ────────────────────────────────────────────
        const meta = loadAiSettingsMeta();
        const providerName =
          meta.provider === 'groq' ? 'Groq' : meta.provider === 'openai' ? 'OpenAI' : 'Gemini';
        if (!meta.hasKey || meta.consentAt === null) {
          pushToast(
            'error',
            'Cloud mode needs your own free API key and consent. Open AI settings to add one — or switch to on-device polishing.',
          );
          setSettingsOpen(true);
          setRunningMode(null);
          return;
        }
        const apiKey = await decryptApiKey();
        if (!apiKey) {
          await handleInvalidKey();
          return;
        }

        const batches = splitIntoPageBatches(plainText);
        for (let i = 0; i < batches.length; i++) {
          setStatus('running');
          setStatusDetail(
            batches.length > 1
              ? `✨ ${Verb} block ${i + 1} of ${batches.length} via ${providerName} (your key)…`
              : `✨ WebMangal AI ${verb} full page via ${providerName} (your key)…`,
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
              body: JSON.stringify({ text: batches[i], mode: activeMode }),
            });
            data = (await res.json().catch(() => null)) as
              | { text?: string; model?: string }
              | EditorAssistErrorResponse
              | null;
            if (res.ok && data && 'text' in data && data.text) {
              if (runId !== activeRunRef.current) return;
              polishedParts.push(data.text);
              continue;
            }
          } catch {
            data = { error: 'Network error.', code: 'upstream_error' };
          }
          if (runId !== activeRunRef.current) return;
          const errCode = (data as EditorAssistErrorResponse | null)?.code ?? 'upstream_error';

          // ── §133 Recovery Matrix ─────────────────────────────────────
          if (errCode === 'invalid_key') {
            await handleInvalidKey();
            return;
          }
          setStatus('idle');
          setRunningMode(null);
          setStatusDetail('');
          if (errCode === 'rate_limited') {
            setCloudAlert({
              kind: 'rate_limited',
              message:
                'API Rate Limit reached for your key. Switching automatically to local WebLLM or try again in a few moments.',
            });
            if (isWebGpuAvailable()) {
              setEngineMode('local');
              pushToast('info', 'Switched to on-device polishing — press Check & Polish again to continue locally.');
            } else {
              pushToast('error', 'Rate limited right now, and this browser has no WebGPU. Try again in a few moments.');
            }
            return;
          }
          setCloudAlert({
            kind: 'server_error',
            message:
              (data as EditorAssistErrorResponse | null)?.error ||
              'The AI provider could not process this text right now.',
          });
          return;
        }
        label = `${providerName} · ${ASSIST_MODE_LABELS[activeMode]}`;
      }

      const polished = polishedParts.join('\n\n');
      if (!polished.trim()) throw new Error('Empty response from the model.');

      setStatus('idle');
      setRunningMode(null);
      setStatusDetail('');
      setDiffState({ original: plainText, polished, label });
    } catch (err) {
      setStatus('idle');
      setRunningMode(null);
      setStatusDetail('');
      pushToast(
        'error',
        err instanceof Error ? err.message : 'Something went wrong while polishing. Please try again.',
      );
    }
  }, [text, status, engineMode, mode, minWords, minChars, pushToast, handleInvalidKey]);

  /** Diff accept → hand the approved text back to the owning component. */
  const acceptPolishedText = useCallback(
    (result: { acceptedText: string; acceptedCount: number; changedCount: number }) => {
      onApplyText(result.acceptedText);
      setDiffState(null);
      if (result.changedCount === 0) {
        pushToast('info', 'Reviewed — text was already clean, nothing changed.');
      } else {
        pushToast(
          'success',
          `Applied edits to ${result.acceptedCount} paragraph${result.acceptedCount === 1 ? '' : 's'}.`,
        );
      }
    },
    [onApplyText, pushToast],
  );

  const dismissDiff = useCallback(() => {
    setDiffState(null);
    pushToast('info', 'Discarded — your original text is untouched.');
  }, [pushToast]);

  const retryAfterServerAlert = useCallback(() => {
    setCloudAlert(null);
    // §144 — repeat the SAME action that failed (translation stays translation).
    void runAssist(lastRunModeRef.current ?? undefined);
  }, [runAssist]);

  const switchToLocalEngine = useCallback(() => {
    setCloudAlert(null);
    setEngineMode('local');
    pushToast('info', 'Switched to on-device polishing.');
  }, [pushToast]);

  return {
    // state
    status,
    statusDetail,
    busy: status !== 'idle',
    mode,
    setMode,
    runningMode,
    engineMode,
    setEngineMode,
    webGpuOk,
    cloudReady,
    settingsOpen,
    openSettings: useCallback(() => setSettingsOpen(true), []),
    closeSettings: useCallback(() => setSettingsOpen(false), []),
    toasts,
    pushToast,
    dismissToast,
    cloudAlert,
    dismissCloudAlert: useCallback(() => setCloudAlert(null), []),
    showThresholdPopover,
    closeThresholdPopover: useCallback(() => setShowThresholdPopover(false), []),
    diffState,
    // derived
    wordCount,
    charCount,
    thresholdMet,
    plannedBlocks,
    minWords,
    minChars,
    creatorEmail,
    // actions
    runAssist,
    acceptPolishedText,
    dismissDiff,
    retryAfterServerAlert,
    switchToLocalEngine,
    probeEnvironment,
  };
}

export type AiAssistEngine = ReturnType<typeof useAiAssistEngine>;


