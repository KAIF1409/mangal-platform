import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import MangalLogo from '@/app/components/shared/MangalLogo';

// The MANGAL company mark — must always be /icon.png with alt "MANGAL",
// wrapped in the fixed orange→green brand gradient (light AND dark theme).
describe('MangalLogo — official MANGAL brand mark', () => {
  it('renders /icon.png with the accessible name MANGAL', () => {
    render(<MangalLogo />);
    const img = screen.getByAltText('MANGAL');
    expect(img).toHaveAttribute('src', '/icon.png');
    expect(img.tagName).toBe('IMG');
  });

  it('wraps the mark in the fixed gradient ring (theme-independent)', () => {
    const { container } = render(<MangalLogo size={40} />);
    const wrapper = container.firstElementChild as HTMLElement;
    // jsdom normalizes hex colors to rgb() — #f97316 = rgb(249,115,22),
    // #16a34a = rgb(22,163,74).
    expect(wrapper.style.background).toContain('linear-gradient');
    expect(wrapper.style.background).toContain('rgb(249, 115, 22)');
    expect(wrapper.style.background).toContain('rgb(22, 163, 74)');
  });

  it('honors the size prop for both wrapper and image', () => {
    const { container } = render(<MangalLogo size={48} />);
    const wrapper = container.firstElementChild as HTMLElement;
    const img = wrapper.querySelector('img') as HTMLImageElement;
    expect(img).toHaveAttribute('width', '48');
    expect(img).toHaveAttribute('height', '48');
    // Ring radius scales with size (0.3 × 48 = 14px).
    expect(wrapper.style.borderRadius).toBe('14px');
  });
});
