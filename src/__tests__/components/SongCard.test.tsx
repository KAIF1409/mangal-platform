import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRouter } from 'next/navigation';
import SongCard, { type SongCardData } from '@/app/components/webmangal/SongCard';

const song: SongCardData = {
  id: 'song-9',
  title: 'Veera Ballad',
  genre: 'Folk',
  views: 9_500,
  block_count: 4,
  linked_series_title: 'Aryavarta Rising',
};

const router = () => useRouter() as unknown as { push: ReturnType<typeof vi.fn> };

beforeEach(() => {
  router().push.mockClear();
});

describe('SongCard — songs discovery card (Home/Library/Bookmarks/Search)', () => {
  it('links to the WebMangal song detail route', () => {
    render(<SongCard song={song} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/WebMangal/songs/song-9');
  });

  it('shows title, formatted views, and block count', () => {
    render(<SongCard song={song} />);
    expect(screen.getByText('Veera Ballad')).toBeInTheDocument();
    expect(screen.getByText('9.5K')).toBeInTheDocument();
    expect(screen.getByText('4 blocks')).toBeInTheDocument();
  });

  it('carries the Song chip and the "Based on <series>" badge when linked', () => {
    render(<SongCard song={song} />);
    expect(screen.getByText('Song')).toBeInTheDocument();
    expect(screen.getByText('Based on Aryavarta Rising')).toBeInTheDocument();
  });

  it('omits the based-on badge and block count when absent', () => {
    render(<SongCard song={{ id: 's2', title: 'Solo Song' }} />);
    expect(screen.queryByText(/Based on/)).not.toBeInTheDocument();
    expect(screen.queryByText(/blocks/)).not.toBeInTheDocument();
  });

  it('routes the creator byline to the Kalpana Circle broadcast channel', () => {
    render(<SongCard song={song} creatorUsername="kaif" />);
    fireEvent.click(screen.getByText('by @kaif'));
    expect(router().push).toHaveBeenCalledWith('/kalpana-circle/broadcast/kaif');
  });
});
