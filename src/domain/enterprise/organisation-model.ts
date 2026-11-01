/**
 * Organisation model — top-level enterprise tenant.
 *
 * Phase 10 Prompt 92: Enterprise Features.
 *
 * An Organisation is the root of the enterprise hierarchy:
 *   Organisation
 *     └─ Department (hierarchical, optional)
 *         └─ CostCentre
 *
 * OrgSettings carry policy defaults that downstream modules
 * (expense-policy, approval-workflow, spending-limits) consult.
 *
 * This module is PURE and READ-ONLY: types + factory only.
 *
 * See `docs/enterprise-features.md`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OrgPlan = 'free' | 'team' | 'enterprise';

export type DataResidency = 'us' | 'eu' | 'apac' | 'custom';

export interface OrgSettings {
  /** Expenses above this amount (in minor units) require a receipt. */
  readonly requireReceiptsAbove: number;
  readonly defaultCurrency: string;
  /** Expenses above this amount (in minor units) require approval. */
  readonly approvalThreshold: number;
  readonly ssoEnabled: boolean;
  readonly dataResidency: DataResidency;
}

export interface Organisation {
  readonly id: string;
  readonly name: string;
  readonly plan: OrgPlan;
  readonly seats: number;
  readonly createdAt: string;
  readonly settings: OrgSettings;
}

// ---------------------------------------------------------------------------
// Defaults + factory
// ---------------------------------------------------------------------------

export const DEFAULT_ORG_SETTINGS: Readonly<OrgSettings> = Object.freeze({
  requireReceiptsAbove: 5_000, // $50.00 in minor units
  defaultCurrency: 'USD',
  approvalThreshold: 25_000, // $250.00 in minor units
  ssoEnabled: false,
  dataResidency: 'us',
});

/**
 * Creates an Organisation with sensible defaults.
 *
 * The returned object is frozen. Caller supplies id, name, plan, seats,
 * createdAt; settings default to DEFAULT_ORG_SETTINGS but can be
 * overridden partially.
 */
export function createOrganisation(params: {
  readonly id: string;
  readonly name: string;
  readonly plan: OrgPlan;
  readonly seats: number;
  readonly createdAt: string;
  readonly settings?: Partial<OrgSettings>;
}): Organisation {
  if (!params.id || params.id.length === 0) {
    throw new Error('createOrganisation: id is required');
  }
  if (!params.name || params.name.length === 0) {
    throw new Error('createOrganisation: name is required');
  }
  if (params.seats < 0) {
    throw new Error('createOrganisation: seats must be >= 0');
  }
  const settings: OrgSettings = Object.freeze({
    ...DEFAULT_ORG_SETTINGS,
    ...params.settings,
  });
  return Object.freeze({
    id: params.id,
    name: params.name,
    plan: params.plan,
    seats: params.seats,
    createdAt: params.createdAt,
    settings,
  });
}

/**
 * Returns true when the org plan is 'enterprise' (highest tier).
 */
export function isEnterpriseOrg(org: Organisation): boolean {
  return org.plan === 'enterprise';
}

/**
 * Returns true when the org plan is 'team' or 'enterprise' (paid).
 */
export function isPaidOrg(org: Organisation): boolean {
  return org.plan === 'team' || org.plan === 'enterprise';
}
