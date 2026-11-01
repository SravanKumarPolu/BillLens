/**
 * Feature candidates for the product roadmap.
 *
 * 10 feature candidates are tracked here. Each candidate carries:
 *   - A stable feature key.
 *   - A user demand score (0..100).
 *   - An implementation effort estimate (in dev-days).
 *   - An estimated value (1..5 — relative business value).
 *   - A risk level (low / medium / high).
 *   - A list of prerequisite features (other feature keys).
 *
 * The 10 candidates were selected from internal brainstorming +
 * feedback analysis. Whether a candidate should actually be
 * implemented is decided by the `feature-validator.ts` module —
 * the validator pulls real usage data from the privacy-safe
 * analytics (Prompt 83) before approving.
 *
 * See `docs/product-roadmap.md`.
 */

// ---------------------------------------------------------------------------
// Feature keys (10)
// ---------------------------------------------------------------------------

export type FeatureKey =
  | 'recurring_expenses'
  | 'budget_tracking'
  | 'family_accounts'
  | 'business_workspaces'
  | 'ai_spending_insights'
  | 'multi_language_ocr'
  | 'shared_shopping_lists'
  | 'expense_forecasting'
  | 'calendar_integration'
  | 'accounting_exports';

export const FEATURE_CANDIDATE_KEYS: readonly FeatureKey[] = [
  'recurring_expenses',
  'budget_tracking',
  'family_accounts',
  'business_workspaces',
  'ai_spending_insights',
  'multi_language_ocr',
  'shared_shopping_lists',
  'expense_forecasting',
  'calendar_integration',
  'accounting_exports',
] as const;

export function isFeatureKey(value: unknown): value is FeatureKey {
  return (
    typeof value === 'string' &&
    (FEATURE_CANDIDATE_KEYS as readonly string[]).includes(value)
  );
}

// ---------------------------------------------------------------------------
// Effort + risk
// ---------------------------------------------------------------------------

export type ImplementationEffort =
  | 'small'    // < 5 dev-days
  | 'medium'   // 5..15 dev-days
  | 'large'    // 15..40 dev-days
  | 'xlarge';  // > 40 dev-days

export const IMPLEMENTATION_EFFORTS: readonly ImplementationEffort[] = [
  'small',
  'medium',
  'large',
  'xlarge',
] as const;

export function isImplementationEffort(value: unknown): value is ImplementationEffort {
  return (
    typeof value === 'string' &&
    (IMPLEMENTATION_EFFORTS as readonly string[]).includes(value)
  );
}

/**
 * Rough dev-day ranges per effort level. Used by the validator to
 * estimate the implementation cost when only the effort level is
 * known.
 */
export const EFFORT_DEV_DAY_RANGES: Readonly<Record<ImplementationEffort, readonly [number, number]>> = Object.freeze({
  small: [1, 5],
  medium: [5, 15],
  large: [15, 40],
  xlarge: [40, 120],
});

export type RiskLevel = 'low' | 'medium' | 'high';

export const RISK_LEVELS: readonly RiskLevel[] = ['low', 'medium', 'high'] as const;

export function isRiskLevel(value: unknown): value is RiskLevel {
  return (
    typeof value === 'string' &&
    (RISK_LEVELS as readonly string[]).includes(value)
  );
}

// ---------------------------------------------------------------------------
// Feature candidate entity
// ---------------------------------------------------------------------------

export interface FeatureCandidate {
  /** Stable feature key. */
  readonly key: FeatureKey;
  /** Human-readable name (no PII). */
  readonly name: string;
  /** Short description (no PII). */
  readonly description: string;
  /** User demand score (0..100). */
  readonly userDemandScore: number;
  /** Implementation effort estimate. */
  readonly implementationEffort: ImplementationEffort;
  /** Estimated value (1..5 — relative business value). */
  readonly estimatedValue: 1 | 2 | 3 | 4 | 5;
  /** Risk level. */
  readonly riskLevel: RiskLevel;
  /** Other feature keys that must ship first. */
  readonly prerequisites: readonly FeatureKey[];
}

export interface FeatureCandidateInput {
  readonly key: FeatureKey;
  readonly name: string;
  readonly description: string;
  readonly userDemandScore: number;
  readonly implementationEffort: ImplementationEffort;
  readonly estimatedValue: 1 | 2 | 3 | 4 | 5;
  readonly riskLevel: RiskLevel;
  readonly prerequisites?: readonly FeatureKey[];
}

