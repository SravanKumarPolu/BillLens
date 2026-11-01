/**
 * API usage analytics — privacy-safe aggregation.
 *
 * Phase 10 Prompt 94: API and Developer Platform.
 *
 * CRITICAL PRIVACY CONSTRAINTS:
 *   - ApiUsageMetric MUST NOT include request bodies, user PII, or
 *     expense amounts. The interface is intentionally narrow: only
 *     clientId, endpoint, method, version, responseStatus,
 *     responseTimeMs, and timestamp.
 *   - The `clientId` field is the OAuth client id (a public identifier
 *     chosen by the developer) — NOT the user id. This is sufficient
 *     for "which integrations are using the API most?" without leaking
 *     which specific user triggered each call.
 *   - Aggregations (`computeApiUsageSummary`) bucket responses by
 *     endpoint and client id — they NEVER group by user id, body
 *     content, or expense amount.
 *   - Logs MUST be retained for at most 30 days. Longer retention
 *     requires explicit opt-in from the legal team.
 *
 * This module is PURE: it computes summaries from inputs; no I/O.
 *
 * See `docs/api-developer-platform.md`.
 */

import type { ApiVersion, HttpMethod } from './api-model';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApiUsageMetric {
  readonly clientId: string;
  readonly endpoint: string;
  readonly method: HttpMethod;
  readonly version: ApiVersion;
  readonly responseStatus: number;
  readonly responseTimeMs: number;
  readonly timestamp: string;
  // CRITICAL: no request body, no user PII, no expense amounts
}

export interface ApiUsageSummary {
  readonly totalRequests: number;
  readonly errorRate: number;
  readonly averageResponseTimeMs: number;
  readonly p95ResponseTimeMs: number;
  readonly topEndpoints: readonly { endpoint: string; count: number }[];
  readonly topClients: readonly { clientId: string; count: number }[];
}

// ---------------------------------------------------------------------------
// Validation — defends against accidentally including PII
// ---------------------------------------------------------------------------

const FORBIDDEN_PROPERTY_KEYS: ReadonlySet<string> = new Set([
  'body',
  'requestBody',
  'payload',
  'userId',
  'userEmail',
  'userPhone',
  'amountMinor',
  'amountMajor',
  'merchantName',
  'groupName',
  'memberName',
  'note',
  'upiId',
  'paymentReference',
  'ocrText',
  'filePath',
  'token',
  'auth',
]);

/**
 * Validates that a metric does NOT contain PII or request-body fields.
 *
 * This is a belt-and-suspenders defense: the `ApiUsageMetric` interface
 * already excludes these fields, but at runtime an object can be passed
 * with extra properties (e.g. via `{ ...metric, userId: '…' }`). The
 * recording use case calls this function BEFORE persisting and refuses
 * any metric with forbidden keys.
 */
export function validateMetricIsPrivacySafe(
  metric: Record<string, unknown>,
): { valid: boolean; violations: readonly string[] } {
  const violations: string[] = [];
  for (const key of Object.keys(metric)) {
    if (FORBIDDEN_PROPERTY_KEYS.has(key)) {
      violations.push(key);
    }
  }
  return { valid: violations.length === 0, violations: Object.freeze(violations) };
}

/**
 * Returns a copy of the metric with all forbidden properties stripped.
 *
 * The recording use case calls this BEFORE persisting as a second line
 * of defense, in case a caller bypassed `validateMetricIsPrivacySafe`.
 */
export function redactMetric(
  metric: Record<string, unknown>,
): Readonly<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(metric)) {
    if (!FORBIDDEN_PROPERTY_KEYS.has(key)) {
      out[key] = metric[key];
    }
  }
  return Object.freeze(out);
}

// ---------------------------------------------------------------------------
// Summary computation
// ---------------------------------------------------------------------------

function isErrorResponse(status: number): boolean {
  return status >= 400 && status < 600;
}

function percentile(sortedAsc: readonly number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  if (p < 0 || p > 100) {
    throw new Error(`percentile must be 0-100, got ${p}`);
  }
  // Nearest-rank method.
  const rank = Math.ceil((p / 100) * sortedAsc.length);
  const idx = Math.min(Math.max(rank - 1, 0), sortedAsc.length - 1);
  const v = sortedAsc[idx];
  return typeof v === 'number' ? v : 0;
}

function topN(
  counts: ReadonlyMap<string, number>,
  n: number,
): readonly { endpoint: string; count: number }[] {
  return Object.freeze(
    [...counts.entries()]
      .map(([key, count]) => ({ endpoint: key, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, n),
  );
}

/**
 * Computes a privacy-safe usage summary from a list of metrics.
 *
 * The summary includes:
 *   - totalRequests
 *   - errorRate (fraction 0-1, computed as errors / total)
 *   - averageResponseTimeMs (arithmetic mean)
 *   - p95ResponseTimeMs (95th percentile, nearest-rank)
 *   - topEndpoints (top 10 by request count)
 *   - topClients (top 10 by request count)
 *
 * No individual user data is exposed. The summary is safe to publish to
 * the developer portal's status page.
 */
export function computeApiUsageSummary(
  metrics: readonly ApiUsageMetric[],
): ApiUsageSummary {
  if (metrics.length === 0) {
    return Object.freeze({
      totalRequests: 0,
      errorRate: 0,
      averageResponseTimeMs: 0,
      p95ResponseTimeMs: 0,
      topEndpoints: Object.freeze([]),
      topClients: Object.freeze([]),
    });
  }

  let totalResponseTime = 0;
  let errorCount = 0;
  const responseTimes: number[] = [];
  const endpointCounts = new Map<string, number>();
  const clientCounts = new Map<string, number>();

  for (const m of metrics) {
    totalResponseTime += m.responseTimeMs;
    responseTimes.push(m.responseTimeMs);
    if (isErrorResponse(m.responseStatus)) {
      errorCount += 1;
    }
    endpointCounts.set(
      m.endpoint,
      (endpointCounts.get(m.endpoint) ?? 0) + 1,
    );
    clientCounts.set(m.clientId, (clientCounts.get(m.clientId) ?? 0) + 1);
  }

  responseTimes.sort((a, b) => a - b);

  return Object.freeze({
    totalRequests: metrics.length,
    errorRate: errorCount / metrics.length,
    averageResponseTimeMs: totalResponseTime / metrics.length,
    p95ResponseTimeMs: percentile(responseTimes, 95),
    topEndpoints: Object.freeze(
      topN(endpointCounts, 10).map((e) => Object.freeze({ ...e })),
    ),
    topClients: Object.freeze(
      topN(clientCounts, 10).map((c) =>
        Object.freeze({ clientId: c.endpoint, count: c.count }),
      ),
    ),
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Buckets response time into discrete bands for histogram-style display.
 *
 *   '< 100ms' | '100-500ms' | '500ms-1s' | '1-5s' | '> 5s'
 */
export function bucketResponseTime(ms: number): string {
  if (ms < 100) return '< 100ms';
  if (ms < 500) return '100-500ms';
  if (ms < 1000) return '500ms-1s';
  if (ms < 5000) return '1-5s';
  return '> 5s';
}

/**
 * Buckets response status into discrete bands.
 *
 *   '2xx' | '3xx' | '4xx' | '5xx'
 */
export function bucketResponseStatus(status: number): string {
  if (status >= 200 && status < 300) return '2xx';
  if (status >= 300 && status < 400) return '3xx';
  if (status >= 400 && status < 500) return '4xx';
  if (status >= 500 && status < 600) return '5xx';
  return 'other';
}
