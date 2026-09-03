import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Footer from '@/app/components/shared/Footer';

describe('Footer — shared site footer (MANGAL brand block)', () => {
  it('defaults to the MANGAL platform name and standard tagline', () => {
    render(<Footer />);
    expect(screen.getByText('MANGAL')).toBeInTheDocument();
    expect(screen.getByText("India's home for original comics & novels. Made with love in Bharat.")).toBeInTheDocument();
  });

  it('shows the MANGAL logo image in the brand block', () => {
    render(<Footer />);
    expect(screen.getByAltText('MANGAL')).toHaveAttribute('src', '/icon.png');
  });

  it('renders the default legal link set', () => {
    render(<Footer />);
    for (const label of ['Home', 'About', 'Help Center', 'Privacy Policy', 'Terms of Service', 'Grievance Officer']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy');
  });

  it('can render a per-product name (e.g. WebMangal pages)', () => {
    render(<Footer platformName="WebMangal" />);
    expect(screen.getByText('WebMangal')).toBeInTheDocument();
  });

  it('links the brand block to logoHref and opens external hrefs safely', () => {
    const { rerender } = render(<Footer logoHref="/WebMangal" />);
    const brandLink = screen.getByText('MANGAL').closest('a') as HTMLAnchorElement;
    expect(brandLink).toHaveAttribute('href', '/WebMangal');
    expect(brandLink).not.toHaveAttribute('target');

    rerender(<Footer logoHref="https://mangal.example.com" />);
    const external = screen.getByText('MANGAL').closest('a') as HTMLAnchorElement;
    expect(external).toHaveAttribute('target', '_blank');
    expect(external).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('can hide the brand block entirely (links-only footer)', () => {
    render(<Footer showBrandBlock={false} />);
    expect(screen.queryByAltText('MANGAL')).not.toBeInTheDocument();
    expect(screen.queryByText('MANGAL')).not.toBeInTheDocument();
  });
});
