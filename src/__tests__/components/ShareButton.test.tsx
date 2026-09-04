import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ShareButton from '@/app/components/webmangal/ShareButton';

// jsdom does NOT implement the Clipboard API (navigator.clipboard is
// undefined) or document.execCommand by default — which conveniently
// mirrors the real "unsupported" case (e.g. WhatsApp/Instagram in-app
// Android WebViews) this component needs to handle gracefully. Each test
// stubs only what that specific scenario needs.

function openMenu() {
  render(<ShareButton title="My Series" url="https://mangal.example/WebMangal/series/abc" />);
  fireEvent.click(screen.getByRole('button'));
}

const originalClipboard = navigator.clipboard;
const originalExecCommand = document.execCommand;

afterEach(() => {
  Object.defineProperty(navigator, 'clipboard', { value: originalClipboard, configurable: true, writable: true });
  document.execCommand = originalExecCommand as typeof document.execCommand;
  vi.restoreAllMocks();
});

describe('ShareButton — Copy Link (Clipboard API availability)', () => {
  it('shows "Copied!" when the Clipboard API is available and succeeds', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(() => Promise.resolve()) },
      configurable: true,
      writable: true,
    });

    openMenu();
    fireEvent.click(screen.getByRole('button', { name: /Copy Link/i }));

    expect(await screen.findByText('Copied!')).toBeInTheDocument();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://mangal.example/WebMangal/series/abc');
  });

  // Regression: the old code called navigator.clipboard.writeText()
  // directly with no capability check. In a real WhatsApp/Instagram
  // in-app browser (this exact menu's other option is "Share on
  // WhatsApp"), navigator.clipboard is undefined — so the OLD code threw
  // a synchronous TypeError on click instead of falling back to anything.
  it('does NOT throw and falls back to execCommand when navigator.clipboard is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true, writable: true });
    document.execCommand = vi.fn(() => true) as typeof document.execCommand;

    openMenu();
    expect(() => fireEvent.click(screen.getByRole('button', { name: /Copy Link/i }))).not.toThrow();

    expect(await screen.findByText('Copied!')).toBeInTheDocument();
    expect(document.execCommand).toHaveBeenCalledWith('copy');
  });

  it('falls back to execCommand when the Clipboard API is present but rejects (e.g. unfocused document)', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(() => Promise.reject(new Error('Document is not focused.'))) },
      configurable: true,
      writable: true,
    });
    document.execCommand = vi.fn(() => true) as typeof document.execCommand;

    openMenu();
    fireEvent.click(screen.getByRole('button', { name: /Copy Link/i }));

    expect(await screen.findByText('Copied!')).toBeInTheDocument();
  });

  // Regression: when there is truly no way to copy (both the modern API
  // and the legacy fallback fail/are absent), the old code gave zero
  // feedback — the click just silently did nothing. Fixed code must show
  // a visible failure state instead of pretending it worked or going silent.
  it('shows a visible failure state (not silence) when neither the Clipboard API nor execCommand work', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true, writable: true });
    document.execCommand = undefined as unknown as typeof document.execCommand; // jsdom's real default

    openMenu();
    expect(() => fireEvent.click(screen.getByRole('button', { name: /Copy Link/i }))).not.toThrow();

    expect(await screen.findByText(/Couldn't copy/i)).toBeInTheDocument();
  });
});
