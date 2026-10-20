/**
 * Barrel for the OCR improvement domain module.
 */

export {
  CURRENT_CONSENT_VERSION,
  OCR_CONSENT_SCOPES,
  canUseAggregatedPatterns,
  canUseAnonymousStats,
  canUseReceiptForTraining,
  getDefaultConsent,
  grantConsent,
  isOcrConsentScope,
  scopeAtLeast,
  scopeRank,
  summarizeConsent,
  withdrawConsent,
  type OcrConsentScope,
  type OcrImprovementConsent,
} from './consent-manager';

export {
  CORRECTION_TYPES,
  EXTRACTION_CONFIDENCES,
  OCR_FIELD_NAMES,
  anonymizeValue,
  computeDiff,
  diffContainsRawPii,
  isExtractionConfidence,
  isOcrFieldName,
  type CorrectionType,
  type ExtractionConfidence,
  type FieldLevelDiff,
  type OcrFieldName,
} from './field-level-diff';

export {
  computeCorrectionStatistics,
  getBestPerformingField,
  getWorstPerformingField,
  statisticsContainRawPii,
  type CorrectionPatternCount,
  type CorrectionStatistics,
  type FieldCorrectionRate,
  type ReceiptCorrectionBatch,
} from './correction-statistics';

export {
  OCR_FAILURE_CATEGORIES,
  analyzeFailures,
  categorizeFailure,
  categorizeFromDiffs,
  isOcrFailureCategory,
  type FailureAnalysisResult,
  type FailureCategoryCount,
  type OcrFailureCategory,
  type OcrFailureInput,
} from './failure-analysis';

export {
  MIN_CORRECTIONS_FOR_PATTERN,
  hasEnoughSamples,
  learnMerchantPattern,
  matchesLearnedPattern,
  patternContainsRawMerchantName,
  type LearnedMerchantPattern,
} from './merchant-pattern-learner';
