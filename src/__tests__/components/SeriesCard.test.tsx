import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRouter } from 'next/navigation';
import SeriesCard, { type SeriesCardData } from '@/app/components/webmangal/SeriesCard';

const base: SeriesCardData = {
  id: 's-123',
  title: 'Aryavarta Rising',
  genre: 'Mythology',
  content_type: 'mangal',
  reading_mode: 'scroll',
  completion_status: 'ongoing',
  views: 1234,
  chapter_count: 12,
};

const router = () => useRouter() as unknown as { push: ReturnType<typeof vi.fn> };

beforeEach(() => {
  router().push.mockClear();
});

describe('SeriesCard — shared discovery card (Home/Search/Rankings/Tags)', () => {
  it('links to the WebMangal series detail route', () => {
    render(<SeriesCard series={base} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/WebMangal/series/s-123');
  });

  it('shows the title, formatted views, and chapter count', () => {
    render(<SeriesCard series={base} />);
    expect(screen.getByText('Aryavarta Rising')).toBeInTheDocument();
    expect(screen.getByText('1.2K')).toBeInTheDocument(); // formatViews(1234)
    expect(screen.getByText('12 ch')).toBeInTheDocument();
  });

  it('labels mangal vs novel content types', () => {
    const { rerender } = render(<SeriesCard series={base} />);
    expect(screen.getByText('Mangal')).toBeInTheDocument();
    expect(screen.queryByText('Novel')).not.toBeInTheDocument();

    rerender(<SeriesCard series={{ ...base, content_type: 'novel' }} />);
    expect(screen.getByText('Novel')).toBeInTheDocument();
  });

  it('shows the Scroll/Page chip only for non-novel content', () => {
    render(<SeriesCard series={base} />);
    expect(screen.getByText('Scroll')).toBeInTheDocument();
  });

  it('renders a rank badge when a rank is supplied', () => {
    render(<SeriesCard series={base} rank={2} />);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('shows completion-status chips for completed/hiatus (not ongoing)', () => {
    const { rerender } = render(<SeriesCard series={{ ...base, completion_status: 'completed' }} />);
    expect(screen.getByText('completed')).toBeInTheDocument();

    rerender(<SeriesCard series={{ ...base, completion_status: 'hiatus' }} />);
    expect(screen.getByText('hiatus')).toBeInTheDocument();

    rerender(<SeriesCard series={{ ...base, completion_status: 'ongoing' }} />);
    expect(screen.queryByText('ongoing')).not.toBeInTheDocument();
  });

  it('navigates to the WebMangal creator profile when "by @user" is clicked', () => {
    render(<SeriesCard series={base} creatorUsername="kaif" />);
    const byline = screen.getByText('by @kaif');
    fireEvent.click(byline);
    expect(router().push).toHaveBeenCalledWith('/WebMangal/creator/kaif');
  });

  it('falls back to a type-icon placeholder when there is no cover', () => {
    render(<SeriesCard series={base} />);
    // No <img> should render without a cover_url.
    expect(document.querySelector('img')).toBeNull();
  });

  it('renders the cover image with the title as alt text when present', () => {
    render(<SeriesCard series={{ ...base, cover_url: 'https://img.supabase.co/cover.jpg' }} />);
    expect(screen.getByAltText('Aryavarta Rising')).toBeInTheDocument();
  });
});