export function createFeatureCandidate(input: FeatureCandidateInput): FeatureCandidate {
  if (!isFeatureKey(input.key)) {
    throw new Error(`Unknown feature key: ${input.key}`);
  }
  if (input.name.trim().length === 0) {
    throw new Error('Feature name must not be empty');
  }
  if (input.description.trim().length === 0) {
    throw new Error('Feature description must not be empty');
  }
  if (
    !Number.isInteger(input.userDemandScore) ||
    input.userDemandScore < 0 ||
    input.userDemandScore > 100
  ) {
    throw new Error(
      `userDemandScore must be an integer in [0, 100], got ${input.userDemandScore}`,
    );
  }
  if (!isImplementationEffort(input.implementationEffort)) {
    throw new Error(`Unknown implementation effort: ${input.implementationEffort}`);
  }
  if (![1, 2, 3, 4, 5].includes(input.estimatedValue)) {
    throw new Error(`estimatedValue must be 1..5, got ${input.estimatedValue}`);
  }
  if (!isRiskLevel(input.riskLevel)) {
    throw new Error(`Unknown risk level: ${input.riskLevel}`);
  }
  for (const pre of input.prerequisites ?? []) {
    if (!isFeatureKey(pre)) {
      throw new Error(`Unknown prerequisite feature key: ${pre}`);
    }
    if (pre === input.key) {
      throw new Error(`Feature ${input.key} cannot list itself as a prerequisite`);
    }
  }
  return Object.freeze({
    key: input.key,
    name: input.name,
    description: input.description,
    userDemandScore: input.userDemandScore,
    implementationEffort: input.implementationEffort,
    estimatedValue: input.estimatedValue,
    riskLevel: input.riskLevel,
    prerequisites: Object.freeze([...(input.prerequisites ?? [])]),
  });
}

// ---------------------------------------------------------------------------
// The 10 feature candidates
// ---------------------------------------------------------------------------

/**
 * The 10 feature candidates. Each entry was selected from internal
 * brainstorming + feedback analysis. The `userDemandScore` reflects
 * INITIAL demand — the feature validator overrides it with
 * real-usage evidence before approving.
 *
 * The estimated dev-days come from `EFFORT_DEV_DAY_RANGES`.
 */
export const FEATURE_CANDIDATES: readonly FeatureCandidate[] = Object.freeze([
  createFeatureCandidate({
    key: 'recurring_expenses',
    name: 'Recurring Expenses',
    description: 'Auto-create expenses on a schedule (rent, subscriptions).',
    userDemandScore: 65,
    implementationEffort: 'medium',
    estimatedValue: 4,
    riskLevel: 'low',
    prerequisites: [],
  }),
  createFeatureCandidate({
    key: 'budget_tracking',
    name: 'Budget Tracking',
    description: 'Set monthly budgets per category and track spend against them.',
    userDemandScore: 55,
    implementationEffort: 'large',
    estimatedValue: 4,
    riskLevel: 'medium',
    prerequisites: [],
  }),
  createFeatureCandidate({
    key: 'family_accounts',
    name: 'Family Accounts',
    description: 'Shared family group with role-based access for parents + children.',
    userDemandScore: 40,
    implementationEffort: 'large',
    estimatedValue: 3,
    riskLevel: 'medium',
    prerequisites: [],
  }),
  createFeatureCandidate({
    key: 'business_workspaces',
    name: 'Business Workspaces',
    description: 'Multi-tenant workspaces for small businesses with admin roles.',
    userDemandScore: 35,
    implementationEffort: 'xlarge',
    estimatedValue: 4,
    riskLevel: 'high',
    prerequisites: [],
  }),
  createFeatureCandidate({
    key: 'ai_spending_insights',
    name: 'AI Spending Insights',
    description: 'Auto-categorise expenses + surface spending trends via on-device ML.',
    userDemandScore: 60,
    implementationEffort: 'large',
    estimatedValue: 4,
    riskLevel: 'medium',
    prerequisites: ['budget_tracking'],
  }),
  createFeatureCandidate({
    key: 'multi_language_ocr',
    name: 'Multi-Language OCR',
    description: 'Extend OCR to support Hindi, Tamil, Bengali receipts (currently English-only).',
    userDemandScore: 50,
    implementationEffort: 'medium',
    estimatedValue: 3,
    riskLevel: 'medium',
    prerequisites: [],
  }),
  createFeatureCandidate({
    key: 'shared_shopping_lists',
    name: 'Shared Shopping Lists',
    description: 'Group-shared shopping lists that auto-convert to expenses on checkout.',
    userDemandScore: 45,
    implementationEffort: 'medium',
    estimatedValue: 3,
    riskLevel: 'low',
    prerequisites: [],
  }),
  createFeatureCandidate({
    key: 'expense_forecasting',
    name: 'Expense Forecasting',
    description: 'Forecast next month\'s spend based on historical patterns.',
    userDemandScore: 30,
    implementationEffort: 'large',
    estimatedValue: 3,
    riskLevel: 'medium',
    prerequisites: ['budget_tracking'],
  }),
  createFeatureCandidate({
    key: 'calendar_integration',
    name: 'Calendar Integration',
    description: 'Sync upcoming bills + settlements to the system calendar.',
    userDemandScore: 25,
    implementationEffort: 'small',
    estimatedValue: 2,
    riskLevel: 'low',
    prerequisites: ['recurring_expenses'],
  }),
  createFeatureCandidate({
    key: 'accounting_exports',
    name: 'Accounting Exports',
    description: 'Export expenses to CSV / XLSX / QuickBooks / Xero formats.',
    userDemandScore: 70,
    implementationEffort: 'medium',
    estimatedValue: 5,
    riskLevel: 'low',
    prerequisites: [],
  }),
]);

export const FEATURE_CANDIDATE_COUNT = FEATURE_CANDIDATES.length; // 10

/**
 * Look up a feature candidate by key. Returns undefined if not found.
 */
export function getFeatureCandidate(key: FeatureKey): FeatureCandidate | undefined {
  return FEATURE_CANDIDATES.find((c) => c.key === key);
}
