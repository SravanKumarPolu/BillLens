/**
 * Privacy-safe redactor for metric payloads.
 *
 * Production monitoring MUST NOT leak:
 *   - SQLite query strings (table names, column names, WHERE clauses)
 *   - Local file paths (file:// URIs, /data/, /var/, /Users/, /home/)
 *   - Exact financial amounts (replaced with coarse buckets)
 *   - Merchant names (free-text from OCR or expense titles)
 *   - UPI IDs / VPA (e.g. user@upi)
 *   - Raw OCR text (the receipt body extracted by OCR)
 *   - Email addresses
 *   - Payment references (bank reference / UTR / RRN)
 *
 * This module is a pure function: no I/O, no side effects, no globals.
 * Output is a deep clone with sensitive values replaced by `[REDACTED:<type>]`.
 *
 * Amount bucketing (NEVER exact):
 *   - amountMinor < 100         → '< 100'
 *   - 100 <= amountMinor < 1000  → '100-1000'
 *   - 1000 <= amountMinor < 10000 → '1000-10000'
 *   - amountMinor >= 10000       → '> 10000'
 *
 * See `docs/production-monitoring.md` and `docs/privacy-and-trust.md`.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type RedactedPayload = Readonly<Record<string, unknown>>;

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

/**
 * Keys whose values are ALWAYS redacted (regardless of value shape).
 *
 * The check is case-insensitive — both `merchantName` and `MerchantName`
 * must be stripped. Numeric values for these keys are also redacted (e.g.
 * `amountMinor: 1250` becomes `[REDACTED:amount]`).
 */
const ALWAYS_REDACTED_KEY_PATTERNS: readonly RegExp[] = [
  /^amountminor$/i,
  /^amountmajor$/i,
  /^merchantname$/i,
  /^merchant$/i,
  /^upiid$/i,
  /^upa$/i,
  /^vpa$/i,
  /^email$/i,
  /^emailaddress$/i,
  /^ocrtext$/i,
  /^ocrresult$/i,
  /^ocr$/i,
  /^paymentreference$/i,
  /^bankreference$/i,
  /^utr$/i,
  /^rrn$/i,
  /^sql$/i,
  /^query$/i,
  /^sqlquery$/i,
  /^filepath$/i,
  /^path$/i,
  /^uri$/i,
  /^receiptimage$/i,
  /^receipttext$/i,
  /^rawtext$/i,
  /^note$/i,
  /^description$/i,
  /^title$/i,
];

/**
 * Value-level patterns that scrub PII even when the key is unknown.
 *
 * These run on every string value encountered in the payload.
 */
const SENSITIVE_VALUE_PATTERNS: readonly { readonly re: RegExp; readonly type: string }[] = [
  // SQLite-flavored query strings: SELECT/INSERT/UPDATE/DELETE/WITH ...
  // Covers `SELECT * FROM expenses WHERE ...`, parameterised or not.
  { re: /\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|WITH|CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE)\b.*\b(FROM|INTO|TABLE|SET|WHERE|VALUES)?\b/i, type: 'sqlite_query' },
  // file:// URIs and absolute paths starting with /data /var /Users /home /tmp
  { re: /^file:\/\//, type: 'file_uri' },
  { re: /^\/(data|var|Users|home|tmp|storage|Documents)(\/|$)/, type: 'file_path' },
  // Email addresses
  { re: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, type: 'email' },
  // UPI VPA: name@bank (e.g. alice@okhdfcbank)
  { re: /^[a-zA-Z0-9._-]{2,64}@[a-zA-Z0-9]{2,24}$/, type: 'upi_vpa' },
  // Payment references / UTR / RRN — typically 12-22 digit runs, sometimes alphanumeric.
  // We require at least 10 digits to avoid redacting short numeric IDs.
  { re: /\b\d{10,22}\b/, type: 'payment_reference' },
  // Tokens (long hex or base64 runs)
  { re: /^[a-fA-F0-9]{32,}$/, type: 'token' },
  { re: /^[A-Za-z0-9+/]{40,}={0,2}$/, type: 'token' },
];

// ---------------------------------------------------------------------------
// Amount bucketing
// ---------------------------------------------------------------------------

