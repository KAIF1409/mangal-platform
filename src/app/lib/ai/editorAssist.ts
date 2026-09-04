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
// §144 — 'translate' is the explicit second AI action (English→Hindi /
// Hindi·Hinglish→English, auto-direction). It rides the exact same
// batching/splitting/BYOK pipeline as the polish modes; see CONTEXT.md §143.
export type AssistMode = 'auto' | 'polish' | 'hinglish' | 'translate';

/** Short toolbar labels for each assist mode — single source for every UI. */
export const ASSIST_MODE_LABELS: Record<AssistMode, string> = {
  auto: 'Auto',
  polish: 'Polish',
  hinglish: 'Hinglish→EN',
  translate: 'Translate',
};

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

  // Word-level last resort: a "sentence" (per the punctuation split below)
  // with no internal sentence punctuation at all can itself blow past the
  // budget — e.g. one giant no-period paste. Slice it on raw whitespace so a
  // block never exceeds TARGET_BATCH_CHARS / MAX_BATCH_WORDS. Completed
  // slices go straight to `blocks`; the trailing remainder is returned so
  // the caller can keep combining it with whatever text follows.
  const pushWordSlices = (text: string): string => {
    let wpiece = '';
    for (const word of text.split(/\s+/).filter(Boolean)) {
      if (
        countWords(wpiece) + 1 > MAX_BATCH_WORDS ||
        wpiece.length + word.length + 1 > TARGET_BATCH_CHARS
      ) {
        if (wpiece.trim()) blocks.push(wpiece.trim());
        wpiece = '';
      }
      wpiece += (wpiece ? ' ' : '') + word;
    }
    return wpiece;
  };

  const pushHardSplitParagraph = (paragraph: string) => {
    // Sentence-boundary first pass.
    let piece = '';
    for (const sentence of paragraph.split(/(?<=[.!?…。]["')\]]?)\s+/)) {
      // A single "sentence" that alone exceeds the budget (no punctuation to
      // split on) can't be handled by the piece-accumulation logic below —
      // fall back to word slicing instead of ever emitting an oversized block.
      if (countWords(sentence) > MAX_BATCH_WORDS || sentence.length > TARGET_BATCH_CHARS) {
        if (piece.trim()) blocks.push(piece.trim());
        piece = pushWordSlices(sentence);
        continue;
      }
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

// §144 — translation task block. Only appended for mode='translate': the
// shared HARD RULES above forbid translation, so this block explicitly
// supersedes that rule for translation runs.
const TRANSLATE_INSTRUCTIONS = `TRANSLATION MODE — the "never translate" hard rule above does NOT apply to this run; translation is the explicit task here.

TASK FOCUS
- If the passage is primarily English, translate it into natural, fluent Hindi in Devanagari script.
- If the passage is primarily Hindi or Hinglish (Roman-script Hindi mixed with English), translate it fully into polished, contextual English prose.

TRANSLATION EXAMPLES
Input (English):  The monsoon arrived early that year, flooding the lanes before dawn.
Output (Hindi):   उस साल बरसात जल्दी आ गई थी, भोर होने से पहले ही गलियाँ पानी से भर गईं।
Input (Hinglish): wo ghar ke bahar khadi thi, barish me bhi bina chhata ke.
Output (English): She stood outside the house, out in the rain even without an umbrella.

TRANSLATION RULES
- Preserve every character name, the narrative tone, and the paragraph order exactly.
- Keep MANGAL formatting intact: **bold**, *italic*, "# heading" lines, and "***" scene breaks stay where they are, untranslated.
- Natural, idiomatic output over literal word-for-word translation.
- Return ONLY the translation. No preamble, no transliteration notes, no commentary.`;

const MODE_INSTRUCTIONS: Record<AssistMode, string> = {
  auto: 'First detect whether the passage is primarily code-mixed Hinglish or standard English, then apply the matching treatment.',
  polish:
    'The passage is standard English: focus on grammar, spelling, punctuation, and literary style refinement.',
  hinglish:
    'The passage is Hinglish / Roman-script Hindi mixed with English: convert it fully into polished, contextual English prose as in the example above, preserving names, tone, and paragraph structure.',
  translate:
    'Translate the passage between English and Hindi/Hinglish per the translation task block below — detect the direction first.',
};

export function buildSystemPrompt(mode: AssistMode = 'auto'): string {
  const base = `${SHARED_EDITORIAL_RULES}\n\nTASK FOCUS: ${MODE_INSTRUCTIONS[mode]}`;
  return mode === 'translate' ? `${base}\n\n${TRANSLATE_INSTRUCTIONS}` : base;
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

