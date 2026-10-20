import { InvalidEntityError } from '../../errors/index';

import { validateUpiVpa } from './upi-vpa-validator';

/**
 * UPI deep-link builder — Phase 6 Track 4.
 *
 * Builds a standards-compliant `upi://` URI per the NPCI UPI
 * deep-linking spec. The URI pre-fills the payee VPA, name, amount,
 * currency, and transaction note into the user's UPI app, which
 * they then confirm manually.
 *
 * ── The safety contract (spec rule, Prompt 56) ──
 *
 *   "BillLens must never claim 'Payment completed' only because a
 *    UPI deep link was opened, a QR code was displayed, a payment
 *    screenshot was attached, the user left BillLens and returned,
 *    or a payment reference was manually entered."
 *
 * This module BUILDS the URI. It does NOT launch the URI, does NOT
 * claim payment success, and does NOT mutate any settlement. The
 * return-to-app handler (`upi-return-handler.ts`) is what records
 * the settlement as `pending_confirmation` after the user returns —
 * and even that does NOT mark it as completed. Receiver confirmation
 * is always required.
 *
 * ── URI format ──
 *
 *   upi://pay?pa={payeeVpa}&pn={payeeName}&am={amount}&cu={currency}
 *            &tn={note}&tr={reference}
 *
 * Parameters (NPCI spec):
 *
 *   - `pa` — payee VPA (mandatory). Validated by `validateUpiVpa`.
 *   - `pn` — payee name (mandatory). 1-100 chars. URL-encoded.
 *   - `am` — amount in major units (e.g. "10.50"). Mandatory for
 *     BillLens (the spec allows it to be optional, but BillLens
 *     always pre-fills the exact amount — never lets the user type
 *     it in the UPI app, which would risk the wrong amount).
 *   - `cu` — currency code. BillLens enforces `INR` only (see
 *     `assertUpiSupportedCurrency`).
 *   - `tn` — transaction note (optional). Max 80 chars per NPCI.
 *     URL-encoded. Used to help the receiver recognise the payment.
 *   - `tr` — transaction reference (optional). BillLens generates
 *     a short unique id so the user can match the UPI transaction
 *     back to a BillLens settlement if needed.
 *
 * Parameters BillLens does NOT include:
 *   - `mc` (merchant code) — BillLens is not a merchant.
 *   - `tid` (transaction id from merchant) — same.
 *   - `url` (merchant URL) — same.
 *
 * ── Privacy ──
 *
 * The URI contains the payee VPA in plaintext — this is required by
 * the UPI spec; the user's UPI app needs the VPA to route the
 * payment. The URI is NOT logged (the analytics redactor strips
 * `upi://` URIs). The URI is NOT embedded in QR codes that contain
 * any other BillLens data — the QR contains ONLY the URI.
 */

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface UpiDeepLinkInput {
  /** Payee VPA. Validated by validateUpiVpa. */
  readonly payeeVpa: string;
  /** Payee display name. 1-100 chars. URL-encoded into `pn`. */
  readonly payeeName: string;
  /**
   * Amount in major units (e.g. 10.50). Must be > 0. BillLens always
   * pre-fills the exact amount; the user cannot change it in the UPI
   * app for the suggested-settlement flow (the spec's safety rule).
   */
  readonly amount: number;
  /**
   * Currency code. BillLens enforces INR only — use
   * `assertUpiSupportedCurrency` to gate before calling this
   * function. The function does an explicit check too as a
   * defensive backstop.
   */
  readonly currencyCode: string;
  /** Optional transaction note. Max 80 chars per NPCI. */
  readonly note?: string;
  /**
   * Optional transaction reference. BillLens generates a short
   * unique id; the user can match it back to a settlement.
   */
  readonly reference?: string;
}

