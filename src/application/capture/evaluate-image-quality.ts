/**
 * Image quality evaluation — technical pre-flight checks before the
 * (potentially paid) OCR round-trip (v2.4.0).
 *
 * HONEST SCOPE: without a computer-vision library on-device we cannot
 * detect blur, crop, or lighting defects locally. What we CAN verify
 * cheaply and reliably from the file itself:
 *
 *   - the file exists and is readable,
 *   - the byte size is within the upload budget (and non-trivially
 *     small — a few-KB "image" is almost certainly corrupt),
 *   - the byte size is not absurdly large (upload cost / memory),
 *   - the media type is a format the OCR backend accepts.
 *
 * Blur / crop / low-light detection happens SERVER-SIDE as part of
 * extraction quality: a blurry receipt returns low field confidences,
 * which the draft-review flow surfaces as `needs review` issues. The
 * quality screen states this honestly instead of faking CV results.
 */

import {
  MAX_IMAGE_FILE_SIZE_BYTES,
  MIN_PLAUSIBLE_IMAGE_FILE_SIZE_BYTES,
  SUPPORTED_IMAGE_MIME_TYPES,
} from '@domain/value-objects';

export type ImageQualityWarningKind = 'blurry' | 'cropped' | 'low_light' | 'unsupported';

export interface ImageQualityWarning {
  readonly kind: ImageQualityWarningKind;
  readonly message: string;
}

export interface ImageQualityFacts {
  readonly sizeBytes: number;
  readonly mimeType?: string;
}

const SUPPORTED_MIME_TYPES = new Set(SUPPORTED_IMAGE_MIME_TYPES);

export interface ImageQualityEvaluation {
  readonly warnings: readonly ImageQualityWarning[];
  /** True when the image should not be sent to OCR at all. */
  readonly blocked: boolean;
}

export function evaluateImageQuality(facts: ImageQualityFacts): ImageQualityEvaluation {
  const warnings: ImageQualityWarning[] = [];
  let blocked = false;

  if (facts.sizeBytes < MIN_PLAUSIBLE_IMAGE_FILE_SIZE_BYTES) {
    warnings.push({
      kind: 'unsupported',
      message:
        'This image looks unusually small — it may be corrupted. Please retake the photo.',
    });
    blocked = true;
  }

  if (facts.sizeBytes > MAX_IMAGE_FILE_SIZE_BYTES) {
    warnings.push({
      kind: 'unsupported',
      message: `This image is larger than the ${Math.round(
        MAX_IMAGE_FILE_SIZE_BYTES / (1024 * 1024),
      )} MB limit. Please retake the photo at standard quality.`,
    });
    blocked = true;
  }

  if (facts.mimeType !== undefined && !SUPPORTED_MIME_TYPES.has(facts.mimeType)) {
    warnings.push({
      kind: 'unsupported',
      message: `Unsupported image format (${facts.mimeType}). Please use JPEG, PNG, WebP, or HEIC.`,
    });
    blocked = true;
  }

  return { warnings, blocked };
}
