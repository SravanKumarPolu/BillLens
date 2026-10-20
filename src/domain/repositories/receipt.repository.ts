import type { GroupId, ReceiptId } from '@shared-types/index';

import type { Receipt } from '../entities/receipt';
import type { ReceiptItem } from '../entities/receipt-item';

import type { DeleteMetadata, PaginatedResult, Pagination, SoftDeleteResult } from './repository-contracts';

/**
 * Repository for the `Receipt` entity and its dependent `ReceiptItem` records.
 *
 * Receipts store both structured data (merchant, total, items) and
 * privacy-sensitive content (image URI, OCR raw text). The repository
 * MUST honor the `ReceiptPrivacyPreference` fields when persisting:
 *
 *   - If `storageMode = delete_after_extraction`, the image URI is cleared
 *     after the structured fields are saved.
 *   - If `retainRawText = false`, the OCR raw text is purged.
 *   - If `retentionDays` is set, a scheduled cleanup job purges the image
 *     after that many days.
 *
 * These policies are enforced by the infrastructure implementation, not
 * by the repository interface itself.
 */
export interface ReceiptRepository {
  findById(id: ReceiptId): Promise<Receipt | null>;
  listByGroup(groupId: GroupId, pagination: Pagination): Promise<PaginatedResult<Receipt>>;
  /** List items for a receipt. */
  listItems(receiptId: ReceiptId): Promise<readonly ReceiptItem[]>;
  /** Save a receipt atomically with its items. */
  save(receipt: Receipt, items: readonly ReceiptItem[]): Promise<void>;
  softDelete(id: ReceiptId, metadata: DeleteMetadata): Promise<SoftDeleteResult>;
  /** Find receipts by image hash (used for duplicate detection). */
  findByImageHash(hash: string): Promise<readonly Receipt[]>;
}
