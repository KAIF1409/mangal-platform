// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  buildChapterMetadataFields,
  chapterEditSignature,
  chapterTitleOrFallback,
  isFutureSchedule,
  splitTagInput,
} from '@/app/lib/webmangal/chapterFields';

const baseInput = {
  chapterNumber: 2,
  title: 'The Long Night',
  authorNoteBefore: '',
  authorNoteAfter: '',
  isDraft: false,
  scheduledAt: '',
  tagsInput: '',
};

// The comic branch's edit-mode UPDATE used to send ONLY chapter_number and
// title, so everything else the screen loaded (author notes, tags, draft flag,
// schedule) was shown, edited, reported as saved, and thrown away. These tests
// pin the columns every chapter write now carries.
describe('chapter metadata fields — edit no longer drops what the form holds', () => {
  it('writes every field the Edit Chapter screen can change', () => {
    const fields = buildChapterMetadataFields({
      ...baseInput,
      authorNoteBefore: 'Previously…',
      authorNoteAfter: 'Next chapter Friday!',
      isDraft: true,
      scheduledAt: '2026-10-01T18:30',
      tagsInput: 'slow-burn, violence-warning',
    });

    expect(fields).toEqual({
      chapter_number: 2,
      title: 'The Long Night',
      author_note_before: 'Previously…',
      author_note_after: 'Next chapter Friday!',
      is_draft: true,
      scheduled_at: new Date('2026-10-01T18:30').toISOString(),
      tags: ['slow-burn', 'violence-warning'],
    });
  });

  it('stores unset notes and tags as null/[] rather than empty strings', () => {
    const fields = buildChapterMetadataFields(baseInput);
    expect(fields.author_note_before).toBeNull();
    expect(fields.author_note_after).toBeNull();
    expect(fields.tags).toEqual([]);
    expect(fields.scheduled_at).toBeNull();
  });

  it('falls back to "Chapter N" for a blank title and trims a real one', () => {
    expect(chapterTitleOrFallback('   ', 7)).toBe('Chapter 7');
    expect(buildChapterMetadataFields({ ...baseInput, title: '  Hi  ' }).title).toBe('Hi');
  });

  it('never writes a chapter number the DB would reject', () => {
    // Number('') from an emptied number input is 0/NaN — a row with that
    // value is refused, which used to surface as "nothing saved".
    expect(buildChapterMetadataFields({ ...baseInput, chapterNumber: Number.NaN }).chapter_number).toBe(1);
    expect(buildChapterMetadataFields({ ...baseInput, chapterNumber: 0 }).chapter_number).toBe(1);
    // A real number is passed through untouched — the fallback only rescues
    // values that cannot be written at all.
    expect(buildChapterMetadataFields({ ...baseInput, chapterNumber: 3 }).chapter_number).toBe(3);
  });
});

describe('tag input parsing', () => {
  it('drops blanks and case-insensitive duplicates, keeping first spelling', () => {
    expect(splitTagInput(' action, , Action ,romance ')).toEqual(['action', 'romance']);
    expect(splitTagInput('')).toEqual([]);
    expect(splitTagInput('   ,  , ')).toEqual([]);
  });
});

describe('schedule detection', () => {
  const now = new Date('2026-09-24T10:00:00Z').getTime();

  it('treats a future datetime-local value as a schedule', () => {
    expect(isFutureSchedule('2026-09-25T10:00', now)).toBe(true);
  });

  it('treats a past value and an empty value as publish-now', () => {
    expect(isFutureSchedule('2026-09-23T10:00', now)).toBe(false);
    expect(isFutureSchedule('', now)).toBe(false);
  });

  it('treats an unparseable value as publish-now, not as a hidden chapter', () => {
    // A garbage timestamp would otherwise be stored, and the reader's
    // scheduled-filter would hide the chapter forever.
    expect(isFutureSchedule('not-a-date', now)).toBe(false);
    expect(buildChapterMetadataFields({ ...baseInput, scheduledAt: 'not-a-date' }).scheduled_at).toBeNull();
  });
});

describe('unsaved-changes signature', () => {
  const signature = (overrides: Partial<typeof baseInput> = {}, pagesKey = 'p1,p2') =>
    chapterEditSignature({
      fields: { ...baseInput, ...overrides },
      pagesKey,
      content: undefined,
    });

  it('is stable when nothing changed', () => {
    expect(signature()).toBe(signature());
  });

  it('changes for every editable field, including page order', () => {
    const original = signature();
    expect(signature({ title: 'Renamed' })).not.toBe(original);
    expect(signature({ chapterNumber: 3 })).not.toBe(original);
    expect(signature({ authorNoteAfter: 'note' })).not.toBe(original);
    expect(signature({ isDraft: true })).not.toBe(original);
    expect(signature({ scheduledAt: '2026-10-01T18:30' })).not.toBe(original);
    expect(signature({ tagsInput: 'action' })).not.toBe(original);
    expect(signature({}, 'p1,p3,p2')).not.toBe(original); // reordered / added page
  });

  it('ignores whitespace-only churn but not a real tag difference', () => {
    expect(signature({ title: '  The Long Night  ' })).toBe(signature());
    expect(signature({ tagsInput: ' ACTION ' })).not.toBe(signature({ tagsInput: 'action,romance' }));
  });

  it('tracks the novel body when one is supplied', () => {
    const withContent = (content: string) =>
      chapterEditSignature({ fields: baseInput, pagesKey: '', content });
    expect(withContent('one')).not.toBe(withContent('two'));
    expect(withContent('one')).toBe(withContent('one'));
  });
});