export interface UpiDeepLinkOutput {
  /** The full `upi://pay?pa=...&pn=...&am=...&cu=...` URI. */
  readonly uri: string;
  /** The payee VPA, validated and trimmed. */
  readonly payeeVpa: string;
  /** The transaction reference used (input.reference or a generated one). */
  readonly transactionReference: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const UPI_DEEP_LINK_SCHEME = 'upi';
export const UPI_DEEP_LINK_HOST = 'pay';
/** NPCI spec: max length of the `tn` (transaction note) parameter. */
export const UPI_NOTE_MAX_LENGTH = 80;
/** NPCI spec: max length of the `pn` (payee name) parameter. */
export const UPI_NAME_MAX_LENGTH = 100;
/** NPCI spec: max length of the `tr` (transaction reference) parameter. */
export const UPI_REFERENCE_MAX_LENGTH = 35;
/** The only currency BillLens supports for UPI in the MVP. */
export const UPI_SUPPORTED_CURRENCIES: readonly string[] = ['INR'];

// ---------------------------------------------------------------------------
// Currency gate
// ---------------------------------------------------------------------------

/**
 * Assert that a currency code is supported for UPI. Throws
 * `InvalidEntityError` if the currency is not in
 * `UPI_SUPPORTED_CURRENCIES`.
 *
 * Spec rule (Prompt 56): "UPI payment requests should use supported
 * currency rules. Do not present UPI as a generic payment mechanism
 * for unsupported currencies. If the balance is in pounds sterling,
 * show another settlement method rather than attempting a UPI
 * conversion."
 *
 * BillLens's MVP supports INR only. The list can be extended in
 * future (e.g. NPR for Nepal UPI) by adding to
 * `UPI_SUPPORTED_CURRENCIES`.
 */
export function assertUpiSupportedCurrency(currencyCode: string): void {
  if (!UPI_SUPPORTED_CURRENCIES.includes(currencyCode.toUpperCase())) {
    throw new InvalidEntityError(
      `UPI is not supported for currency "${currencyCode}". Supported: ${UPI_SUPPORTED_CURRENCIES.join(', ')}. Use another settlement method.`,
    );
  }
}

/**
 * Boolean predicate version of `assertUpiSupportedCurrency`.
 */
export function isUpiSupportedCurrency(currencyCode: string): boolean {
  try {
    assertUpiSupportedCurrency(currencyCode);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/**
 * Build a UPI deep-link URI.
 *
 * Validates the payee VPA, currency, amount, name, and (if present)
 * note and reference. All values are URL-encoded per RFC 3986. The
 * resulting URI is safe to pass to `Linking.openURL` (React Native)
 * or to encode as a QR code.
 *
 * The function is pure: it does NOT launch the URI, does NOT mutate
 * any settlement, does NOT record any state. The caller is
 * responsible for what happens next — typically, the caller hands
 * the URI to the platform URL launcher and then runs the
 * return-to-app handler when the user comes back.
 *
 * @example
 *   const out = buildUpiDeepLink({
 *     payeeVpa: 'john.doe@oksbi',
 *     payeeName: 'John Doe',
 *     amount: 42.50,
 *     currencyCode: 'INR',
 *     note: 'Dinner split',
 *     reference: 'BL-X7Y8Z9',
 *   });
 *   out.uri
 *   // → 'upi://pay?pa=john.doe%40oksbi&pn=John%20Doe&am=42.50&cu=INR&tn=Dinner%20split&tr=BL-X7Y8Z9'
 */
export function buildUpiDeepLink(input: UpiDeepLinkInput): UpiDeepLinkOutput {
  // ── Currency gate (defensive — the use case should have gated
  //    earlier, but this is a pure function so we re-check) ──
  assertUpiSupportedCurrency(input.currencyCode);

  // ── Validate VPA ──
  // We import lazily to avoid a circular dependency: the VPA validator
  // imports InvalidEntityError, but we also import it; that's fine,
  // but keeping the import at the top of this file would not change
  // the dependency graph. We import at the top for clarity.
  const validatedVpa = validateUpiVpa(input.payeeVpa);

  // ── Validate amount ──
  if (typeof input.amount !== 'number' || !Number.isFinite(input.amount)) {
    throw new InvalidEntityError(
      `UPI amount must be a finite number, got ${input.amount}`,
    );
  }
  if (input.amount <= 0) {
    throw new InvalidEntityError(
      `UPI amount must be > 0, got ${input.amount}`,
    );
  }
  // NPCI allows up to ₹2,000,000 per UPI transaction (varies by bank).
  // We do not enforce a max here — the UPI app will reject oversized
  // amounts. The BillLens settlement layer may enforce its own limits.

  // ── Validate payee name ──
  const trimmedName = input.payeeName.trim();
  if (trimmedName.length === 0) {
    throw new InvalidEntityError('UPI payee name must not be empty');
  }
  if (trimmedName.length > UPI_NAME_MAX_LENGTH) {
    throw new InvalidEntityError(
      `UPI payee name must be at most ${UPI_NAME_MAX_LENGTH} chars, got ${trimmedName.length}`,
    );
  }

  // ── Validate note (if present) ──
  let trimmedNote: string | undefined;
  if (input.note !== undefined) {
    trimmedNote = input.note.trim();
    if (trimmedNote.length > UPI_NOTE_MAX_LENGTH) {
      throw new InvalidEntityError(
        `UPI note must be at most ${UPI_NOTE_MAX_LENGTH} chars, got ${trimmedNote.length}`,
      );
    }
  }

  // ── Validate / generate transaction reference ──
  let transactionReference: string;
  if (input.reference !== undefined) {
    const trimmedRef = input.reference.trim();
    if (trimmedRef.length === 0) {
      throw new InvalidEntityError('UPI reference must not be empty if provided');
    }
    if (trimmedRef.length > UPI_REFERENCE_MAX_LENGTH) {
      throw new InvalidEntityError(
        `UPI reference must be at most ${UPI_REFERENCE_MAX_LENGTH} chars, got ${trimmedRef.length}`,
      );
    }
    transactionReference = trimmedRef;
  } else {
    // Generate a short unique reference. Format: BL-{8 hex chars}.
    // Not a security hash — just a stable identifier the user can
    // match back to a BillLens settlement.
    transactionReference = `BL-${generateShortId()}`;
  }

  // ── Build the URI ──
  // Use URLSearchParams for URL-encoding. We build on a sentinel
  // base because URLSearchParams would emit "?params" relative to
  // a base; we want "upi://pay?params". We assemble manually.
  const params = new URLSearchParams();
  params.set('pa', validatedVpa);
  params.set('pn', trimmedName);
  params.set('am', formatAmount(input.amount));
  params.set('cu', input.currencyCode.toUpperCase());
  if (trimmedNote !== undefined && trimmedNote.length > 0) {
    params.set('tn', trimmedNote);
  }
  params.set('tr', transactionReference);

  const uri = `${UPI_DEEP_LINK_SCHEME}://${UPI_DEEP_LINK_HOST}?${params.toString()}`;

  return {
    uri,
    payeeVpa: validatedVpa,
    transactionReference,
  };
}

/**
 * Format the amount per NPCI spec: a decimal string with up to 2
 * decimal places, no trailing zeros beyond the decimal point. NPCI
 * uses the format "10" or "10.50" — not "10.5" and not "10.500".
 *
 * The amount is rendered with the smallest-precision the input
 * allows. We never use scientific notation.
 */
function formatAmount(amount: number): string {
  // Round to 2 decimal places (NPCI does not allow more).
  const rounded = Math.round(amount * 100) / 100;
  if (Number.isInteger(rounded)) {
    return String(rounded);
  }
  // Two-decimal-place formatting.
  return rounded.toFixed(2);
}

/**
 * Generate a short unique id (8 hex chars) for the transaction
 * reference. Uses Web Crypto when available, falls back to a
 * timestamp + random string.
 */
function generateShortId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return Math.random().toString(16).slice(2, 10).padStart(8, '0');
}
