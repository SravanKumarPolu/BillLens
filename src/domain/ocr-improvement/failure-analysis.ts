/**
 * Failure analysis — categorizes OCR failures into discrete buckets.
 *
 * CRITICAL CONTRACT:
 *   - Categorization uses only anonymized metadata (confidence, field
 *     presence, error type). It NEVER uses raw receipt data.
 *   - Failure categories feed back into the OCR improvement loop:
 *     - low_confidence → trigger a "please review" prompt
 *     - total_mismatch → flag the extraction as suspicious
 *     - no_text_detected → suggest user re-capture
 *     - field_missing_critical → ask user to fill in
 *
 * Pure functions — no I/O, no globals.
 */

import type { FieldLevelDiff, OcrFieldName } from './field-level-diff';
import type { ExtractionConfidence } from './field-level-diff';

// ---------------------------------------------------------------------------
// Failure categories
// ---------------------------------------------------------------------------

export type OcrFailureCategory =
  | 'low_confidence'
  | 'total_mismatch'
  | 'no_text_detected'
  | 'field_missing_critical'
  | 'field_missing_optional'
  | 'merchant_unrecognized'
  | 'date_unparseable'
  | 'amount_unparseable'
  | 'line_items_empty'
  | 'extraction_timeout'
  | 'image_quality_poor'
  | 'unknown';

export const OCR_FAILURE_CATEGORIES: readonly OcrFailureCategory[] = [
  'low_confidence',
  'total_mismatch',
  'no_text_detected',
  'field_missing_critical',
  'field_missing_optional',
  'merchant_unrecognized',
  'date_unparseable',
  'amount_unparseable',
  'line_items_empty',
  'extraction_timeout',
  'image_quality_poor',
  'unknown',
] as const;

export function isOcrFailureCategory(
  value: unknown,
): value is OcrFailureCategory {
  return (
    typeof value === 'string' &&
    (OCR_FAILURE_CATEGORIES as readonly string[]).includes(value)
  );
}

// ---------------------------------------------------------------------------
// Failure analysis input
// ---------------------------------------------------------------------------

export interface OcrFailureInput {
  /** Was any text extracted at all? */
  readonly hadAnyExtractedText: boolean;
  /** Did the extraction time out? */
  readonly timedOut: boolean;
  /** Was the image quality flagged as poor? */
  readonly imageQualityPoor: boolean;
  /** Fields extracted by the OCR engine (with confidence). */
  readonly extractedFields: Readonly<Record<string, { readonly confidence: ExtractionConfidence }>>;
  /** Did the user correct the total field? */
  readonly totalCorrected: boolean;
  /** Did the user correct the merchant field? */
  readonly merchantCorrected: boolean;
  /** Did the user correct the date field? */
  readonly dateCorrected: boolean;
  /** Did the user correct any amount field (total/subtotal/tax)? */
  readonly amountCorrected: boolean;
  /** Did the user add a line_items field that was missing? */
  readonly lineItemsAdded: boolean;
}

// ---------------------------------------------------------------------------
// Categorization
// ---------------------------------------------------------------------------

/** Critical fields — if missing, the extraction is essentially useless. */
const CRITICAL_FIELDS: readonly OcrFieldName[] = ['total', 'date', 'merchant'];

/** Optional fields — nice to have but not critical. */
const OPTIONAL_FIELDS: readonly OcrFieldName[] = ['subtotal', 'tax', 'payment_method', 'line_items'];

/**
 * Categorizes the OCR failure based on the input signals.
 *
 * Returns the FIRST matching category, in priority order:
 *   1. extraction_timeout
 *   2. image_quality_poor
 *   3. no_text_detected
 *   4. field_missing_critical
 *   5. total_mismatch
 *   6. amount_unparseable
 *   7. date_unparseable
 *   8. merchant_unrecognized
 *   9. line_items_empty
 *  10. field_missing_optional
 *  11. low_confidence
 *  12. unknown
 */
