/**
 * Product health tests.
 *
 * Phase 10 Prompt 95.
 */

import { describe, expect, it } from '@jest/globals';

import {
  HEALTH_SCORE_WEIGHTS,
  clampScore,
  computeOverallHealth,
  createProductHealthScore,
  getHealthStatus,
  getWeakestSubScore,
  npsToSatisfaction,
  rateToScore,
} from '../product-health';

describe('clampScore', () => {
  it('clamps values to 0-100', () => {
    expect(clampScore(50)).toBe(50);
    expect(clampScore(0)).toBe(0);
    expect(clampScore(100)).toBe(100);
    expect(clampScore(-10)).toBe(0);
    expect(clampScore(150)).toBe(100);
  });

  it('throws on non-finite input', () => {
    expect(() => clampScore(Number.NaN)).toThrow('value must be finite');
    expect(() => clampScore(Number.POSITIVE_INFINITY)).toThrow(
      'value must be finite',
    );
  });
});

describe('npsToSatisfaction', () => {
  it('maps NPS -100 to satisfaction 0', () => {
    expect(npsToSatisfaction(-100)).toBe(0);
  });

  it('maps NPS 0 to satisfaction 50', () => {
    expect(npsToSatisfaction(0)).toBe(50);
  });

  it('maps NPS +100 to satisfaction 100', () => {
    expect(npsToSatisfaction(100)).toBe(100);
  });

  it('maps NPS +50 to satisfaction 75', () => {
    expect(npsToSatisfaction(50)).toBe(75);
  });

  it('throws on NPS out of range', () => {
    expect(() => npsToSatisfaction(-150)).toThrow('nps must be -100..100');
    expect(() => npsToSatisfaction(150)).toThrow('nps must be -100..100');
  });

  it('throws on non-finite input', () => {
    expect(() => npsToSatisfaction(Number.NaN)).toThrow(
      'nps must be finite',
    );
  });
});

describe('rateToScore', () => {
  it('converts a rate 0-1 to a score 0-100', () => {
    expect(rateToScore(0)).toBe(0);
    expect(rateToScore(0.5)).toBe(50);
    expect(rateToScore(1)).toBe(100);
  });

  it('throws on a rate out of range', () => {
    expect(() => rateToScore(-0.1)).toThrow('rate must be 0..1');
    expect(() => rateToScore(1.5)).toThrow('rate must be 0..1');
  });
});

describe('HEALTH_SCORE_WEIGHTS', () => {
  it('has weights that sum to 1.0', () => {
    const sum =
      HEALTH_SCORE_WEIGHTS.financialIntegrity +
      HEALTH_SCORE_WEIGHTS.syncReliability +
      HEALTH_SCORE_WEIGHTS.ocrAccuracy +
      HEALTH_SCORE_WEIGHTS.crashFreeRate +
      HEALTH_SCORE_WEIGHTS.userSatisfaction +
      HEALTH_SCORE_WEIGHTS.supportSla;
    expect(sum).toBeCloseTo(1.0, 5);
  });

  it('gives financial integrity the largest weight (priority)', () => {
    expect(HEALTH_SCORE_WEIGHTS.financialIntegrity).toBeGreaterThanOrEqual(
      HEALTH_SCORE_WEIGHTS.syncReliability,
    );
    expect(HEALTH_SCORE_WEIGHTS.financialIntegrity).toBeGreaterThanOrEqual(
      HEALTH_SCORE_WEIGHTS.ocrAccuracy,
    );
  });
});

describe('computeOverallHealth', () => {
  it('returns 100 when all sub-scores are 100', () => {
    const overall = computeOverallHealth({
      financialIntegrity: 100,
      syncReliability: 100,
      ocrAccuracy: 100,
      crashFreeRate: 100,
      userSatisfaction: 100,
      supportSla: 100,
    });
    expect(overall).toBe(100);
  });

  it('returns 0 when all sub-scores are 0', () => {
    const overall = computeOverallHealth({
      financialIntegrity: 0,
      syncReliability: 0,
      ocrAccuracy: 0,
      crashFreeRate: 0,
      userSatisfaction: 0,
      supportSla: 0,
    });
    expect(overall).toBe(0);
  });

  it('returns a weighted average', () => {
    const overall = computeOverallHealth({
      financialIntegrity: 100,
      syncReliability: 100,
      ocrAccuracy: 0,
      crashFreeRate: 0,
      userSatisfaction: 0,
      supportSla: 0,
    });
    // Expected = 100 * 0.25 + 100 * 0.20 + 0 + 0 + 0 + 0 = 45
    expect(overall).toBeCloseTo(45, 5);
  });

  it('throws on a sub-score out of range', () => {
    expect(() =>
      computeOverallHealth({
        financialIntegrity: 150,
        syncReliability: 100,
        ocrAccuracy: 100,
        crashFreeRate: 100,
        userSatisfaction: 100,
        supportSla: 100,
      }),
    ).toThrow('financialIntegrity must be 0..100');
  });

  it('throws on a non-finite sub-score', () => {
    expect(() =>
      computeOverallHealth({
        financialIntegrity: Number.NaN,
        syncReliability: 100,
        ocrAccuracy: 100,
        crashFreeRate: 100,
        userSatisfaction: 100,
        supportSla: 100,
      }),
    ).toThrow('financialIntegrity must be finite');
  });
});

