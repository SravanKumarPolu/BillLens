/**
 * Accounting export tests.
 *
 * Phase 10 Prompt 99.
 */

import { describe, expect, it } from '@jest/globals';

import {
  type AccountingFormat,
  type ExportInput,
  buildAccountingExport,
  exportToFormat,
} from '../accounting-export';

const SAMPLE_EXPENSES: readonly ExportInput[] = [
  {
    date: '2026-07-01',
    amountMinor: 1250,
    currency: 'USD',
    title: 'Lunch at Starbucks',
    category: 'Food',
  },
  {
    date: '2026-07-02',
    amountMinor: 4500,
    currency: 'USD',
    title: 'Hotel "Marriott"',
    category: 'Travel',
  },
  {
    date: '2026-07-03',
    amountMinor: 999,
    currency: 'USD',
    title: 'Taxi',
    // no category — should default to 'Uncategorised'
  },
];

describe('exportToFormat — CSV (csv_generic)', () => {
  it('returns CSV with headers when expenses is empty', () => {
    const csv = exportToFormat([], 'csv_generic');
    expect(csv).toContain('date');
    expect(csv).toContain('amount');
    expect(csv).toContain('currency');
    expect(csv).toContain('description');
    expect(csv).toContain('category');
  });

  it('exports expenses as CSV with header row + 1 row per expense', () => {
    const csv = exportToFormat(SAMPLE_EXPENSES, 'csv_generic');
    const lines = csv.split('\n');
    expect(lines).toHaveLength(4); // 1 header + 3 expenses
  });

  it('includes the header row with lowercase names for csv_generic', () => {
    const csv = exportToFormat(SAMPLE_EXPENSES, 'csv_generic');
    const header = csv.split('\n')[0]!;
    expect(header).toContain('"date"');
    expect(header).toContain('"amount"');
    expect(header).toContain('"currency"');
    expect(header).toContain('"description"');
    expect(header).toContain('"category"');
  });

  it('converts minor units to major units with 2 decimals', () => {
    const csv = exportToFormat(SAMPLE_EXPENSES, 'csv_generic');
    expect(csv).toContain('12.50'); // 1250 → 12.50
    expect(csv).toContain('45.00'); // 4500 → 45.00
    expect(csv).toContain('9.99'); // 999 → 9.99
  });

  it('escapes double quotes in titles by doubling them', () => {
    const csv = exportToFormat(SAMPLE_EXPENSES, 'csv_generic');
    expect(csv).toContain('"Hotel ""Marriott"""');
  });

  it('defaults missing category to "Uncategorised"', () => {
    const csv = exportToFormat(SAMPLE_EXPENSES, 'csv_generic');
    expect(csv).toContain('"Uncategorised"');
  });

  it('wraps every field in double quotes (RFC 4180)', () => {
    const csv = exportToFormat(SAMPLE_EXPENSES, 'csv_generic');
    const lines = csv.split('\n');
    const dataLine = lines[1]!;
    // Every field starts and ends with a double quote
    const fields = dataLine.split(',');
    for (const f of fields) {
      expect(f.startsWith('"')).toBe(true);
      expect(f.endsWith('"')).toBe(true);
    }
  });
});

describe('exportToFormat — QuickBooks CSV', () => {
  it('uses Title-Case headers for quickbooks', () => {
    const csv = exportToFormat(SAMPLE_EXPENSES, 'quickbooks');
    const header = csv.split('\n')[0]!;
    expect(header).toContain('"Date"');
    expect(header).toContain('"Amount"');
    expect(header).toContain('"Currency"');
    expect(header).toContain('"Description"');
    expect(header).toContain('"Category"');
  });

  it('produces the same number of rows as csv_generic', () => {
    const qbCsv = exportToFormat(SAMPLE_EXPENSES, 'quickbooks');
    const genericCsv = exportToFormat(SAMPLE_EXPENSES, 'csv_generic');
    expect(qbCsv.split('\n')).toHaveLength(genericCsv.split('\n').length);
  });
});

