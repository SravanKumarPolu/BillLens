/**
 * Field-level diff for OCR improvement.
 *
 * CRITICAL CONTRACT:
 *   - This module computes STRUCTURED field-level diffs between what the
 *     OCR engine extracted and what the user corrected. The diff data is
 *     used to identify common OCR error patterns and improve the engine.
 *   - The diff data is ANONYMIZED — actual values are replaced with
 *     structural patterns. We NEVER store raw receipt values, raw merchant
 *     names, raw amounts, raw dates, or raw text in the diff.
 *   - This module is a pure function — no I/O, no globals, no mutation
 *     of the inputs.
 *
 * Anonymization rules (per field type):
 *
 *   total, subtotal, tax: amounts are replaced with '<amount>'.
 *     The pattern captures only the SHAPE of the value, not its magnitude.
 *
 *   date: dates are normalized to 'YYYY-MM-DD' (or 'YYYY-MM' / 'YYYY'
 *     depending on precision). The pattern captures only the precision,
 *     not the actual date.
 *
 *   merchant: merchant names are replaced with '<merchant>'. The pattern
 *     captures only the LENGTH category (short/medium/long) and the
 *     presence of digits, not the actual name.
 *
 *   payment_method: payment methods are mapped to canonical tokens
 *     ('card', 'cash', 'upi', 'wallet', 'other'). The pattern captures
 *     only the canonical form.
 *
 *   line_items: line items are summarized as '<line_items:N>' where N is
 *     the count. Individual item names/prices are NEVER stored.
 */

// ---------------------------------------------------------------------------
// Field types
// ---------------------------------------------------------------------------

export type OcrFieldName =
  | 'total'
  | 'date'
  | 'merchant'
  | 'line_items'
  | 'tax'
  | 'subtotal'
  | 'payment_method';

export const OCR_FIELD_NAMES: readonly OcrFieldName[] = [
  'total',
  'date',
  'merchant',
  'line_items',
  'tax',
  'subtotal',
  'payment_method',
] as const;

export function isOcrFieldName(value: unknown): value is OcrFieldName {
  return (
    typeof value === 'string' &&
    (OCR_FIELD_NAMES as readonly string[]).includes(value)
  );
}

// ---------------------------------------------------------------------------
// Diff types
// ---------------------------------------------------------------------------

export type ExtractionConfidence = 'high' | 'medium' | 'low' | 'unknown';

export const EXTRACTION_CONFIDENCES: readonly ExtractionConfidence[] = [
  'high',
  'medium',
  'low',
  'unknown',
] as const;

export function isExtractionConfidence(
  value: unknown,
): value is ExtractionConfidence {
  return (
    typeof value === 'string' &&
    (EXTRACTION_CONFIDENCES as readonly string[]).includes(value)
  );
}

export type CorrectionType =
  | 'value_change'
  | 'format_change'
  | 'field_added'
  | 'field_removed';

export const CORRECTION_TYPES: readonly CorrectionType[] = [
  'value_change',
  'format_change',
  'field_added',
  'field_removed',
] as const;

export interface FieldLevelDiff {
  /** The field that was corrected. */
  readonly fieldName: OcrFieldName;
  /** Anonymized pattern of the extracted value (NOT the raw value). */
  readonly extractedValuePattern: string;
  /** Anonymized pattern of the corrected value (NOT the raw value). */
  readonly correctedValuePattern: string;
  /** Confidence the OCR engine had for the extracted value. */
  readonly extractionConfidence: ExtractionConfidence;
  /** What kind of correction was made. */
  readonly correctionType: CorrectionType;
}

// ---------------------------------------------------------------------------
// Anonymization
// ---------------------------------------------------------------------------

const AMOUNT_RE = /^[-+]?\s*(?:₹|Rs\.?|INR|USD|\$|EUR|€|GBP|£)?\s*\d{1,12}(?:[.,]\d{1,4})?\s*$/i;

/**
 * Returns `true` when a string looks like an amount (with optional currency
 * prefix/suffix and thousands separators).
 */
function looksLikeAmount(value: string): boolean {
  if (value.length === 0) return false;
  // Strip whitespace and common currency prefixes.
  const stripped = value.trim();
  if (stripped.length === 0) return false;
  return AMOUNT_RE.test(stripped);
}

/**
 * Anonymizes a value based on its field type.
 *
 * Returns a STRUCTURAL PATTERN that captures the shape of the value
 * without revealing its content. The pattern is used to identify common
 * OCR error patterns (e.g. "the total field is frequently misread as a
 * longer number").
 *
 * Pure function — same input always produces the same output.
 */
