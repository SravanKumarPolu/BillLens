/**
 * Subscription plan model — free / premium / team / enterprise.
 *
 * Phase 10 Prompt 98: Revenue and Monetisation.
 *
 * BillLens uses a 4-tier plan model. CRITICAL: financial core features
 * (balance calculation, split methods, settlement, offline sync,
 * backup/restore) are NEVER gated — they are always available on
 * every plan, including free. See `feature-gate.ts` for the
 * enforcement matrix.
 *
 * This module is PURE: it declares the plan registry and exposes
 * pure helpers. No I/O, no billing provider calls.
 *
 * See `docs/revenue-monetisation.md`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PlanTier = 'free' | 'premium' | 'team' | 'enterprise';

export type BillingCycle = 'monthly' | 'yearly';

export interface PlanFeature {
  /** Feature name shown in the comparison table. */
  readonly name: string;
  /** Short description (1 sentence). */
  readonly description: string;
  /** Whether this feature is included in this plan. */
  readonly included: boolean;
}

export interface PlanLimits {
  /** Maximum number of groups the user can be a member of. */
  readonly maxGroups: number;
  /** Maximum number of expenses the user can create per month. */
  readonly maxExpensesPerMonth: number;
  /** Maximum number of receipt OCR scans per month. */
  readonly maxReceiptScansPerMonth: number;
  /** Maximum storage for receipts and attachments (MB). */
  readonly maxStorageMb: number;
  /** Whether the public API is available. */
  readonly apiAccess: boolean;
  /** Whether advanced reporting (charts, trends, exports) is available. */
  readonly advancedReporting: boolean;
  /** Whether custom branding (logo, colors) is available. */
  readonly customBranding: boolean;
  /** Whether SSO (SAML, OIDC) is available. */
  readonly ssoEnabled: boolean;
  /** How long audit log entries are retained (days). */
  readonly auditLogRetentionDays: number;
}

export interface Plan {
  /** Plan tier. */
  readonly tier: PlanTier;
  /** Display name. */
  readonly name: string;
  /** Short marketing description. */
  readonly description: string;
  /** Monthly price in the plan's currency, in major units (e.g. USD 9.99). */
  readonly monthlyPrice: number;
  /** Yearly price in the plan's currency (charged once per year). */
  readonly yearlyPrice: number;
  /** ISO 4217 currency code. */
  readonly currency: string;
  /** Feature list for the comparison table. */
  readonly features: readonly PlanFeature[];
  /** Hard limits enforced by the application. */
  readonly limits: PlanLimits;
}

// ---------------------------------------------------------------------------
// Plan registry
// ---------------------------------------------------------------------------

/**
 * The four BillLens plans.
 *
 *   free       — 1 group, 25 expenses/month, 10 OCR scans/month, 50 MB
 *   premium    — unlimited groups, unlimited expenses, 100 OCR scans, 5 GB
 *   team       — premium + 5 seats, advanced reporting, 50 GB, 1 year audit
 *   enterprise — team + SSO, custom branding, unlimited storage, 7 year audit
 *
 * CRITICAL: the financial core (balance, splits, settlement, offline,
 * backup/restore) is NOT listed as a "feature" here — it is implicit
 * and always available. See `feature-gate.ts`.
 */
