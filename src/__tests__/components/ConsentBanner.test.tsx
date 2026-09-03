import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import ConsentBanner, { hasConsent } from '@/app/components/shared/ConsentBanner';
import { CONSENT_VERSION } from '@/app/lib/compliance/dpdp';

const stored = (status: 'accepted' | 'declined', version = CONSENT_VERSION) =>
  localStorage.setItem(
    'mangal_consent_v1',
    JSON.stringify({ status, version, at: new Date().toISOString() }),
  );

beforeEach(() => {
  localStorage.clear();
});

describe('ConsentBanner — DPDP Rules 2025 consent flow', () => {
  it('shows the dialog for first-time visitors', async () => {
    render(<ConsentBanner />);
    expect(
      await screen.findByRole('dialog', { name: 'Cookie and data consent' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Privacy Policy/)).toBeInTheDocument();
  });

  it('Accept persists {status: accepted, current version} and dismisses the banner', async () => {
    render(<ConsentBanner />);
    fireEvent.click(await screen.findByRole('button', { name: 'Accept' }));
    const record = JSON.parse(localStorage.getItem('mangal_consent_v1')!);
    expect(record.status).toBe('accepted');
    expect(record.version).toBe(CONSENT_VERSION);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(hasConsent()).toBe(true);
  });

  it('Decline persists {status: declined} and dismisses the banner (reading stays free)', async () => {
    render(<ConsentBanner />);
    fireEvent.click(await screen.findByRole('button', { name: 'Decline' }));
    const record = JSON.parse(localStorage.getItem('mangal_consent_v1')!);
    expect(record.status).toBe('declined');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(hasConsent()).toBe(false);
  });

  it('stays hidden when same-version consent already exists', async () => {
    stored('accepted');
    render(<ConsentBanner />);
    // Give the effect a tick, then confirm nothing rendered.
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('re-prompts when the stored consent version is outdated', async () => {
    stored('accepted', '2020-01-01');
    render(<ConsentBanner />);
    expect(
      await screen.findByRole('dialog', { name: 'Cookie and data consent' }),
    ).toBeInTheDocument();
  });

  it('re-prompts on corrupted storage', async () => {
    localStorage.setItem('mangal_consent_v1', '{not json');
    render(<ConsentBanner />);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});

describe('hasConsent() — the gate for non-essential localStorage writes', () => {
  it('is false when nothing is stored (SSR-safe / fresh browser)', () => {
    expect(hasConsent()).toBe(false);
  });

  it('is false for a decline even at the current version', () => {
    stored('declined');
    expect(hasConsent()).toBe(false);
  });

  it('is false for an acceptance at an outdated version', () => {
    stored('accepted', '2020-01-01');
    expect(hasConsent()).toBe(false);
  });

  it('is true only for accepted + current version', () => {
    stored('accepted');
    expect(hasConsent()).toBe(true);
  });
});
