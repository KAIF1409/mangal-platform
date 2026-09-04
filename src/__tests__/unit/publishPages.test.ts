import { describe, expect, it, vi } from 'vitest';
import { publishChapterPages, type PublishPagesDeps } from '@/app/lib/webmangal/publishPages';

function makeFile(name: string): File {
  return new File(['x'], name, { type: 'image/jpeg' });
}

function makeHappyDeps(overrides: Partial<PublishPagesDeps> = {}): PublishPagesDeps {
  let insertCount = 0;
  return {
    uploadFile: vi.fn(async (file: File) => ({ path: `pages/${file.name}`, url: `https://cdn/${file.name}` })),
    insertPage: vi.fn(async () => ({ id: `page-${++insertCount}` })),
    deletePagesByIds: vi.fn(async () => {}),
    deleteFiles: vi.fn(async () => {}),
    deleteChapter: vi.fn(async () => {}),
    ...overrides,
  };
}

describe('publishChapterPages — success path', () => {
  it('uploads and inserts every page in order, one at a time', async () => {
    const callOrder: string[] = [];
    const deps = makeHappyDeps({
      uploadFile: vi.fn(async (file: File) => {
        callOrder.push(`upload:${file.name}`);
        return { path: `pages/${file.name}`, url: `https://cdn/${file.name}` };
      }),
      insertPage: vi.fn(async (pageNumber: number) => {
        callOrder.push(`insert:${pageNumber}`);
        return { id: `page-${pageNumber}` };
      }),
    });

    const files = [makeFile('a.jpg'), makeFile('b.jpg'), makeFile('c.jpg')];
    const result = await publishChapterPages(files, deps);

    expect(result).toEqual({ success: true });
    // Strictly sequential: upload(a) -> insert(1) -> upload(b) -> insert(2) -> upload(c) -> insert(3).
    // A race condition would let upload(b)/upload(c) start before insert(1) resolves.
    expect(callOrder).toEqual([
      'upload:a.jpg', 'insert:1',
      'upload:b.jpg', 'insert:2',
      'upload:c.jpg', 'insert:3',
    ]);
    expect(deps.deleteChapter).not.toHaveBeenCalled();
    expect(deps.deletePagesByIds).not.toHaveBeenCalled();
    expect(deps.deleteFiles).not.toHaveBeenCalled();
  });
});

describe('publishChapterPages — BUG FIX: rollback on partial failure', () => {
  it('rolls back already-inserted pages, already-uploaded files, and the chapter when an upload fails partway through', async () => {
    const deps = makeHappyDeps({
      uploadFile: vi.fn(async (file: File) => {
        if (file.name === 'bad.jpg') throw new Error('network error');
        return { path: `pages/${file.name}`, url: `https://cdn/${file.name}` };
      }),
    });

    const files = [makeFile('a.jpg'), makeFile('b.jpg'), makeFile('bad.jpg'), makeFile('d.jpg')];
    const result = await publishChapterPages(files, deps);

    expect(result.success).toBe(false);
    expect(result.failedAtPageIndex).toBe(2);
    expect(result.error).toMatch(/Page 3/);

    // Pages 1 and 2 were fully uploaded + inserted before the failure —
    // both must be cleaned up. Page 4 was never attempted (sequential).
    expect(deps.insertPage).toHaveBeenCalledTimes(2);
    expect(deps.deletePagesByIds).toHaveBeenCalledWith(['page-1', 'page-2']);
    expect(deps.deleteFiles).toHaveBeenCalledWith(['pages/a.jpg', 'pages/b.jpg']);
    expect(deps.deleteChapter).toHaveBeenCalledTimes(1);
  });

  it('rolls back when a page DB insert fails (upload succeeded, insert did not)', async () => {
    const deps = makeHappyDeps({
      insertPage: vi.fn(async (pageNumber: number) => {
        if (pageNumber === 2) return { error: 'unique_violation' };
        return { id: `page-${pageNumber}` };
      }),
    });

    const files = [makeFile('a.jpg'), makeFile('b.jpg'), makeFile('c.jpg')];
    const result = await publishChapterPages(files, deps);

    expect(result.success).toBe(false);
    expect(result.failedAtPageIndex).toBe(1);
    expect(result.error).toMatch(/Page 2 save/);
    expect(result.error).toMatch(/unique_violation/);

    // Only page 1's upload made it to disk (page 2's insert failed before
    // page 3 was ever attempted) — rollback must delete exactly that.
    expect(deps.deletePagesByIds).toHaveBeenCalledWith(['page-1']);
    expect(deps.deleteFiles).toHaveBeenCalledWith(['pages/a.jpg', 'pages/b.jpg']);
    expect(deps.deleteChapter).toHaveBeenCalledTimes(1);
  });

  it('still reports the original failure even if rollback cleanup itself throws', async () => {
    const deps = makeHappyDeps({
      uploadFile: vi.fn(async (file: File) => {
        if (file.name === 'bad.jpg') throw new Error('upload exploded');
        return { path: `pages/${file.name}`, url: `https://cdn/${file.name}` };
      }),
      deletePagesByIds: vi.fn(async () => { throw new Error('cleanup also failed'); }),
      deleteFiles: vi.fn(async () => { throw new Error('cleanup also failed'); }),
      deleteChapter: vi.fn(async () => { throw new Error('cleanup also failed'); }),
    });

    const result = await publishChapterPages([makeFile('a.jpg'), makeFile('bad.jpg')], deps);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Page 2/);
    expect(result.error).not.toMatch(/cleanup also failed/);
  });

  it('does not attempt any upload/insert for an empty page list, and never rolls back', async () => {
    const deps = makeHappyDeps();
    const result = await publishChapterPages([], deps);

    expect(result).toEqual({ success: true });
    expect(deps.uploadFile).not.toHaveBeenCalled();
    expect(deps.deleteChapter).not.toHaveBeenCalled();
  });
});
