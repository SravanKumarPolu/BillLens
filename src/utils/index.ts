/**
 * Central export for utility functions
 */

export { formatMoney, parseMoney } from './formatMoney';
export { extractBillInfo, validateImageQuality, parseAmount, normalizeMerchant, type OcrResult } from './ocrService';
export { 
  openUPIApp, 
  getAvailableUPIApps, 
  getAppDisplayName, 
  generateUPIUrl, 
  generateAppDeepLink,
  checkAppInstalled,
  type UPIPaymentApp,
  type UPIPaymentParams 
} from './upiService';
export {
  saveAppData,
  loadAppData,
  createBackup,
  restoreBackup,
  clearAllData,
  type AppData,
} from './storageService';
export {
  generateInsights,
  detectUnfairness,
  detectMistakes,
  analyzeSpendingPatterns,
  optimizeSettlements,
  type Insight,
  type UnfairnessPattern,
  type MistakeDetection,
  type SpendingPattern,
  type SettlementOptimization,
} from './insightsService';
export {
  explainSettlement,
  getBalanceHistory,
  type BalanceChange,
  type SettlementExplanation,
} from './settlementExplanation';
export {
  roundToTwoDecimals,
  normalizeSplits,
  calculateEqualSplits,
  verifySplitsSum,
  verifyBalancesSumToZero,
  createEqualSplits,
  normalizeAmount,
} from './mathUtils';
export {
  calculateFairnessScore,
  calculateReliabilityMeter,
  type FairnessScore,
  type ReliabilityMeter,
} from './fairnessScore';
export {
  migrateSettlements,
  runMigrations,
  checkMigrationsNeeded,
} from './migrationService';
export {
  exportGroupHistory,
  exportAsJSON,
  exportAsCSV,
  exportAsText,
  type ExportOptions,
  type ExportData,
} from './exportService';
export {
  cacheBalances,
  getCachedBalances,
  clearBalanceCache,
  clearAllBalanceCaches,
  getCacheStats,
} from './balanceCache';

