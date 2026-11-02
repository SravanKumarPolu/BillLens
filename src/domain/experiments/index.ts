/**
 * Barrel for the experiments domain module.
 */

export {
  DEFAULT_EXPERIMENT_VERSION,
  MAX_TRAFFIC_ALLOCATION,
  MIN_TRAFFIC_ALLOCATION,
  createExperiment,
  canTransition,
  isExperimentActive,
  isExperimentStatus,
  isExperimentSurface,
  isExperimentVariant,
  transitionExperiment,
  type Experiment,
  type ExperimentCreateInput,
  type ExperimentStatus,
  type ExperimentSurface,
  type ExperimentVariant,
  type VariantMetrics,
  type VariantWeight,
} from './experiment-model';

export {
  BLOCKED_FINANCIAL_AREAS,
  getBlockedExperimentAreas,
  isExperimentSafe,
  isExperimentSafeForFinancialArea,
  isFinancialArea,
  validateExperimentDoesNotAffectFinance,
  type FinancialArea,
} from './experiment-safety-guard';

export {
  FINANCIAL_FLAGS,
  getAllowedOverrides,
  getDisallowedOverrides,
  getEffectiveFeatureFlags,
  isFlagFinancial,
} from './feature-flag-decoupler';

export {
  assignVariant,
  assignmentFingerprint,
  fnv1aHash,
  hashToUnitInterval,
  isInExperimentTraffic,
  pickVariantByWeight,
} from './assignment-engine';

export {
  computeExperimentResults,
  differenceConfidenceInterval,
  inverseNormalCdf,
  minimumSampleSize,
  normalCdf,
  twoProportionZTest,
  type ExperimentStatisticalResult,
  type VariantConversionStats,
  type VariantResultRow,
} from './statistical-significance';
