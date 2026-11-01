import {
  buildPaymentRequestMessage,
} from '@domain/services/upi/payment-request-sharing';

/**
 * Use case: Build a shareable payment-request message.
 *
 * Phase 6 Track 4 — thin wrapper around the domain
 * `buildPaymentRequestMessage` function. Produces a text message
 * the user can share via WhatsApp, SMS, etc., containing the
 * settlement context (payer, receiver, amount, currency, group
 * name) and the UPI deep link.
 *
 * ── Privacy ──
 *
 * The message contains the MASKED payee VPA (e.g. "jo***@oksbi"),
 * NOT the full VPA — except inside the UPI URI itself, which is
 * required for the UPI spec. The function refuses to embed an
 * unmasked VPA in the message body.
 */
export class SharePaymentRequestUseCase {
  execute(input: SharePaymentRequestInput): SharePaymentRequestOutput {
    const result = buildPaymentRequestMessage(input);
    return { message: result.message };
  }
}

export interface SharePaymentRequestInput {
  readonly payerName: string;
  readonly receiverName: string;
  readonly receiverMaskedVpa: string;
  readonly amount: number;
  readonly currencyCode: string;
  readonly groupName?: string;
  readonly upiUri: string;
  readonly billLensLink?: string;
}

export interface SharePaymentRequestOutput {
  readonly message: string;
}
