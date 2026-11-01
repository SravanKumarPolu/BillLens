/**
 * Vendor risk management — third-party vendor inventory and DPIA tracking.
 *
 * Phase 10 Prompt 97: Compliance and Governance.
 *
 * Every SaaS, infrastructure provider, and integration partner that
 * touches BillLens data is tracked here with a risk level and a
 * Data Protection Impact Assessment (DPIA) status. High-risk vendors
 * (those with extensive/full data access) MUST have a completed DPIA
 * before they are approved.
 *
 * This module is PURE: it computes risk from vendor metadata. No I/O.
 *
 * See `docs/compliance-governance.md`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VendorRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type VendorDataAccess = 'none' | 'limited' | 'extensive' | 'full';

export interface Vendor {
  /** Stable unique identifier. */
  readonly id: string;
  /** Vendor display name (e.g. 'Supabase'). */
  readonly name: string;
  /** Service category (e.g. 'Supabase', 'OCR Provider', 'Push Notifications'). */
  readonly service: string;
  /** Risk tier currently assigned to this vendor. */
  readonly riskLevel: VendorRiskLevel;
  /** Degree of access to BillLens data. */
  readonly dataAccess: VendorDataAccess;
  /** Whether a Data Protection Impact Assessment has been completed. */
  readonly dpiaCompleted: boolean;
  /** ISO date the DPIA was completed (optional, only when dpiaCompleted). */
  readonly dpiaDate?: string;
  /** ISO date the contract expires (optional). */
  readonly contractExpiresAt?: string;
  /** Link to the vendor's SOC 2 report (optional). */
  readonly soc2Report?: string;
  /** Whether the vendor holds ISO 27001 certification. */
  readonly iso27001?: boolean;
}

// ---------------------------------------------------------------------------
// Risk assessment
// ---------------------------------------------------------------------------

/**
 * Assesses a vendor's risk level from its data access + service type.
 *
 * The baseline risk is derived from `dataAccess`:
 *   - none      → 'low'
 *   - limited   → 'medium'
 *   - extensive → 'high'
 *   - full      → 'critical'
 *
 * The assessment can be OVERRIDDEN by the vendor's declared `riskLevel`
 * ONLY when the declared level is HIGHER than the computed baseline.
 * (We never silently downgrade risk; auditors must explicitly reduce it
 * via a formal risk acceptance.)
 *
 * A vendor with `dataAccess='full'` and `riskLevel='medium'` will be
 * assessed as 'high' (the computed baseline wins over an under-declared
 * level).
 */
export function assessVendorRisk(vendor: Vendor): VendorRiskLevel {
  const baseline: VendorDataAccessToRisk = {
    none: 'low',
    limited: 'medium',
    extensive: 'high',
    full: 'critical',
  };
  const computed = baseline[vendor.dataAccess];

  // If declared risk is higher than computed, honour the declaration.
  if (riskRank(vendor.riskLevel) > riskRank(computed)) {
    return vendor.riskLevel;
  }
  return computed;
}

/**
 * Returns the list of vendors assessed as 'high' or 'critical' risk.
 *
 * These are the vendors that require DPIA, quarterly review, and
 * security monitoring.
 */
export function getHighRiskVendors(
  vendors: readonly Vendor[],
): readonly Vendor[] {
  return vendors.filter((v) => {
    const level = assessVendorRisk(v);
    return level === 'high' || level === 'critical';
  });
}

/**
 * Returns true when a DPIA is required for this vendor.
 *
 * A DPIA is required when the vendor has 'extensive' or 'full' data
 * access — i.e. when a breach or misuse could meaningfully harm users.
 *
 * Vendors with 'none' or 'limited' data access do not require a DPIA
 * (though we may still complete one voluntarily).
 */
export function isDpiaRequired(vendor: Vendor): boolean {
  return (
    vendor.dataAccess === 'extensive' || vendor.dataAccess === 'full'
  );
}

/**
 * Returns true when a DPIA is required AND has not yet been completed.
 *
 * This is the list of vendors that are BLOCKING new customer onboarding
 * until the DPIA is finished.
 */
export function getDpiaGaps(
  vendors: readonly Vendor[],
): readonly Vendor[] {
  return vendors.filter((v) => isDpiaRequired(v) && !v.dpiaCompleted);
}

/**
 * Returns true when the vendor's contract is expiring within `days` days
 * of `now`. Returns false when no contract expiry is recorded.
 */
export function isContractExpiringSoon(
  vendor: Vendor,
  days: number,
  now: string,
): boolean {
  if (vendor.contractExpiresAt === undefined) {
    return false;
  }
  const nowMs = parseStrict(now);
  const expMs = parseStrict(vendor.contractExpiresAt);
  if (nowMs === null || expMs === null) {
    return false;
  }
  if (expMs < nowMs) {
    return false; // already expired — that's a different alert
  }
  const msPerDay = 24 * 60 * 60 * 1000;
  return expMs - nowMs <= days * msPerDay;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type VendorDataAccessToRisk = Readonly<Record<VendorDataAccess, VendorRiskLevel>>;

function riskRank(level: VendorRiskLevel): number {
  switch (level) {
    case 'low':
      return 0;
    case 'medium':
      return 1;
    case 'high':
      return 2;
    case 'critical':
      return 3;
    default:
      return 0;
  }
}

function parseStrict(iso: string): number | null {
  if (typeof iso !== 'string' || iso.trim() === '') {
    return null;
  }
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}
