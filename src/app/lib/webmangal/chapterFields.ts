/**
 * lib/webmangal/chapterFields.ts
 *
 * The columns a chapter row is written with, built in one place for BOTH
 * chapter kinds (comic and novel) and both save paths (create and edit).
 *
 * WHY THIS IS EXTRACTED
 * The novel branch already had a shared field builder
 * (`buildNovelChapterFields`); the comic branch never got one, and its
 * edit-mode UPDATE wrote exactly two columns:
 *
 *     .from('chapters').update({ chapter_number: ..., title: ... })
 *
 * while the same screen happily LOADED author_note_before, author_note_after
 * and tags into the form (see loadChapterForEdit). So a comic creator could
 * type an author's note, watch it appear in the box, hit Save, get
 * "Chapter N updated!", and lose it — the field was never sent. `is_draft` and
 * `scheduled_at` had the same problem: loaded, shown, never written.
 *
 * Two separate builders is what allowed that drift, so there is now one:
 * every chapter write goes through `buildChapterMetadataFields`, and both
 * branches spread it into their insert/update payload. The comic branch keeps
 * only what is its own (pages), the novel branch only what is its own
 * (`content`, `word_count`).
 *
 * `chapterEditSignature` is the other half of the edit flow: a stable string
 * of everything the Edit Chapter screen can change, so the page can tell
 * "nothing to save" from "unsaved changes" and warn before the tab is closed.
 */

/** Everything the chapter form holds that belongs on the chapter row. */
export interface ChapterMetadataInput {
  chapterNumber: number;
  /** Raw title input — empty means "use the Chapter N fallback". */
  title: string;
  authorNoteBefore: string;
  authorNoteAfter: string;
  isDraft: boolean;
  /** datetime-local input value in the viewer's local time; '' = no schedule. */
  scheduledAt: string;
  /** Comma-separated tag input. */
  tagsInput: string;
}

/** The chapter-row columns every chapter write shares. */
export interface ChapterMetadataFields {
  chapter_number: number;
  title: string;
  author_note_before: string | null;
  author_note_after: string | null;
  is_draft: boolean;
  scheduled_at: string | null;
  tags: string[];
}

/**
 * Comma-separated input -> clean tag array. Blank entries and duplicates
 * (case-insensitive, first spelling wins) are dropped: a repeated tag would
 * otherwise be stored twice and shown twice.
 */
export function splitTagInput(tagsInput: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of tagsInput.split(',')) {
    const tag = raw.trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags;
}

/**
 * Is this datetime-local value in the future (i.e. a real schedule rather
 * than "publish now")? An unparseable value counts as "no schedule" — the
 * chapter publishes immediately instead of silently vanishing behind a bad
 * timestamp that the reader's scheduled-filter would hide forever.
 */
export function isFutureSchedule(
  scheduledAt: string,
  now: number = Date.now()
): boolean {
  if (!scheduledAt) return false;
  const when = new Date(scheduledAt).getTime();
  if (!Number.isFinite(when)) return false;
  return when > now;
}

/** The title actually stored: the creator's, or "Chapter N" when left blank. */
export function chapterTitleOrFallback(title: string, chapterNumber: number): string {
  const trimmed = title.trim();
  return trimmed || `Chapter ${chapterNumber}`;
}

/** A chapter number the DB can accept — a null/NaN row would be rejected. */
function normalizeChapterNumber(chapterNumber: number): number {
  return Number.isFinite(chapterNumber) && chapterNumber > 0 ? chapterNumber : 1;
}

/** datetime-local value -> UTC ISO string, or null when it isn't a real date. */
function toIsoOrNull(scheduledAt: string): string | null {
  if (!scheduledAt) return null;
  const when = new Date(scheduledAt).getTime();
  return Number.isFinite(when) ? new Date(when).toISOString() : null;
}

export function buildChapterMetadataFields(
  input: ChapterMetadataInput
): ChapterMetadataFields {
  const chapterNumber = normalizeChapterNumber(input.chapterNumber);
  return {
    chapter_number: chapterNumber,
    title: chapterTitleOrFallback(input.title, chapterNumber),
    // Empty notes/tags are stored as null / [] rather than '' so "not set"
    // and "set to nothing" can't drift apart.
    author_note_before: input.authorNoteBefore.trim() || null,
    author_note_after: input.authorNoteAfter.trim() || null,
    is_draft: input.isDraft,
    // datetime-local is local time; Date() reads it as local, toISOString()
    // stores UTC — the same conversion the novel path always used. An
    // unparseable value becomes null ("no schedule") instead of throwing a
    // RangeError out of the save handler.
    scheduled_at: toIsoOrNull(input.scheduledAt),
    tags: splitTagInput(input.tagsInput),
  };
}

/**
 * A stable string describing everything editable in the Edit Chapter screen,
 * used for the "unsaved changes" warning.
 *
 * `pagesKey` is supplied by the caller (page ids in order, plus a marker per
 * freshly-added file) because page bookkeeping lives in the page component —
 * this function only has to make the comparison total, so that reordering,
 * adding, removing or replacing a page counts as a change even when the
 * metadata fields are untouched.
 *
 * `content` is the novel body; comics pass undefined and it is omitted.
 */
export function chapterEditSignature(input: {
  fields: ChapterMetadataInput;
  pagesKey: string;
  content?: string;
}): string {
  const { fields } = input;
  return JSON.stringify([
    normalizeChapterNumber(fields.chapterNumber),
    fields.title.trim(),
    fields.authorNoteBefore.trim(),
    fields.authorNoteAfter.trim(),
    fields.isDraft,
    fields.scheduledAt,
    splitTagInput(fields.tagsInput).join('\u0001'),
    input.pagesKey,
    input.content ?? null,
  ]);
}
