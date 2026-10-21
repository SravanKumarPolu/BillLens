/**
 * Receipt text → structured fields (pure, no OCR dependency).
 *
 * Deliberately conservative: ambiguous totals produce warnings and missing
 * fields rather than invented values. All amounts are integer minor units.
 * Tested with the Udupi's Upahar ₹100 receipt from the bug report.
 */

export interface ParsedLineItem {
  readonly name: string;
  readonly quantity: number;
  readonly unitPriceMinor: number;
  readonly totalAmountMinor: number;
}

export interface ParsedReceipt {
  readonly merchant?: string;
  readonly date?: string;
  readonly currencyCode: 'INR' | 'USD' | 'EUR' | 'GBP';
  readonly subtotalMinor?: number;
  readonly taxMinor?: number;
  readonly discountMinor?: number;
  readonly totalMinor?: number;
  readonly lineItems: readonly ParsedLineItem[];
  readonly totalMatches: boolean;
  readonly warnings: readonly string[];
}

const MONEY = /(?:₹|rs\.?|inr|\$|€|£)?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})|\d+(?:\.\d{1,2})?)/gi;

function toMinor(value: string): number | null {
  const cleaned = value.replace(/,/g, '');
  const number = Number(cleaned);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.round(number * 100);
}

function lastMoneyIn(line: string): number | null {
  const matches = [...line.matchAll(MONEY)];
  const last = matches[matches.length - 1];
  return last?.[1] !== undefined ? toMinor(last[1]) : null;
}

function normalizeDate(raw: string): string | undefined {
  const dmy = raw.match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    let year = Number(dmy[3]);
    if (year < 100) year += 2000;
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  const iso = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  return iso?.[0];
}

function detectCurrency(text: string): ParsedReceipt['currencyCode'] {
  if (/₹|\brs\.?\b|\binr\b|gst/i.test(text)) return 'INR';
  if (/€|\beur\b/i.test(text)) return 'EUR';
  if (/£|\bgbp\b/i.test(text)) return 'GBP';
  return 'USD';
}

/** `2 x 350.00` or `2 x 350.00 = 700.00`; name is the leading text. */
function parseItemLine(line: string): ParsedLineItem | null {
  const match = line.match(
    /^(.*?)\s+(\d+(?:\.\d+)?)\s*[xX×]\s*(?:₹|rs\.?|inr)?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})|\d+(?:\.\d{1,2})?)\s*(?:=\s*(?:₹|rs\.?|inr)?\s*([\d,.]+))?/,
  );
  if (match === null) return null;
  const name = (match[1] ?? '').replace(/^\d+\s+/, '').trim();
  if (name.length < 2) return null;
  const quantity = Number(match[2]);
  const unit = toMinor(match[3] ?? '');
  if (unit === null || !Number.isFinite(quantity) || quantity <= 0) return null;
  const explicitTotal = match[4] !== undefined ? toMinor(match[4]) : null;
  return {
    name,
    quantity,
    unitPriceMinor: unit,
    totalAmountMinor: explicitTotal ?? Math.round(quantity * unit),
  };
}

export function parseReceiptText(rawText: string): ParsedReceipt {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const warnings: string[] = [];
  if (lines.length === 0) {
    return {
      currencyCode: 'INR',
      lineItems: [],
      totalMatches: false,
      warnings: ['No text was recognised in this image.'],
    };
  }

  const merchant = lines.find(
    (line) =>
      !/^(tax\s+invoice|invoice|receipt|bill|cash memo|gstin|date|time|bill\s*(no|number))/i.test(
        line,
      ) && line.replace(/[^\p{L}]/gu, '').length >= 3,
  );

  const dateLine = lines.find((line) => /(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})|(\d{4}-\d{2}-\d{2})/.test(line));
  const date = dateLine !== undefined ? dateLine.match(/(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})|(\d{4}-\d{2}-\d{2})/)?.[0] : undefined;

  let subtotal: number | undefined;
  let total: number | undefined;
  let taxTotal = 0;
  let discount = 0;
  const lineItems: ParsedLineItem[] = [];

  for (const line of lines) {
    if (/\b(sub\s*total|subtotal)\b/i.test(line)) {
      const value = lastMoneyIn(line);
      if (value !== null) subtotal = value;
      continue;
    }
    if (/\b(grand\s*total|total\s*(amount|payable)?|amount\s*payable|net\s*amount)\b/i.test(line)) {
      const value = lastMoneyIn(line);
      if (value !== null) total = value;
      continue;
    }
    if (/\b(sgst|cgst|igst|gst|vat|tax)\b/i.test(line)) {
      const value = lastMoneyIn(line);
      if (value !== null) taxTotal += value;
      continue;
    }
    if (/\b(discount|offer|saving)\b/i.test(line)) {
      const value = lastMoneyIn(line);
      if (value !== null) discount += value;
      continue;
    }
    const item = parseItemLine(line);
    if (item !== null) lineItems.push(item);
  }

  if (total === undefined) warnings.push('Grand total was not recognised.');
  if (subtotal === undefined && lineItems.length > 0) {
    subtotal = lineItems.reduce((sum, item) => sum + item.totalAmountMinor, 0);
  }

  let totalMatches = false;
  if (total !== undefined && subtotal !== undefined) {
    const expected = subtotal + taxTotal - discount;
    totalMatches = expected === total;
    if (!totalMatches) {
      warnings.push(
        `Subtotal + tax − discount (${expected}) does not match the printed total (${total}).`,
      );
    }
  }
  if (lineItems.length === 0) warnings.push('No item lines were recognised.');

  return {
    ...(merchant !== undefined ? { merchant } : {}),
    ...(date !== undefined ? { date: normalizeDate(date) } : {}),
    currencyCode: detectCurrency(rawText),
    ...(subtotal !== undefined ? { subtotalMinor: subtotal } : {}),
    ...(taxTotal > 0 ? { taxMinor: taxTotal } : {}),
    ...(discount > 0 ? { discountMinor: discount } : {}),
    ...(total !== undefined ? { totalMinor: total } : {}),
    lineItems,
    totalMatches,
    warnings,
  };
}
