/**
 * Barrel for the performance domain module.
 */

export {
  OPTIMIZATION_AREAS,
  OPTIMIZATION_TARGETS,
  getTargetByKey,
  getTargetCountByArea,
  getTargetsByArea,
  meetsTargetValue,
  shouldAlertForTarget,
  type OptimizationArea,
  type OptimizationTarget,
  type TargetDirection,
  type TargetUnit,
} from './optimization-targets';

export {
  FINANCIAL_MUTATIONS,
  createBalanceCacheEntry,
  invalidateOnFinancialMutation,
  isCacheValid,
  safelyRetrieveCachedBalances,
  verifyZeroSumInvariant,
  type BalanceCacheEntry,
  type BalanceCacheEntryInput,
  type FinancialMutation,
} from './balance-cache-safety';

export {
  addMinor,
  assertIntegerMinor,
  isSafeIntegerAmount,
  majorToMinorUnits,
  minorToMajorUnits,
  subtractMinor,
  sumMinor,
  verifyNoFloatingPointInBalances,
} from './floating-point-guard';

export {
  detectNPlusOneQueries,
  getDetectionSeverity,
  getDetectionSeverityLabel,
  normalizeQueryPattern,
  type NPlusOneAnalysisResult,
  type NPlusOneDetection,
  type NPlusOneDetectorOptions,
  type QueryLogEntry,
} from './n-plus-one-detector';

export {
  captureSnapshot,
  detectMemoryLeak,
  diffSnapshots,
  summarizeSnapshots,
  type LeakDetectionResult,
  type LeakDetectorOptions,
  type MemorySnapshot,
  type MemorySummary,
  type SnapshotDiff,
} from './memory-profiler';
