import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProductVisitTracker from '@/app/components/shared/ProductVisitTracker';
import { recordProductVisit } from '@/app/lib/backNav';

// ProductVisitTracker renders nothing — it just mirrors route changes into
// the cross-product back-nav store (lib/backNav).
vi.mock('@/app/lib/backNav', () => ({
  recordProductVisit: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(recordProductVisit).mockClear();
});

describe('ProductVisitTracker — cross-product visit recorder', () => {
  it('renders nothing to the DOM', () => {
    const { container } = render(<ProductVisitTracker />);
    expect(container.innerHTML).toBe('');
  });

  it('records the current pathname on mount', () => {
    render(<ProductVisitTracker />);
    expect(recordProductVisit).toHaveBeenCalledWith('/');
  });
});
