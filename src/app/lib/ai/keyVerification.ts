// app/lib/ai/keyVerification.ts
//
// WebMangal AI assistant — strict API-key health-check pipeline. CLIENT ONLY.
//
// §133 contract: a pasted key is NEVER saved to the encrypted vault until it
// passes two gates, in order:
//   1. FORMAT GATE (instant, offline) — provider-specific prefix/shape
//      validation. A malformed key, or a key that clearly belongs to a
//      DIFFERENT provider (e.g. a gsk_… Groq key pasted while Gemini is
//      selected), is rejected immediately with
//      "Invalid Key Format for selected provider."
//   2. DRY-RUN GATE (network, zero tokens) — a minimal authenticated call
//      (provider models-list) proxied through our own /api/ai/editor-assist
//      with `ping: true`, so the browser CSP never needs provider origins
//      and the failure mapping stays identical to real assist calls.
//
// Results map onto the settings UI badges:
//   🟢 Verified & Ready · 🔴 Authentication Failed · 🟡 Rate Limited

import {
  AI_KEY_HEADER,
  AI_PROVIDER_HEADER,
  type AiProvider,
} from './editorAssist';

export type KeyStatus =
  | 'idle' // nothing to verify yet
  | 'verifying' // dry-run in flight
  | 'verified' // 🟢 format + live check passed
  | 'invalid_format' // ⚠️ failed gate 1
  | 'auth_failed' // 🔴 provider rejected the credential
  | 'rate_limited' // 🟡 credential OK but throttled/quota'd right now
  | 'network_error'; // could not reach the checker — retryable

export interface KeyVerification {
  status: KeyStatus;
  message: string;
}

export const FORMAT_REJECTION = 'Invalid Key Format for selected provider.';

const FORMAT_RULES: Record<AiProvider, RegExp> = {
  // Google AI Studio keys: AIzaSy… (~39 chars total).
  gemini: /^AIzaSy[A-Za-z0-9_-]{30,42}$/,
  // Groq Cloud keys: gsk_…
  groq: /^gsk_[A-Za-z0-9]{20,}$/,
  // OpenAI Platform keys: sk-… and newer sk-proj-… forms.
  openai: /^sk-[A-Za-z0-9_-]{20,}$/,
};

/**
 * Which provider a raw key LOOKS like it belongs to, if any. Powers the
 * "this is actually an X key" wrong-platform hint.
 */
export function detectProviderFromKey(key: string): AiProvider | null {
  if (/^AIzaSy/.test(key)) return 'gemini';
  if (/^gsk_/.test(key)) return 'groq';
  if (/^sk-/.test(key)) return 'openai';
  return null;
}

/** Offline gate 1 — prefix/shape check for the SELECTED provider. */
export function validateApiKeyFormat(key: string, provider: AiProvider): boolean {
  return FORMAT_RULES[provider].test(key.trim());
}

/** Map a proxy error code onto badge state. */
function statusFromCode(
  code: string | undefined,
): Extract<KeyStatus, 'auth_failed' | 'rate_limited' | 'network_error'> {
  switch (code) {
    case 'invalid_key':
      return 'auth_failed';
    case 'rate_limited':
      return 'rate_limited';
    default:
      return 'network_error';
  }
}

/**
 * Full pipeline: gates 1 → 2. Resolves with a badge-ready result and NEVER
 * throws (network hiccups degrade to `network_error`, not exceptions), so
 * callers can render state instead of crashing the editor.
 *
 * `signal` lets callers cancel an in-flight dry run (modal closed, provider
 * switched, key edited again) without orphaned fetches or late setState.
 */
export async function verifyApiKey(
  key: string,
  provider: AiProvider,
  signal?: AbortSignal,
): Promise<KeyVerification> {
  if (signal?.aborted) {
    return { status: 'idle', message: '' };
  }
  const trimmed = key.trim();

  // ── Gate 1: format ──────────────────────────────────────────────────────
  if (!validateApiKeyFormat(trimmed, provider)) {
    const looksLike = detectProviderFromKey(trimmed);
    const detail =
      looksLike && looksLike !== provider
        ? ` This looks like a ${looksLike === 'gemini' ? 'Google Gemini' : looksLike === 'groq' ? 'Groq' : 'OpenAI'} key — switch the provider selector above.`
        : '';
    return { status: 'invalid_format', message: `${FORMAT_REJECTION}${detail}` };
  }

  // ── Gate 2: zero-token dry run through our proxy ────────────────────────
  try {
    const res = await fetch('/api/ai/editor-assist', {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        [AI_PROVIDER_HEADER]: provider,
        [AI_KEY_HEADER]: trimmed,
      },
      body: JSON.stringify({ ping: true }),
    });
    if (signal?.aborted) return { status: 'idle', message: '' };
    const data = (await res.json().catch(() => null)) as
      | { verified?: boolean }
      | { error?: string; code?: string }
      | null;

    if (res.ok && data && 'verified' in data && data.verified) {
      return { status: 'verified', message: 'Key verified with the provider.' };
    }
    const code = (data as { code?: string } | null)?.code;
    const status =
      res.status === 401 || res.status === 403 ? ('auth_failed' as const) : statusFromCode(code);
    return {
      status,
      message:
        status === 'auth_failed'
          ? 'The provider rejected this key. Double-check you copied the full key.'
          : status === 'rate_limited'
            ? 'Key is valid but rate-limited right now — try saving again in a moment.'
            : 'Could not reach the provider to verify. Check your connection and retry.',
    };
  } catch {
    return { status: 'network_error', message: 'Network error during verification. Retry.' };
  }
}
