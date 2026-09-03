// app/lib/ai/guideKnowledge.ts
//
// §150 — MANGAL Assistant (floating chatbot), Guide & Help mode.
//
// STATIC, GROUNDED KNOWLEDGE BASE — the entire Guide-mode "brain". Guide
// mode runs 100% client-side from this file: no network call, no LLM, no
// server cost at ANY concurrency level (see §150 concurrency notes).
//
// GROUNDING RULE (§145/§147): every entry below is derived from the
// per-platform shipped-features audit — src/app/about/FeaturesSection.tsx
// (copy verified against real routes/tables in §145, extended §147) — or
// from §147's explicit NOT-built blacklist. Nothing here claims an
// unbuilt feature:
//   - NO "Nova" AI assistant (dashboard/nova is a 'coming soon' shell).
//   - NO KaTube "Live" streaming ("Live" is a studio tab label only).
//   - NO K Circle servers/roles (broadcast channels + DMs/groups only).
//   - NO chapter-synced audio / song audio uploads (lyric sheets only).

export type ChatPlatformContext = 'official' | 'webmangal' | 'katube' | 'kcircle';

export interface GuideEntry {
  id: string;
  /** Lowercase phrases; matched as whole-word substrings of the message. */
  keywords: string[];
  /** Canonical question phrasing (screen-reader / chip label). */
  question: string;
  /** The answer. Grounded in FeaturesSection.tsx (§145/§147) copy only. */
  answer: string;
  /** Optional deep link surfaced as a chip under the answer. */
  link?: { href: string; label: string };
}

