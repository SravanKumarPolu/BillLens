/**
 * Integration platform model — third-party service catalog.
 *
 * Phase 10 Prompt 99: Ecosystem Expansion.
 *
 * BillLens integrates with accounting software (QuickBooks, Xero),
 * cloud storage (Google Drive, Dropbox), calendar apps (Google
 * Calendar, Apple Calendar), email import, collaboration tools
 * (Slack, Microsoft Teams), payment providers (UPI, Stripe, PayPal),
 * and business expense systems (SAP Concur, Expensify).
 *
 * CRITICAL: every integration MUST pass the security review in
 * `integration-security.ts` BEFORE it is exposed to users. See
 * `FORBIDDEN_DATA_TYPES` for the data types we NEVER share.
 *
 * This module is PURE: it declares the catalog and exposes pure
 * lookup helpers. No I/O, no OAuth handshake (that's the
 * application layer's job).
 *
 * See `docs/ecosystem-expansion.md`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type IntegrationCategory =
  | 'accounting'
  | 'cloud_storage'
  | 'calendar'
  | 'email'
  | 'collaboration'
  | 'banking'
  | 'payment'
  | 'expense_system'
  | 'erp'
  | 'crm';

export type IntegrationStatus =
  | 'available'
  | 'connected'
  | 'disconnected'
  | 'error'
  | 'deprecated';

export type IntegrationAuthType = 'oauth2' | 'api_key' | 'webhook' | 'manual';

export type IntegrationPrivacyLevel =
  | 'read_only'
  | 'read_write'
  | 'full_access';

export interface Integration {
  /** Stable unique identifier (e.g. 'quickbooks'). */
  readonly id: string;
  /** Display name (e.g. 'QuickBooks Online'). */
  readonly name: string;
  /** Category. */
  readonly category: IntegrationCategory;
  /** Short description (1-2 sentences). */
  readonly description: string;
  /** Current availability status. */
  readonly status: IntegrationStatus;
  /** Authentication mechanism. */
  readonly authType: IntegrationAuthType;
  /** OAuth scopes or API key permissions required. */
  readonly requiredScopes: readonly string[];
  /** Privacy level — how much access this integration has. */
  readonly privacyLevel: IntegrationPrivacyLevel;
  /** Data types SENT to the integration (e.g. ['expense_summary', 'category']). */
  readonly dataSent: readonly string[];
  /** Data types RECEIVED from the integration (e.g. ['invoice', 'vendor']). */
  readonly dataReceived: readonly string[];
  /** Logo URL (optional). */
  readonly logoUrl?: string;
  /** Documentation URL (optional). */
  readonly docsUrl?: string;
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

/**
 * The BillLens integration catalog as of Phase 10.
 *
 * Each integration lists:
 *   - What data is SENT (we explicitly enumerate this for the security
 *     review and for the user consent screen).
 *   - What data is RECEIVED (also enumerated).
 *   - The required OAuth scopes (so users see exactly what they're
 *     granting).
 *
 * CRITICAL: no integration in this catalog sends `upi_id`,
 * `bank_password`, `otp`, `payment_pin`, or
 * `full_receipt_image_without_consent`. See `integration-security.ts`
 * for the FORBIDDEN_DATA_TYPES list.
 */
