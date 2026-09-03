import { describe, expect, it } from 'vitest';
import {
  AI_KEY_HEADER,
  AI_PROVIDER_HEADER,
  ASSIST_MODE_LABELS,
  MAX_ASSIST_CHARS,
  MIN_POLISH_CHARS,
  MIN_POLISH_WORDS,
  buildSystemPrompt,
  meetsBatchThreshold,
  meetsBatchThresholdWith,
  splitIntoPageBatches,
  stripModelPreamble,
} from '@/app/lib/ai/editorAssist';

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');

describe('batching thresholds — the AI-assist cost control', () => {
  it('does NOT arm below one full page (300 words AND 1500 chars)', () => {
    expect(meetsBatchThreshold('too short')).toBe(false);
    expect(meetsBatchThreshold(words(299))).toBe(false);
  });

  it('arms at exactly 300 words (words bar)', () => {
    expect(meetsBatchThreshold(words(300))).toBe(true);
  });

  it('arms via the character bar even when word count is low', () => {
    // One "word" of 1500+ chars: word bar fails, char bar passes.
    expect(meetsBatchThreshold('x'.repeat(1500))).toBe(true);
  });

  it('supports smaller per-feature bars (§134 metadata fields)', () => {
    expect(meetsBatchThresholdWith('short', 10, 500)).toBe(false);
    expect(meetsBatchThresholdWith(words(10), 10, 500)).toBe(true);
  });

  it('keeps the transport cap safely above the target batch size', () => {
    // The client splitter targets ≤22,000 chars so no single block can
    // trip the 24,000-char server cap.
    expect(MIN_POLISH_WORDS).toBe(300);
    expect(MIN_POLISH_CHARS).toBe(1500);
    expect(MAX_ASSIST_CHARS).toBe(24000);
  });
});

describe('splitIntoPageBatches — §133 over-length splitter', () => {
  it('returns [] for empty input', () => {
    expect(splitIntoPageBatches('')).toEqual([]);
    expect(splitIntoPageBatches('   \n\n  ')).toEqual([]);
  });

  it('returns one block for a normal-sized manuscript', () => {
    expect(splitIntoPageBatches(words(500))).toHaveLength(1);
  });

  it('splits ONLY on paragraph boundaries and never exceeds the word budget', () => {
    // 12 paragraphs of 700 words each → each block must stay ≤4000 words,
    // so no block can contain more than 5 paragraphs.
    const paragraphs = Array.from({ length: 12 }, (_, i) => `p${i} ${words(700)}`);
    const blocks = splitIntoPageBatches(paragraphs.join('\n\n'));
    expect(blocks.length).toBeGreaterThan(1);
    for (const block of blocks) {
      expect(block.split(/\s+/).length).toBeLessThanOrEqual(4000);
    }
    // Paragraphs are preserved intact — a paragraph's opening marker and
    // its content must never land in different blocks.
    expect(blocks.join('\n\n')).toContain('p0 ');
    expect(blocks.join('\n\n')).toContain('p11 ');
  });

  it('hard-splits an oversized multi-sentence paragraph by sentence', () => {
    // 600 sentences × 8 words = 4,800 words — over the 4,000-word budget.
    const sentences = Array.from({ length: 600 }, () => 'the danger grew steadily worse every single hour.').join(' ');
    const blocks = splitIntoPageBatches(sentences);
    expect(blocks.length).toBeGreaterThan(1);
    for (const block of blocks) {
      expect(block.split(/\s+/).length).toBeLessThanOrEqual(4000);
    }
  });

  it('documents DEFECT-02: an unpunctuated blob is NOT word-sliced', () => {
    // The module comment promises a "raw word slices" fallback for a monster
    // paragraph with no sentence-ending punctuation; the implementation only
    // splits on sentences, so one giant "sentence" passes through unsliced
    // and can exceed the batch budget (see docs/QA_REPORT.md, DEFECT-02).
    // Pinned deliberately — fixing the fallback should flip this test.
    const monster = `${words(6000)}.`;
    const blocks = splitIntoPageBatches(monster);
    expect(blocks).toHaveLength(1);
  });
});

describe('buildSystemPrompt — editorial prompt construction', () => {
  it('always carries the shared editorial rules', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain("WebMangal's editorial assistant");
    expect(prompt).toContain('HARD RULES');
  });

  it('adds the translation block ONLY for the translate mode', () => {
    expect(buildSystemPrompt('translate')).toContain('TRANSLATION MODE');
    expect(buildSystemPrompt('polish')).not.toContain('TRANSLATION MODE');
    expect(buildSystemPrompt('hinglish')).not.toContain('TRANSLATION MODE');
  });

  it('has per-mode task focus', () => {
    expect(buildSystemPrompt('polish')).toContain('standard English');
    expect(buildSystemPrompt('hinglish')).toContain('Hinglish');
  });

  it('exposes the BYOK header names the route depends on', () => {
    expect(AI_PROVIDER_HEADER).toBe('x-wm-ai-provider');
    expect(AI_KEY_HEADER).toBe('x-wm-ai-key');
  });

  it('labels every assist mode', () => {
    expect(ASSIST_MODE_LABELS).toEqual({
      auto: 'Auto',
      polish: 'Polish',
      hinglish: 'Hinglish→EN',
      translate: 'Translate',
    });
  });
});

describe('stripModelPreamble — model chatter removal', () => {
  it('removes a leading "Here is..." chatter line', () => {
    const raw = 'Here is the polished version:\n\nThe actual prose begins here.';
    expect(stripModelPreamble(raw)).toBe('The actual prose begins here.');
  });

  it('removes a "Sure —" style line', () => {
    const raw = 'Sure — here you go:\nClean output text.';
    expect(stripModelPreamble(raw)).toBe('Clean output text.');
  });

  it('removes long wrapping quotes around the whole answer', () => {
    const inner = 'x'.repeat(80);
    expect(stripModelPreamble(`"${inner}"`)).toBe(inner);
  });

  it('leaves genuine prose untouched', () => {
    const prose = 'Abhi sensed the danger that day, but he did not yet understand it.';
    expect(stripModelPreamble(prose)).toBe(prose);
  });

  it('does NOT strip a short first line that is real content', () => {
    // A first line ending with a dash but NOT starting with chatter words
    // must survive (e.g. dialogue).
    const prose = 'Riya said—\nthen fell silent.';
    expect(stripModelPreamble(prose)).toBe(prose);
  });
});
