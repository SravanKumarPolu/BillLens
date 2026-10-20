/**
 * Penetration test framework.
 *
 * Models the lifecycle of penetration tests and their findings. Tracks
 * four test types (authenticated, unauthenticated, internal, external)
 * and four finding lifecycle states (open → in_progress → resolved →
 * accepted_risk).
 *
 * `computeRiskScore()` returns a 0..100 score combining finding
 * severity + finding count, used to prioritise remediation work.
 *
 * This module is a PURE function library: no I/O, no globals.
 *
 * See `docs/security-maintenance.md` and `docs/privacy-and-trust.md`.
 */

// ---------------------------------------------------------------------------
// Test types
// ---------------------------------------------------------------------------

export type PenetrationTestType =
  | 'authenticated'
  | 'unauthenticated'
  | 'internal'
  | 'external';

export const PENETRATION_TEST_TYPES: readonly PenetrationTestType[] = [
  'authenticated',
  'unauthenticated',
  'internal',
  'external',
] as const;

export function isPenetrationTestType(value: unknown): value is PenetrationTestType {
  return (
    typeof value === 'string' &&
    (PENETRATION_TEST_TYPES as readonly string[]).includes(value)
  );
}

// ---------------------------------------------------------------------------
// Finding severity + lifecycle
// ---------------------------------------------------------------------------

export type FindingSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export const FINDING_SEVERITIES: readonly FindingSeverity[] = [
  'info',
  'low',
  'medium',
  'high',
  'critical',
] as const;

export function isFindingSeverity(value: unknown): value is FindingSeverity {
  return (
    typeof value === 'string' &&
    (FINDING_SEVERITIES as readonly string[]).includes(value)
  );
}

export type FindingStatus =
  | 'open'
  | 'in_progress'
  | 'resolved'
  | 'accepted_risk';

export const FINDING_STATUSES: readonly FindingStatus[] = [
  'open',
  'in_progress',
  'resolved',
  'accepted_risk',
] as const;

