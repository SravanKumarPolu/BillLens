import type { CaptureSourceId, PaymentEvidenceId } from '@shared-types/index';

import type { CurrencyCode } from '../value-objects/currency-code';
import type { DateTime } from '../value-objects/date-time';
import type { ExtractionConfidence } from '../value-objects/extraction-confidence';
import {
  asCurrencyCode,
  asExtractionConfidence,
  nowDateTime,
} from '../value-objects/index';

export function asPaymentEvidenceId(value: string): PaymentEvidenceId {
  return value as PaymentEvidenceId;
}

export type PaymentStatus = 'success' | 'pending' | 'failed' | 'unknown';

/**
 * The kind of payment screenshot. Must be one of the screenshot-type
 * CaptureSourceTypes — paper receipts and gallery images are NOT payment
 * evidence.
 */
export type PaymentEvidenceSourceType =
  | 'upi_screenshot'
  | 'card_screenshot'
  | 'bank_screenshot';

/**
 * Payment evidence — a screenshot or image proving a payment was made.
 *
 * IMPORTANT: Payment evidence is NOT the same as a receipt. A payment
 * screenshot proves money changed hands, but does NOT define:
 *   - What the payment was for
 *   - Which group it belongs to
 *   - Who participated
 *   - How it should be split
 *
 * The user MUST confirm all of the above before an expense is created.
 * The ExpenseDraft entity is the editable bridge between PaymentEvidence
 * and a final Expense.
 *
 * All money fields are in minor units (integer paise / cents).
 */
export interface PaymentEvidence {
  readonly id: PaymentEvidenceId;
  readonly captureSourceId: CaptureSourceId;
  readonly sourceType: PaymentEvidenceSourceType;
  readonly amountMinor?: number;
  readonly currencyCode?: CurrencyCode;
  readonly merchantOrPayee?: string;
  readonly transactionReference?: string;
  readonly paymentDate?: string;
  readonly paymentStatus: PaymentStatus;
  readonly confidence: ExtractionConfidence;
  readonly imageUri?: string;
  readonly createdAt: DateTime;
  readonly updatedAt: DateTime;
  readonly version: number;
}

export interface PaymentEvidenceCreateInput {
  readonly id: PaymentEvidenceId;
  readonly captureSourceId: CaptureSourceId;
  readonly sourceType: PaymentEvidenceSourceType;
  readonly amountMinor?: number;
  readonly currencyCode?: string;
  readonly merchantOrPayee?: string;
  readonly transactionReference?: string;
  readonly paymentDate?: string;
  readonly paymentStatus: PaymentStatus;
  /** Raw 0–1 confidence; validated through `asExtractionConfidence`. */
  readonly confidence: number;
  readonly imageUri?: string;
  readonly now?: DateTime;
}

/**
 * Create a new PaymentEvidence record.
 *
 * `confidence` is validated through `asExtractionConfidence` — throws
 * if it is outside [0, 1] or not finite.
 *
 * `currencyCode`, if provided, is validated through `asCurrencyCode` —
 * throws if it is not a 3-letter uppercase ISO 4217 code.
 */
export function createPaymentEvidence(input: PaymentEvidenceCreateInput): PaymentEvidence {
  const now = input.now ?? nowDateTime();
  return {
    id: input.id,
    captureSourceId: input.captureSourceId,
    sourceType: input.sourceType,
    ...(input.amountMinor !== undefined ? { amountMinor: input.amountMinor } : {}),
    ...(input.currencyCode !== undefined
      ? { currencyCode: asCurrencyCode(input.currencyCode) }
      : {}),
    ...(input.merchantOrPayee !== undefined ? { merchantOrPayee: input.merchantOrPayee } : {}),
    ...(input.transactionReference !== undefined
      ? { transactionReference: input.transactionReference }
      : {}),
    ...(input.paymentDate !== undefined ? { paymentDate: input.paymentDate } : {}),
    paymentStatus: input.paymentStatus,
    confidence: asExtractionConfidence(input.confidence),
    ...(input.imageUri !== undefined ? { imageUri: input.imageUri } : {}),
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
}
