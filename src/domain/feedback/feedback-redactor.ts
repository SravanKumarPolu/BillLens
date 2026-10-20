/**
 * PII redactor for user feedback bodies.
 *
 * Feedback bodies are FREE TEXT written by users, which makes them a
 * high-risk surface for accidental PII disclosure. The redactor:
 *
 *   1. Removes file URIs (file://...) and absolute paths (/data/, /var/,
 *      /Users/, /home/, /tmp/, /storage/, /Documents/).
 *   2. Removes attachment references entirely for bug reports
 *      (`Attachment: <path>` lines, `See attached: ...` phrases, image
 *      references). The local-only file is NEVER uploaded.
 *   3. Replaces UPI IDs / VPAs (`name@bank`) with `[REDACTED:upi_id]`.
 *   4. Replaces email addresses (`x@y.z`) with `[REDACTED:email]`.
 *   5. Replaces payment references / UTR / RRN (long digit runs) with
 *      `[REDACTED:payment_reference]`.
 *   6. Replaces raw OCR text markers (`OCR: ...`, `Receipt text: ...`)
 *      with `[REDACTED:ocr_text]`.
 *   7. Replaces merchant label lines (`Merchant: ...`,
 *      `Merchant name: ...`) with `[REDACTED:merchant]`.
 *   8. Buckets amount expressions (`₹1,250.00`, `Rs 1250`,
 *      `1250.00`) into coarse ranges (`< 100`, `100-1000`, `1000-10000`,
 *      `> 10000`). NEVER the exact amount.
 *
 * The function is PURE — it returns a new string and never mutates its
 * input. Output is always finite (returns `''` for null/undefined input).
 */

import { bucketAmountMinor } from '@domain/monitoring/metrics-redactor';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type FeedbackRedactionLevel = 'standard' | 'bug_report';

// ---------------------------------------------------------------------------
// Regex patterns
// ---------------------------------------------------------------------------

/**
 * Capture the leading `^` or `\n` so we can preserve it in the
 * replacement. Without this, the leading newline would be consumed and
 * the redacted line would merge with the previous line.
 */
const LINE_START_CAPTURE = /(^|\n)/;

/** File URIs — file://anything */
const FILE_URI_RE = /\bfile:\/\/[^\s,)!?]+/gi;

/** Absolute paths starting with known roots. */
const ABSOLUTE_PATH_RE = /(^|[^/\w])(\/(?:data|var|Users|home|tmp|storage|Documents)(?:\/[^\s,)!?]*)?)/gi;

/**
 * Attachment references — for bug reports, we strip these ENTIRELY.
 * Matches:
 *   - `Attachment: <path>`
 *   - `See attached: <path>`
 *   - `Attached: <path>`
 *   - `Screenshot: <path>`
 *   - `Log file: <path>`
 *   - `Crash log: <path>`
 *   - markdown image syntax ![alt](path)
 */
const ATTACHMENT_REFERENCE_RE =
  /(^|\n)[ \t]*(?:Attachment|Attached|See attached|Screenshot|Log file|Crash log)[ \t]*:[ \t]*[^\n]+/gi;
const MARKDOWN_IMAGE_RE = /!\[[^\]]*\]\([^)]+\)/g;

/** UPI VPA — name@bank (2-64 chars before @, 2-24 chars after, NO dot in domain). */
const UPI_VPA_RE = /\b[a-zA-Z0-9._-]{2,64}@[a-zA-Z0-9]{2,24}\b/g;

/** Email addresses — requires a dot in the domain part. */
const EMAIL_RE = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;

/**
 * Payment references — runs of 10-22 digits. We require 10+ to avoid
 * redacting short numeric IDs (years, counts).
 */
const PAYMENT_REF_RE = /\b\d{10,22}\b/g;

/**
 * OCR text markers — `OCR: ...`, `Raw text: ...`, `Receipt text: ...`,
 * `Extracted text: ...` (consume to end of line).
 *
 * Capture group 1 preserves the leading newline so the redacted
 * placeholder stays on its own line.
 */
const OCR_TEXT_MARKER_RE =
  /(^|\n)[ \t]*(?:OCR|Raw text|Receipt text|Extracted text)[ \t]*:[ \t]*[^\n]+/gi;

/**
 * Merchant label lines — `Merchant: ...`, `Merchant name: ...`.
 * Captures the leading newline.
 */
const MERCHANT_LABEL_RE = /(^|\n)[ \t]*(?:Merchant name|Merchant)[ \t]*:[ \t]*[^\n]+/gi;

/**
 * Amount expressions:
 *   - `₹1,250.00`     (Indian rupee symbol, with thousand separators)
 *   - `Rs 1250`       (Rs prefix, no separators)
 *   - `Rs. 1,250`     (Rs. prefix, with separators)
 *   - `INR 1250`      (INR prefix)
 *   - `$1,250.00`     (dollar)
 *   - `€12.50`        (euro)
 *   - `£40.00`        (pound)
 *
 * The alternation tries the comma-grouped form FIRST (requires at least
 * one comma), then falls back to a plain number. This prevents
 * `\d{1,3}` from matching only the first 3 digits of a 4+ digit number.
 *
 * Capture group 1 is the numeric value (with commas/decimals).
 */
