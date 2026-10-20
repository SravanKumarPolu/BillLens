/**
 * Policy document model — security, data retention, incident response, etc.
 *
 * Phase 10 Prompt 97: Compliance and Governance.
 *
 * Policies are versioned documents that must be reviewed on a regular
 * cadence (typically annually, or after a major incident). This module
 * tracks the policy metadata and computes "due for review" status.
 *
 * This module is PURE: it operates on policy metadata. The document
 * content itself is opaque (a string) — the application layer is
 * responsible for rendering, version control, and approval workflow.
 *
 * See `docs/compliance-governance.md`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PolicyType =
  | 'security'
  | 'data_retention'
  | 'incident_response'
  | 'access_control'
  | 'password'
  | 'encryption'
  | 'backup'
  | 'vendor_management'
  | 'acceptable_use'
  | 'privacy';

export type PolicyStatus = 'draft' | 'active' | 'under_review' | 'retired';

export interface PolicyDocument {
  /** Stable unique identifier. */
  readonly id: string;
  /** Policy category. */
  readonly type: PolicyType;
  /** Semantic version (e.g. '1.2.0'). */
  readonly version: string;
  /** Human-readable title. */
  readonly title: string;
  /** Full document content (Markdown or HTML — caller decides). */
  readonly content: string;
  /** ISO date the policy became effective. */
  readonly effectiveDate: string;
  /** ISO date by which the policy must next be reviewed. */
  readonly reviewDate: string;
  /** User ID of the approver (must have policy-approve permission). */
  readonly approvedBy: string;
  /** Current lifecycle status. */
  readonly status: PolicyStatus;
}

// ---------------------------------------------------------------------------
// Review scheduling
// ---------------------------------------------------------------------------

/**
 * Returns true when the policy is due for review as of `now`.
 *
 * A policy is "due for review" when:
 *   - status === 'active' (draft/retired policies don't need review)
 *   - reviewDate is in the past OR within the next 30 days
 *
 * The 30-day early-warning window gives the policy owner time to
 * schedule the review before it formally lapses.
 */
export function isPolicyDueForReview(
  policy: PolicyDocument,
  now: string,
): boolean {
  if (policy.status !== 'active') {
    return false;
  }
  const nowMs = parseStrict(now);
  const reviewMs = parseStrict(policy.reviewDate);
  if (nowMs === null || reviewMs === null) {
    return false;
  }
  const msPerDay = 24 * 60 * 60 * 1000;
  const thirtyDays = 30 * msPerDay;
  // Due if review date is within 30 days (i.e. now is within 30 days of review)
  // OR already past.
  return reviewMs - nowMs <= thirtyDays;
}

/**
 * Returns the list of policies with status 'active'.
 *
 * Draft, under_review, and retired policies are excluded.
 */
export function getActivePolicies(
  policies: readonly PolicyDocument[],
): readonly PolicyDocument[] {
  return policies.filter((p) => p.status === 'active');
}

/**
 * Returns the list of active policies that are due for review as of `now`,
 * sorted by reviewDate ascending (most urgent first).
 */
export function getPoliciesDueForReview(
  policies: readonly PolicyDocument[],
  now: string,
): readonly PolicyDocument[] {
  return getActivePolicies(policies)
    .filter((p) => isPolicyDueForReview(p, now))
    .sort((a, b) => {
      const aMs = parseStrict(a.reviewDate) ?? 0;
      const bMs = parseStrict(b.reviewDate) ?? 0;
      return aMs - bMs;
    });
}

/**
 * Returns the latest policy of a given type (highest semantic version,
 * preferring 'active' over 'under_review' over 'draft' over 'retired').
 *
 * Returns null when no policy of the given type exists.
 */
export function getLatestPolicyOfType(
  policies: readonly PolicyDocument[],
  type: PolicyType,
): PolicyDocument | null {
  const matching = policies.filter((p) => p.type === type);
  if (matching.length === 0) {
    return null;
  }
  const statusRank: Record<PolicyStatus, number> = {
    active: 0,
    under_review: 1,
    draft: 2,
    retired: 3,
  };
  return matching.slice().sort((a, b) => {
    const statusDiff = statusRank[a.status] - statusRank[b.status];
    if (statusDiff !== 0) {
      return statusDiff;
    }
    // Same status — compare semantic versions descending.
    return compareSemanticVersions(b.version, a.version);
  })[0] ?? null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function parseStrict(iso: string): number | null {
  if (typeof iso !== 'string' || iso.trim() === '') {
    return null;
  }
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Compares two semantic versions. Returns negative if a < b, positive
 * if a > b, 0 if equal. Missing parts are treated as 0.
 */
function compareSemanticVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const av = pa[i] ?? 0;
    const bv = pb[i] ?? 0;
    if (av !== bv) {
      return av - bv;
    }
  }
  return 0;
}
