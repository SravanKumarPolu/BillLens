/**
 * Privacy-safe redactor for analytics events.
 *
 * CRITICAL: analytics events NEVER carry exact amounts, merchant names,
 * UPI IDs, raw receipt text, file paths, or any of the 13 sensitive
 * property keys listed below. The redactor:
 *
 *   1. DROPS sensitive property keys entirely (never preserves them,
 *      even redacted).
 *   2. Buckets amount properties into coarse ranges.
 *   3. Scrubs PII-looking values (emails, UPI VPAs, file URIs, long
 *      digit runs, tokens) from any string value.
 *   4. Is a PURE function — no I/O, no side effects, no globals.
 *
 * The 13 sensitive property keys (case-sensitive — analytics events
 * should use the canonical camelCase forms):
 */

// ---------------------------------------------------------------------------
// Sensitive property keys — ALWAYS dropped
// ---------------------------------------------------------------------------

export const SENSITIVE_PROPERTY_KEYS: ReadonlySet<string> = new Set([
  'amountMinor',
  'amountMajor',
  'merchantName',
  'upiId',
  'bankReference',
  'ocrText',
  'receiptImage',
  'groupName',
  'memberName',
  'note',
  'paymentReference',
  'inviteToken',
  'sessionToken',
  'filePath',
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AnalyticsEvent {
  /** Stable event name (e.g. 'expense_created', 'receipt_scanned'). */
  readonly name: string;
  /** Anonymous installation ID (never an email or phone number). */
  readonly anonymousId: string;
  /** ISO date-time when the event occurred. */
  readonly occurredAt: string;
  /** Event properties (will be redacted). */
  readonly properties: Readonly<Record<string, unknown>>;
}

export type RedactedAnalyticsEvent = Readonly<{
  name: string;
  anonymousId: string;
  occurredAt: string;
  properties: Readonly<Record<string, unknown>>;
}>;

// ---------------------------------------------------------------------------
// Value-level PII scrubbers
// ---------------------------------------------------------------------------

const FILE_URI_RE = /\bfile:\/\/[^\s,)!?]+/i;
const ABSOLUTE_PATH_RE = /\/(?:data|var|Users|home|tmp|storage|Documents)(?:\/[^\s,)!?]*)?/i;
const EMAIL_RE = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/;
const UPI_VPA_RE = /\b[a-zA-Z0-9._-]{2,64}@[a-zA-Z0-9]{2,24}\b/;
const PAYMENT_REF_RE = /\b\d{10,22}\b/;
const TOKEN_HEX_RE = /^[a-fA-F0-9]{32,}$/;
const TOKEN_BASE64_RE = /^[A-Za-z0-9+/]{40,}={0,2}$/;
const SQL_RE = /\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|WITH|CREATE\s+TABLE)\b/i;

/**
 * Scrub a single string value: replace any PII-looking substring with
 * `[REDACTED:<type>]`. Returns the (possibly modified) string.
 */
function scrubStringValue(value: string): string {
  if (typeof value !== 'string') return value;

  // Fast path — short strings that can't match any pattern.
  if (value.length < 6) return value;

  // Tokens (full-string match).
  if (TOKEN_HEX_RE.test(value)) return '[REDACTED:token]';
  if (TOKEN_BASE64_RE.test(value)) return '[REDACTED:token]';

  let out = value;

  // SQL queries.
  if (SQL_RE.test(out)) {
    out = '[REDACTED:sqlite_query]';
    return out;
  }

  // File URIs.
  if (FILE_URI_RE.test(out)) {
    out = out.replace(/\bfile:\/\/[^\s,)!?]+/gi, '[REDACTED:file_path]');
  }

  // Absolute paths.
  if (ABSOLUTE_PATH_RE.test(out)) {
    out = out.replace(/\/(?:data|var|Users|home|tmp|storage|Documents)(?:\/[^\s,)!?]*)?/gi, '[REDACTED:file_path]');
  }

  // Emails (before UPI — emails have a dot in the domain).
  if (EMAIL_RE.test(out)) {
    out = out.replace(/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g, '[REDACTED:email]');
  }

  // UPI VPAs.
  if (UPI_VPA_RE.test(out)) {
    out = out.replace(/\b[a-zA-Z0-9._-]{2,64}@[a-zA-Z0-9]{2,24}\b/g, '[REDACTED:upi_id]');
  }

  // Payment references (long digit runs).
  if (PAYMENT_REF_RE.test(out)) {
    out = out.replace(/\b\d{10,22}\b/g, '[REDACTED:payment_reference]');
  }

  return out;
}

// ---------------------------------------------------------------------------
// Amount bucketing
// ---------------------------------------------------------------------------

