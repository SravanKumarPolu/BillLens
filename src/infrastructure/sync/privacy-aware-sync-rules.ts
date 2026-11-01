import type { ReceiptPrivacyPreference } from '@domain/entities/receipt';
import {
  requiresCloudUpload,
  shouldDeleteImageAfterExtraction,
  shouldRetainRawText,
} from '@domain/entities/receipt-privacy-preference';

/**
 * Privacy-aware sync rules.
 *
 * These rules govern what data the sync engine may upload to the cloud.
 * They are checked BEFORE any sync operation is enqueued.
 */

/**
 * Returns true if a receipt image may be uploaded to the cloud.
 * Returns false when storageMode is 'local_only' or 'delete_after_extraction'.
 */
export function canUploadReceiptImage(pref: ReceiptPrivacyPreference): boolean {
  return requiresCloudUpload(pref);
}

/**
 * Returns true if raw OCR text may be retained in the cloud.
 * Returns false when retainRawText is false.
 */
export function canUploadRawText(pref: ReceiptPrivacyPreference): boolean {
  return shouldRetainRawText(pref);
}

/**
 * Returns true if the source image should be deleted after extraction.
 */
export function shouldDeleteImagePostExtraction(pref: ReceiptPrivacyPreference): boolean {
  return shouldDeleteImageAfterExtraction(pref);
}

/**
 * Filter a list of sync-eligible items to exclude those that violate
 * privacy preferences.
 */
export interface SyncEligibilityCheck {
  readonly entityType: string;
  readonly entityId: string;
  readonly canUpload: boolean;
  readonly reason?: string;
}

export function checkSyncEligibility(
  entityType: string,
  entityId: string,
  privacyPref: ReceiptPrivacyPreference | null,
): SyncEligibilityCheck {
  if (privacyPref === null) {
    return { entityType, entityId, canUpload: true };
  }
  if (!canUploadReceiptImage(privacyPref)) {
    return {
      entityType,
      entityId,
      canUpload: false,
      reason: `Storage mode is ${privacyPref.storageMode} — image stays local only`,
    };
  }
  return { entityType, entityId, canUpload: true };
}