describe('exportToFormat — Xero CSV', () => {
  it('uses Title-Case headers for xero', () => {
    const csv = exportToFormat(SAMPLE_EXPENSES, 'xero');
    expect(csv.split('\n')[0]).toContain('"Date"');
  });
});

describe('exportToFormat — FreshBooks CSV', () => {
  it('uses lowercase headers for freshbooks', () => {
    const csv = exportToFormat(SAMPLE_EXPENSES, 'freshbooks');
    const header = csv.split('\n')[0]!;
    expect(header).toContain('"date"');
    expect(header).toContain('"amount"');
  });
});

describe('exportToFormat — Zoho Books CSV', () => {
  it('uses Title-Case headers for zoho_books', () => {
    const csv = exportToFormat(SAMPLE_EXPENSES, 'zoho_books');
    expect(csv.split('\n')[0]).toContain('"Date"');
  });
});

describe('exportToFormat — Wave CSV', () => {
  it('uses Title-Case headers for wave', () => {
    const csv = exportToFormat(SAMPLE_EXPENSES, 'wave');
    expect(csv.split('\n')[0]).toContain('"Date"');
  });
});

describe('exportToFormat — OFX', () => {
  it('returns OFX header + empty body when no expenses', () => {
    const ofx = exportToFormat([], 'ofx');
    expect(ofx).toContain('OFXHEADER:100');
    expect(ofx).toContain('<OFX>');
    expect(ofx).toContain('</OFX>');
  });

  it('produces an OFX with a STMTTRN per expense', () => {
    const ofx = exportToFormat(SAMPLE_EXPENSES, 'ofx');
    const stmttrnCount = (ofx.match(/<STMTTRN>/g) ?? []).length;
    expect(stmttrnCount).toBe(3);
  });

  it('OFX includes the amount as a decimal', () => {
    const ofx = exportToFormat(SAMPLE_EXPENSES, 'ofx');
    expect(ofx).toContain('<TRNAMT>12.50');
    expect(ofx).toContain('<TRNAMT>45.00');
    expect(ofx).toContain('<TRNAMT>9.99');
  });

  it('OFX includes the title as NAME', () => {
    const ofx = exportToFormat(SAMPLE_EXPENSES, 'ofx');
    expect(ofx).toContain('<NAME>Lunch at Starbucks');
  });

  it('OFX includes the category as MEMO when present', () => {
    const ofx = exportToFormat(SAMPLE_EXPENSES, 'ofx');
    expect(ofx).toContain('<MEMO>Food');
    expect(ofx).toContain('<MEMO>Travel');
  });

  it('OFX does NOT include MEMO when category is missing', () => {
    const ofx = exportToFormat(
      [
        {
          date: '2026-07-01',
          amountMinor: 1000,
          currency: 'USD',
          title: 'No category expense',
        },
      ],
      'ofx',
    );
    expect(ofx).not.toContain('<MEMO>');
  });

  it('OFX escapes < > & in titles by replacing with spaces', () => {
    const ofx = exportToFormat(
      [
        {
          date: '2026-07-01',
          amountMinor: 1000,
          currency: 'USD',
          title: 'Amount < 100 & > 50',
        },
      ],
      'ofx',
    );
    expect(ofx).not.toContain('Amount < 100');
    expect(ofx).not.toContain('& > 50');
    // The original title "Amount < 100 & > 50" has <, &, > replaced by spaces.
    // Result: "Amount   100     50" (3 spaces between Amount and 100,
    // 5 spaces between 100 and 50, because each of <, >, & becomes one
    // space and there was already a space before and after each).
    expect(ofx).toContain('<NAME>Amount   100     50');
  });

  it('OFX has the correct header', () => {
    const ofx = exportToFormat(SAMPLE_EXPENSES, 'ofx');
    expect(ofx).toContain('OFXHEADER:100');
    expect(ofx).toContain('DATA:OFXSGML');
    expect(ofx).toContain('VERSION:102');
  });

  it('OFX uses YYYYMMDDHHMMSS date format', () => {
    const ofx = exportToFormat(
      [
        {
          date: '2026-07-01T12:30:45.000Z',
          amountMinor: 1000,
          currency: 'USD',
          title: 'Test',
        },
      ],
      'ofx',
    );
    expect(ofx).toContain('<DTPOSTED>20260701123045');
  });
});

