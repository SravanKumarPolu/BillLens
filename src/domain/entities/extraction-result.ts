import type { CaptureSourceId, ExtractionResultId } from '@shared-types/index';

import type { DateTime } from '../value-objects/date-time';
import type { ExtractedField } from '../value-objects/extracted-field';
import type { ExtractionConfidence } from '../value-objects/extraction-confidence';
import { nowDateTime } from '../value-objects/index';

export function asExtractionResultId(value: string): ExtractionResultId {
  return value as ExtractionResultId;
}

/**
 * A single line item detected by the extractor.
 *
 * `id` is a client-generated stable id (UUID v4 recommended) so the
 * user can add/remove/edit items without losing track of which is which.
 *
 * All money values are in minor units (integer paise / cents).
 */
export interface ExtractedLineItem {
  readonly id: string;
  readonly name: ExtractedField<string>;
  readonly quantity: ExtractedField<number>;
  readonly unitPriceMinor: ExtractedField<number>;
  readonly discountMinor?: ExtractedField<number>;
  readonly taxMinor?: ExtractedField<number>;
  readonly totalAmountMinor: ExtractedField<number>;
}

/**
 * The result of running OCR + field extraction on a {@link CaptureSource}.
 *
 * This is an IMMUTABLE record — once the extractor has run, the result
 * does not change. User edits happen on the {@link ExpenseDraft}, not on
 * the ExtractionResult.
 *
 * Money fields are in minor units (integer paise / cents).
 */
export interface ExtractionResult {
  readonly id: ExtractionResultId;
  readonly captureSourceId: CaptureSourceId;
  /** Detected merchant name. */
  readonly merchant: ExtractedField<string>;
  /** Detected receipt date (ISO date string YYYY-MM-DD). */
  readonly date: ExtractedField<string>;
  /** Detected currency code (ISO 4217, e.g. "INR"). */
  readonly currencyCode: ExtractedField<string>;
  /** Detected subtotal. */
  readonly subtotal: ExtractedField<number>;
  /** Detected tax. */
  readonly tax: ExtractedField<number>;
  /** Detected tip / service charge (v2.4.0 — optional; some regions default it). */
  readonly tip?: ExtractedField<number>;
  /** Detected total. */
  readonly total: ExtractedField<number>;
  /** Detected line items. */
  readonly lineItems: readonly ExtractedLineItem[];
  /** Overall confidence of the extraction (aggregate of per-field confidences). */
  readonly overallConfidence: ExtractionConfidence;
  /** Whether the total matches the sum of items + charges. */
  readonly totalMatches: boolean;
  /** Raw OCR text (may be undefined if privacy preference says don't retain). */
  readonly rawText?: string;
  readonly extractedAt: DateTime;
  readonly createdAt: DateTime;
  readonly version: number;
}

export interface ExtractionResultCreateInput {
  readonly id: ExtractionResultId;
  readonly captureSourceId: CaptureSourceId;
  readonly merchant: ExtractedField<string>;
  readonly date: ExtractedField<string>;
  readonly currencyCode: ExtractedField<string>;
  readonly subtotal: ExtractedField<number>;
  readonly tax: ExtractedField<number>;
  readonly tip?: ExtractedField<number>;
  readonly total: ExtractedField<number>;
  readonly lineItems: readonly ExtractedLineItem[];
  readonly overallConfidence: ExtractionConfidence;
  readonly totalMatches: boolean;
  readonly rawText?: string;
  readonly now?: DateTime;
}

/**
 * Create a new ExtractionResult.
 *
 * ExtractionResults are immutable after creation — there is no update
 * function. If the extractor re-runs, create a new ExtractionResult with
 * a new id.
 */
export function createExtractionResult(input: ExtractionResultCreateInput): ExtractionResult {
  const now = input.now ?? nowDateTime();
  return {
    id: input.id,
    captureSourceId: input.captureSourceId,
    merchant: input.merchant,
    date: input.date,
    currencyCode: input.currencyCode,
    subtotal: input.subtotal,
    tax: input.tax,
    ...(input.tip !== undefined ? { tip: input.tip } : {}),
    total: input.total,
    lineItems: input.lineItems,
    overallConfidence: input.overallConfidence,
    totalMatches: input.totalMatches,
    ...(input.rawText !== undefined ? { rawText: input.rawText } : {}),
    extractedAt: now,
    createdAt: now,
    version: 1,
  };
}
