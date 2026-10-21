import { describe, expect, it } from '@jest/globals';

import {
  advanceOccurrence,
  dueOccurrences,
  validateRule,
} from '@domain/recurring/schedule';

describe('recurring schedule', () => {
  it('advances daily and weekly by the interval', () => {
    expect(
      advanceOccurrence('2026-10-01', {
        frequency: 'daily',
        intervalCount: 3,
        startDate: '2026-10-01',
      }),
    ).toBe('2026-10-04');
    expect(
      advanceOccurrence('2026-10-01', {
        frequency: 'weekly',
        intervalCount: 2,
        startDate: '2026-10-01',
      }),
    ).toBe('2026-10-15');
  });

  it('clamps month-end and returns to the anchor day afterwards', () => {
    const rule = { frequency: 'monthly' as const, intervalCount: 1, startDate: '2026-01-31' };
    expect(advanceOccurrence('2026-01-31', rule)).toBe('2026-02-28');
    expect(advanceOccurrence('2026-02-28', rule)).toBe('2026-03-31');
  });

  it('handles leap-year February', () => {
    const rule = { frequency: 'monthly' as const, intervalCount: 1, startDate: '2028-01-31' };
    expect(advanceOccurrence('2028-01-31', rule)).toBe('2028-02-29');
  });

  it('stops at the end date and caps the batch', () => {
    const rule = {
      frequency: 'daily' as const,
      intervalCount: 1,
      startDate: '2026-10-01',
      endDate: '2026-10-03',
    };
    expect(dueOccurrences('2026-10-01', rule, '2026-10-10', 50)).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
    ]);
    expect(
      dueOccurrences('2026-10-01', { ...rule, endDate: undefined }, '2026-12-31', 5),
    ).toHaveLength(5);
  });

  it('advances yearly and clamps a 29 February anchor', () => {
    expect(
      advanceOccurrence('2028-02-29', {
        frequency: 'yearly',
        intervalCount: 1,
        startDate: '2028-02-29',
      }),
    ).toBe('2029-02-28');
    expect(
      advanceOccurrence('2028-02-29', {
        frequency: 'yearly',
        intervalCount: 4,
        startDate: '2028-02-29',
      }),
    ).toBe('2032-02-29');
  });

  it('rejects invalid rules', () => {
    expect(() =>
      validateRule({ frequency: 'monthly', intervalCount: 0, startDate: '2026-01-01' }),
    ).toThrow(/interval/);
    expect(() =>
      validateRule({
        frequency: 'monthly',
        intervalCount: 1,
        startDate: '2026-02-01',
        endDate: '2026-01-01',
      }),
    ).toThrow(/End date/);
  });
});