describe('getHealthStatus', () => {
  it('returns "healthy" for scores >= 80', () => {
    expect(getHealthStatus(80)).toBe('healthy');
    expect(getHealthStatus(95)).toBe('healthy');
    expect(getHealthStatus(100)).toBe('healthy');
  });

  it('returns "warning" for scores 60-79', () => {
    expect(getHealthStatus(60)).toBe('warning');
    expect(getHealthStatus(75)).toBe('warning');
    expect(getHealthStatus(79)).toBe('warning');
  });

  it('returns "critical" for scores < 60', () => {
    expect(getHealthStatus(59)).toBe('critical');
    expect(getHealthStatus(0)).toBe('critical');
  });

  it('throws on a score out of range', () => {
    expect(() => getHealthStatus(-1)).toThrow('score must be 0..100');
    expect(() => getHealthStatus(101)).toThrow('score must be 0..100');
  });
});

describe('createProductHealthScore', () => {
  it('constructs a score from rate-based inputs', () => {
    const score = createProductHealthScore({
      zeroSumPassRate: 1.0, // 100
      syncSuccessRate: 0.95, // 95
      ocrFieldAccuracy: 0.92, // 92
      crashFreeSessionRate: 0.99, // 99
      nps: 40, // 70
      supportSlaComplianceRate: 0.90, // 90
    });
    expect(score.financialIntegrity).toBe(100);
    expect(score.syncReliability).toBe(95);
    expect(score.ocrAccuracy).toBe(92);
    expect(score.crashFreeRate).toBe(99);
    expect(score.userSatisfaction).toBe(70);
    expect(score.supportSla).toBe(90);
    // Overall = 100*0.25 + 95*0.20 + 92*0.10 + 99*0.15 + 70*0.15 + 90*0.15
    //        = 25 + 19 + 9.2 + 14.85 + 10.5 + 13.5 = 92.05
    expect(score.overall).toBeCloseTo(92.05, 1);
  });

  it('returns a frozen object', () => {
    const score = createProductHealthScore({
      zeroSumPassRate: 1.0,
      syncSuccessRate: 1.0,
      ocrFieldAccuracy: 1.0,
      crashFreeSessionRate: 1.0,
      nps: 50,
      supportSlaComplianceRate: 1.0,
    });
    expect(Object.isFrozen(score)).toBe(true);
  });

  it('marks a healthy product as healthy', () => {
    const score = createProductHealthScore({
      zeroSumPassRate: 1.0,
      syncSuccessRate: 0.99,
      ocrFieldAccuracy: 0.95,
      crashFreeSessionRate: 0.995,
      nps: 60,
      supportSlaComplianceRate: 0.98,
    });
    expect(getHealthStatus(score.overall)).toBe('healthy');
  });

  it('marks a struggling product as critical', () => {
    const score = createProductHealthScore({
      zeroSumPassRate: 0.50,
      syncSuccessRate: 0.50,
      ocrFieldAccuracy: 0.50,
      crashFreeSessionRate: 0.50,
      nps: -50,
      supportSlaComplianceRate: 0.50,
    });
    expect(getHealthStatus(score.overall)).toBe('critical');
  });
});

describe('getWeakestSubScore', () => {
  it('returns the lowest sub-score below 90', () => {
    const score = createProductHealthScore({
      zeroSumPassRate: 1.0, // 100
      syncSuccessRate: 0.95, // 95
      ocrFieldAccuracy: 0.80, // 80 ← weakest
      crashFreeSessionRate: 0.99, // 99
      nps: 70, // 85 (so ocrAccuracy at 80 is still the weakest)
      supportSlaComplianceRate: 0.90, // 90
    });
    const weakest = getWeakestSubScore(score);
    expect(weakest).not.toBeNull();
    expect(weakest?.key).toBe('ocrAccuracy');
    expect(weakest?.value).toBe(80);
  });

  it('returns null when all sub-scores are >= 90', () => {
    const score = createProductHealthScore({
      zeroSumPassRate: 1.0,
      syncSuccessRate: 1.0,
      ocrFieldAccuracy: 0.95,
      crashFreeSessionRate: 1.0,
      nps: 80,
      supportSlaComplianceRate: 0.95,
    });
    expect(getWeakestSubScore(score)).toBeNull();
  });
});
