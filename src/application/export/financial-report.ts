/**
 * PDF / XLSX report shaping for the local export.
 *
 * Pure: takes the already-loaded backup and returns display rows or a
 * self-contained HTML document. No database access, no network, no secrets.
 * Expense titles/notes are HTML-escaped because they are user-controlled.
 */

import type { LocalDataExport } from './export-local-data.usecase';

export interface ReportRow {
  readonly group: string;
  readonly date: string;
  readonly title: string;
  readonly category: string;
  readonly splitType: string;
  readonly amount: string;
  readonly currency: string;
  readonly note: string;
}

export function formatMinor(minor: number, currency: string): string {
  const negative = minor < 0;
  const absolute = Math.abs(Math.trunc(minor));
  const major = Math.floor(absolute / 100).toString();
  const cents = (absolute % 100).toString().padStart(2, '0');
  const grouped = major.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${grouped}.${cents} ${currency}`;
}

export function collectReportRows(exported: LocalDataExport): readonly ReportRow[] {
  return exported.groups.flatMap((group) =>
    group.expenses.map((expense) => ({
      group: group.name,
      date: expense.expenseDate.slice(0, 10),
      title: expense.title,
      category: expense.category ?? '',
      splitType: expense.splitType,
      amount: formatMinor(expense.amountMinor, expense.currencyCode),
      currency: expense.currencyCode,
      note: expense.note ?? '',
    })),
  );
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** A4 portrait report with one section per group and a total row. */
export function buildReportHtml(exported: LocalDataExport): string {
  const sections = exported.groups
    .map((group) => {
      const rows = group.expenses
        .map(
          (expense) => `<tr>
            <td>${escapeHtml(expense.expenseDate.slice(0, 10))}</td>
            <td>${escapeHtml(expense.title)}</td>
            <td>${escapeHtml(expense.category ?? '—')}</td>
            <td>${escapeHtml(expense.splitType)}</td>
            <td class="amount">${escapeHtml(
              formatMinor(expense.amountMinor, expense.currencyCode),
            )}</td>
          </tr>`,
        )
        .join('');
      const total = group.expenses.reduce((sum, expense) => sum + expense.amountMinor, 0);
      return `<section>
        <h2>${escapeHtml(group.name)}</h2>
        <p class="meta">${group.expenses.length} expenses · ${
          group.members.length
        } members · ${escapeHtml(formatMinor(total, group.currencyCode))} total</p>
        <table>
          <thead><tr><th>Date</th><th>Expense</th><th>Category</th><th>Split</th><th class="amount">Amount</th></tr></thead>
          <tbody>${rows.length > 0 ? rows : '<tr><td colspan="5">No expenses</td></tr>'}</tbody>
        </table>
      </section>`;
    })
    .join('');

  return `<!doctype html>
<html><head><meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; margin: 32px; color: #1c1b1a; }
  h1 { font-size: 24px; margin: 0 0 4px; }
  h2 { font-size: 16px; margin: 24px 0 4px; }
  .meta { color: #6b6660; font-size: 11px; margin: 0 0 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { text-align: left; border-bottom: 1px solid #d6d0c8; padding: 6px 4px; }
  td { border-bottom: 1px solid #eee9e2; padding: 5px 4px; vertical-align: top; }
  .amount { text-align: right; white-space: nowrap; }
  footer { margin-top: 24px; font-size: 10px; color: #6b6660; }
</style></head>
<body>
  <h1>BillLens expense report</h1>
  <p class="meta">Exported ${escapeHtml(exported.exportedAt.slice(0, 10))} · ${escapeHtml(
    exported.appVersion,
  )} · ${exported.counts.expenses} expenses across ${exported.counts.groups} groups${
    exported.truncated ? ' (truncated)' : ''
  }</p>
  ${sections}
  <footer>Generated locally on this device. No data was uploaded.</footer>
</body></html>`;
}
