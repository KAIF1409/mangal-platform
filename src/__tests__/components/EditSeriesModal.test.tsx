import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EditSeriesModal from '@/app/components/webmangal/EditSeriesModal';
import { supabase } from '@/app/lib/supabase';

// EditSeriesModal talks to `series`, `tags`, and `series_tags` — mock the
// whole chainable query-builder shape it uses (select/update/upsert/insert/
// delete/eq/order/in/maybeSingle/single all return `this` except the final
// awaited call, which resolves the given result).
vi.mock('@/app/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}));

function makeBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  const chain = ['select', 'update', 'upsert', 'insert', 'delete', 'eq', 'order', 'in'];
  for (const method of chain) {
    builder[method] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn(() => Promise.resolve(result));
  builder.single = vi.fn(() => Promise.resolve(result));
  // A bare `await supabase.from(...).select(...).eq(...)` (no .single()/
  // .maybeSingle()) resolves the builder itself as a thenable.
  (builder as unknown as { then: PromiseLike<unknown>['then'] }).then = (resolve) =>
    Promise.resolve(result).then(resolve as never);
  return builder;
}

const story = {
  id: 'series-1',
  title: 'Test Series',
  synopsis: 'A synopsis long enough to pass validation.',
  genre: 'Action',
  cover_url: null,
  reading_mode: 'scroll' as const,
  reading_direction: 'ltr' as const,
  completion_status: 'ongoing' as const,
  chapterCount: 0,
};

describe('EditSeriesModal — tag save (slug-collision fix)', () => {
  let fromMock: ReturnType<typeof vi.fn>;
  let tagsUpsertError: { message: string } | null;
  let tagsSlugLookup: { data: { id: string } | null };
  let insertedSeriesTags: unknown[];

  beforeEach(() => {
    tagsUpsertError = null;
    tagsSlugLookup = { data: null };
    insertedSeriesTags = [];
    fromMock = vi.fn((table: string) => {
      if (table === 'tags') {
        return {
          select: vi.fn(() => ({
            order: vi.fn(() => Promise.resolve({ data: [], error: null })),
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve(tagsSlugLookup)),
            })),
          })),
          upsert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(() =>
                Promise.resolve(
                  tagsUpsertError
                    ? { data: null, error: tagsUpsertError }
                    : { data: { id: 'new-tag-id' }, error: null }
                )
              ),
            })),
          })),
        };
      }
      if (table === 'series') {
        return makeBuilder({ data: { ...story }, error: null });
      }
      if (table === 'series_tags') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
          insert: vi.fn((rows: unknown[]) => {
            insertedSeriesTags = rows;
            return Promise.resolve({ data: null, error: null });
          }),
          delete: vi.fn(() => ({
            eq: vi.fn(() => ({ in: vi.fn(() => Promise.resolve({ data: null, error: null })) })),
          })),
        };
      }
      return makeBuilder({ data: null, error: null });
    });
    vi.mocked(supabase.from).mockImplementation(fromMock as never);
  });

  it('attaches a newly-created tag when the upsert succeeds cleanly', async () => {
    render(<EditSeriesModal story={story} userId="user-1" onClose={vi.fn()} onSaved={vi.fn()} />);
    await waitFor(() => expect(fromMock).toHaveBeenCalledWith('tags'));

    fireEvent.change(screen.getByPlaceholderText('Type a new tag not in the list above...'), {
      target: { value: 'Sci-Fi' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

    await waitFor(() => expect(insertedSeriesTags).toEqual([{ series_id: story.id, tag_id: 'new-tag-id' }]));
  });

  // Regression: the upsert onConflict:'name' doesn't catch a collision on
  // the SEPARATE unique `slug` constraint (a differently-worded name that
  // normalizes to an existing slug). Old code silently dropped the tag with
  // no error and no fallback. Fixed code must fall back to the existing
  // tag by slug and still attach it.
  it('falls back to the existing tag by slug when the upsert errors on a slug collision, and attaches it', async () => {
    tagsUpsertError = { message: 'duplicate key value violates unique constraint "tags_slug_key"' };
    tagsSlugLookup = { data: { id: 'existing-scifi-tag-id' } };

    render(<EditSeriesModal story={story} userId="user-1" onClose={vi.fn()} onSaved={vi.fn()} />);
    await waitFor(() => expect(fromMock).toHaveBeenCalledWith('tags'));

    fireEvent.change(screen.getByPlaceholderText('Type a new tag not in the list above...'), {
      target: { value: 'Sci Fi' }, // different literal name, same slug as an existing "Sci-Fi" tag
    });
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

    await waitFor(() =>
      expect(insertedSeriesTags).toEqual([{ series_id: story.id, tag_id: 'existing-scifi-tag-id' }])
    );
  });

  // Regression: when the tag truly can't be resolved (upsert fails AND no
  // existing tag matches the slug), the old code failed completely
  // silently. Fixed code must surface a visible warning instead of just
  // dropping it with no feedback.
  it('shows a warning (not silence) when the tag can be neither created nor found', async () => {
    tagsUpsertError = { message: 'some transient failure' };
    tagsSlugLookup = { data: null };

    render(<EditSeriesModal story={story} userId="user-1" onClose={vi.fn()} onSaved={vi.fn()} />);
    await waitFor(() => expect(fromMock).toHaveBeenCalledWith('tags'));

    fireEvent.change(screen.getByPlaceholderText('Type a new tag not in the list above...'), {
      target: { value: 'Brand New Tag' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

    expect(await screen.findByText(/Couldn't add tag "Brand New Tag"/i)).toBeInTheDocument();
    // The series save itself must still have gone through (non-fatal).
    expect(insertedSeriesTags).toEqual([]);
  });

  it('does not touch tags at all when no new tag was typed', async () => {
    render(<EditSeriesModal story={story} userId="user-1" onClose={vi.fn()} onSaved={vi.fn()} />);
    await waitFor(() => expect(fromMock).toHaveBeenCalledWith('tags'));

    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

    await waitFor(() => expect(fromMock).toHaveBeenCalledWith('series_tags'));
    expect(insertedSeriesTags).toEqual([]);
  });
});
