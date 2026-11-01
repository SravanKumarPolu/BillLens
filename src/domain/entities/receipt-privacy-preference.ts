// Privacy preference helpers.
//
// The {@link ReceiptPrivacyPreference} interface, {@link StorageMode}
// type, and {@link DEFAULT_PRIVACY_PREFERENCE} constant all live in
// `./receipt.ts` (single source of truth). This module layers factory
// and helper functions on top of those definitions.
//
// We do NOT re-export the types/const here — doing so would create
// duplicate exports when the entities barrel does `export *` from both
// `./receipt` and `./receipt-privacy-preference`. Callers should import
// the type and const from `./receipt` (or via the barrel).

import { DEFAULT_PRIVACY_PREFERENCE } from './receipt';
import type { ReceiptPrivacyPreference } from './receipt';

/**
 * Build a ReceiptPrivacyPreference from partial overrides, merged on top
 * of {@link DEFAULT_PRIVACY_PREFERENCE}.
 *
 * Undefined values in `overrides` are filtered out before merging, so
 * passing `{ retainRawText: undefined }` does NOT clobber the default
 * `retainRawText: false`.
 */
export function createPrivacyPreference(
  overrides?: Partial<ReceiptPrivacyPreference>,
): ReceiptPrivacyPreference {
  const result = { ...DEFAULT_PRIVACY_PREFERENCE, ...(overrides ?? {}) };
  // Filter undefined values so they don't clobber the defaults.
  const filtered: Partial<ReceiptPrivacyPreference> = {};
  for (const [key, value] of Object.entries(result)) {
    if (value !== undefined) {
      (filtered as Record<string, unknown>)[key] = value;
    }
  }
  return { ...DEFAULT_PRIVACY_PREFERENCE, ...filtered } as ReceiptPrivacyPreference;
}

/**
 * Returns true if the storage mode requires cloud upload.
 *
 * `local_only` and `delete_after_extraction` do NOT upload — the image
 * stays on-device (or is deleted after extraction).
 */
export function requiresCloudUpload(pref: ReceiptPrivacyPreference): boolean {
  return pref.storageMode === 'cloud_private' || pref.storageMode === 'shared_with_group';
}

/**
 * Returns true if the source image should be deleted immediately after
 * extraction completes.
 */
export function shouldDeleteImageAfterExtraction(pref: ReceiptPrivacyPreference): boolean {
  return pref.storageMode === 'delete_after_extraction';
}

/**
 * Returns true if raw OCR text should be retained on the receipt /
 * extraction result.
 *
 * When false, the infrastructure layer MUST purge the `rawText` field
 * after the structured ExtractionResult has been written.
 */
export function shouldRetainRawText(pref: ReceiptPrivacyPreference): boolean {
  return pref.retainRawText;
}
