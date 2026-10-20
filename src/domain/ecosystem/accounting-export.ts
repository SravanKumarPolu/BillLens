/**
 * Accounting export — format expenses for accounting software.
 *
 * Phase 10 Prompt 99: Ecosystem Expansion.
 *
 * Generates CSV / OFX / JSON exports in the format expected by
 * popular accounting software (QuickBooks, Xero, FreshBooks, Zoho
 * Books, Wave, generic CSV, OFX).
 *
 * CRITICAL: the export pipeline must call `containsForbiddenData()`
 * from `integration-security.ts` on every export payload. This module
 * does NOT perform that check itself — the application layer must do
 * so before calling these functions. The exported data here is
 * intentionally limited to:
 *   - date, amount, currency, description, category, merchant, taxAmount
 *
 * We do NOT export:
 *   - User PII (names, emails, phone numbers)
 *   - Raw receipt images (only summary data)
 *   - Bank account numbers
 *   - UPI IDs
 *
 * This module is PURE: it formats data into a string. No I/O.
 *
 * See `docs/ecosystem-expansion.md`.
 */

import { formatMinorAmount } from '../entities/currency';
import type { CurrencyCode } from '../value-objects/currency-code';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AccountingFormat =
  | 'quickbooks'
  | 'xero'
  | 'freshbooks'
  | 'zoho_books'
  | 'wave'
  | 'csv_generic'
  | 'ofx';

export interface AccountingExpense {
  readonly date: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly description: string;
  readonly category: string;
  readonly merchant?: string;
  readonly taxAmount?: number;
}

export interface AccountingExport {
  readonly format: AccountingFormat;
  readonly expenses: readonly AccountingExpense[];
  readonly period: { start: string; end: string };
}

