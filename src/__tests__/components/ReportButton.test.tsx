import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReportButton from '@/app/components/webmangal/ReportButton';
import { supabase } from '@/app/lib/supabase';

// ReportButton guards its modal behind a real auth check (auth-first click
// fix), inserts into the `reports` table, and shows a submitted confirmation.
vi.mock('@/app/lib/supabase', () => ({
  supabase: {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
  },
}));

const authedUser = { data: { user: { id: 'user-1' } } };
const anonUser = { data: { user: null } };

const insert = vi.fn();

beforeEach(() => {
  vi.mocked(supabase.auth.getUser).mockReset();
  insert.mockReset();
  vi.mocked(supabase.from).mockReset();
  vi.mocked(supabase.from).mockReturnValue({ insert } as never);
});

describe('ReportButton — content reporting (WebMangal series/songs/chapters)', () => {
  it('opens the modal for a signed-in reader with all four reasons', async () => {
    vi.mocked(supabase.auth.getUser).mockResolvedValue(authedUser as never);
    render(<ReportButton targetType="series" targetId="abc" />);
    fireEvent.click(screen.getByTitle('Report this content'));
    expect(await screen.findByText('Report content')).toBeInTheDocument();
    for (const reason of ['Inappropriate', 'Spam', 'Copyright', 'Other']) {
      expect(screen.getByRole('button', { name: reason })).toBeInTheDocument();
    }
  });

  it('does NOT open the modal for a signed-out reader (auth-first gate)', async () => {
    vi.mocked(supabase.auth.getUser).mockResolvedValue(anonUser as never);
    render(<ReportButton targetType="series" targetId="abc" />);
    fireEvent.click(screen.getByTitle('Report this content'));
    await waitFor(() => expect(supabase.auth.getUser).toHaveBeenCalled());
    expect(screen.queryByText('Report content')).not.toBeInTheDocument();
  });

  it('blocks submission until a reason is picked, then inserts the report', async () => {
    vi.mocked(supabase.auth.getUser).mockResolvedValue(authedUser as never);
    insert.mockResolvedValue({ error: null });
    render(<ReportButton targetType="song" targetId="song-1" />);

    fireEvent.click(screen.getByTitle('Report this content'));
    const submit = await screen.findByRole('button', { name: 'Submit Report' });
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Copyright' }));
    fireEvent.click(screen.getByPlaceholderText('Additional details (optional)'));
    fireEvent.change(screen.getByPlaceholderText('Additional details (optional)'), {
      target: { value: 'stolen artwork' },
    });

    await waitFor(() => expect(submit).not.toBeDisabled());
    fireEvent.click(submit);

    await screen.findByText('Thanks — your report has been submitted for review.');
    expect(insert).toHaveBeenCalledWith({
      target_type: 'song',
      target_id: 'song-1',
      reporter_id: 'user-1',
      reason: 'Copyright',
      details: 'stolen artwork',
    });
  });

  it('shows an error state when the insert fails', async () => {
    vi.mocked(supabase.auth.getUser).mockResolvedValue(authedUser as never);
    insert.mockResolvedValue({ error: { message: 'constraint violation' } });
    render(<ReportButton targetType="series" targetId="abc" />);

    fireEvent.click(screen.getByTitle('Report this content'));
    fireEvent.click(await screen.findByRole('button', { name: 'Spam' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit Report' }));

    expect(await screen.findByText('Something went wrong. Please try again.')).toBeInTheDocument();
    expect(screen.queryByText('Thanks — your report has been submitted for review.')).not.toBeInTheDocument();
  });
});