export const GUIDE_ENTRIES: GuideEntry[] = [
  // ── MANGAL (the company / ecosystem) ───────────────────────────────────
  {
    id: 'what-is-mangal',
    keywords: ['what is mangal', 'what is this platform', 'about mangal', 'what does mangal do', 'mangal platform'],
    question: 'What is MANGAL?',
    answer:
      'MANGAL is India\'s platform for reading and publishing manga, comics and web novels — free to read, free to publish, with creators keeping a 0% platform cut. One account spans all three products: WebMangal (comics, novels, books and songs), KaTube (short and long-form video) and K Circle (the community layer).',
    link: { href: '/about', label: 'Read more on /about' },
  },
  {
    id: 'free-pricing',
    keywords: ['is it free', 'how much does it cost', 'pricing', 'cost', 'subscription', 'creator cut', 'earn money', 'earnings'],
    question: 'Is MANGAL free? What do creators earn?',
    answer:
      'Reading and publishing are free. Creators keep a 0% platform cut on paid books (bought in paise via Razorpay UPI) and on viewer tips — what supporters pay is what the creator keeps.',
    link: { href: '/about', label: 'Creator economics on /about' },
  },
  {
    id: 'publish-chapter',
    keywords: ['how do i publish', 'publish a chapter', 'publish a series', 'upload a chapter', 'start writing', 'how to publish'],
    question: 'How do I publish a chapter?',
    answer:
      'Everything ships through Mangal Studio: create your series, set its metadata (cover, synopsis, genre tags, mature flag, scheduled publishing) in the metadata manager, then add chapters — the studio writer autosaves and tracks word-count goals. When a chapter is ready, publish it and it appears in the shared reader.',
    link: { href: '/dashboard', label: 'Open Mangal Studio' },
  },
  {
    id: 'ai-assistant',
    keywords: ['ai writer', 'writing assistant', 'ai assistant', 'ai writing', 'polish my', 'check and polish'],
    question: 'What is the AI writing assistant?',
    answer:
      'In Mangal Studio, the AI writing assistant polishes your draft in batched passes — grammar, spelling and literary style — and Hinglish & Hindi translation converts Hinglish to clean English or translates English ↔ Hindi with the direction detected automatically. It runs on-device by default (nothing leaves your browser), or with your own API key.',
  },
  {
    id: 'byok-privacy',
    keywords: ['api key', 'byok', 'bring your own key', 'is my key safe', 'key privacy', 'my api key'],
    question: 'How are AI keys handled?',
    answer:
      'Your provider API key is encrypted with AES-GCM before it ever touches localStorage, and the encryption key itself is a non-extractable CryptoKey that never leaves your browser. Keys are never sent to, stored by, or logged on MANGAL\'s servers — they travel only as a per-request header when you explicitly fire a cloud assist action, and are discarded the moment it finishes.',
  },
  {
    id: 'codex',
    keywords: ['codex', 'character profile', 'lore', 'character lore'],
    question: 'What is the Codex?',
    answer:
      'The Codex is Mangal Studio\'s character-lore manager: character profiles and lore entries that open as a read-only sidebar while you write, so names and world facts stay consistent across chapters.',
  },
  {
    id: 'storyboard',
    keywords: ['storyboard', 'story board', 'panel board', 'convert chapter to panels'],
    question: 'What is the storyboard converter?',
    answer:
      'Paste a chapter\'s text into the storyboard converter and it produces a webtoon panel board — rearrange the panels by drag-and-drop, then export as JSON or a scene script.',
  },
  {
    id: 'metadata-manager',
    keywords: ['metadata manager', 'genre tags', 'mature content flag', 'schedule publishing', 'scheduled publish'],
    question: 'What is the metadata manager?',
    answer:
      'The metadata manager in your dashboard handles cover, synopsis, genre tags, the mature-content (18+) flag and scheduled publishing — one form per book/series.',
  },
  {
    id: 'studio-analytics',
    keywords: ['analytics', 'stats', 'views by country', 'reading time', 'demographics'],
    question: 'What analytics do I get?',
    answer:
      'Mangal Studio\'s analytics show reading-time distribution, views by country and reader demographics for every series you publish. KaTube creators get views and likes per video rolled up in the studio.',
  },
  // ── WebMangal ──────────────────────────────────────────────────────────
  {
    id: 'webmangal-reader',
    keywords: ['what is webmangal', 'manga reader', 'novel reader', 'vertical strip', 'right to left', 'rtl', 'fullscreen reading', 'how do i read'],
    question: 'What is WebMangal?',
    answer:
      'WebMangal is where the reading happens: vertical-strip comics and paged novels share one reader with right-to-left support, fullscreen mode, adjustable background, and emoji reactions on every chapter.',
    link: { href: '/WebMangal/home', label: 'Open WebMangal' },
  },
  {
    id: 'books-pdf-epub',
    keywords: ['books', 'pdf', 'epub', 'book reader'],
    question: 'What about full books, PDFs and EPUBs?',
    answer:
      'WebMangal has a dedicated Books section with its own PDF and EPUB reader, theme and typography controls, and progress that picks up where you left off.',
  },
  {
    id: 'songs',
    keywords: ['songs', 'song', 'lyrics', 'lyric sheet'],
    question: 'What are WebMangal Songs?',
    answer:
      'Songs are original songs published as block-by-block lyric sheets — verse, chorus, hook — tagged by genre and linked to the series they\'re based on. (Lyrics only for now; audio upload isn\'t a shipped feature.)',
  },
  {
    id: 'recommendations',
    keywords: ['recommended for you', 'recommendation', 'because you read', 'trending in', 'for you rail', 'how do recommendations work'],
    question: 'How do "Recommended for you" rails work?',
    answer:
      'Rails on the WebMangal home are built from what you read and follow — "For You", "Because you read…" and "Trending in your top genre". New readers get trending picks instead. The matching itself runs on MANGAL\'s own in-house scorer — no third-party service.',
    link: { href: '/WebMangal/home', label: 'See your rails' },
  },
  {
    id: 'library-tracking',
    keywords: ['bookmark', 'library', 'reading history', 'reading progress', 'my reading'],
    question: 'Is my reading tracked?',
    answer:
      'Yes — bookmarks, reading history and a personal library, plus rankings and tags for finding the next series.',
  },
  // ── KaTube ─────────────────────────────────────────────────────────────
  {
    id: 'what-is-katube',
    keywords: ['what is katube', 'katube platform', 'about katube'],
    question: 'What is KaTube?',
    answer:
      'KaTube is MANGAL\'s short and long-form video product — same account, same zero-fee creator economics. Viewers get the Fast Tap shorts feed, full-length playback through the real YouTube player, playlists, and Trending & Following feeds.',
    link: { href: '/katube', label: 'Open KaTube' },
  },
  {
    id: 'fast-tap',
    keywords: ['fast tap', 'shorts', 'short video', 'reels'],
    question: 'What is Fast Tap?',
    answer:
      'Fast Tap is KaTube\'s vertical fast-swipe Shorts feed, alongside full-length playback through the real YouTube player.',
  },
  {
    id: 'katube-upload',
    keywords: ['how do i upload a video', 'katube upload', 'upload a video', 'post a video'],
    question: 'How do I upload to KaTube?',
    answer:
      'The upload flow publishes by pasting a YouTube link — mark it a Short or a full video, optionally link the WebMangal series it adapts, and submit. Your channel page gathers your videos, Shorts and playlists for followers.',
  },
  {
    id: 'mangal-ideas',
    keywords: ['mangal ideas', 'ideas page', 'adaptation'],
    question: 'What is Mangal Ideas?',
    answer:
      'The KaTube homepage surfaces WebMangal stories that have no adaptation yet, inviting video creators to team up with the writer.',
  },
  {
    id: 'playlists',
    keywords: ['playlist', 'playlists'],
    question: 'What about playlists?',
    answer:
      'Save any KaTube video to your own playlists while you watch, and browse the collection back any time.',
  },
  // ── K Circle ───────────────────────────────────────────────────────────
  {
    id: 'what-is-k-circle',
    keywords: ['what is k circle', 'what is kalpana circle', 'k circle', 'kalpana circle', 'community'],
    question: 'What is K Circle?',
    answer:
      'K Circle is the community layer — where the people behind the stories and the people reading them meet. It\'s peer-to-peer: post updates, run polls, share photo stories (with a close-friends audience), message in realtime, watch together, and vote in Mangal of the Week.',
    link: { href: '/kalpana-circle', label: 'Open K Circle' },
  },
  {
    id: 'broadcast-channels',
    keywords: ['broadcast channel', 'broadcast channels', 'broadcast', 'announcements channel'],
    question: 'What is a Broadcast Channel?',
    answer:
      'One announcement channel per creator: the creator posts, fans react and reply — none of the group-chat noise.',
  },
  {
    id: 'watch-together',
    keywords: ['watch together', 'watch party', 'sync playback'],
    question: 'What is Watch Together?',
    answer:
      'Host a room, sync playback of any KaTube video or run a Fast Tap shorts session, and chat side-by-side while you watch.',
  },
  {
    id: 'mangal-of-the-week',
    keywords: ['mangal of the week', 'of the week', 'leaderboard', 'motw'],
    question: 'What is Mangal of the Week?',
    answer:
      'A weekly, audience-voted leaderboard that ranks the best videos across the ecosystem.',
  },
  {
    id: 'close-friends',
    keywords: ['close friends'],
    question: 'What is the close-friends audience?',
    answer:
      'When you post in K Circle you can share photo stories to a close-friends audience — the ones that aren\'t for everyone.',
  },
  // ── Honesty entries (§147 blacklist — say what does NOT exist) ─────────
  {
    id: 'no-nova',
    keywords: ['nova', 'nova ai'],
    question: 'Is there a "Nova" assistant?',
    answer:
      'No — the Nova AI assistant is still marked "coming soon" and has no AI backend wired up. I\'m the assistant that actually exists today: Guide & Help everywhere, plus catalog recommendations on WebMangal and KaTube.',
  },
  {
    id: 'no-live',
    keywords: ['live streaming', 'go live', 'live stream', 'live tab'],
    question: 'Does KaTube have live streaming?',
    answer:
      'Not yet — "Live" is only a tab label in Mangal Studio\'s KaTube content list. No live streaming feature exists on the platform today.',
  },
  {
    id: 'no-servers',
    keywords: ['server', 'servers', 'discord', 'roles', 'role system'],
    question: 'Does K Circle have servers and roles?',
    answer:
      'No Discord-style servers or role hierarchies exist in K Circle. The community building blocks that do exist: broadcast channels (one per creator), direct messages and group chats, the feed, and watch-together rooms.',
  },
  // ── About the assistant itself ─────────────────────────────────────────
  {
    id: 'what-can-you-do',
    keywords: ['what can you do', 'who are you', 'hello', 'hi', 'hey', 'help me', 'what are you'],
    question: 'What can you do?',
    answer:
      'I\'m the MANGAL Assistant. On every page I answer Guide & Help questions about real, shipped features. On WebMangal and KaTube I can also recommend real catalog picks — describe a genre, a mood, or a story idea and I\'ll match it against what\'s published.',
  },
];