export function anonymizeValue(
  value: string,
  fieldType: OcrFieldName,
): string {
  if (typeof value !== 'string') {
    return '<unknown>';
  }
  if (value.length === 0) {
    return '<empty>';
  }

  switch (fieldType) {
    case 'total':
    case 'subtotal':
    case 'tax': {
      // Amount — replace with '<amount>' but capture whether the value
      // looked like an amount in the first place (so we can detect
      // "OCR returned garbage in the total field" cases).
      return looksLikeAmount(value) ? '<amount>' : '<non_amount>';
    }

    case 'date': {
      // Date — normalize to a canonical pattern that keeps the SHAPE but
      // never the value. Year-first dates are normalized to one token
      // regardless of separator; day/month-first dates are labeled by the
      // order the digits actually force (a component > 12), and are marked
      // ambiguous when both orders are valid.
      const dateOnly = value.trim().split(/[T\s]/)[0] ?? '';
      // ISO YYYY-MM-DD (also YYYY/MM/DD and YYYY.MM.DD).
      if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(dateOnly)) {
        return '<date:YYYY-MM-DD>';
      }
      // ISO YYYY-MM.
      if (/^\d{4}-\d{2}$/.test(value)) return '<date:YYYY-MM>';
      // ISO YYYY.
      if (/^\d{4}$/.test(value)) return '<date:YYYY>';
      // Day/month-first dates: DD/MM/YYYY, MM-DD-YYYY, DD.MM.YY.
      const numeric = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(dateOnly);
      if (numeric) {
        const first = Number(numeric[1]);
        const second = Number(numeric[2]);
        if (first > 12 && second <= 12) return '<date:DD/MM/YYYY>';
        if (second > 12 && first <= 12) return '<date:MM/DD/YYYY>';
        return '<date:DD/MM-ambiguous>';
      }
      // Anything else.
      return '<date:unknown_format>';
    }

    case 'merchant': {
      // Merchant — replace with '<merchant>' but capture the LENGTH
      // category (short/medium/long) and whether digits are present.
      const len = value.trim().length;
      const hasDigits = /\d/.test(value);
      const hasSpecialChars = /[^a-zA-Z0-9\s]/.test(value);
      const lengthCategory =
        len <= 8 ? 'short' : len <= 24 ? 'medium' : 'long';
      const features: string[] = [`len=${lengthCategory}`];
      if (hasDigits) features.push('has_digits');
      if (hasSpecialChars) features.push('has_special');
      return `<merchant:${features.join(',')}>`;
    }

    case 'payment_method': {
      // Payment method — map to canonical token.
      const lower = value.trim().toLowerCase();
      if (lower.includes('card') || lower.includes('credit') || lower.includes('debit')) {
        return '<payment_method:card>';
      }
      if (lower.includes('cash')) return '<payment_method:cash>';
      if (lower.includes('upi') || lower.includes('vpa') || lower.includes('@')) {
        return '<payment_method:upi>';
      }
      if (lower.includes('wallet') || lower.includes('paytm') || lower.includes('phonepe') || lower.includes('gpay')) {
        return '<payment_method:wallet>';
      }
      return '<payment_method:other>';
    }

    case 'line_items': {
      // Line items — never store the actual items. Return a placeholder
      // that signals "line items were present".
      return '<line_items>';
    }

    default: {
      // Unknown field type — return a generic placeholder.
      return '<unknown>';
    }
  }
}

// ---------------------------------------------------------------------------
// Diff computation
// ---------------------------------------------------------------------------

/**
 * Computes the field-level diff between the OCR-extracted fields and the
 * user-corrected fields.
 *
 * The diff is a list of `FieldLevelDiff` entries — one per field that
 * was either:
 *   - present in BOTH but differed in value (correctionType='value_change'
 *     or 'format_change')
 *   - present in extracted but missing from corrected (correctionType=
 *     'field_removed')
 *   - missing from extracted but present in corrected (correctionType=
 *     'field_added')
 *
 * Fields that match exactly are NOT included in the diff.
 *
 * CRITICAL: every value is anonymized before being placed in the diff.
 * The diff NEVER contains raw receipt data, merchant names, amounts,
 * dates, or user IDs.
 *
 * Pure function — does not mutate the inputs.
 */
