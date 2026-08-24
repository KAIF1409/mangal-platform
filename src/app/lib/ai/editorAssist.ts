// app/lib/ai/editorAssist.ts
//
// WebMangal AI Writing & Translation Assistant — shared core.
//
// This module is deliberately provider-agnostic and isomorphic (importable
// from both client components and the /api/ai/editor-assist route handler).
// It owns three things:
//
//   1. THRESHOLD-BASED BATCHING POLICY — the single most important cost
//      control for this feature. The AI assist action is NEVER triggered by
//      keystrokes or short typing pauses. It only arms once the creator has
//      written at least one full page (~300 words OR 1,500+ characters) and
//      then explicitly clicks "Check & Polish". At 100k+ creators this keeps
//      request volume ~95% below a naive per-paragraph autosuggest design,
//      and each allowed request is large enough to be worth its token cost.
//
//   2. THE EDITORIAL SYSTEM PROMPT — fiction-publishing-tailored grammar /
//      style correction plus Hinglish (Roman-script Hindi + English
//      code-mix) → polished English prose conversion, preserving character
//      names, tone, paragraph order and MANGAL's tiny formatting dialect
//      (**bold**, *italic*, "# heading", "***" scene break).
//
//   3. SHARED TYPES + response post-processing (stripping chatty model
//      preambles like "Here is the corrected version:") used by BOTH the
//      cloud proxy route and the on-device WebLLM path.

import { countWords } from '../novelEditor';

// ── Batching thresholds ────────────────────────────────────────────────────
// One full manuscript page ≈ 300–500 words ≈ 1,500+ characters. Either bar
// being met unlocks the batch assist action; below both, the UI explains
// what is missing instead of firing tiny, expensive requests.
export const MIN_POLISH_WORDS = 300;
export const MIN_POLISH_CHARS = 1500;

// Hard transport cap — a page or two of prose, never a whole book. Keeps a
// runaway paste from torching anyone's token budget (ours or the creator's).
// The client-side splitter targets slightly UNDER this so no single chunk
// can ever trip it.
export const MAX_ASSIST_CHARS = 24000;

// §133 over-length splitter: anything beyond ~4,000 words (a long chapter)
// is automatically divided into page-sized blocks before any request is
// made, so models never truncate mid-story and each block still clears the
// batching minimum.
export const MAX_BATCH_WORDS = 4000;
export const TARGET_BATCH_CHARS = 22000;

export type AiProvider = 'gemini' | 'groq' | 'openai';
export type AssistMode = 'auto' | 'polish' | 'hinglish';

// Keys travel per-request only, via headers, over TLS, and are discarded the
// moment the upstream call finishes — they are never written to disk, logs,
// or any database on the WebMangal side. See byokStorage.ts for how they sit
// encrypted-at-rest in the creator's own browser between uses.
export const AI_PROVIDER_HEADER = 'x-wm-ai-provider';
export const AI_KEY_HEADER = 'x-wm-ai-key';

export interface EditorAssistRequestBody {
  text: string;
  mode?: AssistMode;
}

export interface EditorAssistSuccessResponse {
  text: string;
  provider: AiProvider | 'local';
  model: string;
}

export interface EditorAssistErrorResponse {
  error: string;
  code:
    | 'missing_key'
    | 'invalid_key'
    | 'rate_limited'
    | 'payload_too_large'
    | 'empty_text'
    | 'upstream_error'
    | 'bad_request';
}

/** True when `text` clears at least one full-page batching bar. */
export function meetsBatchThreshold(text: string): boolean {
  return countWords(text) >= MIN_POLISH_WORDS || text.trim().length >= MIN_POLISH_CHARS;
}

/** §134 — per-feature variant: metadata fields use smaller (still batched) bars. */
export function meetsBatchThresholdWith(
  text: string,
  minWords: number = MIN_POLISH_WORDS,
  minChars: number = MIN_POLISH_CHARS,
): boolean {
  return countWords(text) >= minWords || text.trim().length >= minChars;
}

/**
 * §133 over-length splitter. Divides a manuscript into page-sized blocks so
 * no single request approaches token truncation:
 *   - splits ONLY on paragraph boundaries (blank lines) — story beats are
 *     never severed mid-paragraph;
 *   - honors both budgets: ≤ MAX_BATCH_WORDS words AND ≤ TARGET_BATCH_CHARS
 *     characters per block (chars budget keeps every block safely under the
 *      server's MAX_ASSIST_CHARS transport cap);
 *   - a single monster paragraph (rare) is hard-split by sentence, falling
 *     back to raw word slices, so one giant blob can never wedge the loop.
 */
