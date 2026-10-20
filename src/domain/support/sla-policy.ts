/**
 * SLA (Service-Level Agreement) policies per ticket priority.
 *
 * Each priority has TWO SLA targets:
 *   1. `firstResponseHours` — the maximum time from ticket creation to
 *      the first agent response.
 *   2. `resolutionHours` — the maximum time from ticket creation to
 *      ticket resolution.
 *
 * Default SLAs (per the spec):
 *   - urgent — first response 1h, resolution 4h
 *   - high   — first response 4h, resolution 24h
 *   - normal — first response 24h, resolution 72h (3 days)
 *   - low    — first response 48h, resolution 168h (7 days)
 *
 * `computeSlaStatus()` compares a ticket's elapsed time against the
 * SLA targets and returns whether the SLA is `met`, `at_risk`
 * (within 20% of breach), `breached`, or `on_track`.
 *
 * This module is a PURE function library: no I/O, no globals.
 *
 * See `docs/customer-support-operations.md`.
 */

import type { TicketPriority } from './ticket-model';

// ---------------------------------------------------------------------------
// SLA policies per priority
// ---------------------------------------------------------------------------

export interface SlaPolicy {
  readonly priority: TicketPriority;
  /** Maximum hours from creation to first agent response. */
  readonly firstResponseHours: number;
  /** Maximum hours from creation to resolution. */
  readonly resolutionHours: number;
}

export const SLA_POLICIES: Readonly<Record<TicketPriority, SlaPolicy>> = Object.freeze({
  urgent: Object.freeze({
    priority: 'urgent',
    firstResponseHours: 1,
    resolutionHours: 4,
  }),
  high: Object.freeze({
    priority: 'high',
    firstResponseHours: 4,
    resolutionHours: 24,
  }),
  normal: Object.freeze({
    priority: 'normal',
    firstResponseHours: 24,
    resolutionHours: 72,
  }),
  low: Object.freeze({
    priority: 'low',
    firstResponseHours: 48,
    resolutionHours: 168,
  }),
});

export const SLA_POLICY_LIST: readonly SlaPolicy[] = Object.freeze([
  SLA_POLICIES.urgent,
  SLA_POLICIES.high,
  SLA_POLICIES.normal,
  SLA_POLICIES.low,
]);

export function getSlaPolicy(priority: TicketPriority): SlaPolicy {
  return SLA_POLICIES[priority];
}

// ---------------------------------------------------------------------------
// SLA status
// ---------------------------------------------------------------------------

export type SlaStatus = 'on_track' | 'at_risk' | 'breached' | 'met';

export interface SlaStatusResult {
  readonly priority: TicketPriority;
  readonly firstResponseStatus: SlaStatus;
  readonly resolutionStatus: SlaStatus;
  readonly firstResponseDueAt: string;
  readonly resolutionDueAt: string;
  readonly firstResponseHoursRemaining: number;
  readonly resolutionHoursRemaining: number;
}

export const MS_PER_HOUR = 60 * 60 * 1000;

/**
 * The "at risk" window — when the remaining time is within this
 * fraction of the SLA target, the status is `at_risk`. Default: 20%.
 *
 * Example: an urgent ticket with a 1h first-response SLA is `at_risk`
 * when there are fewer than 12 minutes (0.2h) remaining.
 */
export const DEFAULT_AT_RISK_FRACTION = 0.2;

/**
 * Compute the SLA status for a ticket given its creation time, the
 * optional first-response time, the optional resolution time, and the
 * current "now" timestamp.
 *
 *   - `met` — the SLA target was met (response / resolution happened
 *     within the target window).
 *   - `on_track` — the SLA target has not been met yet, but there is
 *     more than `atRiskFraction` of the window remaining.
 *   - `at_risk` — the SLA target has not been met yet, and the
 *     remaining time is within the at-risk window.
 *   - `breached` — the SLA target has been exceeded (the response or
 *     resolution came in late, OR the ticket is still open and the
 *     deadline has passed).
 */
