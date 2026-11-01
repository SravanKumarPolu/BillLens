/**
 * API analytics tests — privacy-safe aggregation.
 *
 * Phase 10 Prompt 94.
 *
 * CRITICAL: verifies that the privacy-safety guard rejects metrics
 * containing PII, request bodies, or expense amounts.
 */

import { describe, expect, it } from '@jest/globals';

import {
  bucketResponseStatus,
  bucketResponseTime,
  computeApiUsageSummary,
  redactMetric,
  validateMetricIsPrivacySafe,
  type ApiUsageMetric,
} from '../api-analytics';

function metric(overrides: Partial<ApiUsageMetric>): ApiUsageMetric {
  return {
    clientId: 'client_123',
    endpoint: '/v1/groups',
    method: 'GET',
    version: 'v1',
    responseStatus: 200,
    responseTimeMs: 100,
    timestamp: '2026-07-15T12:00:00.000Z',
    ...overrides,
  };
}

describe('validateMetricIsPrivacySafe', () => {
  it('accepts a metric with only the allowed fields', () => {
    const result = validateMetricIsPrivacySafe({
      clientId: 'client_123',
      endpoint: '/v1/groups',
      method: 'GET',
      version: 'v1',
      responseStatus: 200,
      responseTimeMs: 100,
      timestamp: '2026-07-15T12:00:00.000Z',
    });
    expect(result.valid).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('rejects a metric with a userId field', () => {
    const result = validateMetricIsPrivacySafe({ userId: 'user_abc' });
    expect(result.valid).toBe(false);
    expect(result.violations).toContain('userId');
  });

  it('rejects a metric with a body field', () => {
    const result = validateMetricIsPrivacySafe({ body: 'request payload' });
    expect(result.valid).toBe(false);
    expect(result.violations).toContain('body');
  });

  it('rejects a metric with an amountMinor field', () => {
    const result = validateMetricIsPrivacySafe({ amountMinor: 1250 });
    expect(result.valid).toBe(false);
    expect(result.violations).toContain('amountMinor');
  });

  it('rejects a metric with multiple forbidden fields', () => {
    const result = validateMetricIsPrivacySafe({
      userId: 'user_abc',
      body: 'payload',
      merchantName: 'Starbucks',
      token: 'secret-token',
    });
    expect(result.valid).toBe(false);
    expect(result.violations).toHaveLength(4);
  });

  it('rejects merchantName, groupName, memberName, upiId, paymentReference, ocrText, filePath, token, auth', () => {
    const forbidden = [
      'merchantName',
      'groupName',
      'memberName',
      'upiId',
      'paymentReference',
      'ocrText',
      'filePath',
      'token',
      'auth',
    ];
    for (const key of forbidden) {
      const result = validateMetricIsPrivacySafe({ [key]: 'value' });
      expect(result.valid).toBe(false);
      expect(result.violations).toContain(key);
    }
  });

  it('returns a frozen violations array', () => {
    const result = validateMetricIsPrivacySafe({ userId: 'user_abc' });
    expect(Object.isFrozen(result.violations)).toBe(true);
  });
});

describe('redactMetric', () => {
  it('strips forbidden fields and keeps the rest', () => {
    const redacted = redactMetric({
      clientId: 'client_123',
      userId: 'user_abc',
      endpoint: '/v1/groups',
      amountMinor: 1250,
      method: 'GET',
    });
    expect(redacted.clientId).toBe('client_123');
    expect(redacted.endpoint).toBe('/v1/groups');
    expect(redacted.method).toBe('GET');
    expect(redacted.userId).toBeUndefined();
    expect(redacted.amountMinor).toBeUndefined();
  });

  it('returns a frozen object', () => {
    const redacted = redactMetric({ clientId: 'client_123', userId: 'x' });
    expect(Object.isFrozen(redacted)).toBe(true);
  });
});

describe('computeApiUsageSummary', () => {
  it('returns zeros for an empty list', () => {
    const summary = computeApiUsageSummary([]);
    expect(summary.totalRequests).toBe(0);
    expect(summary.errorRate).toBe(0);
    expect(summary.averageResponseTimeMs).toBe(0);
    expect(summary.p95ResponseTimeMs).toBe(0);
    expect(summary.topEndpoints).toEqual([]);
    expect(summary.topClients).toEqual([]);
  });

  it('counts total requests', () => {
    const summary = computeApiUsageSummary([
      metric({}),
      metric({}),
      metric({}),
    ]);
    expect(summary.totalRequests).toBe(3);
  });

  it('computes error rate as errors / total', () => {
    const summary = computeApiUsageSummary([
      metric({ responseStatus: 200 }),
      metric({ responseStatus: 200 }),
      metric({ responseStatus: 500 }),
      metric({ responseStatus: 404 }),
    ]);
    expect(summary.errorRate).toBeCloseTo(0.5, 5);
  });

  it('computes average response time', () => {
    const summary = computeApiUsageSummary([
      metric({ responseTimeMs: 100 }),
      metric({ responseTimeMs: 200 }),
      metric({ responseTimeMs: 300 }),
    ]);
    expect(summary.averageResponseTimeMs).toBeCloseTo(200, 5);
  });

  it('computes p95 response time (nearest-rank)', () => {
    // 20 samples, all 100ms except the last one is 1000ms.
    // p95 rank = ceil(0.95 * 20) = 19, so p95 = the 19th value = 100.
    const metrics: ApiUsageMetric[] = [];
    for (let i = 0; i < 19; i++) {
      metrics.push(metric({ responseTimeMs: 100 }));
    }
    metrics.push(metric({ responseTimeMs: 1000 }));
    const summary = computeApiUsageSummary(metrics);
    expect(summary.p95ResponseTimeMs).toBe(100);
  });

  it('computes p95 = max when only one sample', () => {
    const summary = computeApiUsageSummary([
      metric({ responseTimeMs: 250 }),
    ]);
    expect(summary.p95ResponseTimeMs).toBe(250);
  });

  it('returns top 10 endpoints by request count', () => {
    const metrics: ApiUsageMetric[] = [];
    for (let i = 0; i < 15; i++) {
      metrics.push(metric({ endpoint: `/v1/endpoint_${i}` }));
    }
    const summary = computeApiUsageSummary(metrics);
    expect(summary.topEndpoints).toHaveLength(10);
    // Each endpoint has 1 request — they should all have count=1.
    for (const e of summary.topEndpoints) {
      expect(e.count).toBe(1);
    }
  });

  it('sorts topEndpoints by count descending', () => {
    const metrics: ApiUsageMetric[] = [
      metric({ endpoint: '/v1/a' }),
      metric({ endpoint: '/v1/a' }),
      metric({ endpoint: '/v1/a' }),
      metric({ endpoint: '/v1/b' }),
      metric({ endpoint: '/v1/b' }),
      metric({ endpoint: '/v1/c' }),
    ];
    const summary = computeApiUsageSummary(metrics);
    expect(summary.topEndpoints[0]?.endpoint).toBe('/v1/a');
    expect(summary.topEndpoints[0]?.count).toBe(3);
    expect(summary.topEndpoints[1]?.endpoint).toBe('/v1/b');
    expect(summary.topEndpoints[1]?.count).toBe(2);
    expect(summary.topEndpoints[2]?.endpoint).toBe('/v1/c');
    expect(summary.topEndpoints[2]?.count).toBe(1);
  });

  it('returns top 10 clients by request count', () => {
    const metrics: ApiUsageMetric[] = [];
    for (let i = 0; i < 12; i++) {
      metrics.push(metric({ clientId: `client_${i}` }));
    }
    const summary = computeApiUsageSummary(metrics);
    expect(summary.topClients).toHaveLength(10);
  });

  it('does NOT include user-level data in the summary', () => {
    const summary = computeApiUsageSummary([
      metric({ clientId: 'client_1', endpoint: '/v1/groups' }),
    ]);
    const serialised = JSON.stringify(summary);
    expect(serialised).not.toContain('user_');
    expect(serialised).not.toContain('amount');
    expect(serialised).not.toContain('body');
    expect(serialised).not.toContain('merchantName');
  });

  it('returns a frozen summary', () => {
    const summary = computeApiUsageSummary([metric({})]);
    expect(Object.isFrozen(summary)).toBe(true);
    expect(Object.isFrozen(summary.topEndpoints)).toBe(true);
    expect(Object.isFrozen(summary.topClients)).toBe(true);
  });
});

describe('bucketResponseTime', () => {
  it('returns "< 100ms" for sub-100ms responses', () => {
    expect(bucketResponseTime(50)).toBe('< 100ms');
    expect(bucketResponseTime(99)).toBe('< 100ms');
  });

  it('returns "100-500ms" for 100-499ms', () => {
    expect(bucketResponseTime(100)).toBe('100-500ms');
    expect(bucketResponseTime(499)).toBe('100-500ms');
  });

  it('returns "500ms-1s" for 500-999ms', () => {
    expect(bucketResponseTime(500)).toBe('500ms-1s');
    expect(bucketResponseTime(999)).toBe('500ms-1s');
  });

  it('returns "1-5s" for 1000-4999ms', () => {
    expect(bucketResponseTime(1000)).toBe('1-5s');
    expect(bucketResponseTime(4999)).toBe('1-5s');
  });

  it('returns "> 5s" for 5000ms+', () => {
    expect(bucketResponseTime(5000)).toBe('> 5s');
    expect(bucketResponseTime(60000)).toBe('> 5s');
  });
});

describe('bucketResponseStatus', () => {
  it('returns "2xx" for 200-299', () => {
    expect(bucketResponseStatus(200)).toBe('2xx');
    expect(bucketResponseStatus(204)).toBe('2xx');
  });

  it('returns "3xx" for 300-399', () => {
    expect(bucketResponseStatus(301)).toBe('3xx');
  });

  it('returns "4xx" for 400-499', () => {
    expect(bucketResponseStatus(404)).toBe('4xx');
    expect(bucketResponseStatus(422)).toBe('4xx');
  });

  it('returns "5xx" for 500-599', () => {
    expect(bucketResponseStatus(500)).toBe('5xx');
    expect(bucketResponseStatus(503)).toBe('5xx');
  });

  it('returns "other" for non-HTTP statuses', () => {
    expect(bucketResponseStatus(100)).toBe('other');
    expect(bucketResponseStatus(700)).toBe('other');
  });
});