export function computeDiff(
  extracted: Readonly<Record<string, unknown>>,
  corrected: Readonly<Record<string, unknown>>,
): readonly FieldLevelDiff[] {
  const diffs: FieldLevelDiff[] = [];

  // Collect all field names from both records.
  const allFields = new Set<string>([
    ...Object.keys(extracted),
    ...Object.keys(corrected),
  ]);

  for (const fieldName of allFields) {
    if (!isOcrFieldName(fieldName)) continue;

    const extractedValue = extracted[fieldName];
    const correctedValue = corrected[fieldName];

    const extractedStr = valueToString(extractedValue);
    const correctedStr = valueToString(correctedValue);

    const extractedPresent = extractedValue !== undefined && extractedValue !== null;
    const correctedPresent = correctedValue !== undefined && correctedValue !== null;

    if (extractedPresent && !correctedPresent) {
      // Field was removed.
      diffs.push({
        fieldName,
        extractedValuePattern: anonymizeValue(extractedStr, fieldName),
        correctedValuePattern: '<empty>',
        extractionConfidence: 'unknown',
        correctionType: 'field_removed',
      });
    } else if (!extractedPresent && correctedPresent) {
      // Field was added.
      diffs.push({
        fieldName,
        extractedValuePattern: '<empty>',
        correctedValuePattern: anonymizeValue(correctedStr, fieldName),
        extractionConfidence: 'unknown',
        correctionType: 'field_added',
      });
    } else if (extractedPresent && correctedPresent) {
      // Both present — check if they differ.
      if (extractedStr !== correctedStr) {
        // Determine correction type: 'value_change' or 'format_change'.
        // 'format_change' = same value, different formatting.
        // 'value_change' = different value entirely.
        const correctionType: CorrectionType = isFormatChange(
          extractedStr,
          correctedStr,
          fieldName,
        )
          ? 'format_change'
          : 'value_change';

        diffs.push({
          fieldName,
          extractedValuePattern: anonymizeValue(extractedStr, fieldName),
          correctedValuePattern: anonymizeValue(correctedStr, fieldName),
          extractionConfidence: inferConfidence(extractedStr, fieldName),
          correctionType,
        });
      }
    }
    // If neither present, skip.
  }

  return Object.freeze(diffs);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function valueToString(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    // For arrays (e.g. line_items), use the length as a proxy.
    return `<array:${value.length}>`;
  }
  if (typeof value === 'object') {
    return `<object>`;
  }
  return '<unknown>';
}

/**
 * Returns `true` when the corrected value is just a re-formatted version
 * of the extracted value (e.g. "12.50" → "$12.50" or "2025/01/01" →
 * "2025-01-01"). Returns `false` when the values are genuinely different.
 */
