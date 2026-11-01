/**
 * Capture-processing configuration.
 *
 * Centralised constants for the receipt/payment-screenshot capture pipeline.
 * These values control image quality, storage paths, OCR thresholds, and
 * privacy defaults.
 *
 * IMPORTANT: BillLens requires a custom Expo development build (not Expo Go)
 * because it uses expo-camera, expo-image-picker, and (in Phase 2) a share
 * extension. Expo Go does not support these modules' full functionality.
 */

// Domain-owned capture policy (single source of truth — v2.4.0).
// Application-layer code imports these from @domain/value-objects directly
// (application may not import @config); this re-export keeps infra/
// presentation consumers reading ONE canonical definition.
import {
  DRAFT_REVIEW_CONFIDENCE_THRESHOLD,
  MAX_IMAGE_FILE_SIZE_BYTES,
} from '@domain/value-objects/capture-policy';

export const CAPTURE_CONFIG = {
  /**
   * Image compression quality (0-1). Higher = better quality, larger file.
   * Receipts need decent quality for OCR accuracy.
   */
  imageQuality: 0.8,

  /** Maximum image dimension in pixels. Larger images are downscaled. */
  maxImageDimension: 2048,

  /** Maximum file size in bytes for local storage (10 MB). */
  maxFileSizeBytes: MAX_IMAGE_FILE_SIZE_BYTES,

  /** Local directory for captured receipt images (relative to FileSystem.documentDirectory). */
  localImageDirectory: 'receipts',

  /** Local directory for payment screenshot images. */
  localPaymentDirectory: 'payments',

  /** Local directory for draft images (not yet confirmed). */
  localDraftDirectory: 'drafts',

  /**
   * Confidence threshold above which a field is considered "high confidence"
   * and does not require user review.
   */
  highConfidenceThreshold: 0.85,

  /**
   * Confidence threshold above which a field is considered "medium confidence".
   * Fields below this are "low confidence" and must be reviewed.
   */
  mediumConfidenceThreshold: 0.60,

  /**
   * Overall extraction confidence below which the entire draft is flagged
   * for mandatory review.
   */
  draftReviewThreshold: DRAFT_REVIEW_CONFIDENCE_THRESHOLD,

  /**
   * Maximum number of duplicate candidates to show to the user at once.
   * If more are found, only the highest-confidence ones are shown.
   */
  maxDuplicateCandidates: 5,

  /**
   * Image hash algorithm for duplicate detection.
   * 'sha256' is the only supported value in Phase 1.
   */
  imageHashAlgorithm: 'sha256' as const,

  /**
   * Whether to automatically delete source images after extraction when
   * the privacy preference is 'delete_after_extraction'.
   * Default: true (delete immediately after structured fields are extracted).
   */
  autoDeleteAfterExtraction: true,

  /**
   * Default retention period (in days) for locally-stored receipt images.
   * After this period, a cleanup job may delete the image (structured data
   * is retained).
   */
  defaultRetentionDays: 30,
} as const;

export type CaptureConfig = typeof CAPTURE_CONFIG;
