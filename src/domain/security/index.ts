/**
 * Barrel for the security domain module.
 */

export {
  OUTDATED_LEVELS,
  SEVERITY_WEIGHT,
  VULNERABILITY_SEVERITIES,
  auditDependencies,
  auditDependency,
  classifyCvssScore,
  classifyExpoNativeModuleRisk,
  classifyRiskLevel,
  compareOutdatedLevel,
  isAbandoned,
  isVulnerabilitySeverity,
  type DependencyAdvisory,
  type DependencyAuditFinding,
  type DependencyAuditSummary,
  type DependencyMetadata,
  type DependencyRiskLevel,
  type ExpoNativeModuleRisk,
  type OutdatedLevel,
  type VulnerabilitySeverity,
} from './dependency-audit';

export {
  DEFAULT_ROTATION_INTERVAL_DAYS,
  MS_PER_DAY,
  SECRET_TYPES,
  STUB_SECRET_HASHER,
  computeRotationSchedule,
  createRotationRecord,
  isRotationDue,
  isSecretType,
  nextRotationDate,
  rotationsDueWithin,
  type SecretHasher,
  type SecretRotationRecord,
  type SecretRotationRecordInput,
  type SecretType,
  type UpcomingRotation,
} from './secret-rotation';

export {
  ALLOWED_FINDING_TRANSITIONS,
  FINDING_SEVERITIES,
  FINDING_SEVERITY_WEIGHT,
  FINDING_STATUSES,
  PENETRATION_TEST_TYPES,
  canTransitionFinding,
  computeRiskScore,
  createFinding,
  createPenetrationTest,
  isFindingSeverity,
  isFindingStatus,
  isPenetrationTestType,
  riskScoreBand,
  summarizeFindingSeverities,
  summarizeFindingStatuses,
  transitionFinding,
  type FindingSeverity,
  type FindingStatus,
  type PenetrationFinding,
  type PenetrationFindingInput,
  type PenetrationTest,
  type PenetrationTestInput,
  type PenetrationTestType,
} from './penetration-test-framework';

export {
  PHASE_9_TABLES,
  TABLES_REQUIRING_RLS,
  generateRlsChecks,
  missingPhase9Tables,
  phase9TablesCovered,
  verifyRlsCoverage,
  type RlsCheck,
  type RlsCoverageResult,
  type RlsEnforcementLevel,
} from './rls-verification';

export {
  DATA_SENSITIVITIES,
  SENSITIVITY_RANK,
  STORAGE_TIERS,
  STORAGE_TIER_PROFILES,
  canStorePii,
  isDataSensitivity,
  isStorageTier,
  reviewAllTiers,
  reviewStorageTier,
  tiersClearedOnLogout,
  type DataSensitivity,
  type StorageReviewResult,
  type StorageReviewVerdict,
  type StorageTier,
  type StorageTierProfile,
} from './storage-review';

export {
  classifyScanResult,
  countsAreConsistent,
  isCleanScan,
  vulnerabilitiesAtOrAbove,
  type ScanVerdict,
  type VulnerabilityScanResult,
} from './vulnerability-scan';
