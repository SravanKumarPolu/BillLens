/**
 * Product analytics metric definitions.
 *
 * BillLens ships privacy-safe product analytics: DAU/WAU/MAU, feature
 * adoption, manual-vs-OCR usage, retention (D1/D7/D30), and counts of
 * key actions. CRITICAL: analytics events NEVER carry exact amounts,
 * merchant names, UPI IDs, raw receipt text, file paths, or any of the
 * 13 sensitive property keys listed in `analytics-redactor.ts`.
 *
 * All analytics events are bucketed: amounts become coarse ranges,
 * timestamps become day-granular buckets, and user IDs are anonymous
 * installation IDs (never emails or phone numbers).
 */

// ---------------------------------------------------------------------------
// Product metric keys
// ---------------------------------------------------------------------------

export type ProductMetricKey =
  | 'dau'
  | 'wau'
  | 'mau'
  | 'groups_created'
  | 'expenses_created'
  | 'receipts_scanned'
  | 'manual_vs_ocr'
  | 'retention_d1'
  | 'retention_d7'
  | 'retention_d30'
  | 'feature_adoption';

export const PRODUCT_METRIC_KEYS: readonly ProductMetricKey[] = [
  'dau',
  'wau',
  'mau',
  'groups_created',
  'expenses_created',
  'receipts_scanned',
  'manual_vs_ocr',
  'retention_d1',
  'retention_d7',
  'retention_d30',
  'feature_adoption',
] as const;

// ---------------------------------------------------------------------------
// Metric definitions
// ---------------------------------------------------------------------------

export type ProductMetricUnit = 'count' | 'ratio' | 'bucketed_ratio';

export interface ProductMetricDefinition {
  readonly key: ProductMetricKey;
  readonly label: string;
  readonly description: string;
  readonly unit: ProductMetricUnit;
  /** For ratio metrics: the target value (0..1). */
  readonly target?: number;
  /** For ratio metrics: the alert threshold (0..1). */
  readonly alertThreshold?: number;
}

export const PRODUCT_METRIC_DEFINITIONS: Readonly<
  Record<ProductMetricKey, ProductMetricDefinition>
> = Object.freeze({
  dau: Object.freeze({
    key: 'dau',
    label: 'Daily Active Users',
    description: 'Number of distinct anonymous installation IDs active in the last 24h.',
    unit: 'count',
  }),
  wau: Object.freeze({
    key: 'wau',
    label: 'Weekly Active Users',
    description: 'Number of distinct anonymous installation IDs active in the last 7 days.',
    unit: 'count',
  }),
  mau: Object.freeze({
    key: 'mau',
    label: 'Monthly Active Users',
    description: 'Number of distinct anonymous installation IDs active in the last 30 days.',
    unit: 'count',
  }),
  groups_created: Object.freeze({
    key: 'groups_created',
    label: 'Groups Created',
    description: 'Number of new groups created (aggregate, per-day bucket).',
    unit: 'count',
  }),
  expenses_created: Object.freeze({
    key: 'expenses_created',
    label: 'Expenses Created',
    description: 'Number of new expenses created (aggregate, per-day bucket).',
    unit: 'count',
  }),
  receipts_scanned: Object.freeze({
    key: 'receipts_scanned',
    label: 'Receipts Scanned',
    description: 'Number of receipt images processed through the OCR pipeline.',
    unit: 'count',
  }),
  manual_vs_ocr: Object.freeze({
    key: 'manual_vs_ocr',
    label: 'Manual vs OCR Entry',
    description:
      'Ratio of manually-entered expenses to OCR-scanned expenses. Buckets: manual, ocr, mixed.',
    unit: 'bucketed_ratio',
  }),
  retention_d1: Object.freeze({
    key: 'retention_d1',
    label: 'D1 Retention',
    description: 'Fraction of new installations active 1 day after first launch.',
    unit: 'ratio',
    target: 0.4,
    alertThreshold: 0.25,
  }),
  retention_d7: Object.freeze({
    key: 'retention_d7',
    label: 'D7 Retention',
    description: 'Fraction of new installations active 7 days after first launch.',
    unit: 'ratio',
    target: 0.2,
    alertThreshold: 0.12,
  }),
  retention_d30: Object.freeze({
    key: 'retention_d30',
    label: 'D30 Retention',
    description: 'Fraction of new installations active 30 days after first launch.',
    unit: 'ratio',
    target: 0.1,
    alertThreshold: 0.05,
  }),
  feature_adoption: Object.freeze({
    key: 'feature_adoption',
    label: 'Feature Adoption',
    description:
      'Per-feature adoption rate (fraction of MAU that used the feature at least once in the period).',
    unit: 'ratio',
  }),
});

// ---------------------------------------------------------------------------
// Manual vs OCR bucket
// ---------------------------------------------------------------------------

export type ManualVsOcrBucket = 'manual' | 'ocr' | 'mixed';

export function classifyManualVsOcr(
  manualCount: number,
  ocrCount: number,
): ManualVsOcrBucket {
  if (manualCount > 0 && ocrCount === 0) return 'manual';
  if (ocrCount > 0 && manualCount === 0) return 'ocr';
  if (manualCount > 0 && ocrCount > 0) return 'mixed';
  return 'manual'; // default when both are 0
}