export function isFindingStatus(value: unknown): value is FindingStatus {
  return (
    typeof value === 'string' &&
    (FINDING_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Allowed status transitions.
 *
 *   open → in_progress | resolved | accepted_risk
 *   in_progress → resolved | accepted_risk
 *   resolved → (terminal)
 *   accepted_risk → open   (a re-open path for accepted-risk findings
 *                            that later need remediation)
 */
export const ALLOWED_FINDING_TRANSITIONS: Readonly<Record<FindingStatus, readonly FindingStatus[]>> = Object.freeze({
  open: ['in_progress', 'resolved', 'accepted_risk'],
  in_progress: ['resolved', 'accepted_risk'],
  resolved: [],
  accepted_risk: ['open'],
});

export function canTransitionFinding(from: FindingStatus, to: FindingStatus): boolean {
  const allowed = ALLOWED_FINDING_TRANSITIONS[from];
  return allowed !== undefined && (allowed as readonly string[]).includes(to);
}

/**
 * Numeric weight per severity, used by `computeRiskScore`. The curve is
 * log-ish so a single critical finding outweighs many low findings.
 */
export const FINDING_SEVERITY_WEIGHT: Readonly<Record<FindingSeverity, number>> = Object.freeze({
  info: 0,
  low: 1,
  medium: 5,
  high: 25,
  critical: 50,
});

// ---------------------------------------------------------------------------
// Finding entity
// ---------------------------------------------------------------------------

export interface PenetrationFinding {
  /** Stable identifier (UUID). */
  readonly id: string;
  /** Test that produced the finding. */
  readonly testId: string;
  /** Severity bucket. */
  readonly severity: FindingSeverity;
  /** Lifecycle status. */
  readonly status: FindingStatus;
  /** Short title (no PII). */
  readonly title: string;
  /** Detailed description (no PII). */
  readonly description: string;
  /** ISO date-time the finding was reported. */
  readonly reportedAt: string;
  /** ISO date-time the finding was resolved, or null. */
  readonly resolvedAt: string | null;
  /** Recommended remediation (no PII). */
  readonly remediation: string | null;
  /** CVSS v3 score (0..10), if known. */
  readonly cvss?: number;
}

export interface PenetrationFindingInput {
  readonly id: string;
  readonly testId: string;
  readonly severity: FindingSeverity;
  readonly status?: FindingStatus;
  readonly title: string;
  readonly description: string;
  readonly reportedAt: string;
  readonly resolvedAt?: string | null;
  readonly remediation?: string | null;
  readonly cvss?: number;
}

export function createFinding(input: PenetrationFindingInput): PenetrationFinding {
  if (input.id.trim().length === 0) throw new Error('Finding id must not be empty');
  if (input.testId.trim().length === 0) throw new Error('Finding testId must not be empty');
  if (!isFindingSeverity(input.severity)) {
    throw new Error(`Unknown severity: ${input.severity}`);
  }
  const status: FindingStatus = input.status ?? 'open';
  if (!isFindingStatus(status)) {
    throw new Error(`Unknown status: ${status}`);
  }
  if (input.title.trim().length === 0) throw new Error('Finding title must not be empty');
  if (Number.isNaN(Date.parse(input.reportedAt))) {
    throw new Error('reportedAt must be a valid ISO date-time');
  }
  if (status === 'resolved' && input.resolvedAt === undefined) {
    throw new Error('Resolved findings require a resolvedAt date');
  }
  if (input.cvss !== undefined) {
    if (!Number.isFinite(input.cvss) || input.cvss < 0 || input.cvss > 10) {
      throw new Error(`cvss must be in [0, 10], got ${input.cvss}`);
    }
  }
  return Object.freeze({
    id: input.id,
    testId: input.testId,
    severity: input.severity,
    status,
    title: input.title,
    description: input.description,
    reportedAt: input.reportedAt,
    resolvedAt: input.resolvedAt ?? null,
    remediation: input.remediation ?? null,
    ...(input.cvss !== undefined ? { cvss: input.cvss } : {}),
  });
}

/**
 * Transition a finding to a new status. Returns a NEW finding object;
 * never mutates the input.
 */
export function transitionFinding(
  finding: PenetrationFinding,
  to: FindingStatus,
  resolvedAt?: string,
): PenetrationFinding {
  if (!canTransitionFinding(finding.status, to)) {
    throw new Error(`Illegal finding transition: ${finding.status} → ${to}`);
  }
  const next: PenetrationFinding = {
    ...finding,
    status: to,
    resolvedAt: to === 'resolved'
      ? (resolvedAt ?? new Date().toISOString())
      : (to === 'open' ? null : finding.resolvedAt),
  };
  if (to === 'resolved' && next.resolvedAt === null) {
    throw new Error('Resolved findings require a resolvedAt date');
  }
  return Object.freeze(next);
}

// ---------------------------------------------------------------------------
// Penetration test
// ---------------------------------------------------------------------------

export interface PenetrationTest {
  readonly id: string;
  readonly type: PenetrationTestType;
  /** ISO date-time the test started. */
  readonly startedAt: string;
  /** ISO date-time the test ended, or null if ongoing. */
  readonly endedAt: string | null;
  /** Tester name / vendor (no PII). */
  readonly performedBy: string;
  /** Scope description (no PII). */
  readonly scope: string;
}

export interface PenetrationTestInput {
  readonly id: string;
  readonly type: PenetrationTestType;
  readonly startedAt: string;
  readonly endedAt?: string | null;
  readonly performedBy: string;
  readonly scope: string;
}

export function createPenetrationTest(input: PenetrationTestInput): PenetrationTest {
  if (input.id.trim().length === 0) throw new Error('Test id must not be empty');
  if (!isPenetrationTestType(input.type)) {
    throw new Error(`Unknown test type: ${input.type}`);
  }
  if (Number.isNaN(Date.parse(input.startedAt))) {
    throw new Error('startedAt must be a valid ISO date-time');
  }
  if (input.endedAt !== undefined && input.endedAt !== null) {
    if (Number.isNaN(Date.parse(input.endedAt))) {
      throw new Error('endedAt must be a valid ISO date-time or null');
    }
    if (Date.parse(input.endedAt) < Date.parse(input.startedAt)) {
      throw new Error('endedAt must not precede startedAt');
    }
  }
  if (input.performedBy.trim().length === 0) {
    throw new Error('performedBy must not be empty');
  }
  return Object.freeze({
    id: input.id,
    type: input.type,
    startedAt: input.startedAt,
    endedAt: input.endedAt ?? null,
    performedBy: input.performedBy,
    scope: input.scope,
  });
}

// ---------------------------------------------------------------------------
// Risk score computation
// ---------------------------------------------------------------------------

/**
 * Compute a 0..100 risk score from a set of findings.
 *
 * The score combines:
 *   - The sum of severity weights for UNRESOLVED findings (open /
 *     in_progress / accepted_risk). Resolved findings do NOT contribute.
 *   - A count multiplier: every 10 unresolved findings adds +5 to the
 *     score (capped at +20). This rewards consolidating findings into
 *     a single root-cause remediation.
 *
 * The result is clamped to [0, 100]. A single critical finding
 * contributes 50, two criticals contribute 100 (clamped).
 *
 * `accepted_risk` findings count toward the score — accepting a risk
 * does not eliminate it from the risk surface. This is deliberate: the
 * dashboard should always reflect the TRUE risk posture.
 */
export function computeRiskScore(findings: readonly PenetrationFinding[]): number {
  let weightSum = 0;
  let unresolvedCount = 0;
  for (const f of findings) {
    if (f.status === 'resolved') continue;
    weightSum += FINDING_SEVERITY_WEIGHT[f.severity];
    unresolvedCount += 1;
  }
  const countBonus = Math.min(20, Math.floor(unresolvedCount / 10) * 5);
  const raw = weightSum + countBonus;
  return Math.max(0, Math.min(100, raw));
}

/**
 * Returns a human-readable risk band for a 0..100 score.
 *
 *   0..19   → low
 *   20..49  → medium
 *   50..79  → high
 *   80..100 → critical
 */
export function riskScoreBand(score: number): 'low' | 'medium' | 'high' | 'critical' {
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    throw new Error(`score must be in [0, 100], got ${score}`);
  }
  if (score >= 80) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 20) return 'medium';
  return 'low';
}

/**
 * Returns the count of findings in each status bucket.
 */
export function summarizeFindingStatuses(
  findings: readonly PenetrationFinding[],
): Readonly<Record<FindingStatus, number>> {
  const out: Record<FindingStatus, number> = {
    open: 0,
    in_progress: 0,
    resolved: 0,
    accepted_risk: 0,
  };
  for (const f of findings) {
    out[f.status] += 1;
  }
  return Object.freeze(out);
}

/**
 * Returns the count of findings in each severity bucket.
 */
export function summarizeFindingSeverities(
  findings: readonly PenetrationFinding[],
): Readonly<Record<FindingSeverity, number>> {
  const out: Record<FindingSeverity, number> = {
    info: 0,
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };
  for (const f of findings) {
    out[f.severity] += 1;
  }
  return Object.freeze(out);
}