export interface ExportInput {
  readonly date: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly title: string;
  readonly category?: string;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/**
 * Exports a list of expenses in the requested format.
 *
 * Returns a formatted string:
 *
 *   - `csv_generic` / `quickbooks` / `wave` → CSV (comma-separated)
 *   - `xero` / `freshbooks` / `zoho_books` → CSV with provider-specific headers
 *   - `ofx` → OFX 2.2 (SGML-ish text format for Open Financial Exchange)
 *
 * The `title` field is used as the description (we don't expose the
 * raw receipt text). The `category` defaults to 'Uncategorised' if
 * not provided.
 *
 * Amounts are converted from minor units (e.g. cents) to major units
 * (e.g. dollars) with 2 decimal places.
 *
 * All CSV fields are double-quoted and any embedded double quotes are
 * escaped by doubling (""). This follows RFC 4180.
 */
export function exportToFormat(
  expenses: readonly ExportInput[],
  format: AccountingFormat,
): string {
  if (expenses.length === 0) {
    return getEmptyOutput(format);
  }
  switch (format) {
    case 'csv_generic':
    case 'quickbooks':
    case 'wave':
      return exportCsv(expenses, format);
    case 'xero':
    case 'freshbooks':
    case 'zoho_books':
      return exportCsv(expenses, format);
    case 'ofx':
      return exportOfx(expenses);
    default:
      throw new Error(`Unknown accounting format: ${format}`);
  }
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

function exportCsv(
  expenses: readonly ExportInput[],
  format: AccountingFormat,
): string {
  const headers = getCsvHeaders(format);
  const rows: string[] = [headers.map(csvEscape).join(',')];
  for (const e of expenses) {
    const row = [
      e.date,
      formatAmount(e.amountMinor, e.currency),
      e.currency,
      e.title,
      e.category ?? 'Uncategorised',
    ];
    rows.push(row.map(csvEscape).join(','));
  }
  return rows.join('\n');
}

function getCsvHeaders(format: AccountingFormat): string[] {
  switch (format) {
    case 'quickbooks':
      return ['Date', 'Amount', 'Currency', 'Description', 'Category'];
    case 'xero':
      return ['Date', 'Amount', 'Currency', 'Description', 'Category'];
    case 'freshbooks':
      return ['date', 'amount', 'currency', 'description', 'category'];
    case 'zoho_books':
      return ['Date', 'Amount', 'Currency', 'Description', 'Category'];
    case 'wave':
      return ['Date', 'Amount', 'Currency', 'Description', 'Category'];
    case 'csv_generic':
      return ['date', 'amount', 'currency', 'description', 'category'];
    default:
      return ['date', 'amount', 'currency', 'description', 'category'];
  }
}

function csvEscape(value: string): string {
  if (typeof value !== 'string') {
    return '""';
  }
  // Escape embedded double quotes by doubling them, then wrap in double quotes.
  const escaped = value.replace(/"/g, '""');
  return `"${escaped}"`;
}

function formatAmount(amountMinor: number, currencyCode?: string): string {
  if (!Number.isFinite(amountMinor)) {
    return '0.00';
  }
  // v2.5.0: currency-aware minor-unit formatting (was hardcoded ÷100 —
  // wrong for JPY/KWD-scale currencies).
  if (currencyCode !== undefined) {
    return formatMinorAmount(amountMinor, currencyCode as CurrencyCode);
  }
  const decimals = 2;
  const divisor = Math.pow(10, decimals);
  const abs = Math.abs(amountMinor);
  return `${amountMinor < 0 ? '-' : ''}${Math.floor(abs / divisor)}.${(abs % divisor).toString().padStart(decimals, '0')}`;
}

// ---------------------------------------------------------------------------
// OFX export
// ---------------------------------------------------------------------------

function exportOfx(expenses: readonly ExportInput[]): string {
  const header = [
    'OFXHEADER:100',
    'DATA:OFXSGML',
    'VERSION:102',
    'SECURITY:NONE',
    'ENCODING:USASCII',
    'CHARSET:1252',
    'COMPRESSION:NONE',
    'OLDFILEUID:NONE',
    'NEWFILEUID:NONE',
    '',
  ].join('\n');

  const body: string[] = ['<OFX>'];
  body.push('<BANKMSGSRSV1>');
  body.push('<STMTTRNRS>');
  body.push('<CURDEF>USD');
  body.push('<BANKTRANLIST>');

  for (const e of expenses) {
    body.push('<STMTTRN>');
    body.push(`<TRNTYPE>DEBIT`);
    body.push(`<DTPOSTED>${ofxDate(e.date)}`);
    body.push(`<TRNAMT>${formatAmount(e.amountMinor, e.currency)}`);
    body.push(`<FITID>${hashString(e.date + e.amountMinor + e.title)}`);
    body.push(`<NAME>${ofxEscape(e.title)}`);
    if (e.category !== undefined) {
      body.push(`<MEMO>${ofxEscape(e.category)}`);
    }
    body.push('</STMTTRN>');
  }

  body.push('</BANKTRANLIST>');
  body.push('</STMTTRNRS>');
  body.push('</BANKMSGSRSV1>');
  body.push('</OFX>');

  return header + body.join('\n') + '\n';
}

function ofxDate(iso: string): string {
  // OFX dates are YYYYMMDDHHMMSS
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) {
    return '19700101000000';
  }
  const d = new Date(ms);
  const yyyy = d.getUTCFullYear().toString().padStart(4, '0');
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = d.getUTCDate().toString().padStart(2, '0');
  const hh = d.getUTCHours().toString().padStart(2, '0');
  const mi = d.getUTCMinutes().toString().padStart(2, '0');
  const ss = d.getUTCSeconds().toString().padStart(2, '0');
  return `${yyyy}${mm}${dd}${hh}${mi}${ss}`;
}

function ofxEscape(value: string): string {
  // OFX SGML doesn't allow <, >, & in element text. Replace with spaces.
  return value.replace(/[<>&]/g, ' ').trim();
}

function hashString(s: string): string {
  // Simple deterministic hash (not cryptographic — OFX FITID just
  // needs to be unique within the file).
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16);
}

// ---------------------------------------------------------------------------
// Empty output
// ---------------------------------------------------------------------------

function getEmptyOutput(format: AccountingFormat): string {
  if (format === 'ofx') {
    return [
      'OFXHEADER:100',
      'DATA:OFXSGML',
      'VERSION:102',
      'SECURITY:NONE',
      'ENCODING:USASCII',
      'CHARSET:1252',
      'COMPRESSION:NONE',
      'OLDFILEUID:NONE',
      'NEWFILEUID:NONE',
      '',
      '<OFX>',
      '</OFX>',
      '',
    ].join('\n');
  }
  // Empty CSV with just headers
  return getCsvHeaders(format).map(csvEscape).join(',') + '\n';
}

// ---------------------------------------------------------------------------
// Period helpers
// ---------------------------------------------------------------------------

/**
 * Builds an AccountingExport object from a list of expenses and a
 * period. The export can be passed to a downstream serializer.
 *
 * Pure: no I/O.
 */
export function buildAccountingExport(
  expenses: readonly ExportInput[],
  format: AccountingFormat,
  period: { start: string; end: string },
): AccountingExport {
  return Object.freeze({
    format,
    period: Object.freeze({ ...period }),
    expenses: Object.freeze(
      expenses.map((e) =>
        Object.freeze({
          date: e.date,
          amountMinor: e.amountMinor,
          currency: e.currency,
          description: e.title,
          category: e.category ?? 'Uncategorised',
        }),
      ),
    ),
  });
}
