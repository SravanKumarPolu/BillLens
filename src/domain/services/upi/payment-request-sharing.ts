import { InvalidEntityError } from '../../errors/index';

/**
 * UPI payment-request sharing — Phase 6 Track 4.
 *
 * Generates a shareable text message for a UPI-assisted settlement
 * request. The message contains enough context for the receiver to
 * understand the request, plus the UPI deep-link URI itself.
 *
 * ── Spec rules (Prompt 56) ──
 *
 *   "Create a shareable message containing:
 *     - Payer
 *     - Receiver
 *     - Amount
 *     - Currency
 *     - Group name where appropriate
 *     - Secure BillLens settlement link
 *     - Optional UPI link
 *
 *    Do not expose private group information to unauthorised
 *    recipients."
 *
 * This module generates the shareable TEXT. The "secure BillLens
 * settlement link" is a separate `billlens://settlement/...` deep
 * link (parallel to the existing `billlens://group/join/...` deep
 * link); we generate it here as a string and let the caller decide
 * whether to include it.
 *
 * ── Privacy ──
 *
 * The message is intended to be shared via the platform share sheet
 * (WhatsApp, SMS, etc.). The message contains the masked payee VPA
 * (NOT the full VPA), the amount, the group name (optional), and the
 * UPI deep link. It does NOT contain expense history, member
 * balances, or other private group data.
 *
 * The UPI deep link itself contains the FULL payee VPA in plaintext
 * (the UPI spec requires it for routing). This is acceptable because
 * the shareable message is meant for the payer to send to themselves
 * (or to a person they trust) to launch the UPI app on their own
 * device. It is NOT meant for public sharing.
 */

// ---------------------------------------------------------------------------
// Input / output
// ---------------------------------------------------------------------------

export interface SharePaymentRequestInput {
  /** Payer's display name. */
  readonly payerName: string;
  /** Receiver's display name. */
  readonly receiverName: string;
  /** Receiver's masked VPA (e.g. "jo***@oksbi"). NOT the full VPA. */
  readonly receiverMaskedVpa: string;
  /** Amount in major units (e.g. 42.50). */
  readonly amount: number;
  /** Currency code. BillLens shows UPI only for INR. */
  readonly currencyCode: string;
  /** Optional group name. */
  readonly groupName?: string;
  /** The UPI deep-link URI (from `buildUpiDeepLink`). */
  readonly upiUri: string;
  /** Optional secure BillLens settlement link (a billlens:// URL). */
  readonly billLensLink?: string;
}