/**
 * Buckets a minor-unit amount into a coarse range string.
 *
 * Returns one of:
 *   - '< 100'      (amountMinor < 100)
 *   - '100-1000'   (100 <= amountMinor < 1000)
 *   - '1000-10000' (1000 <= amountMinor < 10000)
 *   - '> 10000'    (amountMinor >= 10000)
 *
 * Returns `'[REDACTED:amount]'` for non-finite or non-numeric input so the
 * caller never sees an exact value in the output, even on bad input.
 */
export function bucketAmountMinor(amountMinor: unknown): string {
  if (typeof amountMinor !== 'number' || !Number.isFinite(amountMinor)) {
    return '[REDACTED:amount]';
  }
  if (amountMinor < 0) {
    // Treat negative amounts as the absolute value for bucketing purposes;
    // we still never reveal the exact magnitude.
    const abs = Math.abs(amountMinor);
    return bucketAmountMinor(abs);
  }
  if (amountMinor < 100) return '< 100';
  if (amountMinor < 1000) return '100-1000';
  if (amountMinor < 10000) return '1000-10000';
  return '> 10000';
}

// ---------------------------------------------------------------------------
// Core redactor
// ---------------------------------------------------------------------------

/**
 * Returns true when a key name should be force-redacted (any value, even
 * non-strings, becomes `[REDACTED:<type>]`).
 */
function isAlwaysRedactedKey(key: string): string | null {
  for (const re of ALWAYS_REDACTED_KEY_PATTERNS) {
    if (re.test(key)) {
      return redactionTypeForKey(key);
    }
  }
  return null;
}

/**
 * Maps a redacted key to its `[REDACTED:<type>]` label.
 */
function redactionTypeForKey(key: string): string {
  const lower = key.toLowerCase();
  if (lower === 'amountminor' || lower === 'amountmajor') return '[REDACTED:amount]';
  if (lower.startsWith('merchant')) return '[REDACTED:merchant]';
  if (lower === 'upiid' || lower === 'upa' || lower === 'vpa') return '[REDACTED:upi_id]';
  if (lower.startsWith('email')) return '[REDACTED:email]';
  if (lower.startsWith('ocr') || lower === 'rawtext' || lower === 'receipttext') return '[REDACTED:ocr_text]';
  if (lower === 'paymentreference' || lower === 'bankreference' || lower === 'utr' || lower === 'rrn') {
    return '[REDACTED:payment_reference]';
  }
  if (lower === 'sql' || lower === 'query' || lower === 'sqlquery') return '[REDACTED:sqlite_query]';
  if (lower === 'filepath' || lower === 'path' || lower === 'uri' || lower === 'receiptimage') {
    return '[REDACTED:file_path]';
  }
  // Generic for note/description/title — they may carry merchant names.
  return '[REDACTED:free_text]';
}

/**
 * Returns the redaction type for a sensitive value, or `null` when the
 * value passes all sensitive-value checks.
 */
function redactionTypeForValue(value: string): string | null {
  for (const { re, type } of SENSITIVE_VALUE_PATTERNS) {
    if (re.test(value)) {
      switch (type) {
        case 'sqlite_query':
          return '[REDACTED:sqlite_query]';
        case 'file_uri':
        case 'file_path':
          return '[REDACTED:file_path]';
        case 'email':
          return '[REDACTED:email]';
        case 'upi_vpa':
          return '[REDACTED:upi_id]';
        case 'payment_reference':
          return '[REDACTED:payment_reference]';
        case 'token':
          return '[REDACTED:token]';
        default:
          return '[REDACTED:unknown]';
      }
    }
  }
  return null;
}

/**
 * Redacts a single value (string / number / boolean / nested object/array).
 * Returns the redacted replacement. NEVER mutates the input.
 */
function redactValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    // First check value-level patterns (file paths, emails, UPI IDs, SQL).
    const valueType = redactionTypeForValue(value);
    if (valueType !== null) return valueType;
    return value;
  }

  if (typeof value === 'number') {
    // Numbers are never leaked as-is — they may be exact amounts.
    // We return the bucketed form so ratios/latencies aren't accidentally
    // exact amounts either. Callers who need exact numeric ratios should
    // store them at the TOP level of the payload, not nested in objects.
    return bucketAmountMinor(value);
  }

  if (typeof value === 'boolean') return value;

  if (Array.isArray(value)) {
    return value.map((v) => redactValue(v));
  }

  if (typeof value === 'object') {
    return redactObject(value as Record<string, unknown>);
  }

  // Functions, symbols, bigint — drop to a placeholder to avoid leaking.
  return '[REDACTED:unknown]';
}

