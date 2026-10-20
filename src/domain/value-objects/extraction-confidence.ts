import type { Branded } from '@shared-types/index';

import { InvalidEntityError } from '../errors/index';

/**
 * Extraction confidence — a number in the closed interval [0, 1]
 * representing how confident the OCR/extraction pipeline is about a
 * particular field (or an overall extraction).
 *
 * Branded to prevent accidental mixing with arbitrary numbers (e.g.
 * a percentage in [0, 100] or a basis-points value in [0, 10_000]).
 */
export type ExtractionConfidence = Branded<number, 'ExtractionConfidence'>;

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'unknown';

/**
 * Confidence thresholds.
 *
 *   >= 0.85 → high     (auto-accepted, no review needed)
 *   >= 0.60 → medium   (suggest review)
 *   >= 0.30 → low      (require review)
 *   <  0.30 → unknown  (likely garbage, require review)
 */
export const HIGH_CONFIDENCE_THRESHOLD = 0.85;
export const MEDIUM_CONFIDENCE_THRESHOLD = 0.6;
export const LOW_CONFIDENCE_THRESHOLD = 0.3;

/**
 * Construct an ExtractionConfidence from a number. Throws if the value
 * is not finite or outside [0, 1].
 *
 * @example
 *   const c = asExtractionConfidence(0.92); // ✅
 *   asExtractionConfidence(1.2);              // ❌ throws
 *   asExtractionConfidence(-0.1);             // ❌ throws
 *   asExtractionConfidence(NaN);              // ❌ throws
 */
export function asExtractionConfidence(value: number): ExtractionConfidence {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new InvalidEntityError(
      `ExtractionConfidence must be in [0, 1], got ${value}`,
    );
  }
  return value as ExtractionConfidence;
}

/**
 * Bucket a confidence value into one of four qualitative levels.
 */
export function confidenceLevel(confidence: ExtractionConfidence): ConfidenceLevel {
  const c = confidence as number;
  if (c >= HIGH_CONFIDENCE_THRESHOLD) return 'high';
  if (c >= MEDIUM_CONFIDENCE_THRESHOLD) return 'medium';
  if (c >= LOW_CONFIDENCE_THRESHOLD) return 'low';
  return 'unknown';
}

/**
 * Returns true if the confidence is below the high-confidence threshold
 * and therefore the field/extraction should be reviewed by the user.
 */
export function needsReview(confidence: ExtractionConfidence): boolean {
  return confidenceLevel(confidence) !== 'high';
}
