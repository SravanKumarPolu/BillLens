import { describe, expect, it } from '@jest/globals';

import {
  threeWayMerge,
  FINANCIAL_FIELDS,
  isHighPriorityConflict,
  HIGH_PRIORITY_CONFLICT_TYPES,
} from '../conflict-resolution';

describe('Three-way merge', () => {
  it('auto-merges when only local changed a non-financial field', () => {
    const result = threeWayMerge(
      { title: 'Dinner', note: '', amountMinor: 5000 },
      { title: 'Dinner', note: 'New note', amountMinor: 5000 },
      { title: 'Dinner', note: '', amountMinor: 5000 },
    );
    expect(result.canAutoMerge).toBe(true);
    expect(result.mergedSnapshot?.['note']).toBe('New note');
  });

  it('auto-merges when only remote changed a non-financial field', () => {
    const result = threeWayMerge(
      { title: 'Dinner', note: '', amountMinor: 5000 },
      { title: 'Dinner', note: '', amountMinor: 5000 },
      { title: 'Dinner', note: 'Remote note', amountMinor: 5000 },
    );
    expect(result.canAutoMerge).toBe(true);
    expect(result.mergedSnapshot?.['note']).toBe('Remote note');
  });

  it('creates conflict when both changed the same non-financial field', () => {
    const result = threeWayMerge(
      { title: 'Dinner' },
      { title: 'Dinner for 3' },
      { title: 'Lunch' },
    );
    expect(result.canAutoMerge).toBe(false);
    expect(result.conflictingFields).toHaveLength(1);
    expect(result.conflictingFields[0]?.fieldName).toBe('title');
  });

  it('creates financial conflict when both changed amountMinor', () => {
    const result = threeWayMerge(
      { amountMinor: 5000 },
      { amountMinor: 5500 },
      { amountMinor: 6000 },
    );
    expect(result.canAutoMerge).toBe(false);
    expect(result.hasFinancialConflict).toBe(true);
    expect(result.conflictingFields).toHaveLength(1);
    expect(result.conflictingFields[0]?.fieldName).toBe('amountMinor');
  });

  it('converges when both changed to the same value', () => {
    const result = threeWayMerge(
      { title: 'Dinner' },
      { title: 'Lunch' },
      { title: 'Lunch' },
    );
    expect(result.canAutoMerge).toBe(true);
    expect(result.mergedSnapshot?.['title']).toBe('Lunch');
  });

  it('uses base when neither changed', () => {
    const result = threeWayMerge(
      { title: 'Dinner', amountMinor: 5000 },
      { title: 'Dinner', amountMinor: 5000 },
      { title: 'Dinner', amountMinor: 5000 },
    );
    expect(result.canAutoMerge).toBe(true);
    expect(result.mergedSnapshot?.['title']).toBe('Dinner');
  });

  it('FINANCIAL_FIELDS includes amount, currency, payer, status', () => {
    expect(FINANCIAL_FIELDS).toContain('amountMinor');
    expect(FINANCIAL_FIELDS).toContain('currencyCode');
    expect(FINANCIAL_FIELDS).toContain('fromMemberId');
    expect(FINANCIAL_FIELDS).toContain('status');
  });
});

describe('Conflict priority', () => {
  it('identifies high-priority conflicts', () => {
    expect(isHighPriorityConflict('expense_amount_changed')).toBe(true);
    expect(isHighPriorityConflict('settlement_confirmed_while_edited')).toBe(true);
    expect(isHighPriorityConflict('some_normal_conflict')).toBe(false);
  });

  it('HIGH_PRIORITY_CONFLICT_TYPES is non-empty', () => {
    expect(HIGH_PRIORITY_CONFLICT_TYPES.length).toBeGreaterThan(0);
  });
});