export const AVAILABLE_INTEGRATIONS: readonly Integration[] = Object.freeze([
  // -------------------------------------------------------------------------
  // Accounting
  // -------------------------------------------------------------------------
  {
    id: 'quickbooks',
    name: 'QuickBooks Online',
    category: 'accounting',
    description:
      'Export BillLens expenses to QuickBooks as categorized transactions.',
    status: 'available',
    authType: 'oauth2',
    requiredScopes: ['com.intuit.quickbooks.accounting'],
    privacyLevel: 'read_write',
    dataSent: ['expense_summary', 'category', 'merchant_name', 'currency'],
    dataReceived: ['vendor', 'account'],
    docsUrl: 'https://developer.intuit.com/app/developer/qbo/docs/develop',
  },
  {
    id: 'xero',
    name: 'Xero',
    category: 'accounting',
    description: 'Export expenses to Xero as bank transactions.',
    status: 'available',
    authType: 'oauth2',
    requiredScopes: ['accounting.transactions'],
    privacyLevel: 'read_write',
    dataSent: ['expense_summary', 'category', 'currency'],
    dataReceived: ['bank_account', 'contact'],
    docsUrl: 'https://developer.xero.com/documentation/oauth2/',
  },
  {
    id: 'zoho_books',
    name: 'Zoho Books',
    category: 'accounting',
    description: 'Export expenses to Zoho Books as categorized expenses.',
    status: 'available',
    authType: 'oauth2',
    requiredScopes: ['ZohoBooks.expenses.CREATE'],
    privacyLevel: 'read_write',
    dataSent: ['expense_summary', 'category', 'currency'],
    dataReceived: ['vendor'],
    docsUrl: 'https://www.zoho.com/books/api/v3/',
  },
  {
    id: 'freshbooks',
    name: 'FreshBooks',
    category: 'accounting',
    description: 'Export expenses to FreshBooks as categorized expenses.',
    status: 'available',
    authType: 'oauth2',
    requiredScopes: ['expenses:write'],
    privacyLevel: 'read_write',
    dataSent: ['expense_summary', 'category'],
    dataReceived: ['category'],
    docsUrl: 'https://www.freshbooks.com/api/start',
  },
  // -------------------------------------------------------------------------
  // Cloud storage
  // -------------------------------------------------------------------------
  {
    id: 'google_drive',
    name: 'Google Drive',
    category: 'cloud_storage',
    description: 'Back up receipt images and export data to Google Drive.',
    status: 'available',
    authType: 'oauth2',
    requiredScopes: ['https://www.googleapis.com/auth/drive.file'],
    privacyLevel: 'read_write',
    dataSent: ['receipt_image_with_consent', 'export_csv'],
    dataReceived: ['file_metadata'],
    docsUrl: 'https://developers.google.com/drive/api/guides/about-sdk',
  },
  {
    id: 'dropbox',
    name: 'Dropbox',
    category: 'cloud_storage',
    description: 'Back up receipt images and export data to Dropbox.',
    status: 'available',
    authType: 'oauth2',
    requiredScopes: ['files.content.write'],
    privacyLevel: 'read_write',
    dataSent: ['receipt_image_with_consent', 'export_csv'],
    dataReceived: ['file_metadata'],
    docsUrl: 'https://www.dropbox.com/developers/documentation',
  },
  {
    id: 'icloud_drive',
    name: 'iCloud Drive',
    category: 'cloud_storage',
    description: 'Back up receipt images to iCloud Drive (iOS only).',
    status: 'available',
    authType: 'oauth2',
    requiredScopes: ['com.apple.developer.icloud-container-identifiers'],
    privacyLevel: 'read_write',
    dataSent: ['receipt_image_with_consent'],
    dataReceived: ['file_metadata'],
  },
  // -------------------------------------------------------------------------
  // Calendar
  // -------------------------------------------------------------------------
  {
    id: 'google_calendar',
    name: 'Google Calendar',
    category: 'calendar',
    description: 'Add settlement reminders and expense events to Google Calendar.',
    status: 'available',
    authType: 'oauth2',
    requiredScopes: ['https://www.googleapis.com/auth/calendar.events'],
    privacyLevel: 'read_write',
    dataSent: ['settlement_reminder', 'expense_event'],
    dataReceived: [],
    docsUrl: 'https://developers.google.com/calendar/api/guides/overview',
  },
  {
    id: 'apple_calendar',
    name: 'Apple Calendar',
    category: 'calendar',
    description: 'Add settlement reminders via Apple Calendar EventKit.',
    status: 'available',
    authType: 'manual',
    requiredScopes: ['calendars.write'],
    privacyLevel: 'read_write',
    dataSent: ['settlement_reminder'],
    dataReceived: [],
  },
  {
    id: 'outlook_calendar',
    name: 'Outlook Calendar',
    category: 'calendar',
    description: 'Add settlement reminders to Outlook via Microsoft Graph.',
    status: 'available',
    authType: 'oauth2',
    requiredScopes: ['Calendars.ReadWrite'],
    privacyLevel: 'read_write',
    dataSent: ['settlement_reminder', 'expense_event'],
    dataReceived: [],
    docsUrl: 'https://learn.microsoft.com/graph/api/resources/calendar',
  },
  // -------------------------------------------------------------------------
  // Email
  // -------------------------------------------------------------------------
  {
    id: 'gmail_receipts',
    name: 'Gmail Receipt Import',
    category: 'email',
    description:
      'Import receipts from your Gmail inbox (with explicit consent per email).',
    status: 'available',
    authType: 'oauth2',
    requiredScopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    privacyLevel: 'read_only',
    dataSent: [],
    dataReceived: ['email_receipt_with_consent'],
    docsUrl: 'https://developers.google.com/gmail/api',
  },
  // -------------------------------------------------------------------------
  // Collaboration
  // -------------------------------------------------------------------------
  {
    id: 'slack',
    name: 'Slack',
    category: 'collaboration',
    description:
      'Send expense notifications and settlement reminders to Slack channels.',
    status: 'available',
    authType: 'oauth2',
    requiredScopes: ['chat:write', 'incoming-webhook'],
    privacyLevel: 'read_write',
    dataSent: ['settlement_reminder', 'expense_summary'],
    dataReceived: [],
    docsUrl: 'https://api.slack.com/docs',
  },
  {
    id: 'microsoft_teams',
    name: 'Microsoft Teams',
    category: 'collaboration',
    description: 'Send expense notifications to Teams channels.',
    status: 'available',
    authType: 'oauth2',
    requiredScopes: ['ChannelMessage.Send'],
    privacyLevel: 'read_write',
    dataSent: ['settlement_reminder', 'expense_summary'],
    dataReceived: [],
    docsUrl: 'https://learn.microsoft.com/microsoftteams/platform/',
  },
  // -------------------------------------------------------------------------
  // Banking — RESTRICTED
  // -------------------------------------------------------------------------
  // BillLens does NOT directly connect to bank accounts. Bank transaction
  // import is provided ONLY via regulated PSD2/Open Banking aggregators
  // (Plaid in the US, TrueLayer in the EU/UK). The aggregators hold the
  // bank credentials — BillLens never sees them.
  {
    id: 'plaid',
    name: 'Plaid (Bank Account Link)',
    category: 'banking',
    description:
      'Import bank transactions via Plaid. BillLens NEVER sees your bank credentials.',
    status: 'available',
    authType: 'oauth2',
    requiredScopes: ['transactions.read', 'accounts.read'],
    privacyLevel: 'read_only',
    dataSent: [],
    dataReceived: ['bank_transaction', 'account_metadata'],
    docsUrl: 'https://plaid.com/docs/',
  },
  {
    id: 'truelayer',
    name: 'TrueLayer (Open Banking EU/UK)',
    category: 'banking',
    description:
      'Import bank transactions via TrueLayer. PSD2-compliant. BillLens NEVER sees your bank credentials.',
    status: 'available',
    authType: 'oauth2',
    requiredScopes: ['transactions', 'accounts'],
    privacyLevel: 'read_only',
    dataSent: [],
    dataReceived: ['bank_transaction', 'account_metadata'],
    docsUrl: 'https://docs.truelayer.com/',
  },
  // -------------------------------------------------------------------------
  // Payment
  // -------------------------------------------------------------------------
  {
    id: 'upi',
    name: 'UPI (India)',
    category: 'payment',
    description:
      'Generate UPI deep links for settlement payments. No UPI ID stored on BillLens servers.',
    status: 'available',
    authType: 'manual',
    requiredScopes: [],
    privacyLevel: 'read_only',
    dataSent: ['payment_link', 'amount_minor', 'currency', 'note'],
    dataReceived: [],
  },
  {
    id: 'stripe',
    name: 'Stripe',
    category: 'payment',
    description: 'Send settlement payments via Stripe Connect.',
    status: 'available',
    authType: 'oauth2',
    requiredScopes: ['payments'],
    privacyLevel: 'read_write',
    dataSent: ['amount_minor', 'currency', 'recipient_ref'],
    dataReceived: ['payment_status'],
    docsUrl: 'https://stripe.com/docs/api',
  },
  {
    id: 'paypal',
    name: 'PayPal',
    category: 'payment',
    description: 'Generate PayPal.me links for settlement payments.',
    status: 'available',
    authType: 'manual',
    requiredScopes: [],
    privacyLevel: 'read_only',
    dataSent: ['payment_link', 'amount_minor', 'currency'],
    dataReceived: [],
    docsUrl: 'https://developer.paypal.com/docs/',
  },
  {
    id: 'wise',
    name: 'Wise (TransferWise)',
    category: 'payment',
    description: 'Cross-border settlement payments via Wise.',
    status: 'available',
    authType: 'api_key',
    requiredScopes: ['transfers:create'],
    privacyLevel: 'read_write',
    dataSent: ['amount_minor', 'currency', 'recipient_ref'],
    dataReceived: ['payment_status'],
    docsUrl: 'https://wise.com/api-docs/',
  },
  // -------------------------------------------------------------------------
  // Expense system (corporate)
  // -------------------------------------------------------------------------
  {
    id: 'sap_concur',
    name: 'SAP Concur',
    category: 'expense_system',
    description: 'Export expenses to SAP Concur for corporate reimbursement.',
    status: 'available',
    authType: 'oauth2',
    requiredScopes: ['expense.write'],
    privacyLevel: 'read_write',
    dataSent: ['expense_summary', 'receipt_image_with_consent', 'category'],
    dataReceived: ['reimbursement_status'],
    docsUrl: 'https://developer.concur.com/',
  },
  {
    id: 'expensify',
    name: 'Expensify',
    category: 'expense_system',
    description: 'Export expenses to Expensify for corporate reimbursement.',
    status: 'available',
    authType: 'api_key',
    requiredScopes: ['expense.write'],
    privacyLevel: 'read_write',
    dataSent: ['expense_summary', 'receipt_image_with_consent'],
    dataReceived: ['reimbursement_status'],
    docsUrl: 'https://integrations.expensify.com/',
  },
]);

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when an integration with the given ID is in the catalog.
 *
 * Note: this does NOT check whether the integration has passed the
 * security review — that's `isIntegrationSecure` in
 * `integration-security.ts`. Both checks must pass before the
 * integration is offered to users.
 */
export function isIntegrationAvailable(integrationId: string): boolean {
  return AVAILABLE_INTEGRATIONS.some((i) => i.id === integrationId);
}

/**
 * Returns all integrations in the given category.
 */
export function getIntegrationsByCategory(
  category: IntegrationCategory,
): readonly Integration[] {
  return AVAILABLE_INTEGRATIONS.filter((i) => i.category === category);
}

/**
 * Returns the integration for a given ID, or null if not found.
 */
export function getIntegrationById(
  integrationId: string,
): Integration | null {
  return AVAILABLE_INTEGRATIONS.find((i) => i.id === integrationId) ?? null;
}

/**
 * Returns the list of all categories that have at least one integration.
 */
export function getAvailableCategories(): readonly IntegrationCategory[] {
  const seen = new Set<IntegrationCategory>();
  for (const integration of AVAILABLE_INTEGRATIONS) {
    seen.add(integration.category);
  }
  return Object.freeze(Array.from(seen).sort());
}