/**
 * Redacts an object's keys + values. Returns a NEW object; never mutates.
 */
function redactObject(input: Record<string, unknown>): RedactedPayload {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(input)) {
    const value = input[key];
    const forcedType = isAlwaysRedactedKey(key);
    if (forcedType !== null) {
      // For amount fields, attempt to bucket if numeric — this preserves
      // useful aggregate information while hiding the exact value.
      if (
        (key.toLowerCase() === 'amountminor' || key.toLowerCase() === 'amountmajor') &&
        typeof value === 'number' &&
        Number.isFinite(value)
      ) {
        out[key] = bucketAmountMinor(value);
      } else {
        out[key] = forcedType;
      }
      continue;
    }
    out[key] = redactValue(value);
  }
  return Object.freeze(out);
}

/**
 * Public redactor entry point.
 *
 * Accepts an arbitrary readonly payload (typically the `payload` field of a
 * metric event). Returns a deeply-redacted, frozen copy.
 *
 * Top-level numeric values are PRESERVED as-is — the caller is expected to
 * pass only aggregate ratios/latencies at the top level. Nested numbers
 * (e.g. inside an `error.context` sub-object) are bucketed to amounts.
 *
 * Top-level `amountMinor` / `amountMajor` keys are ALWAYS bucketed.
 */
export function redactMetricPayload(
  payload: Readonly<Record<string, unknown>>,
): RedactedPayload {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(payload)) {
    const value = payload[key];
    const lower = key.toLowerCase();

    // Always-bucketed top-level amount keys.
    if (lower === 'amountminor' || lower === 'amountmajor') {
      if (typeof value === 'number' && Number.isFinite(value)) {
        out[key] = bucketAmountMinor(value);
      } else {
        out[key] = '[REDACTED:amount]';
      }
      continue;
    }

    const forcedType = isAlwaysRedactedKey(key);
    if (forcedType !== null) {
      out[key] = forcedType;
      continue;
    }

    // Top-level numbers are preserved (aggregate ratios/latencies).
    if (typeof value === 'number') {
      out[key] = value;
      continue;
    }

    if (typeof value === 'boolean' || value === null || value === undefined) {
      out[key] = value;
      continue;
    }

    if (typeof value === 'string') {
      const valueType = redactionTypeForValue(value);
      out[key] = valueType !== null ? valueType : value;
      continue;
    }

    if (Array.isArray(value) || typeof value === 'object') {
      out[key] = redactValue(value);
      continue;
    }

    out[key] = '[REDACTED:unknown]';
  }
  return Object.freeze(out);
}

// ---------------------------------------------------------------------------
// Verification helpers — used by tests AND by the alerting layer to assert
// that no PII patterns survive a redaction pass.
// ---------------------------------------------------------------------------

/**
 * Returns true when `redacted` still contains a value that looks like PII.
 * Used as a defensive assertion in tests.
 */
export function containsResidualPii(redacted: unknown): boolean {
  if (redacted === null || redacted === undefined) return false;
  if (typeof redacted === 'string') {
    for (const { re } of SENSITIVE_VALUE_PATTERNS) {
      if (re.test(redacted)) return true;
    }
    return false;
  }
  if (typeof redacted === 'number' || typeof redacted === 'boolean') return false;
  if (Array.isArray(redacted)) {
    return redacted.some(containsResidualPii);
  }
  if (typeof redacted === 'object') {
    for (const key of Object.keys(redacted as Record<string, unknown>)) {
      if (isAlwaysRedactedKey(key)) {
        // If the value is NOT a `[REDACTED:...]` placeholder, it leaked.
        const v = (redacted as Record<string, unknown>)[key];
        if (typeof v === 'string' && v.startsWith('[REDACTED:')) continue;
        if (typeof v === 'string' && (v === '< 100' || v === '100-1000' || v === '1000-10000' || v === '> 10000')) {
          continue;
        }
        return true;
      }
      const v = (redacted as Record<string, unknown>)[key];
      if (containsResidualPii(v)) return true;
    }
    return false;
  }
  return false;
}