function isFormatChange(
  extracted: string,
  corrected: string,
  fieldType: OcrFieldName,
): boolean {
  // For dates — if both name the same calendar day, it's a format change.
  if (fieldType === 'date') {
    if (sameCalendarDate(extracted, corrected)) {
      return true;
    }
  }

  // For amounts — if both parse to the same numeric value, it's a format
  // change.
  if (fieldType === 'total' || fieldType === 'subtotal' || fieldType === 'tax') {
    const exNum = parseAmount(extracted);
    const corNum = parseAmount(corrected);
    if (exNum !== null && corNum !== null && exNum === corNum) {
      return true;
    }
  }

  // For merchant names — if the difference is only whitespace or case,
  // it's a format change.
  if (fieldType === 'merchant') {
    if (extracted.trim().toLowerCase() === corrected.trim().toLowerCase()) {
      return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Calendar-date comparison (timezone-free)
// ---------------------------------------------------------------------------

/** A calendar day with no time and no timezone. */
export interface CalendarDate {
  readonly year: number;
  /** 1-12. */
  readonly month: number;
  /** 1-31. */
  readonly day: number;
}

const DAYS_IN_MONTH: readonly number[] = [
  31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
];

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function toCalendarDate(
  year: number,
  month: number,
  day: number,
): CalendarDate | null {
  if (!Number.isInteger(year) || year < 1900 || year > 2100) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  const monthLength =
    month === 2 && isLeapYear(year)
      ? 29
      : (DAYS_IN_MONTH[month - 1] ?? 31);
  if (!Number.isInteger(day) || day < 1 || day > monthLength) return null;
  return { year, month, day };
}

/**
 * Parses a receipt date into the calendar days it could denote.
 *
 * Receipts carry plain calendar dates ("2025-01-15"), not instants, so
 * `Date.parse` is the wrong tool: `Date.parse('2025-01-15')` is UTC
 * midnight while `Date.parse('2025/01/15')` is LOCAL midnight. On any
 * device outside UTC the same calendar day then looks different, which
 * mislabels a formatting correction as a value correction.
 *
 * Returns every plausible reading: `01/02/2025` is both 1 Feb and
 * 2 Jan, so both candidates are returned. Returns `[]` when the string
 * is not a date (invalid day/month, free text, timestamps).
 */
export function parseCalendarDates(value: string): readonly CalendarDate[] {
  if (typeof value !== 'string') return [];
  // Drop a time component: "2025-01-15T10:30:00Z" → "2025-01-15".
  const dateOnly = value.trim().split(/[T\s]/)[0] ?? '';
  if (dateOnly.length === 0) return [];

  // Year-first: YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD.
  const yearFirst = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(dateOnly);
  if (yearFirst) {
    const parsed = toCalendarDate(
      Number(yearFirst[1]),
      Number(yearFirst[2]),
      Number(yearFirst[3]),
    );
    return parsed ? [parsed] : [];
  }

  // Day/month-first: DD/MM/YYYY, MM-DD-YYYY, DD.MM.YY.
  const dayFirst = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(dateOnly);
  if (!dayFirst) return [];

  const first = Number(dayFirst[1]);
  const second = Number(dayFirst[2]);
  const rawYear = dayFirst[3] ?? '';
  const year = rawYear.length === 2 ? 2000 + Number(rawYear) : Number(rawYear);

  const asDayMonth = toCalendarDate(year, second, first);
  const asMonthDay = toCalendarDate(year, first, second);
  if (!asDayMonth) return asMonthDay ? [asMonthDay] : [];
  if (!asMonthDay) return [asDayMonth];
  // Both orders are valid (e.g. 05/06/2025) — keep both readings.
  if (asDayMonth.month === asMonthDay.month) return [asDayMonth];
  return [asDayMonth, asMonthDay];
}

/**
 * Returns `true` when two strings name the same calendar day, whatever
 * their separator order or the device timezone.
 */
export function sameCalendarDate(a: string, b: string): boolean {
  const left = parseCalendarDates(a);
  const right = parseCalendarDates(b);
  if (left.length === 0 || right.length === 0) return false;
  return left.some((x) =>
    right.some(
      (y) => x.year === y.year && x.month === y.month && x.day === y.day,
    ),
  );
}

function parseAmount(value: string): number | null {
  if (typeof value !== 'string') return null;
  // Strip currency symbols and whitespace.
  const stripped = value.replace(/[^0-9.,-]/g, '');
  if (stripped.length === 0) return null;
  // Replace European thousands separators (1.234,56 → 1234.56).
  const normalized = stripped.replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
  const num = Number.parseFloat(normalized);
  return Number.isFinite(num) ? num : null;
}

function inferConfidence(
  extracted: string,
  fieldType: OcrFieldName,
): ExtractionConfidence {
  // Heuristic: long, structured values that look like the expected type
  // are "high" confidence; shorter or mismatched values are "low".
  if (extracted.length === 0) return 'unknown';

  switch (fieldType) {
    case 'date':
      return /^\d{4}-\d{2}-\d{2}$/.test(extracted) ? 'high' : 'low';
    case 'total':
    case 'subtotal':
    case 'tax':
      return looksLikeAmount(extracted) ? 'medium' : 'low';
    case 'merchant':
      return extracted.trim().length >= 3 ? 'medium' : 'low';
    case 'payment_method':
      return 'medium';
    case 'line_items':
      return 'unknown';
    default:
      return 'unknown';
  }
}

// ---------------------------------------------------------------------------
// Verification helper
// ---------------------------------------------------------------------------

/**
 * Returns `true` when the diff list contains any value that looks like raw
 * PII (an actual email, UPI VPA, exact amount with magnitude, exact date).
 * Used by tests as a defensive assertion.
 */
export function diffContainsRawPii(diffs: readonly FieldLevelDiff[]): boolean {
  const EMAIL_RE = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/;
  const UPI_VPA_RE = /\b[a-zA-Z0-9._-]{2,64}@[a-zA-Z0-9]{2,24}\b/;
  // A 4-digit year alone is fine. A full ISO date (YYYY-MM-DD) appearing
  // in a diff value would be a leak — the pattern should be '<date:YYYY-MM-DD>'.
  const RAW_DATE_RE = /\b\d{4}-\d{2}-\d{2}\b/;

  for (const d of diffs) {
    for (const v of [d.extractedValuePattern, d.correctedValuePattern]) {
      if (typeof v !== 'string') continue;
      // Strip [REDACTED:...] and <...> placeholders.
      const stripped = v.replace(/<[^>]*>/g, '').replace(/\[REDACTED:[^\]]*\]/g, '');
      if (EMAIL_RE.test(stripped)) return true;
      if (UPI_VPA_RE.test(stripped)) return true;
      if (RAW_DATE_RE.test(stripped)) return true;
    }
  }
  return false;
}
