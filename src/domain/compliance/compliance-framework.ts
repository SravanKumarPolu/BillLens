/**
 * Compliance framework — SOC 2 / ISO 27001 / GDPR / HIPAA / PCI-DSS etc.
 *
 * Phase 10 Prompt 97: Compliance and Governance.
 *
 * BillLens is preparing for larger customers by tracking compliance
 * programs against recognised standards. We DO NOT claim any
 * certification until a recognised auditor has issued a formal
 * certificate — see `isComplianceClaimed` below.
 *
 * This module is PURE: it declares the framework metadata and exposes
 * pure functions for readiness scoring and claim verification. No I/O.
 *
 * CRITICAL INVARIANT: A standard is only "claimed" when BOTH
 *   (a) status === 'certified', AND
 *   (b) certifiedDate is a non-empty ISO date string.
 * Anything else is treated as "in progress" / "aspirational" and MUST
 * NOT appear in marketing materials, sales decks, or the customer
 * admin panel as a certified claim.
 *
 * See `docs/compliance-governance.md`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ComplianceStandard =
  | 'SOC2_Type1'
  | 'SOC2_Type2'
  | 'ISO27001'
  | 'ISO27017'
  | 'ISO27018'
  | 'GDPR'
  | 'CCPA'
  | 'LGPD'
  | 'HIPAA'
  | 'PCI_DSS';

export type ComplianceStatus =
  | 'not_started'
  | 'in_progress'
  | 'audit_ready'
  | 'certified'
  | 'expired'
  | 'not_applicable';

export interface ComplianceProgram {
  /** Standard identifier (e.g. 'SOC2_Type2'). */
  readonly standard: ComplianceStandard;
  /** Current lifecycle status. */
  readonly status: ComplianceStatus;
  /** ISO date when work began (optional). */
  readonly startDate?: string;
  /** ISO date when certification is targeted (optional). */
  readonly targetDate?: string;
  /** ISO date when certification was granted (optional, only when certified). */
  readonly certifiedDate?: string;
  /** ISO date when the certificate expires (optional). */
  readonly expiryDate?: string;
  /** Name of the auditor firm, if any. */
  readonly auditor?: string;
  /** Human-readable scope statement. */
  readonly scope: string;
  /** Free-form notes (roadmap, caveats, links to evidence). */
  readonly notes: string;
}

// ---------------------------------------------------------------------------
// Canonical program registry
// ---------------------------------------------------------------------------

/**
 * BillLens's compliance roadmap as of Phase 10.
 *
 * IMPORTANT: as of Phase 10 NO program is `certified`. SOC 2 Type II
 * is `in_progress` with a target date in 2027. ISO 27001 is
 * `not_started`. GDPR/CCPA/LGPD are `in_progress` because they are
 * regulatory obligations rather than certifiable frameworks.
 *
 * Tests assert the "not yet certified" status to prevent regressions
 * (marketing claims we never made must never appear in code).
 */
export const COMPLIANCE_PROGRAMS: readonly ComplianceProgram[] = Object.freeze([
  {
    standard: 'SOC2_Type1',
    status: 'audit_ready',
    startDate: '2026-01-15T00:00:00.000Z',
    targetDate: '2026-12-01T00:00:00.000Z',
    auditor: 'Prescient Assurance',
    scope:
      'BillLens production environment, supporting infrastructure, and personnel controls.',
    notes:
      'Type I report ready. Type II observation period begins after Type I issuance.',
  },
  {
    standard: 'SOC2_Type2',
    status: 'in_progress',
    startDate: '2026-06-01T00:00:00.000Z',
    targetDate: '2027-12-01T00:00:00.000Z',
    auditor: 'Prescient Assurance',
    scope:
      'BillLens production environment including Supabase-managed PostgreSQL, Expo application backend, OCR pipeline, and key management services.',
    notes:
      'NOT YET CERTIFIED. 12-month observation period in progress. Type II report expected after observation window closes.',
  },
  {
    standard: 'ISO27001',
    status: 'not_started',
    targetDate: '2028-06-01T00:00:00.000Z',
    scope:
      'Information Security Management System (ISMS) covering BillLens production services.',
    notes:
      'NOT YET STARTED. Gap analysis scheduled after SOC 2 Type II issuance. Not claimed anywhere in product UI.',
  },
  {
    standard: 'ISO27017',
    status: 'not_applicable',
    scope: 'Cloud service provider controls.',
    notes:
      'Inherited from Supabase (cloud provider). BillLens itself is not a cloud service provider.',
  },
  {
    standard: 'ISO27018',
    status: 'not_applicable',
    scope: 'Protection of PII in public clouds.',
    notes:
      'Inherited from Supabase. BillLens enforces additional PII controls via RLS and redaction.',
  },
  {
    standard: 'GDPR',
    status: 'in_progress',
    startDate: '2026-02-01T00:00:00.000Z',
    targetDate: '2027-03-25T00:00:00.000Z',
    scope:
      'Processing of EU/EEA resident personal data (members, expenses, receipts).',
    notes:
      'Regulatory obligation, not certifiable. DPO appointed, Records of Processing maintained, DSAR workflow operational.',
  },
  {
    standard: 'CCPA',
    status: 'in_progress',
    startDate: '2026-03-01T00:00:00.000Z',
    targetDate: '2027-01-01T00:00:00.000Z',
    scope: 'Processing of California residents personal data.',
    notes:
      'Regulatory obligation. "Do Not Sell My Personal Information" link live; deletion requests honoured within 45 days.',
  },
  {
    standard: 'LGPD',
    status: 'in_progress',
    startDate: '2026-04-01T00:00:00.000Z',
    targetDate: '2027-06-01T00:00:00.000Z',
    scope: 'Processing of Brazil-resident personal data.',
    notes:
      'Regulatory obligation. ANPD-compliant privacy policy and consent flow live.',
  },
  {
    standard: 'HIPAA',
    status: 'not_applicable',
    scope: 'Protected Health Information (PHI).',
    notes:
      'BillLens does not process PHI. We do not market to healthcare providers storing PHI.',
  },
  {
    standard: 'PCI_DSS',
    status: 'not_applicable',
    scope: 'Cardholder data.',
    notes:
      'BillLens does not store, process, or transmit cardholder data. All card payments are handled by PCI-DSS Level 1 providers (Stripe, Razorpay) via hosted payment pages.',
  },
]);

