/**
 * Capture pipeline policy thresholds (domain layer).
 *
 * These are BUSINESS rules of the capture/review pipeline, so they live
 * in the domain — the application layer must stay env-agnostic (see
 * docs/architecture-boundaries.md: application may not import @config).
 * `src/config/capture.ts` re-exports them for infrastructure/presentation
 * consumers so there is exactly ONE source of truth.
 *
 * v2.4.0: previously these constants existed only in `src/config/capture.ts`
 * and were dead config — nothing read them. They now drive the real
 * pipeline (ProcessCaptureUseCase, evaluateImageQuality, and the OCR
 * adapter's size guard).
 */

/** Confidence below which a whole draft is flagged for careful review. */
export const DRAFT_REVIEW_CONFIDENCE_THRESHOLD = 0.7;

/**
 * Maximum accepted receipt-image size (10 MB). Applies BOTH to the local
 * pre-flight check and the remote OCR adapter (upload budget).
 */
export const MAX_IMAGE_FILE_SIZE_BYTES = 10 * 1024 * 1024;

/** Smallest plausible receipt image (below this the file is corrupt). */
export const MIN_PLAUSIBLE_IMAGE_FILE_SIZE_BYTES = 8 * 1024;

/** Upper bound on extracted line items the pipeline will persist. */
export const MAX_EXTRACTED_LINE_ITEMS = 100;

/** Image MIME types the OCR backend accepts. */
export const SUPPORTED_IMAGE_MIME_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];