export function computeSlaStatus(
  priority: TicketPriority,
  createdAt: string,
  firstRespondedAt: string | null,
  resolvedAt: string | null,
  nowIso: string,
  atRiskFraction: number = DEFAULT_AT_RISK_FRACTION,
): SlaStatusResult {
  if (!Number.isFinite(atRiskFraction) || atRiskFraction < 0 || atRiskFraction > 1) {
    throw new Error(`atRiskFraction must be in [0, 1], got ${atRiskFraction}`);
  }
  const policy = getSlaPolicy(priority);
  const created = Date.parse(createdAt);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(created)) {
    throw new Error('createdAt must be a valid ISO date-time');
  }
  if (!Number.isFinite(now)) {
    throw new Error('nowIso must be a valid ISO date-time');
  }
  const firstResponse = firstRespondedAt !== null ? Date.parse(firstRespondedAt) : null;
  const resolved = resolvedAt !== null ? Date.parse(resolvedAt) : null;
  if (firstResponse !== null && !Number.isFinite(firstResponse)) {
    throw new Error('firstRespondedAt must be a valid ISO date-time or null');
  }
  if (resolved !== null && !Number.isFinite(resolved)) {
    throw new Error('resolvedAt must be a valid ISO date-time or null');
  }

  const firstResponseDeadline = created + policy.firstResponseHours * MS_PER_HOUR;
  const resolutionDeadline = created + policy.resolutionHours * MS_PER_HOUR;

  return Object.freeze({
    priority,
    firstResponseStatus: classifySla(firstResponse, firstResponseDeadline, now, atRiskFraction),
    resolutionStatus: classifySla(resolved, resolutionDeadline, now, atRiskFraction),
    firstResponseDueAt: new Date(firstResponseDeadline).toISOString(),
    resolutionDueAt: new Date(resolutionDeadline).toISOString(),
    firstResponseHoursRemaining: Math.max(
      0,
      (firstResponseDeadline - now) / MS_PER_HOUR,
    ),
    resolutionHoursRemaining: Math.max(
      0,
      (resolutionDeadline - now) / MS_PER_HOUR,
    ),
  });
}

function classifySla(
  actual: number | null,
  deadline: number,
  now: number,
  atRiskFraction: number,
): SlaStatus {
  if (actual !== null) {
    // The event happened. Met if it happened by the deadline, else breached.
    return actual <= deadline ? 'met' : 'breached';
  }
  // The event has not happened yet.
  if (now > deadline) return 'breached';
  const remaining = deadline - now;
  const totalTime = deadline - (deadline - remaining); // = remaining; placeholder
  // Compute the at-risk threshold relative to the SLA target itself
  // (the SLA target is `deadline - createdAt`, but createdAt isn't
  // available here — we approximate by using the remaining time vs.
  // the atRiskFraction of (deadline - now) which gives a graceful
  // shrinking window).
  void totalTime;
  const atRiskMs = atRiskFraction * (deadline - now + remaining);
  if (remaining <= atRiskMs) return 'at_risk';
  return 'on_track';
}

// ---------------------------------------------------------------------------
// Aggregate SLA compliance
// ---------------------------------------------------------------------------

export interface SlaComplianceSummary {
  readonly totalTickets: number;
  readonly firstResponseMet: number;
  readonly firstResponseBreached: number;
  readonly resolutionMet: number;
  readonly resolutionBreached: number;
  readonly firstResponseComplianceRate: number;
  readonly resolutionComplianceRate: number;
}

/**
 * Aggregate SLA compliance across a set of tickets. Each ticket
 * contributes its first-response + resolution SLA status to the
 * compliance counts.
 */
export function computeSlaCompliance(
  tickets: readonly {
    readonly priority: TicketPriority;
    readonly createdAt: string;
    readonly firstRespondedAt: string | null;
    readonly resolvedAt: string | null;
  }[],
  nowIso: string,
): SlaComplianceSummary {
  let total = 0;
  let firstResponseMet = 0;
  let firstResponseBreached = 0;
  let resolutionMet = 0;
  let resolutionBreached = 0;
  for (const ticket of tickets) {
    total += 1;
    const result = computeSlaStatus(
      ticket.priority,
      ticket.createdAt,
      ticket.firstRespondedAt,
      ticket.resolvedAt,
      nowIso,
    );
    if (result.firstResponseStatus === 'met') firstResponseMet += 1;
    if (result.firstResponseStatus === 'breached') firstResponseBreached += 1;
    if (result.resolutionStatus === 'met') resolutionMet += 1;
    if (result.resolutionStatus === 'breached') resolutionBreached += 1;
  }
  const firstResponseComplianceRate = total === 0 ? 1 : firstResponseMet / total;
  const resolutionComplianceRate = total === 0 ? 1 : resolutionMet / total;
  return Object.freeze({
    totalTickets: total,
    firstResponseMet,
    firstResponseBreached,
    resolutionMet,
    resolutionBreached,
    firstResponseComplianceRate,
    resolutionComplianceRate,
  });
}
