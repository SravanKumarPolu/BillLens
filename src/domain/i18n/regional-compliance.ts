/**
 * Regional compliance requirements.
 *
 * Phase 10 Prompt 93: International Expansion.
 *
 * Defines per-region compliance requirements (GDPR, CCPA, GST, etc.)
 * that BillLens must satisfy. Each requirement is mandatory by
 * default — non-mandatory items are advisory.
 *
 * This module is PURE and READ-ONLY.
 *
 * See `docs/international-expansion.md`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ComplianceRequirement {
  /** Region code: 'IN', 'EU', 'US', 'BR', 'CN', 'JP', etc. */
  readonly region: string;
  /** Stable identifier (e.g. 'GDPR_CONSENT'). */
  readonly requirement: string;
  /** Human-readable description. */
  readonly description: string;
  /** Mandatory requirements MUST be met before launch in this region. */
  readonly mandatory: boolean;
}

// ---------------------------------------------------------------------------
// Compliance requirements registry
// ---------------------------------------------------------------------------

export const COMPLIANCE_REQUIREMENTS: readonly ComplianceRequirement[] =
  Object.freeze([
    {
      region: 'IN',
      requirement: 'GST_DISPLAY',
      description: 'GST registration number must be displayed on invoices above ₹5000',
      mandatory: true,
    },
    {
      region: 'IN',
      requirement: 'DPDP_CONSENT',
      description: 'Digital Personal Data Protection Act consent required before data processing',
      mandatory: true,
    },
    {
      region: 'IN',
      requirement: 'UPI_COMPLIANCE',
      description: 'UPI payments must comply with NPCI guidelines and use approved PSPs',
      mandatory: true,
    },
    {
      region: 'EU',
      requirement: 'GDPR_CONSENT',
      description: 'Explicit consent required for data processing',
      mandatory: true,
    },
    {
      region: 'EU',
      requirement: 'GDPR_RIGHT_TO_ERASURE',
      description: 'Users can request deletion of their personal data within 30 days',
      mandatory: true,
    },
    {
      region: 'EU',
      requirement: 'GDPR_DATA_PORTABILITY',
      description: 'Users can export their data in a machine-readable format',
      mandatory: true,
    },
    {
      region: 'EU',
      requirement: 'VAT_MOSS',
      description: 'VAT on digital services must be collected at the consumer\'s location rate',
      mandatory: false,
    },
    {
      region: 'US',
      requirement: 'CCPA_NOTICE',
      description: 'California Consumer Privacy Act notice required for California residents',
      mandatory: true,
    },
    {
      region: 'US',
      requirement: 'PCI_DSS',
      description: 'Payment Card Industry Data Security Standard compliance for card data',
      mandatory: true,
    },
    {
      region: 'US',
      requirement: 'STATE_TAX_DISPLAY',
      description: 'Sales tax must be displayed at checkout based on user\'s state',
      mandatory: false,
    },
    {
      region: 'BR',
      requirement: 'LGPD_CONSENT',
      description: 'Brazilian General Data Protection Law consent required',
      mandatory: true,
    },
    {
      region: 'BR',
      requirement: 'PIX_COMPLIANCE',
      description: 'Pix payments must comply with Banco Central do Brasil regulations',
      mandatory: true,
    },
    {
      region: 'CN',
      requirement: 'PIPL_CONSENT',
      description: 'Personal Information Protection Law consent required before processing',
      mandatory: true,
    },
    {
      region: 'CN',
      requirement: 'PIPL_CROSS_BORDER',
      description: 'Cross-border data transfer requires government security assessment',
      mandatory: true,
    },
    {
      region: 'JP',
      requirement: 'APPI_CONSENT',
      description: 'Act on Protection of Personal Information consent required',
      mandatory: true,
    },
    {
      region: 'JP',
      requirement: 'CONSUMPTION_TAX_DISPLAY',
      description: 'Consumption tax (10% standard, 8% reduced) must be displayed on invoices',
      mandatory: true,
    },
    {
      region: 'KR',
      requirement: 'PIPC_CONSENT',
      description: 'Personal Information Protection Commission consent required',
      mandatory: true,
    },
    {
      region: 'ID',
      requirement: 'PDP_LAW_CONSENT',
      description: 'Indonesian Personal Data Protection Law consent required',
      mandatory: true,
    },
    {
      region: 'TH',
      requirement: 'PDPA_CONSENT',
      description: 'Thailand Personal Data Protection Act consent required',
      mandatory: true,
    },
    {
      region: 'VN',
      requirement: 'PDPD_CONSENT',
      description: 'Vietnam Personal Data Protection Decree consent required',
      mandatory: true,
    },
    {
      region: 'AU',
      requirement: 'PRIVACY_ACT_CONSENT',
      description: 'Australian Privacy Act 1988 consent required',
      mandatory: true,
    },
    {
      region: 'CA',
      requirement: 'PIPEDA_CONSENT',
      description: 'Personal Information Protection and Electronic Documents Act consent required',
      mandatory: true,
    },
    {
      region: 'SA',
      requirement: 'PCI_DSS',
      description: 'Payment Card Industry Data Security Standard compliance for card data',
      mandatory: true,
    },
  ]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the compliance requirements for a given region (country
 * code or 'EU' for the European Union). Returns an empty list when
 * the region has no requirements registered.
 *
 * Case-insensitive: 'in' and 'IN' both match.
 */
export function getComplianceForRegion(
  region: string,
): readonly ComplianceRequirement[] {
  if (!region || typeof region !== 'string') {
    return [];
  }
  const upper = region.toUpperCase();
  return COMPLIANCE_REQUIREMENTS.filter((r) => r.region === upper);
}

/**
 * Returns the list of MANDATORY compliance requirements for a region.
 */
export function getMandatoryComplianceForRegion(
  region: string,
): readonly ComplianceRequirement[] {
  return getComplianceForRegion(region).filter((r) => r.mandatory);
}

/**
 * Returns true when the region has any mandatory compliance requirement.
 */
export function hasMandatoryCompliance(region: string): boolean {
  return getMandatoryComplianceForRegion(region).length > 0;
}

/**
 * Returns the list of unique regions registered.
 */
export function getRegisteredRegions(): readonly string[] {
  const set = new Set<string>();
  for (const r of COMPLIANCE_REQUIREMENTS) {
    set.add(r.region);
  }
  return Array.from(set).sort();
}
