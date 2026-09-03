// app/lib/ai/chatDiscovery.ts
//
// §150 — MANGAL Assistant, Discovery/Recommendation mode (WebMangal + KaTube).
//
// ISOMORPHIC (like lib/ai/editorAssist.ts): imported by the client widget
// AND by /api/chat/discovery so the intent lexicon exists in exactly one
// place. This module owns:
//
//   1. INTENT ROUTING — the §150 DEFAULT rule, verbatim: if the message
//      asks "what/how/why/where" about a feature/term → Guide mode; if it
//      names/describes a genre, mood, vibe, or story idea, or asks to be
//      "given"/"recommended" something → Discovery mode. Genuinely
//      ambiguous → Guide (the user can re-ask).
//
//   2. QUERY EXTRACTION — freeform text → structured genre/keyword/
//      type-hint filters. No LLM: a fixed lexicon over the REAL catalog
//      fields (series.genre single text, books.genre_tags text[],
//      songs.genre single text, videos.is_short — verified from
//      supabase/migrations/*, NOT assumed).
//
//   3. REFINEMENT STATE — the client keeps the last query's genres locally
//      ("shorter", "less romance", "funnier") and sends the merged context
//      with the next request; the server stays stateless.

export type DiscoveryTypeHint =
  | 'any'
  | 'novel'
  | 'manga'
  | 'book'
  | 'song'
  | 'short'
  | 'video'
  | 'channel';

export interface DiscoveryIntent {
  genres: string[];
  excludeGenres: string[];
  /** Content words for title/synopsis matching (≥3 chars). */
  keywords: string[];
  typeHint: DiscoveryTypeHint;
  /** KaTube only: true → Shorts feed, false → full videos, null → either. */
  shortOnly: boolean | null;
}

export interface DiscoverySessionContext {
  genres: string[];
  excludeGenres: string[];
}

// ── Lexicons (normalized genre keys + intent phrases) ──────────────────────

/** genre key → phrases that express it (whole-word matched, lowercase). */
const GENRE_LEXICON: Record<string, string[]> = {
  mythology: ['mythology', 'mythological', 'myths', 'purana', 'epic', 'mahabharat', 'ramayan', 'mahabharata', 'ramayana', 'gods', 'goddess', 'devi', 'devta'],
  action: ['action', 'fight', 'fighting', 'battle', 'battles', 'war', 'martial arts', 'combat'],
  romance: ['romance', 'romantic', 'love story', 'romcom', 'rom-com'],
  fantasy: ['fantasy', 'magic', 'magical', 'magical world'],
  horror: ['horror', 'scary', 'spooky', 'creepy'],
  thriller: ['thriller', 'suspense', 'mystery', 'detective', 'crime', 'whodunit'],
  comedy: ['comedy', 'funny', 'humor', 'humour', 'hilarious', 'comedic'],
  drama: ['drama', 'emotional', 'sad', 'heartbreak', 'tragic', 'tragedy', 'tearjerker', 'melancholy'],
  'slice of life': ['slice of life', 'wholesome', 'cozy', 'cosy', 'feel good', 'feel-good'],
  'sci-fi': ['sci-fi', 'scifi', 'science fiction', 'futuristic', 'cyberpunk', 'space'],
  adventure: ['adventure', 'quest', 'journey'],
  history: ['historical', 'history', 'period piece'],
  sports: ['sports', 'tournament'],
};

/** Vibe words that stay KEYWORDS (match title/synopsis) rather than genres. */
const VIBE_WORDS = [
  'beautiful', 'dark', 'heartwarming', 'bittersweet', 'gritty', 'lighthearted',
  'slow', 'hidden', 'underrated', 'gem', 'chill',
];

/** Phrases that signal "give me something to read/watch" → Discovery. */
const DISCOVERY_SIGNALS = [
  'recommend', 'recommendation', 'suggest', 'give me', 'show me', 'find me',
  'looking for', 'want to read', 'want to watch', 'something to read',
  'something to watch', 'any series', 'any video', 'any shorts',
  'similar to', 'bored', 'vibe', 'mood', 'story idea', 'a story where',
  'plot idea', 'surprise me', 'what should i', 'what to',
];

