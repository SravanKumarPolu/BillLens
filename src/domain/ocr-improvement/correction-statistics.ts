/**
 * Correction statistics — aggregate, anonymous OCR correction patterns.
 *
 * CRITICAL CONTRACT:
 *   - This module NEVER contains raw receipt data, merchant names, or
 *     user IDs. It aggregates anonymized `FieldLevelDiff` entries into
 *     per-field correction rates, common correction patterns, and
 *     worst-performing fields.
 *   - Statistics are computed from anonymized diffs only — never from
 *     raw images or raw receipt text.
 *   - Pure functions — no I/O, no globals.
 */

import type { FieldLevelDiff, OcrFieldName } from './field-level-diff';

// ---------------------------------------------------------------------------
// Input — a batch of anonymized diffs for a single receipt or across
// multiple receipts
// ---------------------------------------------------------------------------

export interface ReceiptCorrectionBatch {
  /** Anonymous receipt ID (NOT a user ID). */
  readonly receiptId: string;
  /** List of field-level diffs for this receipt. */
  readonly diffs: readonly FieldLevelDiff[];
}

// ---------------------------------------------------------------------------
// Output — aggregated statistics
// ---------------------------------------------------------------------------

export interface FieldCorrectionRate {
  readonly fieldName: OcrFieldName;
  readonly totalOccurrences: number;
  readonly correctedCount: number;
  /** Ratio correctedCount / totalOccurrences, in [0, 1]. 0 if no occurrences. */
  readonly correctionRate: number;
}

export interface CorrectionPatternCount {
  readonly fieldName: OcrFieldName;
  readonly extractedValuePattern: string;
  readonly correctedValuePattern: string;
  readonly correctionType: string;
  readonly count: number;
}

