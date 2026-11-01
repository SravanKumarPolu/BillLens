/**
 * Support analytics — SLA compliance, CSAT, trending categories.
 *
 * Aggregates support ticket data into metrics for the support
 * dashboard. All metrics are aggregate (no individual user data).
 *
 * Metrics computed:
 *   - SLA compliance rates (first-response + resolution).
 *   - CSAT (Customer Satisfaction) average + distribution.
 *   - Trending categories (most common ticket categories).
 *   - Ticket volume by status / priority / channel.
 *
 * See `docs/customer-support-operations.md`.
 */

import { computeSlaCompliance, type SlaComplianceSummary } from './sla-policy';
import type {
  TicketChannel,
  TicketPriority,
  TicketStatus,
} from './ticket-model';

// ---------------------------------------------------------------------------
// Ticket summary (minimal shape for analytics)
// ---------------------------------------------------------------------------

export interface TicketSummary {
  readonly priority: TicketPriority;
  readonly status: TicketStatus;
  readonly channel: TicketChannel;
  readonly category: string | null;
  readonly createdAt: string;
  readonly firstRespondedAt: string | null;
  readonly resolvedAt: string | null;
  readonly csatScore: number | null;
}

// ---------------------------------------------------------------------------
// Analytics output
// ---------------------------------------------------------------------------

export interface SupportAnalyticsReport {
  readonly generatedAt: string;
  readonly totalTickets: number;
  readonly slaCompliance: SlaComplianceSummary;
  readonly csatAverage: number;
  readonly csatDistribution: Readonly<Record<1 | 2 | 3 | 4 | 5, number>>;
  readonly csatResponseRate: number;
  readonly trendingCategories: readonly TrendingCategory[];
  readonly ticketsByStatus: Readonly<Record<TicketStatus, number>>;
  readonly ticketsByPriority: Readonly<Record<TicketPriority, number>>;
  readonly ticketsByChannel: Readonly<Record<TicketChannel, number>>;
}

export interface TrendingCategory {
  readonly category: string;
  readonly count: number;
  readonly percentage: number;
}

// ---------------------------------------------------------------------------
// Computation
// ---------------------------------------------------------------------------

export function computeSupportAnalytics(
  tickets: readonly TicketSummary[],
  nowIso: string,
): SupportAnalyticsReport {
  if (Number.isNaN(Date.parse(nowIso))) {
    throw new Error('nowIso must be a valid ISO date-time');
  }

  const total = tickets.length;

  // 1. SLA compliance.
  const slaCompliance = computeSlaCompliance(
    tickets.map((t) => ({
      priority: t.priority,
      createdAt: t.createdAt,
      firstRespondedAt: t.firstRespondedAt,
      resolvedAt: t.resolvedAt,
    })),
    nowIso,
  );

  // 2. CSAT.
  let csatSum = 0;
  let csatCount = 0;
  const csatDistribution: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const t of tickets) {
    if (t.csatScore !== null) {
      csatSum += t.csatScore;
      csatCount += 1;
      csatDistribution[t.csatScore as 1 | 2 | 3 | 4 | 5] += 1;
    }
  }
  const csatAverage = csatCount === 0 ? 0 : csatSum / csatCount;
  const csatResponseRate = total === 0 ? 0 : csatCount / total;

  // 3. Trending categories.
  const categoryCounts = new Map<string, number>();
  for (const t of tickets) {
    if (t.category === null) continue;
    categoryCounts.set(t.category, (categoryCounts.get(t.category) ?? 0) + 1);
  }
  const trendingCategories: TrendingCategory[] = [];
  for (const [category, count] of categoryCounts) {
    trendingCategories.push(
      Object.freeze({
        category,
        count,
        percentage: total === 0 ? 0 : count / total,
      }),
    );
  }
  trendingCategories.sort((a, b) => b.count - a.count);

  // 4. Tickets by status / priority / channel.
  const ticketsByStatus: Record<TicketStatus, number> = {
    new: 0,
    open: 0,
    in_progress: 0,
    waiting_customer: 0,
    waiting_engineering: 0,
    resolved: 0,
    closed: 0,
  };
  const ticketsByPriority: Record<TicketPriority, number> = {
    urgent: 0,
    high: 0,
    normal: 0,
    low: 0,
  };
  const ticketsByChannel: Record<TicketChannel, number> = {
    in_app: 0,
    email: 0,
    web_form: 0,
    api: 0,
  };
  for (const t of tickets) {
    ticketsByStatus[t.status] += 1;
    ticketsByPriority[t.priority] += 1;
    ticketsByChannel[t.channel] += 1;
  }

  return Object.freeze({
    generatedAt: nowIso,
    totalTickets: total,
    slaCompliance,
    csatAverage,
    csatDistribution: Object.freeze(csatDistribution),
    csatResponseRate,
    trendingCategories: Object.freeze(trendingCategories),
    ticketsByStatus: Object.freeze(ticketsByStatus),
    ticketsByPriority: Object.freeze(ticketsByPriority),
    ticketsByChannel: Object.freeze(ticketsByChannel),
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the top N trending categories by ticket count.
 */
export function topTrendingCategories(
  report: SupportAnalyticsReport,
  n: number,
): readonly TrendingCategory[] {
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`n must be a positive integer, got ${n}`);
  }
  return Object.freeze(report.trendingCategories.slice(0, n));
}

/**
 * Returns true when the CSAT response rate is below the target
 * threshold (default 30%). A low CSAT response rate means we don't
 * have enough signal to trust the CSAT average.
 */
export function isCsatResponseRateLow(
  report: SupportAnalyticsReport,
  threshold: number = 0.3,
): boolean {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new Error(`threshold must be in [0, 1], got ${threshold}`);
  }
  return report.csatResponseRate < threshold;
}
