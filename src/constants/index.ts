/**
 * App-wide constants. No business logic lives here — only configuration values.
 * Domain-specific constants belong in `src/domain/...`, not here.
 */
export const APP_CONSTANTS = {
  defaultCurrencyCode: 'INR',
  defaultCurrencyLocale: 'en-IN',
  maxGroupNameLength: 100,
  maxExpenseTitleLength: 200,
  maxMemberDisplayNameLength: 80,
  maxNoteLength: 1000,
  syncMaxRetryAttempts: 8,
  syncBaseBackoffMs: 1000,
} as const;

export type AppConstants = typeof APP_CONSTANTS;