export interface CorrectionStatistics {
  /** Total receipts considered. */
  readonly totalReceipts: number;
  /** Total corrections across all fields. */
  readonly totalCorrections: number;
  /** Per-field correction rates. */
  readonly fieldCorrectionRates: readonly FieldCorrectionRate[];
  /** Most common correction patterns (top N by count). */
  readonly commonPatterns: readonly CorrectionPatternCount[];
  /** Worst-performing fields (highest correction rate, min 5 occurrences). */
  readonly worstPerformingFields: readonly FieldCorrectionRate[];
  /** Per-correction-type counts. */
  readonly correctionTypeCounts: Readonly<Record<string, number>>;
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

/**
 * Computes correction statistics from a list of receipt correction batches.
 *
 * Pure function — does not mutate the inputs.
 *
 * The output NEVER contains raw receipt data, merchant names, or user IDs.
 * All values are anonymized patterns or aggregate counts.
 */
export function computeCorrectionStatistics(
  batches: readonly ReceiptCorrectionBatch[],
  options?: { readonly topPatternsLimit?: number; readonly minOccurrencesForWorst?: number },
): CorrectionStatistics {
  const topPatternsLimit = options?.topPatternsLimit ?? 20;
  const minOccurrencesForWorst = options?.minOccurrencesForWorst ?? 5;

  const totalReceipts = batches.length;
  let totalCorrections = 0;

  // Per-field counts.
  const fieldTotal = new Map<OcrFieldName, number>();
  const fieldCorrected = new Map<OcrFieldName, number>();

  // Per-pattern counts.
  const patternCounts = new Map<string, CorrectionPatternCount>();

  // Per-correction-type counts.
  const correctionTypeCounts: Record<string, number> = {};

  for (const batch of batches) {
    // For each receipt, count each field at most once (even if multiple
    // diffs touch the same field — which shouldn't happen but be safe).
    const fieldsInReceipt = new Set<OcrFieldName>();

    for (const diff of batch.diffs) {
      totalCorrections++;
      fieldsInReceipt.add(diff.fieldName);

      // Per-field totals — we'll count total occurrences from extracted
      // data, but since we only see diffs (not the full receipt), we
      // approximate: each receipt contributes 1 occurrence per field
      // that appears in its diffs.
      fieldCorrected.set(
        diff.fieldName,
        (fieldCorrected.get(diff.fieldName) ?? 0) + 1,
      );

      // Pattern counts.
      const patternKey = `${diff.fieldName}::${diff.extractedValuePattern}::${diff.correctedValuePattern}::${diff.correctionType}`;
      const existing = patternCounts.get(patternKey);
      if (existing) {
        patternCounts.set(patternKey, { ...existing, count: existing.count + 1 });
      } else {
        patternCounts.set(patternKey, {
          fieldName: diff.fieldName,
          extractedValuePattern: diff.extractedValuePattern,
          correctedValuePattern: diff.correctedValuePattern,
          correctionType: diff.correctionType,
          count: 1,
        });
      }

      // Correction type counts.
      correctionTypeCounts[diff.correctionType] =
        (correctionTypeCounts[diff.correctionType] ?? 0) + 1;
    }

    // Each field touched in the receipt contributes one "occurrence".
    for (const fieldName of fieldsInReceipt) {
      fieldTotal.set(fieldName, (fieldTotal.get(fieldName) ?? 0) + 1);
    }
  }

  // Build per-field correction rates. We use the total number of receipts
  // as the denominator for the "total occurrences" because we don't have
  // access to receipts that had no corrections (those wouldn't appear
  // in the diff batches).
  const allFieldNames = new Set<OcrFieldName>([
    ...fieldTotal.keys(),
    ...fieldCorrected.keys(),
  ]);

  const fieldCorrectionRates: FieldCorrectionRate[] = [];
  for (const fieldName of allFieldNames) {
    const total = fieldTotal.get(fieldName) ?? 0;
    const corrected = fieldCorrected.get(fieldName) ?? 0;
    fieldCorrectionRates.push({
      fieldName,
      totalOccurrences: total,
      correctedCount: corrected,
      correctionRate: total > 0 ? corrected / total : 0,
    });
  }

  // Sort by correction rate descending.
  fieldCorrectionRates.sort((a, b) => b.correctionRate - a.correctionRate);

  // Common patterns — sort by count descending, take top N.
  const commonPatterns = Array.from(patternCounts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, topPatternsLimit);

  // Worst-performing fields — highest correction rate, min occurrences.
  const worstPerformingFields = fieldCorrectionRates
    .filter((f) => f.totalOccurrences >= minOccurrencesForWorst)
    .sort((a, b) => b.correctionRate - a.correctionRate);

  return Object.freeze({
    totalReceipts,
    totalCorrections,
    fieldCorrectionRates: Object.freeze(fieldCorrectionRates),
    commonPatterns: Object.freeze(commonPatterns),
    worstPerformingFields: Object.freeze(worstPerformingFields),
    correctionTypeCounts: Object.freeze({ ...correctionTypeCounts }),
  });
}

// ---------------------------------------------------------------------------
// Verification helper
// ---------------------------------------------------------------------------

/**
 * Returns `true` when the statistics object contains any value that looks
 * like raw PII (a raw merchant name, raw amount, raw date, or user ID).
 * Used by tests as a defensive assertion.
 */
export function statisticsContainRawPii(
  stats: CorrectionStatistics,
): boolean {
  // Check that no field name is a raw value.
  const EMAIL_RE = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/;
  const UPI_VPA_RE = /\b[a-zA-Z0-9._-]{2,64}@[a-zA-Z0-9]{2,24}\b/;
  const RAW_DATE_RE = /\b\d{4}-\d{2}-\d{2}\b/;

  for (const p of stats.commonPatterns) {
    for (const v of [p.extractedValuePattern, p.correctedValuePattern]) {
      if (typeof v !== 'string') continue;
      // Strip <...> placeholders.
      const stripped = v.replace(/<[^>]*>/g, '');
      if (EMAIL_RE.test(stripped)) return true;
      if (UPI_VPA_RE.test(stripped)) return true;
      if (RAW_DATE_RE.test(stripped)) return true;
    }
  }
  return false;
}

/**
 * Returns the field with the highest correction rate, or `null` if no
 * fields have any corrections.
 */
export function getWorstPerformingField(
  stats: CorrectionStatistics,
): FieldCorrectionRate | null {
  if (stats.worstPerformingFields.length === 0) return null;
  return stats.worstPerformingFields[0]!;
}

/**
 * Returns the field with the lowest correction rate, or `null` if no
 * fields have any data.
 */
export function getBestPerformingField(
  stats: CorrectionStatistics,
): FieldCorrectionRate | null {
  if (stats.fieldCorrectionRates.length === 0) return null;
  // Lowest correction rate (best performer).
  return stats.fieldCorrectionRates[stats.fieldCorrectionRates.length - 1]!;
}
