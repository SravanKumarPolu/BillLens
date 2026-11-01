/**
 * Centralized application metadata.
 *
 * Single source of truth for app name, version, and brand strings.
 * Do NOT scatter these literals across the codebase.
 */
export const APP_METADATA = {
  name: 'BillLens',
  version: '2.3.0',
  description: 'Offline-first, receipt-aware shared expense app',
  tagline: 'Capture. Verify. Settle.',
  supportEmail: 'support@billlens.app',
  websiteUrl: 'https://billlens.app',
} as const;

export type AppMetadata = typeof APP_METADATA;