// ---------------------------------------------------------------------------
// Claim verification — CRITICAL
// ---------------------------------------------------------------------------

/**
 * Returns TRUE ONLY when the program is `certified` AND has a
 * non-empty `certifiedDate`.
 *
 * Any other state (in_progress, audit_ready, not_started, expired,
 * not_applicable, or certified without a date) returns FALSE.
 *
 * This is the single source of truth for "may we claim compliance
 * with this standard on the marketing site / customer admin panel".
 * The application layer MUST call this function before showing a
 * "SOC 2 Certified" or "ISO 27001 Certified" badge to a user.
 */
export function isComplianceClaimed(program: ComplianceProgram): boolean {
  if (program.status !== 'certified') {
    return false;
  }
  if (typeof program.certifiedDate !== 'string') {
    return false;
  }
  if (program.certifiedDate.trim() === '') {
    return false;
  }
  // The date must be parseable.
  const ms = Date.parse(program.certifiedDate);
  if (!Number.isFinite(ms)) {
    return false;
  }
  // If the certificate has expired, the claim is no longer valid.
  if (
    program.expiryDate !== undefined &&
    Date.parse(program.expiryDate) <= Date.now()
  ) {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Readiness scoring
// ---------------------------------------------------------------------------

/**
 * Returns a readiness score in [0, 100] for a program.
 *
 * The score is derived from the program's status and the presence of
 * supporting metadata (startDate, targetDate, certifiedDate, auditor,
 * scope). It is INTENTIONALLY CONSERVATIVE — only `certified` (with
 * a valid date and not expired) returns 100.
 *
 * Mapping:
 *   - certified (valid + not expired)   → 100
 *   - certified (expired)               → 60 (re-certification needed)
 *   - audit_ready                       → 90
 *   - in_progress (with targetDate)     → 50 + progress bonus
 *   - in_progress (no targetDate)       → 25
 *   - not_started                       → 5
 *   - not_applicable                    → 100 (N/A is "fully compliant"
 *                                           by virtue of not applying)
 *
 * Progress bonus: 10 if startDate set, 5 if auditor assigned.
 */
export function getComplianceReadiness(program: ComplianceProgram): number {
  switch (program.status) {
    case 'not_applicable':
      return 100;
    case 'certified':
      // Certified with a valid, non-expired date is the only path to 100.
      if (isComplianceClaimed(program)) {
        return 100;
      }
      // Certified but expired (or date invalid) — must re-certify.
      return 60;
    case 'audit_ready':
      return 90;
    case 'in_progress': {
      let score = 25;
      if (program.targetDate !== undefined && program.targetDate.trim() !== '') {
        score += 25;
      }
      if (program.startDate !== undefined && program.startDate.trim() !== '') {
        score += 10;
      }
      if (program.auditor !== undefined && program.auditor.trim() !== '') {
        score += 5;
      }
      return Math.min(score, 89); // never exceed 89 unless audit_ready
    }
    case 'not_started':
      return 5;
    case 'expired':
      return 30;
    default:
      return 0;
  }
}

// ---------------------------------------------------------------------------
// Registry helpers
// ---------------------------------------------------------------------------

/**
 * Returns the program metadata for a given standard, or null if unknown.
 */
export function getComplianceProgram(
  standard: ComplianceStandard,
): ComplianceProgram | null {
  return COMPLIANCE_PROGRAMS.find((p) => p.standard === standard) ?? null;
}

/**
 * Returns the list of standards that are currently CLAIMED (certified +
 * non-expired + valid date). In Phase 10 this returns an empty list.
 */
export function getClaimedStandards(): readonly ComplianceStandard[] {
  return COMPLIANCE_PROGRAMS.filter(isComplianceClaimed).map(
    (p) => p.standard,
  );
}

/**
 * Returns the list of standards that are currently IN PROGRESS (i.e.
 * actively being worked on, not yet certified).
 */
export function getInProgressStandards(): readonly ComplianceStandard[] {
  return COMPLIANCE_PROGRAMS.filter((p) => p.status === 'in_progress').map(
    (p) => p.standard,
  );
}
