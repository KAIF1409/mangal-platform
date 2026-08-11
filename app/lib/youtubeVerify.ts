// Server-only helpers for KaTube §6 channel-ownership verification.
// Uses only the YouTube Data API's public read-only endpoints
// (channels.list, videos.list) — no OAuth, no Google app review needed.
// NEVER import this into a 'use client' component — YOUTUBE_API_KEY must
// stay server-side only.

function getApiKey(): string {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    throw new Error(
      'YOUTUBE_API_KEY is not set. Channel verification needs a free YouTube ' +
      'Data API v3 key from Google Cloud Console (APIs & Services > Credentials), ' +
      'with the YouTube Data API v3 enabled for the project. Set it as an env ' +
      'var in Vercel (Project Settings > Environment Variables) and locally in .env.local.'
    );
  }
  return key;
}

interface ResolvedChannel {
  channelId: string;
  title: string;
  description: string;
}

// Accepts a channel URL in any common form (youtube.com/channel/UCxxx,
// youtube.com/@handle, youtube.com/c/name, youtube.com/user/name) or a bare
// @handle. Returns the real channelId + current description, or null if it
// couldn't be resolved.
export async function resolveChannel(input: string): Promise<ResolvedChannel | null> {
  const trimmed = input.trim();
  const apiKey = getApiKey();

  let channelIdGuess: string | null = null;
  let handle: string | null = null;
  let legacyUsername: string | null = null;

  try {
    const url = trimmed.includes('youtube.com') ? new URL(trimmed) : null;
    if (url) {
      const channelMatch = url.pathname.match(/\/channel\/(UC[\w-]{22})/);
      const handleMatch = url.pathname.match(/\/@([\w.-]+)/);
      const userMatch = url.pathname.match(/\/(?:c|user)\/([\w.-]+)/);
      if (channelMatch) channelIdGuess = channelMatch[1];
      else if (handleMatch) handle = handleMatch[1];
      else if (userMatch) legacyUsername = userMatch[1];
    } else if (/^UC[\w-]{22}$/.test(trimmed)) {
      channelIdGuess = trimmed;
    } else {
      // Bare handle, with or without a leading "@"
      handle = trimmed.replace(/^@/, '');
    }
  } catch {
    return null;
  }

  const params = new URLSearchParams({ part: 'snippet', key: apiKey });
  if (channelIdGuess) params.set('id', channelIdGuess);
  else if (handle) params.set('forHandle', handle);
  else if (legacyUsername) params.set('forUsername', legacyUsername);
  else return null;

  const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?${params.toString()}`);
  if (!res.ok) return null;
  const data = await res.json();
  const item = data?.items?.[0];
  if (!item) return null;

  return {
    channelId: item.id,
    title: item.snippet?.title || '',
    description: item.snippet?.description || '',
  };
}

// Re-fetches a known channel's current description, for the verify step.
export async function fetchChannelDescription(channelId: string): Promise<string | null> {
  const apiKey = getApiKey();
  const params = new URLSearchParams({ part: 'snippet', id: channelId, key: apiKey });
  const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?${params.toString()}`);
  if (!res.ok) return null;
  const data = await res.json();
  const item = data?.items?.[0];
  return item?.snippet?.description ?? null;
}

// Per-upload enforcement (§6 step 4) — resolves a video's real owning
// channelId from its public metadata, regardless of who pasted the link.
export async function fetchVideoChannelId(videoId: string): Promise<string | null> {
  const apiKey = getApiKey();
  const params = new URLSearchParams({ part: 'snippet', id: videoId, key: apiKey });
  const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params.toString()}`);
  if (!res.ok) return null;
  const data = await res.json();
  const item = data?.items?.[0];
  return item?.snippet?.channelId ?? null;
}

interface VideoModerationInfo {
  channelId: string;
  // YouTube's own "Altered or Synthetic content" self-disclosure field
  // (status.containsSyntheticMedia, live on the Data API since Oct 30 2024).
  // Self-declared by the uploader on YouTube itself, not verified by
  // YouTube — still the best zero-cost signal available. See §6b.
  containsSyntheticMedia: boolean;
}

// §6b part 2 — same videos.list call as fetchVideoChannelId above, just
// requesting part=snippet,status together so the AI-disclosure check
// costs zero extra API quota over the existing §6 channel check. Use this
// instead of fetchVideoChannelId wherever both checks are needed (i.e. the
// upload route) — fetchVideoChannelId is kept as-is since other callers
// (e.g. future re-verification flows) may only need the channelId.
export async function fetchVideoModerationInfo(videoId: string): Promise<VideoModerationInfo | null> {
  const apiKey = getApiKey();
  const params = new URLSearchParams({ part: 'snippet,status', id: videoId, key: apiKey });
  const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params.toString()}`);
  if (!res.ok) return null;
  const data = await res.json();
  const item = data?.items?.[0];
  if (!item?.snippet?.channelId) return null;
  return {
    channelId: item.snippet.channelId,
    containsSyntheticMedia: item.status?.containsSyntheticMedia === true,
  };
}

export function generateVerificationCode(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return `MANGAL-VERIFY-${code}`;
}
