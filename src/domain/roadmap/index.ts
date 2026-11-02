/**
 * Barrel for the roadmap domain module.
 */

export {
  EFFORT_DEV_DAY_RANGES,
  FEATURE_CANDIDATE_COUNT,
  FEATURE_CANDIDATES,
  FEATURE_CANDIDATE_KEYS,
  IMPLEMENTATION_EFFORTS,
  RISK_LEVELS,
  createFeatureCandidate,
  getFeatureCandidate,
  isFeatureKey,
  isImplementationEffort,
  isRiskLevel,
  type FeatureCandidate,
  type FeatureCandidateInput,
  type FeatureKey,
  type ImplementationEffort,
  type RiskLevel,
} from './feature-candidate';

export {
  ALLOWED_ANALYTICS_SOURCES,
  MAX_COST_PER_VALUE_POINT_DEV_DAYS,
  MIN_ESTIMATED_USERS_IMPACTED,
  MIN_FEEDBACK_COUNT,
  MIN_RELATED_FEATURE_ADOPTION,
  MIN_USER_DEMAND_SCORE,
  isCostValueAcceptable,
  validateFeature,
  validateFeatureInput,
  validateFeatures,
  type AnalyticsSource,
  type ConfidenceLevel,
  type FeatureValidationInput,
  type FeatureValidationResult,
  type RecommendedPriority,
  type RoadmapValidationSummary,
} from './feature-validator';

export {
  DEFAULT_CAPACITY_PER_QUARTER_DEV_DAYS,
  DEFAULT_QUARTER_COUNT,
  QUARTER_LABELS,
  featuresPerQuarter,
  hasOverCapacityQuarter,
  planRoadmap,
  type QuarterPlan,
  type QuarterlyRoadmap,
  type RoadmapEntry,
  type RoadmapPlannerInput,
} from './roadmap-planner';
