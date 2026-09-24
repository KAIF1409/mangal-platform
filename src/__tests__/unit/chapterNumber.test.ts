// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  describeWriteError,
  guessNextChapterNumber,
} from '@/app/lib/webmangal/chapterNumber';

// The exact strings PostgREST puts in `error.message` for the refusals a
// chapter write can hit, copied from real responses so the matching stays
// honest rather than matching something we invented.
const RLS_REFUSAL =
  'new row violates row-level security policy for table "chapters"';
const CHAPTER_NUMBER_TAKEN =
  'duplicate key value violates unique constraint "chapters_series_id_chapter_number_key"';
const PAGE_NUMBER_TAKEN =
  'duplicate key value violates unique constraint "pages_chapter_id_page_number_key"';

describe('next chapter number prefill', () => {
  it('never guesses while editing a chapter, even when later chapters exist', () => {
    // The regression: this guess used to overwrite the number of the chapter
    // being edited, so the save collided with another chapter's number and
    // nothing — not even the title — was written.
    expect(
      guessNextChapterNumber({ isEditMode: true, latestChapterNumber: 7 })
    ).toBeNull();
    expect(
      guessNextChapterNumber({ isEditMode: true, latestChapterNumber: null })
    ).toBeNull();
  });

  it('prefills latest + 1 when creating the next chapter', () => {
    expect(
      guessNextChapterNumber({ isEditMode: false, latestChapterNumber: 1 })
    ).toBe(2);
    expect(
      guessNextChapterNumber({ isEditMode: false, latestChapterNumber: 7 })
    ).toBe(8);
  });

  it.each([
    null,
    undefined,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])(
    'leaves the field alone when there is no usable latest number (%s)',
    (latestChapterNumber) => {
      expect(
        guessNextChapterNumber({ isEditMode: false, latestChapterNumber })
      ).toBeNull();
    }
  );
});

describe('chapter write error messages', () => {
  it('explains a row-level-security refusal as an ownership problem', () => {
    const message = describeWriteError(RLS_REFUSAL);
    expect(message).toContain('row-level security');
    expect(message).toContain('Only the account that created a series');
    // The old copy told creators to ask an admin for "developer write access",
    // which no longer exists — authors are owners, never roles.
    expect(message).not.toMatch(/developer|admin/i);
  });

  it('explains a taken chapter number and how to get past it', () => {
    const message = describeWriteError(CHAPTER_NUMBER_TAKEN);
    expect(message).toMatch(/already uses that chapter number/i);
    expect(message).toMatch(/change the chapter number/i);
    expect(message).not.toBe(CHAPTER_NUMBER_TAKEN);
  });

  it('leaves unrelated refusals untouched so real causes stay visible', () => {
    // A page-number conflict is a different bug with a different fix; it is
    // deliberately not rewritten into chapter-number wording.
    expect(describeWriteError(PAGE_NUMBER_TAKEN)).toBe(PAGE_NUMBER_TAKEN);
    expect(describeWriteError('Failed to fetch')).toBe('Failed to fetch');
    expect(describeWriteError('')).toBe('');
  });
});
