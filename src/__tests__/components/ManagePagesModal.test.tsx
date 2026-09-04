import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ManagePagesModal from '@/app/components/webmangal/ManagePagesModal';
import { supabase } from '@/app/lib/supabase';

vi.mock('@/app/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}));

vi.mock('@/app/lib/media/uploadClient', () => ({
  deleteMediaFiles: vi.fn(() => Promise.resolve()),
}));

const TEMP_OFFSET = 1_000_000;

const initialPages = [
  { id: 'p1', page_number: 1, image_url: 'https://cdn.example/api/media/pages/p1.jpg' },
  { id: 'p2', page_number: 2, image_url: 'https://cdn.example/api/media/pages/p2.jpg' },
  { id: 'p3', page_number: 3, image_url: 'https://cdn.example/api/media/pages/p3.jpg' },
];

describe('ManagePagesModal — reorder/delete renumbering (unique-constraint race fix)', () => {
  // Records every `.update({...}).eq('id', id)` call against `pages`, in
  // the exact order the component issued them, so we can assert on phase
  // ordering (all temp-offset writes before any final-value write).
  let updateCalls: { page_number: number; id: string }[];

  beforeEach(() => {
    updateCalls = [];
    vi.mocked(supabase.from).mockImplementation(((table: string) => {
      if (table === 'pages') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => Promise.resolve({ data: initialPages, error: null })),
            })),
          })),
          update: vi.fn((values: { page_number: number }) => ({
            eq: vi.fn((_col: string, id: string) => {
              updateCalls.push({ page_number: values.page_number, id });
              return Promise.resolve({ data: null, error: null });
            }),
          })),
          delete: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ error: null })),
          })),
        };
      }
      return { select: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ data: [], error: null })) })) };
    }) as never);
  });

  async function renderAndWaitForLoad() {
    render(
      <ManagePagesModal
        chapterId="chapter-1"
        chapterTitle="Chapter 1"
        seriesId="series-1"
        onClose={vi.fn()}
      />
    );
    await waitFor(() => expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument());
  }

  it('writes every page to a temp offset BEFORE writing any real final page_number (Save Order)', async () => {
    await renderAndWaitForLoad();

    // Move page 1 right (swap with page 2) — the classic adjacent-swap
    // scenario that used to collide when writes were fully concurrent.
    fireEvent.click(screen.getAllByTitle('Move right')[0]);
    fireEvent.click(screen.getAllByRole('button', { name: /Save Order/i })[0]);

    await waitFor(() => expect(updateCalls.length).toBe(6)); // 3 temp + 3 final

    const tempPhase = updateCalls.slice(0, 3);
    const finalPhase = updateCalls.slice(3, 6);

    // Every temp-phase write must be off the real 1..N range, and no
    // final-phase write may happen before ALL temp writes are issued.
    for (const call of tempPhase) {
      expect(call.page_number).toBeGreaterThanOrEqual(TEMP_OFFSET);
    }
    for (const call of finalPhase) {
      expect(call.page_number).toBeLessThan(TEMP_OFFSET);
    }

    // The two rows that actually swapped (p1<->p2) must end up with the
    // new numbers; p3 (untouched by the swap) keeps its position.
    const finalById = Object.fromEntries(finalPhase.map((c) => [c.id, c.page_number]));
    expect(finalById).toEqual({ p1: 2, p2: 1, p3: 3 });
  });

  it('never issues two DIFFERENT pages the same page_number as their simultaneous CURRENT value (no collision window)', async () => {
    await renderAndWaitForLoad();

    fireEvent.click(screen.getAllByTitle('Move right')[0]); // swap p1/p2
    fireEvent.click(screen.getAllByRole('button', { name: /Save Order/i })[0]);
    await waitFor(() => expect(updateCalls.length).toBe(6));

    // Simulate the DB state as each update "lands", in call order, and
    // assert no two rows are ever simultaneously equal — this is exactly
    // the invariant the old single-phase concurrent write could violate.
    const state = new Map(initialPages.map((p) => [p.id, p.page_number]));
    for (const call of updateCalls) {
      state.set(call.id, call.page_number);
      const values = [...state.values()];
      expect(new Set(values).size).toBe(values.length);
    }
  });

  it('also two-phases the post-delete gapless renumbering', async () => {
    await renderAndWaitForLoad();

    // Delete the middle page (p2) — two-click confirm.
    fireEvent.click(screen.getAllByTitle('Delete page')[1]); // p2, the middle page
    fireEvent.click(await screen.findByRole('button', { name: /Delete\?/i }));

    await waitFor(() => expect(updateCalls.length).toBe(4)); // 2 remaining pages x 2 phases

    const tempPhase = updateCalls.slice(0, 2);
    const finalPhase = updateCalls.slice(2, 4);
    for (const call of tempPhase) expect(call.page_number).toBeGreaterThanOrEqual(TEMP_OFFSET);

    const finalById = Object.fromEntries(finalPhase.map((c) => [c.id, c.page_number]));
    expect(finalById).toEqual({ p1: 1, p3: 2 }); // p3 shifts down from #3 to #2, gaplessly
  });
});
