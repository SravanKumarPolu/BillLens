
import { InvalidEntityError } from '@domain/errors';
import type { AuditRepository } from '@domain/repositories/audit.repository';
import type { MemberPaymentHandleRepository } from '@domain/repositories/payment-handle.repository';
import {
  buildUpiDeepLink,
  type UpiDeepLinkOutput,
  assertUpiSupportedCurrency,
} from '@domain/services/upi/upi-deep-link-builder';
import type { MemberId, PaymentHandleId, SettlementId } from '@shared-types/index';

import type { PaymentHandleEncryptionPort } from './save-upi-payment-handle.usecase';

/**
 * Use case: Build a UPI deep-link for a settlement.
 *
 * Phase 6 Track 4 — resolves the payee's full VPA from the encrypted
 * store, builds the `upi://` URI via the deep-link builder, and
 * returns it for the caller to launch via the platform URL launcher.
 *
 * ── Safety ──
 *
 * This use case BUILDS the URI. It does NOT launch it, does NOT
 * mutate any settlement, does NOT record any state. The caller
 * (the UI) hands the URI to `Linking.openURL` (React Native) and
 * then runs the `HandleUpiReturnUseCase` when the user comes back.
 *
 * ── Currency gate ──
 *
 * The use case asserts the settlement's currency is INR BEFORE
 * building the deep link. If the currency is not INR, it throws
 * `InvalidEntityError` with a clear message directing the caller to
 * another settlement method. This is the spec rule: "If the balance
 * is in pounds sterling, show another settlement method rather than
 * attempting a UPI conversion."
 *
 * ── Privacy ──
 *
 * The full VPA is decrypted from the encrypted store, held in memory
 * for the duration of the deep-link build, then discarded. The
 * decrypted VPA is NOT logged, NOT included in the audit entry, NOT
 * stored anywhere. The audit entry contains only the handle id and
 * the settlement id.
 */
export class GenerateUpiDeepLinkUseCase {
  constructor(
    private readonly handles: MemberPaymentHandleRepository,
    private readonly audit: AuditRepository,
    private readonly encryption: PaymentHandleEncryptionPort,
  ) {}

  async execute(input: GenerateUpiDeepLinkInput): Promise<GenerateUpiDeepLinkOutput> {
    // ── Currency gate (defensive — the UI should have gated) ──
    assertUpiSupportedCurrency(input.currencyCode);

    // ── Load the payment handle ──
    const handle = await this.handles.findById(input.payeeHandleId);
    if (handle === null) {
      throw new InvalidEntityError(
        `GenerateUpiDeepLink: payment handle ${input.payeeHandleId as string} not found`,
      );
    }
    if (handle.deletedAt !== undefined) {
      throw new InvalidEntityError(
        `GenerateUpiDeepLink: payment handle ${input.payeeHandleId as string} is deleted`,
      );
    }
    if (handle.type !== 'upi_vpa') {
      throw new InvalidEntityError(
        `GenerateUpiDeepLink: payment handle ${input.payeeHandleId as string} is not a UPI VPA handle (type="${handle.type}")`,
      );
    }
    if (handle.encryptedValue === undefined || handle.encryptionKeyId === undefined) {
      throw new InvalidEntityError(
        `GenerateUpiDeepLink: payment handle ${input.payeeHandleId as string} has no encrypted value (transient handle cannot be used for deep links)`,
      );
    }

    // ── Decrypt the full VPA ──
    const fullVpa = await this.encryption.decrypt(
      handle.encryptedValue,
      handle.encryptionKeyId,
    );

    // ── Build the deep link ──
    const link: UpiDeepLinkOutput = buildUpiDeepLink({
      payeeVpa: fullVpa,
      payeeName: input.payeeName,
      amount: input.amount,
      currencyCode: input.currencyCode,
      ...(input.note !== undefined ? { note: input.note } : {}),
      ...(input.transactionReference !== undefined
        ? { reference: input.transactionReference }
        : {}),
    });

    // ── Audit (no full VPA in the entry) ──
    await this.audit.append({
      id: generateId(),
      entityType: 'settlement',
      entityId: input.settlementId as string,
      action: 'update',
      changeSummary: {
        upiDeepLinkGenerated: true,
        payeeHandleId: input.payeeHandleId as string,
        payeeMaskedVpa: handle.maskedDisplayValue,
        transactionReference: link.transactionReference,
        // The full VPA and the URI itself are deliberately NOT in the
        // audit entry. The URI contains the full VPA in plaintext
        // (the UPI spec requires it for routing), and we do not log it.
      },
    });

    return {
      uri: link.uri,
      transactionReference: link.transactionReference,
      payeeMaskedVpa: handle.maskedDisplayValue,
    };
  }
}

export interface GenerateUpiDeepLinkInput {
  /** The settlement this deep link is for. Used for the audit entry. */
  readonly settlementId: SettlementId;
  /** The payee's payment handle id. */
  readonly payeeHandleId: PaymentHandleId;
  /** Payee display name (for the UPI app). */
  readonly payeeName: string;
  /** Amount in major units. */
  readonly amount: number;
  /** Currency code. Must be INR. */
  readonly currencyCode: string;
  /** Optional transaction note. */
  readonly note?: string;
  /** Optional transaction reference. Generated if not provided. */
  readonly transactionReference?: string;
}

export interface GenerateUpiDeepLinkOutput {
  /** The full `upi://pay?pa=...` URI. */
  readonly uri: string;
  /** The transaction reference used (input or generated). */
  readonly transactionReference: string;
  /** The masked VPA, for the caller to display in UI. */
  readonly payeeMaskedVpa: string;
}

// Re-export the type so callers can import from one place
export type { MemberId };

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
