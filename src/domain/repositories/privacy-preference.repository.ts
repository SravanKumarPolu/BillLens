import type { ReceiptId } from '@shared-types/index';

import type { ReceiptPrivacyPreference } from '../entities/receipt';

/**
 * Repository for the `ReceiptPrivacyPreference` value (capture intelligence
 * layer).
 *
 * Privacy preferences are stored separately from the receipt itself so
 * that they can be changed without touching the receipt record. Each
 * receipt has at most one privacy-preference row (enforced by a unique
 * index in the cloud schema).
 *
 * The infrastructure implementation MUST honor these preferences when
 * persisting receipts and extraction results:
 *
 *   - If `storageMode = delete_after_extraction`, the image URI is cleared
 *     after the structured fields are saved.
 *   - If `retainRawText = false`, the OCR raw text is purged.
 *   - If `retentionDays` is set, a scheduled cleanup job purges the image
 *     after that many days.
 */
export interface PrivacyPreferenceRepository {
  findByReceipt(receiptId: ReceiptId): Promise<ReceiptPrivacyPreference | null>;
  save(receiptId: ReceiptId, preference: ReceiptPrivacyPreference): Promise<void>;
  updateStorageMode(receiptId: ReceiptId, storageMode: ReceiptPrivacyPreference['storageMode']): Promise<void>;
}