export function splitIntoPageBatches(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const paragraphs = trimmed.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const blocks: string[] = [];
  let current: string[] = [];
  let currentWords = 0;
  let currentChars = 0;

  const flush = () => {
    if (current.length > 0) {
      blocks.push(current.join('\n\n'));
      current = [];
      currentWords = 0;
      currentChars = 0;
    }
  };

  const pushHardSplitParagraph = (paragraph: string) => {
    // Sentence-boundary first pass.
    let piece = '';
    for (const sentence of paragraph.split(/(?<=[.!?…。]["')\]]?)\s+/)) {
      if (
        currentWords + countWords(piece) + countWords(sentence) > MAX_BATCH_WORDS ||
        currentChars + piece.length + sentence.length + 1 > TARGET_BATCH_CHARS
      ) {
        flush();
      }
      if (
        countWords(piece) + countWords(sentence) > MAX_BATCH_WORDS ||
        piece.length + sentence.length + 1 > TARGET_BATCH_CHARS
      ) {
        if (piece.trim()) blocks.push(piece.trim());
        piece = '';
      }
      piece += (piece ? ' ' : '') + sentence;
    }
    if (piece.trim()) {
      if (
        currentWords + countWords(piece) > MAX_BATCH_WORDS ||
        currentChars + piece.length + 2 > TARGET_BATCH_CHARS
      ) {
        flush();
      }
      current.push(piece.trim());
      currentWords += countWords(piece);
      currentChars += piece.length;
    }
  };

  for (const paragraph of paragraphs) {
    const w = countWords(paragraph);
    const c = paragraph.length;

    if (w > MAX_BATCH_WORDS || c > TARGET_BATCH_CHARS) {
      flush(); // close the open block before an oversized paragraph
      pushHardSplitParagraph(paragraph);
      continue;
    }
    if (currentWords + w > MAX_BATCH_WORDS || currentChars + c + 2 > TARGET_BATCH_CHARS) {
      flush();
    }
    current.push(paragraph);
    currentWords += w;
    currentChars += c + 2; // + blank-line joiner
  }
  flush();

  return blocks;
}

// ── Prompt construction ────────────────────────────────────────────────────

const SHARED_EDITORIAL_RULES = `You are WebMangal's editorial assistant for Indian web-novel, book, and story-script creators.

WHAT TO DO
- Fix grammar, spelling, punctuation, tense agreement, and awkward phrasing.
- Lightly improve literary flow and readability while keeping the author's voice.
- If the input mixes Roman-script Hindi with English (Hinglish / code-mixed), rewrite it as natural, engaging English prose that reads professionally for a global audience. Translate meaning, not word-for-word.
- Preserve every character name exactly (e.g. "Abhi", "Riya"). Preserve proper nouns, invented terms, and story facts.
- Preserve tone: if it is menacing stay menacing; if playful stay playful. Do not sanitize violence/romance intensity; polish it.
- Keep the same number of paragraphs, in the same order, separated by blank lines.
- The input may contain MANGAL formatting markers. Preserve them where present:
    **text** = bold        *text* = italic
    a line starting with "# " = soft heading
    a lone line "***" = scene break

HINGLISH EXAMPLE
Input:  abhi ne us deen us khatre ko meehsoos karta hi magar samaj nahi gaya wo abhi shayad
Output: Abhi sensed the danger that day, but perhaps he didn't quite understand it yet.

HARD RULES
- Return ONLY the finished prose. No preamble ("Here is..."), no explanations, no quotes around the output, no commentary, no questions.
- Never answer, continue, summarize, translate into Hindi, or roleplay the story content.
- If a passage is already clean, keep it almost unchanged rather than inventing edits.`;

const MODE_INSTRUCTIONS: Record<AssistMode, string> = {
  auto: 'First detect whether the passage is primarily code-mixed Hinglish or standard English, then apply the matching treatment.',
  polish:
    'The passage is standard English: focus on grammar, spelling, punctuation, and literary style refinement.',
  hinglish:
    'The passage is Hinglish / Roman-script Hindi mixed with English: convert it fully into polished, contextual English prose as in the example above, preserving names, tone, and paragraph structure.',
};

export function buildSystemPrompt(mode: AssistMode = 'auto'): string {
  return `${SHARED_EDITORIAL_RULES}\n\nTASK FOCUS: ${MODE_INSTRUCTIONS[mode]}`;
}

/**
 * Models occasionally ignore the "no preamble" rule. Strip the common
 * conversational wrappers so the diff view shows pure prose.
 */
export function stripModelPreamble(raw: string): string {
  let text = raw.trim();
  // Remove wrapping quotes some models add around the whole answer.
  if (
    (text.startsWith('"') && text.endsWith('"') && text.length > 60) ||
    (text.startsWith('“') && text.endsWith('”') && text.length > 60)
  ) {
    text = text.slice(1, -1).trim();
  }
  // Drop a single leading chatter line ("Here is the polished version:" etc.)
  // only when a clear colon/dash ends the first line and more prose follows.
  const firstBreak = text.indexOf('\n');
  const firstLine = (firstBreak === -1 ? text : text.slice(0, firstBreak)).trim();
  if (
    firstBreak !== -1 &&
    firstLine.length < 120 &&
    /[:(—-]$/.test(firstLine) &&
    /^(here|sure|certainly|below|corrected|polished|translated|revised|output|result)/i.test(
      firstLine,
    )
  ) {
    text = text.slice(firstBreak + 1).trim();
  }
  return text.trim();
}

export const ASSIST_MODEL_DEFAULTS: Record<AiProvider, string> = {
  // Free-tier friendly picks (as of 2026): Gemini 2.0 Flash-Lite has a
  // generous free quota via AI Studio keys; Groq's Llama 3.3 70B is free
  // and fast; OpenAI's gpt-4o-mini is the cheapest tier with solid
  // multilingual prose quality. These are shipped defaults — the route
  // accepts an optional model override header so creators can swap models
  // without code changes.
  gemini: 'gemini-2.0-flash-lite',
  groq: 'llama-3.3-70b-versatile',
  openai: 'gpt-4o-mini',
};

export const PROVIDER_LABELS: Record<AiProvider, string> = {
  gemini: 'Google Gemini (AI Studio key)',
  groq: 'Groq (Cloud console key)',
  openai: 'OpenAI (Platform API key)',
};

/**
 * Deep links to each provider's key portal + the human-readable name used
 * in the SSO-alignment notice ("...when redirected to Google AI Studio...").
 */
export const PROVIDER_PORTALS: Record<AiProvider, { url: string; name: string }> = {
  gemini: { url: 'https://aistudio.google.com/app/apikey', name: 'Google AI Studio' },
  groq: { url: 'https://console.groq.com/keys', name: 'Groq Console' },
  openai: { url: 'https://platform.openai.com/api-keys', name: 'the OpenAI Platform' },
};