export interface SharePaymentRequestOutput {
  /** The shareable message text. */
  readonly message: string;
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/**
 * Build a shareable payment-request message.
 *
 * The message format is:
 *
 *   {groupName + " — " if present}{payerName} → {receiverName}
 *   {currencySymbol}{amount}
 *
 *   Tap to pay via UPI:
 *   {upiUri}
 *
 *   {billLensLink line if present}
 *
 * Example:
 *
 *   Weekend Trip — John Doe → Jane Doe
 *   ₹42.50
 *
 *   Tap to pay via UPI:
 *   upi://pay?pa=john.doe%40oksbi&pn=John%20Doe&am=42.50&cu=INR&tn=Weekend%20Trip
 *
 *   billlens://settlement/s/abc123
 *
 * The function validates the inputs and throws `InvalidEntityError`
 * for invalid input. It is pure — no I/O, no side effects.
 */
export function buildPaymentRequestMessage(
  input: SharePaymentRequestInput,
): SharePaymentRequestOutput {
  // ── Validate names ──
  const payer = input.payerName.trim();
  if (payer.length === 0) {
    throw new InvalidEntityError('SharePaymentRequest: payerName must not be empty');
  }
  if (payer.length > 100) {
    throw new InvalidEntityError(
      `SharePaymentRequest: payerName must be at most 100 chars, got ${payer.length}`,
    );
  }
  const receiver = input.receiverName.trim();
  if (receiver.length === 0) {
    throw new InvalidEntityError('SharePaymentRequest: receiverName must not be empty');
  }
  if (receiver.length > 100) {
    throw new InvalidEntityError(
      `SharePaymentRequest: receiverName must be at most 100 chars, got ${receiver.length}`,
    );
  }
  const maskedVpa = input.receiverMaskedVpa.trim();
  if (maskedVpa.length === 0) {
    throw new InvalidEntityError(
      'SharePaymentRequest: receiverMaskedVpa must not be empty',
    );
  }
  // Defensive: refuse to embed a full VPA (which contains @ and a
  // bank identifier). The masked form should contain "***".
  if (!maskedVpa.includes('***')) {
    throw new InvalidEntityError(
      `SharePaymentRequest: receiverMaskedVpa must be a masked form (containing "***"), got "${maskedVpa}"`,
    );
  }

  // ── Validate amount ──
  if (typeof input.amount !== 'number' || !Number.isFinite(input.amount)) {
    throw new InvalidEntityError(
      `SharePaymentRequest: amount must be a finite number, got ${input.amount}`,
    );
  }
  if (input.amount <= 0) {
    throw new InvalidEntityError(
      `SharePaymentRequest: amount must be > 0, got ${input.amount}`,
    );
  }

  // ── Validate currency / amount formatting ──
  const formattedAmount = formatAmountWithCurrency(input.amount, input.currencyCode);

  // ── Validate UPI URI ──
  if (!input.upiUri.startsWith('upi://')) {
    throw new InvalidEntityError(
      `SharePaymentRequest: upiUri must start with "upi://", got "${input.upiUri.slice(0, 20)}..."`,
    );
  }

  // ── Validate group name (if present) ──
  let groupPrefix = '';
  if (input.groupName !== undefined) {
    const trimmedGroup = input.groupName.trim();
    if (trimmedGroup.length > 0) {
      if (trimmedGroup.length > 100) {
        throw new InvalidEntityError(
          `SharePaymentRequest: groupName must be at most 100 chars, got ${trimmedGroup.length}`,
        );
      }
      groupPrefix = `${trimmedGroup} — `;
    }
  }

  // ── Validate BillLens link (if present) ──
  let billLensLine = '';
  if (input.billLensLink !== undefined) {
    const trimmedLink = input.billLensLink.trim();
    if (trimmedLink.length > 0) {
      if (!trimmedLink.startsWith('billlens://') && !trimmedLink.startsWith('https://billlens.app')) {
        throw new InvalidEntityError(
          `SharePaymentRequest: billLensLink must start with "billlens://" or "https://billlens.app", got "${trimmedLink.slice(0, 30)}..."`,
        );
      }
      billLensLine = `\n\n${trimmedLink}`;
    }
  }

  // ── Assemble ──
  const message =
    `${groupPrefix}${payer} → ${receiver}\n` +
    `${formattedAmount}\n\n` +
    `Pay to: ${maskedVpa}\n\n` +
    `Tap to pay via UPI:\n${input.upiUri}` +
    billLensLine;

  return { message };
}

/**
 * Format an amount with its currency symbol. BillLens uses the
 * currency's Unicode symbol if available (₹ for INR, $ for USD,
 * £ for GBP, € for EUR), otherwise falls back to the ISO code.
 */
function formatAmountWithCurrency(amount: number, currencyCode: string): string {
  const symbol = currencySymbol(currencyCode);
  // Format the amount with up to 2 decimal places, no trailing zeros.
  const rounded = Math.round(amount * 100) / 100;
  const amountStr = Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(2);
  return `${symbol}${amountStr}`;
}

const CURRENCY_SYMBOLS: Readonly<Record<string, string>> = {
  INR: '₹',
  USD: '$',
  GBP: '£',
  EUR: '€',
  JPY: '¥',
  AUD: 'A$',
  CAD: 'C$',
  CHF: 'Fr',
  CNY: '¥',
  SGD: 'S$',
};

function currencySymbol(currencyCode: string): string {
  return CURRENCY_SYMBOLS[currencyCode.toUpperCase()] ?? `${currencyCode.toUpperCase()} `;
}