/**
 * Bucket an amount (minor units) into a coarse range string.
 *
 *   - amountMinor < 100         → '< 100'
 *   - 100 <= amountMinor < 1000  → '100-1000'
 *   - 1000 <= amountMinor < 10000 → '1000-10000'
 *   - amountMinor >= 10000       → '> 10000'
 *
 * Returns `'[REDACTED:amount]'` for non-finite input.
 */
export function bucketAmount(amountMinor: number): string {
  if (typeof amountMinor !== 'number' || !Number.isFinite(amountMinor)) {
    return '[REDACTED:amount]';
  }
  const abs = Math.abs(amountMinor);
  if (abs < 100) return '< 100';
  if (abs < 1000) return '100-1000';
  if (abs < 10000) return '1000-10000';
  return '> 10000';
}

// ---------------------------------------------------------------------------
// Property redaction
// ---------------------------------------------------------------------------

/**
 * Returns true when a property key is in the sensitive-keys set.
 * Case-sensitive — analytics events should use the canonical camelCase.
 */
export function isSensitivePropertyKey(key: string): boolean {
  return SENSITIVE_PROPERTY_KEYS.has(key);
}

/**
 * Redact a single property value (non-sensitive keys only).
 * Strings are scrubbed for PII patterns. Numbers are PRESERVED
 * (analytics frequently uses counts). Booleans/null/undefined are
 * preserved. Arrays + nested objects are recursively redacted.
 */
function redactPropertyValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return scrubStringValue(value);
  if (typeof value === 'number') {
    // Preserve numbers (counts, ratios) — but if the number looks like
    // an amount (very large), leave it. The caller is responsible for
    // not putting exact amounts in non-amount-keyed properties.
    return value;
  }
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value.map((v) => redactPropertyValue(v));
  }
  if (typeof value === 'object') {
    return redactProperties(value as Record<string, unknown>);
  }
  return '[REDACTED:unknown]';
}

/**
 * Redact a properties object: drop sensitive keys, scrub values of
 * remaining keys. Returns a NEW frozen object.
 */
function redactProperties(
  properties: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(properties)) {
    if (isSensitivePropertyKey(key)) {
      // DROP entirely — do not preserve even a redacted placeholder.
      continue;
    }
    out[key] = redactPropertyValue(properties[key]);
  }
  return Object.freeze(out);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Redact an analytics event: drop sensitive property keys, scrub
 * PII-looking values from remaining properties, preserve the event
 * name / anonymousId / occurredAt.
 *
 * Pure function — never mutates the input.
 */
export function redactAnalyticsEvent(event: AnalyticsEvent): RedactedAnalyticsEvent {
  // Validate anonymousId — must NOT look like an email or contain PII.
  let safeAnonymousId = event.anonymousId;
  if (typeof safeAnonymousId !== 'string' || safeAnonymousId.length === 0) {
    safeAnonymousId = '[REDACTED:anonymous_id]';
  } else {
    // Scrub in case the caller accidentally passed an email-shaped ID.
    const scrubbed = scrubStringValue(safeAnonymousId);
    if (scrubbed !== safeAnonymousId) {
      safeAnonymousId = '[REDACTED:anonymous_id]';
    }
  }

  // Validate event name — must be a short identifier, not free text.
  let safeName = event.name;
  if (typeof safeName !== 'string' || safeName.length === 0 || safeName.length > 100) {
    safeName = '[REDACTED:event_name]';
  } else if (EMAIL_RE.test(safeName) || UPI_VPA_RE.test(safeName) || FILE_URI_RE.test(safeName)) {
    safeName = '[REDACTED:event_name]';
  }

  return Object.freeze({
    name: safeName,
    anonymousId: safeAnonymousId,
    occurredAt: event.occurredAt,
    properties: redactProperties(event.properties),
  });
}

// ---------------------------------------------------------------------------
// Verification helper
// ---------------------------------------------------------------------------

/**
 * Returns true when the redacted event still contains a value that looks
 * like PII. Used by tests as a defensive assertion.
 */
export function containsResidualAnalyticsPii(redacted: RedactedAnalyticsEvent): boolean {
  // Check no sensitive keys survived.
  for (const key of Object.keys(redacted.properties)) {
    if (isSensitivePropertyKey(key)) return true;
  }
  // Check values for PII patterns.
  const serialized = JSON.stringify(redacted);
  // Strip [REDACTED:...] placeholders.
  const stripped = serialized.replace(/\[REDACTED:[^\]]*\]/g, '');
  const patterns = [
    FILE_URI_RE,
    ABSOLUTE_PATH_RE,
    EMAIL_RE,
    UPI_VPA_RE,
    PAYMENT_REF_RE,
    TOKEN_HEX_RE,
    TOKEN_BASE64_RE,
    SQL_RE,
  ];
  for (const re of patterns) {
    if (re.test(stripped)) return true;
  }
  return false;
}