export const PLANS: Readonly<Record<PlanTier, Plan>> = Object.freeze({
  free: Object.freeze({
    tier: 'free',
    name: 'Free',
    description: 'For individuals tracking personal expenses with friends.',
    monthlyPrice: 0,
    yearlyPrice: 0,
    currency: 'USD',
    features: Object.freeze([
      {
        name: 'Unlimited members per group',
        description: 'Invite as many friends as you want.',
        included: true,
      },
      {
        name: '5 split methods',
        description: 'Equal, exact, percentage, share, itemised.',
        included: true,
      },
      {
        name: 'Offline-first sync',
        description: 'Works without internet; syncs when back online.',
        included: true,
      },
      {
        name: 'Local backup & restore',
        description: 'Export your data to a file you control.',
        included: true,
      },
      {
        name: 'Cloud OCR (10 scans/month)',
        description: 'Receipt scanning with field extraction.',
        included: true,
      },
      {
        name: 'Advanced reporting',
        description: 'Charts, trends, category breakdowns.',
        included: false,
      },
      {
        name: 'API access',
        description: 'Programmatic access to your data.',
        included: false,
      },
    ]),
    limits: Object.freeze({
      maxGroups: 1,
      maxExpensesPerMonth: 25,
      maxReceiptScansPerMonth: 10,
      maxStorageMb: 50,
      apiAccess: false,
      advancedReporting: false,
      customBranding: false,
      ssoEnabled: false,
      auditLogRetentionDays: 30,
    }),
  }),
  premium: Object.freeze({
    tier: 'premium',
    name: 'Premium',
    description: 'For power users with multiple groups and recurring expenses.',
    monthlyPrice: 4.99,
    yearlyPrice: 49.99,
    currency: 'USD',
    features: Object.freeze([
      {
        name: 'Unlimited groups',
        description: 'Create as many groups as you need.',
        included: true,
      },
      {
        name: 'Unlimited expenses',
        description: 'No monthly cap on expense creation.',
        included: true,
      },
      {
        name: 'Cloud OCR (100 scans/month)',
        description: 'Receipt scanning with field extraction.',
        included: true,
      },
      {
        name: 'Advanced reporting',
        description: 'Charts, trends, category breakdowns.',
        included: true,
      },
      {
        name: '5 GB attachment storage',
        description: 'Store receipt photos and PDFs.',
        included: true,
      },
      {
        name: 'API access',
        description: 'Programmatic access to your data.',
        included: false,
      },
      {
        name: 'Custom branding',
        description: 'Add your logo and brand colors.',
        included: false,
      },
    ]),
    limits: Object.freeze({
      maxGroups: Number.POSITIVE_INFINITY,
      maxExpensesPerMonth: Number.POSITIVE_INFINITY,
      maxReceiptScansPerMonth: 100,
      maxStorageMb: 5 * 1024,
      apiAccess: false,
      advancedReporting: true,
      customBranding: false,
      ssoEnabled: false,
      auditLogRetentionDays: 90,
    }),
  }),
  team: Object.freeze({
    tier: 'team',
    name: 'Team',
    description: 'For small teams and families sharing expenses.',
    monthlyPrice: 14.99,
    yearlyPrice: 149.99,
    currency: 'USD',
    features: Object.freeze([
      {
        name: 'Everything in Premium',
        description: 'All premium features included.',
        included: true,
      },
      {
        name: '5 seats included',
        description: 'Add team members at $3/seat/month.',
        included: true,
      },
      {
        name: 'Shared group library',
        description: 'Reuse groups, merchants, and categories across members.',
        included: true,
      },
      {
        name: 'Advanced reporting + exports',
        description: 'CSV, PDF, and (coming soon) QuickBooks/Xero export.',
        included: true,
      },
      {
        name: '50 GB attachment storage',
        description: 'Store receipt photos and PDFs.',
        included: true,
      },
      {
        name: 'API access',
        description: 'Programmatic access to your data.',
        included: true,
      },
      {
        name: '1-year audit log retention',
        description: 'Compliance-grade audit trail.',
        included: true,
      },
      {
        name: 'SSO (SAML / OIDC)',
        description: 'Single sign-on for enterprise identity providers.',
        included: false,
      },
    ]),
    limits: Object.freeze({
      maxGroups: Number.POSITIVE_INFINITY,
      maxExpensesPerMonth: Number.POSITIVE_INFINITY,
      maxReceiptScansPerMonth: 500,
      maxStorageMb: 50 * 1024,
      apiAccess: true,
      advancedReporting: true,
      customBranding: false,
      ssoEnabled: false,
      auditLogRetentionDays: 365,
    }),
  }),
  enterprise: Object.freeze({
    tier: 'enterprise',
    name: 'Enterprise',
    description: 'For organisations with compliance and SSO requirements.',
    monthlyPrice: 49.99,
    yearlyPrice: 499.99,
    currency: 'USD',
    features: Object.freeze([
      {
        name: 'Everything in Team',
        description: 'All team features included.',
        included: true,
      },
      {
        name: 'SSO (SAML / OIDC)',
        description: 'Single sign-on for Okta, Azure AD, Google Workspace.',
        included: true,
      },
      {
        name: 'Custom branding',
        description: 'White-label the app with your logo and colors.',
        included: true,
      },
      {
        name: 'Unlimited attachment storage',
        description: 'No storage cap.',
        included: true,
      },
      {
        name: '7-year audit log retention',
        description: 'Compliance-grade audit trail (SOC 2 / GDPR).',
        included: true,
      },
      {
        name: 'Dedicated support + SLA',
        description: '24/7 support with 99.9% uptime SLA.',
        included: true,
      },
      {
        name: 'DPA + sub-processor list',
        description: 'Data Processing Agreement and published sub-processors.',
        included: true,
      },
    ]),
    limits: Object.freeze({
      maxGroups: Number.POSITIVE_INFINITY,
      maxExpensesPerMonth: Number.POSITIVE_INFINITY,
      maxReceiptScansPerMonth: Number.POSITIVE_INFINITY,
      maxStorageMb: Number.POSITIVE_INFINITY,
      apiAccess: true,
      advancedReporting: true,
      customBranding: true,
      ssoEnabled: true,
      auditLogRetentionDays: 365 * 7,
    }),
  }),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the plan for a given tier. Throws if the tier is unknown
 * (defensive — the type system should prevent this at compile time).
 */
export function getPlan(tier: PlanTier): Plan {
  const plan = PLANS[tier];
  if (!plan) {
    throw new Error(`Unknown plan tier: ${tier}`);
  }
  return plan;
}

/**
 * Compares two plans and returns the feature names that are added
 * (present in tier2 but not tier1) and removed (present in tier1
 * but not tier2) when upgrading from tier1 to tier2.
 *
 * A feature is "included" only when `included === true`.
 */
export function comparePlans(
  tier1: PlanTier,
  tier2: PlanTier,
): { added: readonly string[]; removed: readonly string[] } {
  const plan1 = getPlan(tier1);
  const plan2 = getPlan(tier2);

  const set1 = new Set(
    plan1.features.filter((f) => f.included).map((f) => f.name),
  );
  const set2 = new Set(
    plan2.features.filter((f) => f.included).map((f) => f.name),
  );

  const added: string[] = [];
  for (const name of set2) {
    if (!set1.has(name)) {
      added.push(name);
    }
  }
  const removed: string[] = [];
  for (const name of set1) {
    if (!set2.has(name)) {
      removed.push(name);
    }
  }

  return Object.freeze({
    added: Object.freeze(added.sort()),
    removed: Object.freeze(removed.sort()),
  });
}

/**
 * Returns the price for a given tier + billing cycle.
 *
 * For yearly, returns `yearlyPrice` (a single annual charge). For
 * monthly, returns `monthlyPrice`.
 */
export function getPrice(tier: PlanTier, cycle: BillingCycle): number {
  const plan = getPlan(tier);
  return cycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
}

/**
 * Returns the effective per-month price for a given tier + billing cycle.
 *
 * For yearly, divides the yearly price by 12 (so yearly plans look
 * cheaper, which is the point of offering them). For monthly, returns
 * the monthly price unchanged.
 *
 * Returns 0 for the free tier.
 */
export function getEffectiveMonthlyPrice(
  tier: PlanTier,
  cycle: BillingCycle,
): number {
  const plan = getPlan(tier);
  if (plan.monthlyPrice === 0 && plan.yearlyPrice === 0) {
    return 0;
  }
  if (cycle === 'yearly') {
    return Math.round((plan.yearlyPrice / 12) * 100) / 100;
  }
  return plan.monthlyPrice;
}
