import { describe, expect, it } from '@jest/globals';

import {
  buildReportHtml,
  collectReportRows,
  escapeHtml,
  formatMinor,
} from '@application/export/financial-report';
import type { LocalDataExport } from '@application/export/export-local-data.usecase';

const exported: LocalDataExport = {
  schemaVersion: 1,
  exportedAt: '2026-10-21T00:00:00.000Z',
  appVersion: '2.14.0',
  groups: [
    {
      id: 'g1',
      name: 'Goa <Trip>',
      currencyCode: 'INR',
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
      members: [
        {
          id: 'm1',
          displayName: 'Asha',
          role: 'owner',
          joinedAt: '2026-10-01T00:00:00.000Z',
        },
      ],
      expenses: [
        {
          id: 'e1',
          title: '<script>alert(1)</script>',
          amountMinor: 123456,
          currencyCode: 'INR',
          expenseDate: '2026-10-20',
          category: 'Food & drink',
          splitType: 'equal',
          note: 'n',
        },
      ],
      settlements: [],
    },
  ],
  csv: '',
  counts: { groups: 1, members: 1, expenses: 1, settlements: 0 },
  truncated: false,
  json: '',
};

describe('financial report', () => {
  it('formats minor units with grouping', () => {
    expect(formatMinor(123456, 'INR')).toBe('1,234.56 INR');
    expect(formatMinor(-5, 'USD')).toBe('-0.05 USD');
  });

  it('collects rows across groups', () => {
    expect(collectReportRows(exported)).toEqual([
      {
        group: 'Goa <Trip>',
        date: '2026-10-20',
        title: '<script>alert(1)</script>',
        category: 'Food & drink',
        splitType: 'equal',
        amount: '1,234.56 INR',
        currency: 'INR',
        note: 'n',
      },
    ]);
  });

  it('escapes user content in the HTML report', () => {
    const html = buildReportHtml(exported);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('Goa &lt;Trip&gt;');
    expect(html).toContain('Food &amp; drink');
  });

  it('escapes every dangerous character', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });
});