const AMOUNT_RE =
  /(?:₹|Rs\.?|INR|\$|€|£)[ \t]*(\d{1,3}(?:,\d{3})+(?:\.\d{1,4})?|\d+(?:\.\d{1,4})?)/g;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a matched amount string (e.g. `"1,250.00"` or `"1250"`) into a
 * bucketable numeric value (the major-unit amount as a number).
 *
 * We do NOT convert to minor units (paise) — the bucket function treats
 * its input as a raw number and bucketizes it into coarse ranges. For
 * feedback bodies, the user wrote a major amount (e.g. ₹1250), so we
 * pass 1250 to the bucket function, which returns '1000-10000'.
 *
 * Returns `null` if parsing fails.
 */
function parseAmountString(raw: string): number | null {
  const cleaned = raw.replace(/,/g, '').trim();
  const parsed = Number.parseFloat(cleaned);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 0) return null;
  return parsed;
}

/**
 * Apply standard-level redaction (used by all feedback types except
 * bug_report). Strips PII but preserves general structure.
 */
function applyStandardRedaction(input: string): string {
  let out = input;

  // OCR text markers (capture leading newline to preserve line structure).
  out = out.replace(OCR_TEXT_MARKER_RE, '$1[REDACTED:ocr_text]');

  // Merchant label lines (capture leading newline).
  out = out.replace(MERCHANT_LABEL_RE, '$1[REDACTED:merchant]');

  // File URIs.
  out = out.replace(FILE_URI_RE, '[REDACTED:file_path]');

  // Absolute paths (preserve the preceding character via capture group 1).
  out = out.replace(ABSOLUTE_PATH_RE, '$1[REDACTED:file_path]');

  // Emails (BEFORE UPI — emails require a dot, UPI does not).
  out = out.replace(EMAIL_RE, '[REDACTED:email]');

  // UPI VPAs.
  out = out.replace(UPI_VPA_RE, '[REDACTED:upi_id]');

  // Payment references.
  out = out.replace(PAYMENT_REF_RE, '[REDACTED:payment_reference]');

  // Amounts — bucket (NEVER exact).
  out = out.replace(AMOUNT_RE, (_match, amountStr: string) => {
    const value = parseAmountString(amountStr);
    if (value === null) return '[REDACTED:amount]';
    return `[REDACTED:amount:${bucketAmountMinor(value)}]`;
  });

  return out;
}

/**
 * Apply bug_report-level redaction. Adds stripping of attachment
 * references ENTIRELY (never uploaded).
 */
function applyBugReportRedaction(input: string): string {
  let out = input;

  // Strip attachment references entirely (lines like "Attachment: <path>").
  // Capture leading newline to preserve line structure.
  out = out.replace(ATTACHMENT_REFERENCE_RE, '$1[REDACTED:attachment]');
  // Strip markdown image syntax.
  out = out.replace(MARKDOWN_IMAGE_RE, '[REDACTED:attachment]');

  // Then apply standard redaction.
  out = applyStandardRedaction(out);

  return out;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Redact a feedback body.
 *
 * @param body          The raw body as written by the user.
 * @param level         `'bug_report'` for bug reports (strips attachment
 *                      references entirely), `'standard'` for all other
 *                      types. Defaults to `'standard'`.
 *
 * @returns The PII-redacted body. Always a string (never null/undefined).
 *          Empty for null/undefined input.
 */
export function redactFeedbackBody(
  body: string | null | undefined,
  level: FeedbackRedactionLevel = 'standard',
): string {
  if (body === null || body === undefined) return '';
  if (typeof body !== 'string') return '';
  if (body.length === 0) return '';

  return level === 'bug_report' ? applyBugReportRedaction(body) : applyStandardRedaction(body);
}

/**
 * Convenience helper — redact for a specific feedback type.
 * `bug_report` uses bug_report-level redaction; everything else uses
 * standard.
 */
export function redactFeedbackBodyForType(
  body: string | null | undefined,
  type: 'general' | 'feature_request' | 'bug_report' | 'ocr_correction' | 'nps' | 'app_store_review',
): string {
  return redactFeedbackBody(
    body,
    type === 'bug_report' ? 'bug_report' : 'standard',
  );
}

/**
 * Returns true when the redacted body still contains a value that looks
 * like PII. Used by tests as a defensive assertion.
 */
export function containsResidualFeedbackPii(redacted: string): boolean {
  if (typeof redacted !== 'string') return false;
  // Strip placeholders first, then run patterns against the rest.
  const stripped = redacted.replace(/\[REDACTED:[^\]]*\]/g, '');
  // Reset lastIndex on global regexes before testing.
  const patterns = [
    FILE_URI_RE,
    ABSOLUTE_PATH_RE,
    EMAIL_RE,
    UPI_VPA_RE,
    PAYMENT_REF_RE,
    OCR_TEXT_MARKER_RE,
    MERCHANT_LABEL_RE,
    AMOUNT_RE,
  ];
  for (const re of patterns) {
    re.lastIndex = 0;
    if (re.test(stripped)) return true;
  }
  // Suppress unused-variable warning for LINE_START_CAPTURE.
  void LINE_START_CAPTURE;
  return false;
}
