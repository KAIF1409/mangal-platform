import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveBookQueue } from '@/app/lib/books/libraryClient';
import { supabase } from '@/app/lib/supabase';

vi.mock('@/app/lib/supabase', () => ({ supabase: { rpc: vi.fn() } }));
beforeEach(() => vi.resetAllMocks());

describe('Book queue persistence', () => {
  it('uses the caller-scoped RPC without accepting a user ID', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: 7, error: null } as never);
    expect(await saveBookQueue(['a', 'b'], 6)).toEqual({ book_ids: ['a', 'b'], revision: 7 });
    expect(supabase.rpc).toHaveBeenCalledWith('save_book_reading_queue', { p_book_ids: ['a', 'b'], p_revision: 6 });
  });
  it('requires a reload for stale revisions', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { code: '40001' } } as never);
    await expect(saveBookQueue(['a'], 6)).rejects.toThrow('changed in another session');
  });
  it('never reports success for an unconfirmed response', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never);
    await expect(saveBookQueue([], 0)).rejects.toThrow('could not be confirmed');
  });
  it('rejects oversized/duplicate queues before making a request', async () => {
    await expect(saveBookQueue(['a', 'a'], 0)).rejects.toThrow('100 unique');
    await expect(saveBookQueue(Array.from({ length: 101 }, (_, i) => String(i)), 0)).rejects.toThrow('100 unique');
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});