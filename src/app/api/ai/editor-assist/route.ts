// app/api/ai/editor-assist/route.ts
//
// WebMangal AI Writing & Translation Assistant — cloud fallback proxy.
//
// HYBRID COMPUTE, tier 2: the default assist path is fully on-device
// (WebLLM/WebGPU — see lib/ai/webllmEngine.ts, zero server cost). This
// route exists ONLY as the explicit user-triggered fallback for creators
// whose hardware can't run local models.
//
// BYOK contract (Bring Your Own Key):
//   - The caller supplies their own Gemini AI Studio or Groq API key via
//     the `x-wm-ai-key` request HEADER on every call. This server is a
//     stateless pass-through: the key is read from the header, used once
//     for a single upstream fetch, and then dropped with the request.
//   - Keys are NEVER persisted to disk/database/cache and NEVER logged —
//     log lines carry only byte counts and status codes. There are no
//     WebMangal-owned provider keys anywhere in this codebase, so there
//     is no shared token pool to abuse at 100k+ creators.
//
import { NextRequest, NextResponse } from 'next/server';
import {
  AI_KEY_HEADER,
  AI_PROVIDER_HEADER,
  ASSIST_MODEL_DEFAULTS,
  buildSystemPrompt,
  MAX_ASSIST_CHARS,
  stripModelPreamble,
  type AiProvider,
  type AssistMode,
} from '../../../lib/ai/editorAssist';

const ALLOWED_PROVIDERS: AiProvider[] = ['gemini', 'groq', 'openai'];

interface ProviderCallResult {
  ok: boolean;
  status: number;
  text?: string;
  errorCode?:
    | 'invalid_key'
    | 'rate_limited'
    | 'upstream_error'
    | 'bad_request';
  errorMessage?: string;
}

async function callGemini(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userText: string,
): Promise<ProviderCallResult> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Key goes out on this single upstream request only.
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userText }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 8192 },
        }),
      },
    );
    if (!res.ok) return mapUpstreamFailure('gemini', res);
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    if (!text.trim()) {
      return {
        ok: false,
        status: 502,
        errorCode: 'upstream_error',
        errorMessage: 'Gemini returned an empty response.',
      };
    }
    return { ok: true, status: 200, text: stripModelPreamble(text) };
  } catch {
    return networkFailure();
  }
}

async function callGroq(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userText: string,
): Promise<ProviderCallResult> {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        max_tokens: 8192,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userText },
        ],
      }),
    });
    if (!res.ok) return mapUpstreamFailure('groq', res);
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content ?? '';
    if (!text.trim()) {
      return {
        ok: false,
        status: 502,
        errorCode: 'upstream_error',
        errorMessage: 'Groq returned an empty response.',
      };
    }
    return { ok: true, status: 200, text: stripModelPreamble(text) };
  } catch {
    return networkFailure();
  }
}

async function callOpenAI(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userText: string,
): Promise<ProviderCallResult> {
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        max_tokens: 8192,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userText },
        ],
      }),
    });
    if (!res.ok) return mapUpstreamFailure('openai', res);
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content ?? '';
    if (!text.trim()) {
      return {
        ok: false,
        status: 502,
        errorCode: 'upstream_error',
        errorMessage: 'OpenAI returned an empty response.',
      };
    }
    return { ok: true, status: 200, text: stripModelPreamble(text) };
  } catch {
    return networkFailure();
  }
}

function networkFailure(): ProviderCallResult {
  return {
    ok: false,
    status: 502,
    errorCode: 'upstream_error',
    errorMessage: 'Could not reach the AI provider. Check your connection and try again.',
  };
}

/**
 * §133 zero-token dry-run used by the settings modal's key verification.
 * Lists models with the candidate key — free, fast, and cleanly maps
 * 401 → invalid_key / 429 → rate_limited / network → upstream_error.
 */
