import { describe, expect, it } from 'vitest';
import {
  buildUpiUri,
  generateReferenceCode,
  isValidIndianPhone,
  isValidUpiId,
} from '@/app/lib/payments/upi';

describe('isValidUpiId — direct-to-VPA rail (§141)', () => {
  it('accepts realistic VPAs', () => {
    expect(isValidUpiId('kaif@okhdfcbank')).toBe(true);
    expect(isValidUpiId('user.name-1@ybl')).toBe(true);
    expect(isValidUpiId('  founder@upi  ')).toBe(true); // trims
  });

  it('rejects obviously-malformed input', () => {
    expect(isValidUpiId('no-at-sign')).toBe(false);
    expect(isValidUpiId('a@b')).toBe(false); // handle must be ≥2 alphabetic chars
    expect(isValidUpiId('name@123')).toBe(false); // handle must be alphabetic
    expect(isValidUpiId('@okaxis')).toBe(false);
    expect(isValidUpiId('')).toBe(false);
  });
});

describe('isValidIndianPhone — payout contact validation', () => {
  it('accepts 10-digit numbers starting 6-9', () => {
    expect(isValidIndianPhone('9876543210')).toBe(true);
    expect(isValidIndianPhone('6123456789')).toBe(true);
  });

  it('accepts +91 / 91 prefixes and spaces/dashes', () => {
    expect(isValidIndianPhone('+919876543210')).toBe(true);
    expect(isValidIndianPhone('91 98765 43210')).toBe(true);
    expect(isValidIndianPhone('98765-43210')).toBe(true);
  });

  it('rejects wrong starting digit, short numbers, and garbage', () => {
    expect(isValidIndianPhone('5876543210')).toBe(false);
    expect(isValidIndianPhone('987654321')).toBe(false);
    expect(isValidIndianPhone('not-a-phone')).toBe(false);
  });
});

describe('generateReferenceCode — statement-grep payment note', () => {
  it('always matches MANGAL-<6 unambiguous chars>', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateReferenceCode()).toMatch(/^MANGAL-[A-HJ-NP-Z2-9]{6}$/);
    }
  });

  it('never contains visually ambiguous characters (0/O/1/I)', () => {
    for (let i = 0; i < 50; i++) {
      expect(/[01OI]/.test(generateReferenceCode())).toBe(false);
    }
  });

  it('is random enough for hand-matching (not a single fixed code)', () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateReferenceCode()));
    expect(codes.size).toBeGreaterThan(1);
  });
});

describe('buildUpiUri — upi://pay deep link', () => {
  it('carries payee VPA, name, amount, currency and note', () => {
    const uri = buildUpiUri({
      vpa: 'kaif@okhdfcbank',
      payeeName: 'MANGAL Creator',
      amountRupees: 49,
      note: 'MANGAL-ABC234 Book purchase',
    });
    expect(uri.startsWith('upi://pay?')).toBe(true);
    const qs = new URLSearchParams(uri.slice('upi://pay?'.length));
    expect(qs.get('pa')).toBe('kaif@okhdfcbank');
    expect(qs.get('pn')).toBe('MANGAL Creator');
    expect(qs.get('am')).toBe('49.00');
    expect(qs.get('cu')).toBe('INR');
    expect(qs.get('tn')).toBe('MANGAL-ABC234 Book purchase');
  });

  it('formats paise amounts with exactly two decimals', () => {
    const qs = new URLSearchParams(
      buildUpiUri({ vpa: 'a@b', payeeName: 'x', amountRupees: 99.5, note: 'n' }).slice(10),
    );
    expect(qs.get('am')).toBe('99.50');
  });
});
