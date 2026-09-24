/**
 * Chapter-number guards for the WebMangal upload flow
 * (src/app/WebMangal/upload/page.tsx).
 *
 * Written because of one incident whose symptom pointed nowhere near its
 * cause: clicking "Edit chapter" on a published chapter looked like the
 * platform itself had broken — the title refused to save, the pages looked
 * gone — while the real story was two effects fighting over one field:
 *
 *   1. The upload page ran two effects that both wrote `chapterNumber`. One
 *      guessed "the series' highest chapter number + 1", which is only ever
 *      right in the CREATE flow; the other loaded the chapter being edited.
 *      Which one won depended purely on which network round trip finished
 *      last — and because loading the edit awaits the chapter row AND then
 *      its pages, the single quick "latest + 1" query often won on a slow
 *      connection and silently replaced the number of the chapter being
 *      edited.
 *   2. Saving then wrote that wrong number, which collided with another
 *      chapter's number under `chapters_series_id_chapter_number_key`
 *      (UNIQUE (series_id, chapter_number)). Postgres refused the whole
 *      UPDATE — before the title or a single page row was written — and
 *      PostgREST handed the browser the raw constraint text, so the failure
 *      read as "everything is broken" instead of "that number is taken".
 *
 * `guessNextChapterNumber` closes (1) by refusing to guess while editing, and
 * `describeWriteError` closes (2) by saying what happened and what to do next.
 * Both are pure functions with no Supabase/React imports, so these invariants
 * are pinned by src/__tests__/unit/chapterNumber.test.ts instead of only
 * living inside a browser-only code path.
 */

/**
 * The chapter number to prefill in the CREATE flow, or `null` when the field
 * must be left exactly as it is.
 *
 * Edit mode always gets `null`: when `?chapterId=` is present the number
 * belongs to the chapter row being edited (the page's own edit effect loads
 * it) and must never be replaced by a guess about "the next new chapter".
 * That refusal IS the fix for the race described above — not a style choice.
 *
 * A series with no chapters yet also gets `null`, leaving the field at its
 * initial value of 1.
 */
export function guessNextChapterNumber(options: {
  isEditMode: boolean;
  latestChapterNumber: number | null | undefined;
}): number | null {
  if (options.isEditMode) return null;

  const latest = options.latestChapterNumber;
  if (typeof latest !== 'number' || !Number.isFinite(latest)) return null;

  return latest + 1;
}

/**
 * Turns the raw PostgREST/Postgres refusal text a chapter write can return
 * into something the creator can act on.
 *
 * PostgREST reports EVERY row-level-security refusal with the same wording —
 * `new row violates row-level security policy for table "chapters"` — which is
 * accurate but tells a creator nothing about the cause. The one cause this
 * flow can hit (the ownership rule the database enforces, mirrored by
 * seriesWriteBlockReason in lib/auth/roles.ts) is being signed in as an
 * account that isn't the series' creator_id, so say that instead — there is no
 * developer/admin bypass to point at, by design.
 *
 * `duplicate key value violates unique constraint
 * "chapters_series_id_chapter_number_key"` is the collision described in this
 * module's header: a chapter number another chapter in the same series already
 * holds. Name the problem and the way out.
 *
 * Anything else (network, 5xx, a constraint on some other column) is passed
 * through untouched — those messages are already specific, and reinterpreting
 * them here would only make real failures harder to diagnose.
 */
export function describeWriteError(message: string): string {
  if (/row-level security/i.test(message)) {
    return 'The database refused this write (row-level security): this series belongs to a different account than the one you’re signed in as. Only the account that created a series can add or edit its chapters — log in with that account to publish here.';
  }
  if (/chapters_series_id_chapter_number_key/i.test(message)) {
    return 'Another chapter in this series already uses that chapter number. Change the chapter number to one that isn’t taken and try saving again.';
  }
  return message;
}
