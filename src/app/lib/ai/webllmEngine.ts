// app/lib/ai/webllmEngine.ts
//
// WebMangal AI assistant — on-device inference path. CLIENT ONLY.
//
// Hybrid compute architecture, tier 1 (the default when hardware allows):
// the creator's browser runs the model itself via @mlc-ai/web-llm on
// WebGPU. Zero server tokens, zero server cost, zero data leaving the
// device — which is exactly what you want at 100k+ concurrent creators.
//
// Design notes:
//   - The heavy `@mlc-ai/web-llm` module is imported DYNAMICALLY so it is
//     never part of the initial page bundle / SSR graph.
//   - The engine is a lazily-created singleton: model weights (~1–2 GB)
//     download once into the browser's cache and are reused across runs.
//   - Model cascade: try progressively smaller instruct models so weak
//     GPUs still get a workable local option instead of a hard failure.

export interface LocalEngineProgress {
  phase: 'checking' | 'loading' | 'ready' | 'error';
  /** 0–100 where meaningful (weight download / shader compile). */
  percent?: number;
  detail?: string;
}

export function isWebGpuAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

let enginePromise: Promise<LocalEngineHandle> | null = null;

/** Small-but-capable instruction models, best first. All q4f16 MLC builds. */
const MODEL_CASCADE = [
  'Llama-3.2-3B-Instruct-q4f16_1-MLC',
  'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
  'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
];

interface LocalEngineHandle {
  complete: (messages: { role: 'system' | 'user' | 'assistant'; content: string }[]) => Promise<string>;
  modelId: string;
}

type WebLlmModule = typeof import('@mlc-ai/web-llm');

async function loadWebLlmModule(): Promise<WebLlmModule> {
  // One dynamic import point — keeps web-llm (~1 MB JS) out of every other
  // chunk and off the SSR/server bundle entirely.
  return import('@mlc-ai/web-llm');
}

function makeHandle(webllm: WebLlmModule, engine: unknown, modelId: string): LocalEngineHandle {
  const chat = engine as import('@mlc-ai/web-llm').MLCEngineInterface;
  return {
    modelId,
    async complete(messages) {
      const chunks = await chat.chat.completions.create({
        messages,
        temperature: 0.4,
        max_tokens: 4096,
        stream: false,
      });
      return chunks.choices[0]?.message?.content ?? '';
    },
  };
}

/**
 * Get (or boot) the shared on-device engine. First call downloads and
 * compiles model weights; `onProgress` surfaces that to the status bar.
 */
export function getLocalEngine(
  onProgress?: (p: LocalEngineProgress) => void,
): Promise<LocalEngineHandle> {
  if (enginePromise) return enginePromise;

  enginePromise = (async () => {
    if (!isWebGpuAvailable()) {
      throw new Error('WebGPU is not available in this browser.');
    }
    onProgress?.({ phase: 'loading', detail: 'Loading runtime…' });
    const webllm = await loadWebLlmModule();

    let lastError: unknown = null;
    for (const modelId of MODEL_CASCADE) {
      try {
        const engine = await webllm.CreateMLCEngine(modelId, {
          initProgressCallback: (report) => {
            // report.progress is 0..1 across fetch + compile + warmup.
            onProgress?.({
              phase: 'loading',
              percent: Math.round(report.progress * 100),
              detail: report.text,
            });
          },
        });
        onProgress?.({ phase: 'ready', percent: 100, detail: modelId });
        return makeHandle(webllm, engine, modelId);
      } catch (err) {
        lastError = err;
        onProgress?.({
          phase: 'loading',
          detail: `${modelId} unavailable — trying a smaller model…`,
        });
      }
    }
    enginePromise = null; // allow a future retry once storage/GPU recovers
    onProgress?.({
      phase: 'error',
      detail: lastError instanceof Error ? lastError.message : 'Model load failed',
    });
    throw new Error(
      'Could not load an on-device model. Your GPU/browser may be out of memory — try the cloud mode with your own API key instead.',
    );
  })();

  return enginePromise;
}
