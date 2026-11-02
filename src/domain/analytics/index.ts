/**
 * Barrel for the analytics domain module.
 */

export {
  PRODUCT_METRIC_DEFINITIONS,
  PRODUCT_METRIC_KEYS,
  classifyManualVsOcr,
  type ManualVsOcrBucket,
  type ProductMetricDefinition,
  type ProductMetricKey,
  type ProductMetricUnit,
} from './product-metrics';

export {
  SENSITIVE_PROPERTY_KEYS,
  bucketAmount,
  containsResidualAnalyticsPii,
  isSensitivePropertyKey,
  redactAnalyticsEvent,
  type AnalyticsEvent,
  type RedactedAnalyticsEvent,
} from './analytics-redactor';

export {
  addDays,
  computeCohortRetention,
  computeRetentionAggregate,
  toDayBucket,
  type ActivitySnapshot,
  type InstallCohort,
  type RetentionAggregate,
  type RetentionResult,
} from './retention-calculator';

export {
  FEATURE_COUNT,
  FEATURE_KEYS,
  FeatureAdoptionTracker,
  listFeatures,
  type FeatureAdoptionEntry,
  type FeatureAdoptionReport,
  type FeatureKey,
} from './feature-adoption-tracker';
