/**
 * lib/webmangal/publishPages.ts
 *
 * Manga chapter-publish pipeline (upload + insert every page, in order),
 * extracted out of WebMangal/upload/page.tsx so the rollback logic is
 * testable without rendering the whole upload page.
 *
 * BUG FIX — no rollback on partial upload failure: the previous inline
 * version created the `chapters` row, then uploaded + inserted each page
 * sequentially, and on ANY failure (a slow/corrupt file, a dropped R2
 * request, a DB insert error) it just showed an error and returned —
 * leaving the `chapters` row and every already-uploaded page live in the
 * DB/R2 as an orphaned, partially-published chapter. Retrying created a
 * SECOND chapter row instead of resuming, doubling the garbage. This
 * module uploads/inserts pages one at a time (preserving page order — no
 * concurrent writes, so no out-of-order-page race either) and, on any
 * failure, best-effort rolls back everything this call itself wrote:
 * inserted `pages` rows, uploaded R2 objects, and the `chapters` row.
 */

export interface UploadedFile {
  /** Storage key/path — needed to delete the object from R2 on rollback. */
  path: string;
  /** Public URL — what gets stored in `pages.image_url`. */
  url: string;
}

export type InsertPageResult = { id: string } | { error: string };

export interface PublishPagesDeps {
  uploadFile: (file: File) => Promise<UploadedFile>;
  insertPage: (pageNumber: number, imageUrl: string) => Promise<InsertPageResult>;
  /** Best-effort — called during rollback only. Errors are swallowed so the
   * original failure reason is what reaches the creator. */
  deletePagesByIds: (pageIds: string[]) => Promise<void>;
  /** Best-effort — called during rollback only. */
  deleteFiles: (paths: string[]) => Promise<void>;
  /** Best-effort — called during rollback only. Removes the just-created,
   * now-orphaned chapter row so a retry doesn't create a duplicate. */
  deleteChapter: () => Promise<void>;
}

export interface PublishPagesResult {
  success: boolean;
  /** User-facing message, set only when success is false. */
  error?: string;
  /** 0-based index of the page that failed, set only when success is false. */
  failedAtPageIndex?: number;
}

export async function publishChapterPages(
  files: File[],
  deps: PublishPagesDeps
): Promise<PublishPagesResult> {
  const uploadedPaths: string[] = [];
  const insertedPageIds: string[] = [];

  const rollback = async () => {
    // Order matters least here since each step is independent, but pages
    // (the DB rows readers could theoretically already query) go first,
    // then the storage objects, then the chapter row itself.
    if (insertedPageIds.length) {
      try { await deps.deletePagesByIds(insertedPageIds); } catch { /* best-effort */ }
    }
    if (uploadedPaths.length) {
      try { await deps.deleteFiles(uploadedPaths); } catch { /* best-effort */ }
    }
    try { await deps.deleteChapter(); } catch { /* best-effort */ }
  };

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    let uploaded: UploadedFile;
    try {
      uploaded = await deps.uploadFile(file);
    } catch (uploadError) {
      await rollback();
      return {
        success: false,
        error: `Page ${i + 1}: ${uploadError instanceof Error ? uploadError.message : 'upload failed'}. The chapter was rolled back — please retry.`,
        failedAtPageIndex: i,
      };
    }
    uploadedPaths.push(uploaded.path);

    const inserted = await deps.insertPage(i + 1, uploaded.url);
    if ('error' in inserted) {
      await rollback();
      return {
        success: false,
        error: `Page ${i + 1} save: ${inserted.error}. The chapter was rolled back — please retry.`,
        failedAtPageIndex: i,
      };
    }
    insertedPageIds.push(inserted.id);
  }

  return { success: true };
}
