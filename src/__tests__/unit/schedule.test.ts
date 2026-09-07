// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { toLocalDateTimeInput } from '@/app/lib/webmangal/schedule';

describe('chapter schedule editing', () => {
  it('round-trips a release instant in the current timezone without shifting it', () => {
    const iso = '2026-09-07T10:30:00.000Z';
    const input = toLocalDateTimeInput(iso);
    expect(new Date(input).toISOString()).toBe(iso);
    expect(input).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
  it.each([null, undefined, '', 'invalid'])('handles absent/invalid input %s', value => {
    expect(toLocalDateTimeInput(value)).toBe('');
  });
});