/** Rank entries against a freeform message; null when nothing matches well. */
export function answerGuideQuery(message: string): GuideEntry | null {
  const msg = ` ${message.toLowerCase().replace(/[^\p{L}\p{N}\s%]/gu, ' ').replace(/\s+/g, ' ').trim()} `;
  if (msg.length < 3) return null;

  let best: GuideEntry | null = null;
  let bestScore = 0;
  for (const entry of GUIDE_ENTRIES) {
    let score = 0;
    for (const kw of entry.keywords) {
      if (msg.includes(` ${kw} `) || msg.includes(` ${kw}`) || msg.includes(`${kw} `)) {
        // Longer phrases are stronger evidence than single words.
        score += kw.split(' ').length >= 2 ? 3 : 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }
  return bestScore >= 1 ? best : null;
}

/** Cold-start suggestion chips, per platform context (§150 spec). */
export function getGuideSuggestions(platform: ChatPlatformContext): string[] {
  switch (platform) {
    case 'webmangal':
      // Discovery + Guide mix (both modes are live here).
      return ['Something short, sad and beautiful', 'What is WebMangal?'];
    case 'katube':
      return ['Mythology action videos', 'What is Fast Tap?'];
    case 'kcircle':
      return ['What is a Broadcast Channel?', 'What is Watch Together?'];
    default:
      return ['What is MANGAL?', 'How do I publish a chapter?'];
  }
}



