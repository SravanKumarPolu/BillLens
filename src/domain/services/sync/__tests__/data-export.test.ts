import { describe, expect, it } from '@jest/globals';

import {
  csvEscape,
  csvRow,
  buildCsv,
  BACKUP_SCHEMA_VERSION,
  isBackupSchemaSupported,
  generateRestoreSummary,
  verifyPayerTotals,
  verifySplitTotals,
  verifyZeroSumInvariant,
  verifyReversalNeutralisation,
  type BackupFile,
  type BackupExpense,
  type BackupSettlement,
} from '../data-export';

const NOW = '2026-10-10T10:00:00.000Z' as never;

describe('CSV export', () => {
  it('escapes values with commas', () => {
    expect(csvEscape('hello,world')).toBe('"hello,world"');
  });

  it('escapes values with double quotes', () => {
    expect(csvEscape('say "hello"')).toBe('"say ""hello"""');
  });

  it('escapes values with newlines', () => {
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"');
  });

  it('returns empty for null/undefined', () => {
    expect(csvEscape(null)).toBe('');
    expect(csvEscape(undefined)).toBe('');
  });

  it('does NOT escape simple values', () => {
    expect(csvEscape('hello')).toBe('hello');
    expect(csvEscape(42)).toBe('42');
  });

  it('builds a CSV row', () => {
    expect(csvRow(['a', 'b,c', null])).toBe('a,"b,c",');
  });

  it('builds a full CSV file', () => {
    const csv = buildCsv(['id', 'title'], [['1', 'Hello'], ['2', 'World']]);
    expect(csv).toBe('id,title\n1,Hello\n2,World');
  });
});

describe('JSON backup', () => {
  it('BACKUP_SCHEMA_VERSION is 1', () => {
    expect(BACKUP_SCHEMA_VERSION).toBe(1);
  });

  it('isBackupSchemaSupported returns true for matching version', () => {
    const backup: BackupFile = {
      schemaVersion: 1,
      exportVersion: 1,
      appVersion: '1.0.0',
      generatedAt: NOW,
      groups: [],
      settlements: [],
      auditReferences: [],
    };
    expect(isBackupSchemaSupported(backup)).toBe(true);
  });

  it('isBackupSchemaSupported returns false for mismatched version', () => {
    const backup: BackupFile = {
      schemaVersion: 99,
      exportVersion: 1,
      appVersion: '1.0.0',
      generatedAt: NOW,
      groups: [],
      settlements: [],
      auditReferences: [],
    };
    expect(isBackupSchemaSupported(backup)).toBe(false);
  });

  it('generateRestoreSummary counts entities correctly', () => {
    const backup: BackupFile = {
      schemaVersion: 1,
      exportVersion: 1,
      appVersion: '1.0.0',
      generatedAt: NOW,
      groups: [
        {
          id: 'g-1',
          name: 'Trip',
          currencyCode: 'INR',
          members: [
            { id: 'm-1', displayName: 'A', role: 'member', joinedAt: NOW },
            { id: 'm-2', displayName: 'B', role: 'member', joinedAt: NOW },
          ],
          expenses: [
            {
              id: 'e-1', title: 'Dinner', amountMinor: 1000, currencyCode: 'INR',
              expenseDate: NOW, splitType: 'equal', version: 1, createdAt: NOW, updatedAt: NOW,
              payers: [{ memberId: 'm-1', amountMinor: 1000 }],
              splits: [{ memberId: 'm-1', amountMinor: 500 }, { memberId: 'm-2', amountMinor: 500 }],
            },
          ],
        },
      ],
      settlements: [
        {
          id: 's-1', groupId: 'g-1', fromMemberId: 'm-2', toMemberId: 'm-1',
          amountMinor: 500, currencyCode: 'INR', method: 'upi', version: 1,
          settlementDate: NOW, createdAt: NOW, updatedAt: NOW,
        },
      ],
      auditReferences: [],
    };
    const summary = generateRestoreSummary(backup);
    expect(summary.totalGroups).toBe(1);
    expect(summary.totalMembers).toBe(2);
    expect(summary.totalExpenses).toBe(1);
    expect(summary.totalSettlements).toBe(1);
  });
});

describe('Post-restore invariants', () => {
  it('verifies payer totals match expense total', () => {
    const expense: BackupExpense = {
      id: 'e-1', title: 'Dinner', amountMinor: 1000, currencyCode: 'INR',
      expenseDate: NOW, splitType: 'equal', version: 1, createdAt: NOW, updatedAt: NOW,
      payers: [{ memberId: 'm-1', amountMinor: 1000 }],
      splits: [],
    };
    expect(verifyPayerTotals(expense).passed).toBe(true);
  });

  it('detects payer total mismatch', () => {
    const expense: BackupExpense = {
      id: 'e-1', title: 'Dinner', amountMinor: 1000, currencyCode: 'INR',
      expenseDate: NOW, splitType: 'equal', version: 1, createdAt: NOW, updatedAt: NOW,
      payers: [{ memberId: 'm-1', amountMinor: 500 }],
      splits: [],
    };
    expect(verifyPayerTotals(expense).passed).toBe(false);
  });

  it('verifies split totals match expense total', () => {
    const expense: BackupExpense = {
      id: 'e-1', title: 'Dinner', amountMinor: 1000, currencyCode: 'INR',
      expenseDate: NOW, splitType: 'equal', version: 1, createdAt: NOW, updatedAt: NOW,
      payers: [],
      splits: [{ memberId: 'm-1', amountMinor: 500 }, { memberId: 'm-2', amountMinor: 500 }],
    };
    expect(verifySplitTotals(expense).passed).toBe(true);
  });

  it('verifies zero-sum invariant', () => {
    expect(verifyZeroSumInvariant({ INR: 0, USD: 0 }).passed).toBe(true);
    expect(verifyZeroSumInvariant({ INR: 100 }).passed).toBe(false);
  });

  it('verifies reversal neutralisation', () => {
    const settlements: BackupSettlement[] = [
      {
        id: 's-1', groupId: 'g-1', fromMemberId: 'm-1', toMemberId: 'm-2',
        amountMinor: 500, currencyCode: 'INR', method: 'upi', version: 1,
        settlementDate: NOW, createdAt: NOW, updatedAt: NOW,
      },
      {
        id: 's-2', groupId: 'g-1', fromMemberId: 'm-2', toMemberId: 'm-1',
        amountMinor: 500, currencyCode: 'INR', method: 'upi', version: 1,
        settlementDate: NOW, createdAt: NOW, updatedAt: NOW,
        reversalOfSettlementId: 's-1',
      },
    ];
    expect(verifyReversalNeutralisation(settlements).passed).toBe(true);
  });

  it('detects missing reversal original', () => {
    const settlements: BackupSettlement[] = [
      {
        id: 's-2', groupId: 'g-1', fromMemberId: 'm-2', toMemberId: 'm-1',
        amountMinor: 500, currencyCode: 'INR', method: 'upi', version: 1,
        settlementDate: NOW, createdAt: NOW, updatedAt: NOW,
        reversalOfSettlementId: 's-missing',
      },
    ];
    expect(verifyReversalNeutralisation(settlements).passed).toBe(false);
  });
});