async function pingProvider(provider: AiProvider, apiKey: string): Promise<ProviderCallResult> {
  const endpoints: Record<AiProvider, string> = {
    gemini:
      'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1',
    groq: 'https://api.groq.com/openai/v1/models',
    openai: 'https://api.openai.com/v1/models',
  };
  const headers: Record<string, string> =
    provider === 'gemini'
      ? { 'x-goog-api-key': apiKey }
      : { Authorization: `Bearer ${apiKey}` };
  try {
    const res = await fetch(endpoints[provider], { headers, method: 'GET' });
    if (!res.ok) return mapUpstreamFailure(provider, res);
    return { ok: true, status: 200 };
  } catch {
    return networkFailure();
  }
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 1. BYOK headers — required. There is deliberately NO server-side key
  //    fallback: if the creator hasn't supplied their own key, cloud mode
  //    is simply unavailable and they stay on on-device WebLLM.
  const providerHeader = req.headers.get(AI_PROVIDER_HEADER);
  const apiKey = req.headers.get(AI_KEY_HEADER)?.trim();

  if (!providerHeader || !ALLOWED_PROVIDERS.includes(providerHeader as AiProvider)) {
    return NextResponse.json(
      {
        error: 'Unknown AI provider.',
        code: 'bad_request',
      } satisfies { error: string; code: 'bad_request' },
      { status: 400 },
    );
  }
  if (!apiKey) {
    return NextResponse.json(
      {
        error: 'No API key provided. Add your free Gemini/Groq key in AI settings, or use on-device polishing.',
        code: 'missing_key',
      },
      { status: 401 },
    );
  }
  const provider = providerHeader as AiProvider;

  // 2. Payload validation.
  let body: { text?: unknown; mode?: unknown; ping?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.', code: 'bad_request' }, { status: 400 });
  }

  // §133 — zero-token key-verification path (settings modal dry run).
  // Deliberately placed BEFORE text validation: there is no manuscript
  // payload on a ping, just a models-list probe with the caller's own key.
  if (body.ping === true) {
    const ping = await pingProvider(provider, apiKey);
    if (!ping.ok) {
      return NextResponse.json(
        {
          error: ping.errorMessage ?? 'Key verification failed.',
          code: ping.errorCode ?? 'upstream_error',
        },
        { status: ping.status },
      );
    }
    return NextResponse.json({ verified: true, provider });
  }

  const text = typeof body.text === 'string' ? body.text : '';
  if (!text.trim()) {
    return NextResponse.json(
      { error: 'Nothing to polish — the page is empty.', code: 'empty_text' },
      { status: 400 },
    );
  }
  if (text.length > MAX_ASSIST_CHARS) {
    return NextResponse.json(
      {
        error: `Selection too large (${text.length.toLocaleString()} chars). Polish one page at a time (max ${MAX_ASSIST_CHARS.toLocaleString()}).`,
        code: 'payload_too_large',
      },
      { status: 413 },
    );
  }
  const mode: AssistMode =
    body.mode === 'polish' || body.mode === 'hinglish' || body.mode === 'auto'
      ? body.mode
      : 'auto';

  // 3. One stateless upstream call with the caller's own key.
  const model = ASSIST_MODEL_DEFAULTS[provider];
  const systemPrompt = buildSystemPrompt(mode);
  let result: ProviderCallResult;
  if (provider === 'gemini') result = await callGemini(apiKey, model, systemPrompt, text);
  else if (provider === 'groq') result = await callGroq(apiKey, model, systemPrompt, text);
  else result = await callOpenAI(apiKey, model, systemPrompt, text);

  if (!result.ok || result.text === undefined) {
    return NextResponse.json(
      { error: result.errorMessage ?? 'AI request failed.', code: result.errorCode ?? 'upstream_error' },
      { status: result.status },
    );
  }

  console.log(
    `[editor-assist] ok provider=${provider} model=${model} in=${text.length} out=${result.text.length}`,
  );
  return NextResponse.json({ text: result.text, provider, model });
}

/** Translate provider HTTP failures into stable, key-safe client codes. */
async function mapUpstreamFailure(
  provider: AiProvider,
  res: Response,
): Promise<ProviderCallResult> {
  const status = res.status;
  let detail = '';
  try {
    const body = (await res.json()) as { error?: { message?: string } | string };
    detail =
      typeof body.error === 'string' ? body.error : body.error?.message ?? '';
  } catch {
    /* body wasn't JSON — fine */
  }
  // Never echo the key or raw upstream payloads that might contain it.
  console.error(
    `[editor-assist] ${provider} upstream failure: status=${status} bytes=${detail.length}`,
  );
  if (status === 401 || status === 403 || (provider === 'gemini' && status === 400 && /api key/i.test(detail))) {
    return {
      ok: false,
      status: 401,
      errorCode: 'invalid_key',
      errorMessage:
        'Your API key was rejected by the provider. Open AI settings and re-check it.',
    };
  }
  if (status === 429) {
    return {
      ok: false,
      status: 429,
      errorCode: 'rate_limited',
      errorMessage:
        'Your API key hit its rate limit at the provider. Wait a minute, or switch to on-device mode.',
    };
  }
  return {
    ok: false,
    status: 502,
    errorCode: 'upstream_error',
    errorMessage: `The AI provider returned an error (${status}). Try again shortly.`,
  };
}