// BUILT DEFAULT RULE (§150, verbatim intent): ANY discovery signal below
// flips the message to Discovery; a message with zero discovery signals —
// e.g. a bare what/how/why/where feature question — defaults to Guide.
// Ties and ambiguity therefore land on Guide, per the spec.

function tokenize(message: string): string[] {
  return message
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function hasPhrase(tokens: string[], phrase: string): boolean {
  const parts = phrase.split(' ');
  for (let i = 0; i <= tokens.length - parts.length; i++) {
    let ok = true;
    for (let j = 0; j < parts.length; j++) {
      if (tokens[i + j] !== parts[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

/**
 * §150 DEFAULT routing rule. Returns 'guide' or 'discovery'.
 * Guide wins ties (genuinely ambiguous → Guide, user re-asks).
 */
export function routeIntent(message: string): 'guide' | 'discovery' {
  const tokens = tokenize(message);
  if (tokens.length === 0) return 'guide';

  let discoveryScore = 0;
  for (const sig of DISCOVERY_SIGNALS) {
    if (hasPhrase(tokens, sig)) discoveryScore += sig.includes(' ') ? 3 : 2;
  }
  for (const phrases of Object.values(GENRE_LEXICON)) {
    for (const p of phrases) if (hasPhrase(tokens, p)) discoveryScore += 2;
  }

  // Discovery signals beat a lone question opener ("what should i read"
  // opens with "what" but IS a Discovery request); a bare opener with zero
  // discovery signals is a Guide question.
  if (discoveryScore > 0) return 'discovery';
  return 'guide';
}

/** Pure refinement message? ("shorter", "less romance", "funnier") */
function isRefinement(tokens: string[]): boolean {
  if (tokens.length > 5) return false;
  const markers = ['shorter', 'longer', 'less', 'more', 'without', 'no', 'but', 'funnier', 'darker', 'lighter', 'again', 'different', 'another'];
  return markers.some((m) => tokens.includes(m) || hasPhrase(tokens, m));
}

/**
 * Freeform message (+ client-kept session context) → structured query.
 * Returns null when no usable Discovery signal exists in the message.
 */
export function extractDiscoveryQuery(
  message: string,
  context: DiscoverySessionContext,
): DiscoveryIntent | null {
  const tokens = tokenize(message);
  if (tokens.length === 0) return null;

  const genres: string[] = [];
  const excludeGenres: string[] = [];
  const keywords: string[] = [];
  let typeHint: DiscoveryTypeHint = 'any';
  let shortOnly: boolean | null = null;

  // 1. Multi-word genre phrases first ("slice of life" must win whole).
  const phraseMatched = new Set<string>();
  for (const [genre, phrases] of Object.entries(GENRE_LEXICON)) {
    for (const p of phrases) {
      if (!p.includes(' ')) continue;
      if (hasPhrase(tokens, p)) {
        if (!genres.includes(genre)) genres.push(genre);
        phraseMatched.add(p);
      }
    }
  }

  // 2. Exclusions: "less romance", "without horror", "no romance".
  const excludeTriggers = ['less', 'without', 'no'];
  for (let i = 0; i < tokens.length; i++) {
    if (!excludeTriggers.includes(tokens[i])) continue;
    const rest = tokens.slice(i + 1, i + 3).join(' ');
    for (const [genre, phrases] of Object.entries(GENRE_LEXICON)) {
      for (const p of phrases) {
        if (rest.startsWith(p) || p.startsWith(rest)) {
          if (!excludeGenres.includes(genre)) excludeGenres.push(genre);
        }
      }
    }
  }

  // 3. Single-word genres + vibe words → keywords for title/synopsis match.
  const stop = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'have', 'want', 'something', 'anything', 'please', 'give', 'show', 'find', 'recommend', 'recommendation', 'suggest', 'looking', 'read', 'reading', 'watch', 'watching', 'story', 'stories', 'series', 'video', 'videos', 'manga', 'comic', 'comics', 'webtoon', 'novel', 'novels', 'book', 'books', 'song', 'songs', 'short', 'shorts', 'channel', 'channels', 'creator', 'creators', 'like', 'similar', 'about', 'some', 'good', 'best', 'great', 'nice', 'really', 'very', 'much', 'lots', 'where', 'what', 'which', 'when', 'how', 'reels', 'pdf', 'epub', 'lyrics']);
  const genreWords = new Set<string>();
  const wordToGenre = new Map<string, string>();
  for (const [genre, phrases] of Object.entries(GENRE_LEXICON)) {
    genreWords.add(genre);
    if (!wordToGenre.has(genre)) wordToGenre.set(genre, genre);
    for (const p of phrases) {
      if (!p.includes(' ')) {
        genreWords.add(p);
        if (!wordToGenre.has(p)) wordToGenre.set(p, genre);
      }
    }
  }
  for (const t of tokens) {
    if (t.length < 3 || stop.has(t) || excludeGenres.includes(t)) continue;
    if (genreWords.has(t)) {
      // Normalize to the GENRE KEY ('sad' → 'drama'), so scoring matches
      // real catalog genre labels, not the raw token.
      const g = wordToGenre.get(t) ?? t;
      if (!genres.includes(g) && !excludeGenres.includes(g)) genres.push(g);
    } else if (VIBE_WORDS.includes(t)) {
      if (!keywords.includes(t)) keywords.push(t);
    } else if (keywords.length < 4) {
      // Unknown content words: keep a few for title/synopsis matching —
      // prevents turning an entire sentence into matching noise.
      if (!keywords.includes(t)) keywords.push(t);
    }
  }

  // 4. Type hints (map to real columns: content_type, books table, is_short).
  if (hasPhrase(tokens, 'novel') || hasPhrase(tokens, 'novels')) typeHint = 'novel';
  else if (hasPhrase(tokens, 'manga') || hasPhrase(tokens, 'comic') || hasPhrase(tokens, 'comics') || hasPhrase(tokens, 'webtoon')) typeHint = 'manga';
  else if (hasPhrase(tokens, 'book') || hasPhrase(tokens, 'books') || hasPhrase(tokens, 'pdf') || hasPhrase(tokens, 'epub')) typeHint = 'book';
  else if (hasPhrase(tokens, 'song') || hasPhrase(tokens, 'songs') || hasPhrase(tokens, 'lyrics')) typeHint = 'song';
  else if (hasPhrase(tokens, 'shorts') || hasPhrase(tokens, 'reels')) { typeHint = 'short'; shortOnly = true; }
  else if (hasPhrase(tokens, 'video') || hasPhrase(tokens, 'videos')) { typeHint = 'video'; shortOnly = false; }
  else if (hasPhrase(tokens, 'channel') || hasPhrase(tokens, 'channels') || hasPhrase(tokens, 'creator') || hasPhrase(tokens, 'creators')) typeHint = 'channel';

  // KaTube "short" without an explicit Shorts noun still flips shortOnly —
  // videos.is_short is the only real length filter in the schema.
  if (typeHint === 'any' && tokens.includes('short')) shortOnly = true;

  // 5. Refinement-only message → graft onto the previous context.
  if (genres.length === 0 && keywords.length === 0 && context.genres.length > 0 && isRefinement(tokens)) {
    return {
      genres: context.genres.filter((g) => !excludeGenres.includes(g)),
      excludeGenres: [...new Set([...context.excludeGenres, ...excludeGenres])],
      keywords: [],
      typeHint,
      shortOnly,
    };
  }

  // A bare type hint ("shorts", "some books") is a usable Discovery query
  // even with zero genre/keyword signal — only bail when there's NOTHING.
  if (genres.length === 0 && keywords.length === 0 && typeHint === 'any') return null;

  return {
    genres: genres.filter((g) => !excludeGenres.includes(g)),
    excludeGenres,
    keywords,
    typeHint,
    shortOnly,
  };
}

/** Client-side session memory for refinements (server stays stateless). */
export function mergeDiscoveryContext(
  prev: DiscoverySessionContext,
  intent: DiscoveryIntent,
): DiscoverySessionContext {
  const nextGenres = intent.genres.length > 0 ? intent.genres : prev.genres;
  const nextExcluded = [...new Set([...prev.excludeGenres, ...intent.excludeGenres])].filter(
    (g) => !nextGenres.includes(g),
  );
  return { genres: nextGenres, excludeGenres: nextExcluded };
}


