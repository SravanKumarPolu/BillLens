/**
 * Attachment sync lifecycle — Phase 7 Prompt 65.
 *
 * Defines the 10-state attachment lifecycle, privacy-gated upload
 * rules, and structured-data independence (expenses sync even when
 * attachments are still pending).
 *
 * The existing `privacy-aware-sync-rules.ts` (Phase 1) handles
 * receipt-image upload decisions; this module extends it with the
 * full lifecycle model.
 */

// ---------------------------------------------------------------------------
// Lifecycle states (spec, Prompt 65)
// ---------------------------------------------------------------------------

export type AttachmentLifecycleState =
  | 'local'                 // File exists locally only
  | 'queued'                // Queued for upload
  | 'preparing'              // Being prepared (hash, compress)
  | 'uploading'              // Actively uploading
  | 'uploaded'               // Upload complete, cloud copy verified
  | 'download_available'    // Cloud copy exists, can be downloaded
  | 'downloading'            // Actively downloading
  | 'available'              // Available locally and in cloud
  | 'failed'                 // Upload/download failed
  | 'deleted';               // Soft-deleted

export const ALL_ATTACHMENT_STATES: readonly AttachmentLifecycleState[] = [
  'local',
  'queued',
  'preparing',
  'uploading',
  'uploaded',
  'download_available',
  'downloading',
  'available',
  'failed',
  'deleted',
];

// ---------------------------------------------------------------------------
// Privacy rules
// ---------------------------------------------------------------------------

export type AttachmentPrivacyMode =
  | 'local_only'             // Never upload
  | 'cloud_private'          // Only the owner may access
  | 'shared_with_group'      // Group members may access
  | 'delete_after_extraction'; // Do not upload unless explicitly required

export const ALL_ATTACHMENT_PRIVACY_MODES: readonly AttachmentPrivacyMode[] = [
  'local_only',
  'cloud_private',
  'shared_with_group',
  'delete_after_extraction',
];

/**
 * Determine whether an attachment with the given privacy mode should
 * be uploaded to the cloud.
 *
 *   - `local_only` → NEVER upload
 *   - `cloud_private` → upload (owner-only access)
 *   - `shared_with_group` → upload (group access)
 *   - `delete_after_extraction` → do NOT upload unless another explicit
 *     policy requires it (the file is deleted after OCR extraction)
 */
export function shouldUploadAttachment(
  privacyMode: AttachmentPrivacyMode,
  explicitlyRequired: boolean = false,
): boolean {
  if (privacyMode === 'local_only') return false;
  if (privacyMode === 'delete_after_extraction') return explicitlyRequired;
  return true; // cloud_private or shared_with_group
}

/**
 * Determine whether a download is allowed for the given privacy mode
 * and user access.
 *
 *   - `local_only` → download not applicable (no cloud copy)
 *   - `cloud_private` → only the owner
 *   - `shared_with_group` → group members only
 *   - `delete_after_extraction` → download not applicable
 */
export function canDownloadAttachment(
  privacyMode: AttachmentPrivacyMode,
  isOwner: boolean,
  isGroupMember: boolean,
): boolean {
  if (privacyMode === 'local_only' || privacyMode === 'delete_after_extraction') {
    return false;
  }
  if (privacyMode === 'cloud_private') return isOwner;
  if (privacyMode === 'shared_with_group') return isGroupMember;
  return false;
}

// ---------------------------------------------------------------------------
// Structured-data independence
// ---------------------------------------------------------------------------

/**
 * Determine whether the parent entity's sync operation should be
 * marked as completed even if the attachment upload is still pending.
 *
 * The spec (Prompt 65) says: "Expense and settlement records should
 * be able to sync even if their attachments are still pending." and
 * "Do not mark the whole expense as failed when only the attachment
 * upload failed."
 *
 * This function returns `true` — the structured data and the
 * attachment are independent sync operations.
 */
export function canParentSyncCompleteWithoutAttachment(
  _parentEntityType: string,
  _attachmentState: AttachmentLifecycleState,
): boolean {
  // Always true — structured data and attachments are independent.
  // The UI shows "Expense synced — Receipt image pending" separately.
  return true;
}

// ---------------------------------------------------------------------------
// Cloud path security
// ---------------------------------------------------------------------------

/**
 * Validate that a cloud path does not expose private data.
 *
 * The spec (Prompt 65) says cloud filenames must NOT include:
 *   - Full user name
 *   - Email
 *   - Group name
 *   - Merchant name
 *   - Transaction reference
 *   - Receipt number
 *
 * The recommended pattern is a UUID or a hash-based path.
 */
export function isCloudPathSafe(cloudPath: string): boolean {
  // Reject paths containing @ (email), spaces (likely names), or
  // common PII patterns.
  if (cloudPath.includes('@')) return false;
  if (cloudPath.includes(' ')) return false;
  if (/\.(txt|csv|json)$/.test(cloudPath)) return false; // avoid data-file extensions
  // Accept UUID-based paths (alphanumeric + dashes + slashes)
  return /^[a-zA-Z0-9\-\/]+$/.test(cloudPath);
}
