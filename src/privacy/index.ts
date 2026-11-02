/**
 * Privacy & Trust module barrel.
 *
 * Aggregates privacy-enforcement code from across layers:
 * - Domain entity (ReceiptPrivacyPreference)
 * - Domain helpers (requiresCloudUpload, shouldDeleteImageAfterExtraction)
 * - Infrastructure enforcement (privacy-aware-sync-rules)
 *
 * ARCHITECTURE RULE: The sync engine MUST NOT upload a receipt image
 * when storageMode is 'local_only' or 'delete_after_extraction'.
 */

// Domain types
export type {
  ReceiptPrivacyPreference,
  StorageMode,
} from '@domain/entities/receipt';

// Domain helpers (DEFAULT_PRIVACY_PREFERENCE is a const, not a type — export as value)
export {
  createPrivacyPreference,
  requiresCloudUpload,
  shouldDeleteImageAfterExtraction,
  shouldRetainRawText,
} from '@domain/entities/receipt-privacy-preference';

// Re-export the const from receipt.ts (where it's defined)
export { DEFAULT_PRIVACY_PREFERENCE } from '@domain/entities/receipt';

// Infrastructure enforcement
export {
  canUploadReceiptImage,
  canUploadRawText,
  shouldDeleteImagePostExtraction,
  checkSyncEligibility,
} from '../infrastructure/sync/privacy-aware-sync-rules';

export type { SyncEligibilityCheck } from '../infrastructure/sync/privacy-aware-sync-rules';