describe('exportToFormat — error handling', () => {
  it('throws on an unknown format', () => {
    expect(() =>
      exportToFormat(SAMPLE_EXPENSES, 'unknown' as unknown as AccountingFormat),
    ).toThrow(/Unknown accounting format/);
  });
});

describe('buildAccountingExport', () => {
  it('returns a frozen AccountingExport object', () => {
    const exportObj = buildAccountingExport(
      SAMPLE_EXPENSES,
      'csv_generic',
      { start: '2026-07-01', end: '2026-07-31' },
    );
    expect(Object.isFrozen(exportObj)).toBe(true);
    expect(Object.isFrozen(exportObj.expenses)).toBe(true);
    expect(Object.isFrozen(exportObj.period)).toBe(true);
  });

  it('defaults missing category to "Uncategorised"', () => {
    const exportObj = buildAccountingExport(
      [
        {
          date: '2026-07-01',
          amountMinor: 1000,
          currency: 'USD',
          title: 'No category',
        },
      ],
      'csv_generic',
      { start: '2026-07-01', end: '2026-07-31' },
    );
    expect(exportObj.expenses[0]!.category).toBe('Uncategorised');
  });

  it('preserves the format and period', () => {
    const exportObj = buildAccountingExport(
      SAMPLE_EXPENSES,
      'xero',
      { start: '2026-07-01', end: '2026-07-31' },
    );
    expect(exportObj.format).toBe('xero');
    expect(exportObj.period.start).toBe('2026-07-01');
    expect(exportObj.period.end).toBe('2026-07-31');
  });

  it('maps title → description (no raw receipt text)', () => {
    const exportObj = buildAccountingExport(
      [
        {
          date: '2026-07-01',
          amountMinor: 1000,
          currency: 'USD',
          title: 'Lunch',
          category: 'Food',
        },
      ],
      'csv_generic',
      { start: '2026-07-01', end: '2026-07-31' },
    );
    expect(exportObj.expenses[0]!.description).toBe('Lunch');
  });
});

describe('CRITICAL: exports do not contain forbidden data types', () => {
  it('CSV export does not include upi_id, bank_password, otp, or payment_pin', () => {
    const csv = exportToFormat(SAMPLE_EXPENSES, 'csv_generic');
    expect(csv).not.toMatch(/upi_id/i);
    expect(csv).not.toMatch(/bank_password/i);
    expect(csv).not.toMatch(/\botp\b/i);
    expect(csv).not.toMatch(/payment_pin/i);
  });

  it('OFX export does not include upi_id, bank_password, otp, or payment_pin', () => {
    const ofx = exportToFormat(SAMPLE_EXPENSES, 'ofx');
    expect(ofx).not.toMatch(/upi_id/i);
    expect(ofx).not.toMatch(/bank_password/i);
    expect(ofx).not.toMatch(/\botp\b/i);
    expect(ofx).not.toMatch(/payment_pin/i);
  });

  it('export only contains summary fields (date, amount, currency, title, category)', () => {
    const csv = exportToFormat(SAMPLE_EXPENSES, 'csv_generic');
    // The CSV should have exactly 5 columns per row.
    const lines = csv.split('\n');
    for (const line of lines) {
      const fields = line.split(',');
      expect(fields).toHaveLength(5);
    }
  });
});
