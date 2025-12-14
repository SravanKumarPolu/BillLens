/**
 * Central export for utility functions
 */

export { formatMoney, parseMoney } from './formatMoney';
export { extractBillInfo, validateImageQuality, parseAmount, normalizeMerchant, type OcrResult } from './ocrService';
export { parseReceiptWithBackend, convertBackendToOcrResult, type BackendOCRResponse } from './ocrBackendService';
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
  exportAsPDF,
  exportAsExcel,
  type ExportOptions,
  type ExportData,
} from './exportService';
export {
  generatePDF,
  sharePDF,
  type PDFOptions,
} from './pdfExportHelper';
export {
  generateExcelFile,
  shareExcel,
  type ExcelWorkbook,
} from './excelExportHelper';
export {
  learnSplitPatterns,
  getSuggestedSplitPattern,
  suggestAmount,
  learnCategoryPatterns,
  suggestCategory,
  type SplitPattern,
  type AmountSuggestion,
  type CategoryLearning,
} from './patternLearningService';
export {
  generateMonthlyReport,
  generateYouPaidExtraInsights,
  type MonthlyReport,
} from './monthlyReportService';
export {
  checkSettlementReminder,
  checkRentReminder,
  generateExpenseAddedNotification,
  checkImbalanceAlert,
  generateMonthEndNotification,
  getPendingNotifications,
  type Notification,
  type NotificationSettings,
} from './notificationService';
export {
  encryptData,
  decryptData,
  getSecuritySettings,
  updateSecuritySettings,
  shouldLockApp,
  recordUnlock,
  isBiometricAvailable,
  authenticateWithBiometrics,
  lockApp,
  isAppLocked,
  type SecuritySettings,
} from './securityService';
export {
  detectUPIPayment,
  suggestGroup,
  calculateRentSplit,
  parseItemizedFoodBill,
  parseSMSBill,
  type UPIDetection,
  type GroupSuggestion,
  type RentSplit,
  type ItemizedFoodSplit,
} from './indiaFirstService';
export {
  calculateDashboardStats,
  type DashboardStats,
} from './dashboardService';
export {
  cacheBalances,
  getCachedBalances,
  clearBalanceCache,
  clearAllBalanceCaches,
  getCacheStats,
} from './balanceCache';
export {
  formatCurrency,
  parseCurrency,
  convertCurrency,
  convertCurrencySync,
  getExchangeRate,
  getCurrency,
  SUPPORTED_CURRENCIES,
  DEFAULT_CURRENCY,
  type Currency,
  type ExchangeRate,
} from './currencyService';
export {
  parseSMS,
  isBillSMS,
  type ParsedSMSBill,
} from './smsParserService';
export {
  isSMSAutoFetchEnabled,
  setSMSAutoFetchEnabled,
  requestSMSPermissions,
  checkSMSPermissions,
  readRecentSMS,
  processSMSForBills,
  handleNewSMS,
  clearProcessedSMSHistory,
  type SMSMessage,
  type ProcessedSMSBill,
} from './smsReaderService';
export {
  getBadges,
  getAchievements,
  calculateLevel,
  calculateStreak,
  type Badge,
  type UserLevel,
  type Streak,
  type Achievement,
} from './gamificationService';
export {
  isPersonalExpense,
  getPersonalExpenses,
  getGroupExpenses,
  calculateBlendedInsights,
  type BlendedInsights,
} from './personalExpenseService';
export {
  checkBudgetStatus,
  getAllBudgetStatuses,
  getBudgetAlerts,
  type BudgetStatus,
} from './categoryBudgetService';
export {
  syncGooglePay,
  syncPaytm,
  syncPhonePe,
  syncSMS,
  syncEmail,
  syncBankStatement,
  syncAllIntegrations,
  type IntegrationResult,
} from './apiIntegrationService';
export {
  syncService,
  type SyncStatus,
  type SyncConflict,
  type SyncResult,
  type PendingChange,
} from './syncService';
export {
  cloudService,
  type CloudConfig,
} from './cloudService';
export {
  searchExpenses,
  searchGroups,
  searchMembers,
  globalSearch,
  quickSearch,
  type SearchResult,
  type SearchOptions,
} from './searchService';
export {
  getCategories,
  getCustomCategories,
  addCustomCategory,
  deleteCustomCategory,
  updateCustomCategory,
  getCategoryEmoji,
  getCategoryColor,
  type CustomCategory,
} from './categoryService';
export {
  isGroupAdmin,
  hasAdminRole,
  canManageGroup,
  canManageMembers,
  canSettleOnBehalf,
  canEditExpenses,
  canViewGroup,
  setGroupAdmin,
  transferAdmin,
  updateMemberRole,
} from './adminService';
export {
  importFromSplitwise,
  parseSplitwiseCSV,
  parseSplitwiseJSON,
  createGroupsFromSplitwise,
  type SplitwiseImportResult,
  type SplitwiseExpense,
  type SplitwiseGroup,
} from './splitwiseImportService';
export {
  getCollectionsForGroup,
  getCollection,
  getExpensesInCollection,
  getCollectionTotal,
  getCollectionSummary,
  validateCollection,
  type CollectionSummary,
} from './collectionService';