export function categorizeFailure(input: OcrFailureInput): OcrFailureCategory {
  // 1. Timeout.
  if (input.timedOut) return 'extraction_timeout';

  // 2. Image quality.
  if (input.imageQualityPoor) return 'image_quality_poor';

  // 3. No text at all.
  if (!input.hadAnyExtractedText) return 'no_text_detected';

  // 4. Critical field missing.
  for (const field of CRITICAL_FIELDS) {
    if (!(field in input.extractedFields)) {
      return 'field_missing_critical';
    }
  }

  // 5. Total mismatch (user had to correct the total).
  if (input.totalCorrected) return 'total_mismatch';

  // 6. Amount unparseable.
  if (input.amountCorrected) return 'amount_unparseable';

  // 7. Date unparseable.
  if (input.dateCorrected) return 'date_unparseable';

  // 8. Merchant unrecognized.
  if (input.merchantCorrected) return 'merchant_unrecognized';

  // 9. Line items empty (user had to add them).
  if (input.lineItemsAdded) return 'line_items_empty';

  // 10. Optional field missing.
  for (const field of OPTIONAL_FIELDS) {
    if (!(field in input.extractedFields)) {
      return 'field_missing_optional';
    }
  }

  // 11. Low confidence — any extracted field with low confidence.
  for (const field of Object.keys(input.extractedFields)) {
    const conf = input.extractedFields[field]?.confidence;
    if (conf === 'low') return 'low_confidence';
  }

  // 12. Unknown — no specific failure detected.
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Batch categorization
// ---------------------------------------------------------------------------

export interface FailureCategoryCount {
  readonly category: OcrFailureCategory;
  readonly count: number;
  /** Ratio count / totalBatches, in [0, 1]. */
  readonly rate: number;
}

export interface FailureAnalysisResult {
  readonly totalBatches: number;
  readonly categoryCounts: readonly FailureCategoryCount[];
  readonly topCategory: OcrFailureCategory | null;
}

/**
 * Categorizes a batch of OCR failures and returns aggregate counts.
 *
 * Pure function.
 */
export function analyzeFailures(
  inputs: readonly OcrFailureInput[],
): FailureAnalysisResult {
  const counts = new Map<OcrFailureCategory, number>();
  for (const input of inputs) {
    const cat = categorizeFailure(input);
    counts.set(cat, (counts.get(cat) ?? 0) + 1);
  }

  const totalBatches = inputs.length;
  const categoryCounts: FailureCategoryCount[] = [];
  for (const [category, count] of counts) {
    categoryCounts.push({
      category,
      count,
      rate: totalBatches > 0 ? count / totalBatches : 0,
    });
  }
  categoryCounts.sort((a, b) => b.count - a.count);

  const topCategory =
    categoryCounts.length > 0 ? categoryCounts[0]!.category : null;

  return Object.freeze({
    totalBatches,
    categoryCounts: Object.freeze(categoryCounts),
    topCategory,
  });
}

// ---------------------------------------------------------------------------
// Failure → diff mapping
// ---------------------------------------------------------------------------

/**
 * Maps a list of field-level diffs to a coarse failure category.
 *
 * Used by the OCR improvement pipeline when only the diffs are available
 * (no full extraction metadata). Less precise than `categorizeFailure`
 * but still useful for aggregate analysis.
 */
export function categorizeFromDiffs(
  diffs: readonly FieldLevelDiff[],
): OcrFailureCategory {
  if (diffs.length === 0) return 'unknown';

  // Priority: total_mismatch > amount_unparseable > date_unparseable >
  // merchant_unrecognized > line_items_empty > field_missing_critical >
  // field_missing_optional > low_confidence > unknown.
  const fieldsChanged = new Set(diffs.map((d) => d.fieldName));
  const hasLowConfidence = diffs.some((d) => d.extractionConfidence === 'low');

  if (fieldsChanged.has('total')) return 'total_mismatch';
  if (fieldsChanged.has('subtotal') || fieldsChanged.has('tax')) {
    return 'amount_unparseable';
  }
  if (fieldsChanged.has('date')) return 'date_unparseable';
  if (fieldsChanged.has('merchant')) return 'merchant_unrecognized';
  if (fieldsChanged.has('line_items')) return 'line_items_empty';

  // Check for field-added / field-removed patterns.
  const addedFields = diffs.filter((d) => d.correctionType === 'field_added');
  const removedFields = diffs.filter((d) => d.correctionType === 'field_removed');

  if (addedFields.length > 0) {
    // User had to add a field that was missing.
    const addedCritical = addedFields.some((d) =>
      (CRITICAL_FIELDS as readonly string[]).includes(d.fieldName),
    );
    if (addedCritical) return 'field_missing_critical';
    return 'field_missing_optional';
  }

  if (removedFields.length > 0) return 'field_missing_optional';
  if (hasLowConfidence) return 'low_confidence';

  return 'unknown';
}
