import type { CaptureSourceId, UserId } from '@shared-types/index';

import { EmptyValueError } from '../errors/index';
import { type DateTime, nowDateTime } from '../value-objects/index';

export function asCaptureSourceId(value: string): CaptureSourceId {
  return value as CaptureSourceId;
}

/**
 * The kind of source image that was captured.
 *
 * - `paper_receipt`       — photographed paper receipt
 * - `gallery_image`       — picked from the device gallery
 * - `upi_screenshot`      — UPI payment confirmation screenshot
 * - `card_screenshot`     — credit/debit card statement screenshot
 * - `bank_screenshot`     — bank app transaction screenshot
 * - `digital_invoice`     — PDF or digital invoice (no paper)
 * - `shared_image`        — received via share-sheet from another app
 */
export type CaptureSourceType =
  | 'paper_receipt'
  | 'gallery_image'
  | 'upi_screenshot'
  | 'card_screenshot'
  | 'bank_screenshot'
  | 'digital_invoice'
  | 'shared_image';

/**
 * Lifecycle of a CaptureSource as it moves through the OCR pipeline.
 *
 *   pending    → not yet processed (just captured)
 *   processing → OCR/extraction in progress
 *   completed  → extraction done, draft ready for review
 *   failed     → extraction failed (see `processingError`)
 *   cancelled  → user cancelled before completion
 */
export type CaptureProcessingStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface CaptureSource {
  readonly id: CaptureSourceId;
  readonly sourceType: CaptureSourceType;
  /** Local file URI of the captured image. */
  readonly imageUri: string;
  /** SHA-256 hash of image bytes — for duplicate detection. */
  readonly imageHash?: string;
  /** MIME type of the image. */
  readonly mimeType?: string;
  /** File size in bytes. */
  readonly fileSizeBytes?: number;
  readonly processingStatus: CaptureProcessingStatus;
  /** Set when processingStatus is 'failed'. */
  readonly processingError?: string;
  readonly capturedBy: UserId;
  readonly capturedAt: DateTime;
  readonly createdAt: DateTime;
  readonly updatedAt: DateTime;
  readonly version: number;
}

export interface CaptureSourceCreateInput {
  readonly id: CaptureSourceId;
  readonly sourceType: CaptureSourceType;
  readonly imageUri: string;
  readonly imageHash?: string;
  readonly mimeType?: string;
  readonly fileSizeBytes?: number;
  readonly capturedBy: UserId;
  readonly now?: DateTime;
}

/**
 * Create a new CaptureSource.
 *
 * A freshly-created CaptureSource always has `processingStatus = 'pending'`
 * and `version = 1`. The pipeline moves it through the other statuses via
 * {@link updateProcessingStatus}.
 */
export function createCaptureSource(input: CaptureSourceCreateInput): CaptureSource {
  if (!input.imageUri || input.imageUri.trim().length === 0) {
    throw new EmptyValueError('CaptureSource imageUri must not be empty');
  }
  const now = input.now ?? nowDateTime();
  return {
    id: input.id,
    sourceType: input.sourceType,
    imageUri: input.imageUri,
    ...(input.imageHash !== undefined ? { imageHash: input.imageHash } : {}),
    ...(input.mimeType !== undefined ? { mimeType: input.mimeType } : {}),
    ...(input.fileSizeBytes !== undefined ? { fileSizeBytes: input.fileSizeBytes } : {}),
    processingStatus: 'pending',
    capturedBy: input.capturedBy,
    capturedAt: now,
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
}

/**
 * Transition a CaptureSource to a new processing status.
 *
 * If `error` is provided, it overwrites any existing `processingError`.
 * If `error` is undefined, the existing `processingError` is preserved
 * (callers that want to clear it should pass an empty string explicitly
 * — TODO: add a `clearError` flag in a future iteration if needed).
 */
export function updateProcessingStatus(
  current: CaptureSource,
  status: CaptureProcessingStatus,
  error?: string,
  now?: DateTime,
): CaptureSource {
  const ts = now ?? nowDateTime();
  return {
    ...current,
    processingStatus: status,
    ...(error !== undefined ? { processingError: error } : {}),
    updatedAt: ts,
    version: current.version + 1,
  };
}
