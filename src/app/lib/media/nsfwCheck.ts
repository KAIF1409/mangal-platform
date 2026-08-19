// KaTube §6b part 1 — NSFW thumbnail check, server-only.
//
// §88: Re-enabled using Cloudflare Workers AI instead of the old
// NSFWJS + @tensorflow/tfjs + sharp stack (see §87 for why that broke —
// sharp is a native binary, incompatible with the Workers runtime, and
// the bundle blew past the 3 MiB size limit). Workers AI runs in the same
// isolate as the Worker itself — no native deps, no bundle size cost,
// billed per-request instead of shipped in the bundle.
//
// Uses a vision-language model (LLaVA) asked a direct yes/no moderation
// question, since Workers AI's catalog doesn't have a purpose-built NSFW
// classifier the way NSFWJS did — this is a reasonable stand-in, but the
// exact model ID below should be double-checked against Cloudflare's
// current Workers AI model catalog after deploying (dashboard → AI →
// Models), since the catalog changes over time and this was written
// without live access to verify it. If '@cf/llava-hf/llava-1.5-7b-hf'
// has been renamed/removed, swap it here — everything else in this file
// stays the same.
//
// Fail-open design preserved: any error (binding missing in local dev,
// fetch failure, model error) returns null — never blocks an upload.
// Manual admin review remains the backstop regardless.

import { getCloudflareContext } from '@opennextjs/cloudflare';

export interface NsfwCheckResult {
  flagged: boolean;
  topClass: string;
  topProbability: number;
}

interface WorkersAiBinding {
  run(model: string, inputs: Record<string, unknown>): Promise<unknown>;
}

const MODEL_ID = '@cf/llava-hf/llava-1.5-7b-hf';

export async function checkThumbnailNsfw(thumbnailUrl: string | null): Promise<NsfwCheckResult | null> {
  if (!thumbnailUrl) return null;

  try {
    const { env } = getCloudflareContext();
    const ai = (env as unknown as { AI?: WorkersAiBinding }).AI;
    if (!ai) {
      // No AI binding available (e.g. local `next dev` without wrangler) —
      // skip safely rather than throwing.
      return null;
    }

    const imgRes = await fetch(thumbnailUrl);
    if (!imgRes.ok) return null;
    const arrayBuffer = await imgRes.arrayBuffer();
    const imageBytes = [...new Uint8Array(arrayBuffer)];

    const result = (await ai.run(MODEL_ID, {
      image: imageBytes,
      prompt:
        'Does this image contain nudity, pornography, or sexually explicit content? ' +
        'Reply with exactly one word: "yes" or "no".',
      max_tokens: 8,
    })) as { description?: string; response?: string };

    const text = (result?.response ?? result?.description ?? '').trim().toLowerCase();
    const flagged = text.startsWith('yes') || text.includes(' yes');

    return {
      flagged,
      topClass: flagged ? 'Flagged' : 'Neutral',
      // Workers AI's LLaVA output here is a yes/no answer, not a
      // probability — this is a placeholder confidence for the admin
      // review UI, not a real model score.
      topProbability: flagged ? 0.75 : 0.1,
    };
  } catch (err) {
    console.error('NSFW thumbnail check failed (Workers AI), skipping (non-blocking):', err);
    return null;
  }
}
