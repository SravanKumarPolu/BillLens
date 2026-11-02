/**
 * Fraud detection tests.
 *
 * Phase 10 Prompt 96.
 *
 * CRITICAL: verifies that fraud detection is ADVISORY ONLY — it NEVER
 * blocks transactions. Every advisory's recommendation field MUST say
 * "review" and MUST NOT contain "block", "reject", "refund", "cancel",
 * or "decline".
 */

import { describe, expect, it } from '@jest/globals';

import {
  detectFraudPatterns,
  filterSafeAdvisories,
  isAdvisorySafe,
  sortAdvisoriesBySeverity,
  type ExpenseForFraudDetection,
  type FraudAdvisory,
  type UserBaseline,
} from '../fraud-detection';

const NOW = '2026-07-15T12:00:00.000Z';

function makeExpenses(
  overrides: Partial<ExpenseForFraudDetection>[],
): ExpenseForFraudDetection[] {
  return overrides.map((o) => ({
    amountMinor: 1000,
    date: NOW,
    ...o,
  }));
}

describe('detectFraudPatterns — unusual_amount', () => {
  const baseline: UserBaseline = {
    averageAmountMinor: 5000, // ₹50 average
    stdDevAmountMinor: 2000,
    knownMerchants: ['STARBUCKS'],
  };

  it('flags an expense > 5x average + 3σ', () => {
    const advisories = detectFraudPatterns(
      makeExpenses([{ amountMinor: 500_000, date: NOW, merchantName: 'STARBUCKS' }]),
      baseline,
    );
    const unusual = advisories.filter((a) => a.signal === 'unusual_amount');
    expect(unusual.length).toBeGreaterThan(0);
    expect(unusual[0]?.confidence).toBeGreaterThan(0.5);
  });

  it('does NOT flag an expense within the normal range', () => {
    const advisories = detectFraudPatterns(
      makeExpenses([{ amountMinor: 5000, date: NOW, merchantName: 'STARBUCKS' }]),
      baseline,
    );
    const unusual = advisories.filter((a) => a.signal === 'unusual_amount');
    expect(unusual).toEqual([]);
  });

  it('uses "review" language, not "block" language (CRITICAL)', () => {
    const advisories = detectFraudPatterns(
      makeExpenses([{ amountMinor: 1_000_000, date: NOW }]),
      baseline,
    );
    const unusual = advisories.filter((a) => a.signal === 'unusual_amount');
    expect(unusual.length).toBeGreaterThan(0);
    for (const a of unusual) {
      expect(a.recommendation.toLowerCase()).toContain('review');
      expect(a.recommendation.toLowerCase()).not.toContain('block');
      expect(a.recommendation.toLowerCase()).not.toContain('reject');
      expect(a.recommendation.toLowerCase()).not.toContain('refund');
      expect(a.recommendation.toLowerCase()).not.toContain('cancel');
      expect(a.recommendation.toLowerCase()).not.toContain('decline');
    }
  });
});

describe('detectFraudPatterns — unusual_frequency', () => {
  it('flags 11+ expenses in a 1-hour window', () => {
    const expenses: ExpenseForFraudDetection[] = [];
    // 12 expenses, 5 minutes apart (1 hour total).
    for (let i = 0; i < 12; i++) {
      expenses.push({
        amountMinor: 1000,
        date: new Date(Date.parse(NOW) + i * 5 * 60 * 1000).toISOString(),
      });
    }
    const advisories = detectFraudPatterns(expenses);
    const freq = advisories.filter((a) => a.signal === 'unusual_frequency');
    expect(freq.length).toBeGreaterThan(0);
  });

  it('does NOT flag expenses spread out over more than an hour', () => {
    const expenses: ExpenseForFraudDetection[] = [];
    // 12 expenses, 10 minutes apart (110 minutes total — over 1 hour).
    for (let i = 0; i < 12; i++) {
      expenses.push({
        amountMinor: 1000,
        date: new Date(Date.parse(NOW) + i * 10 * 60 * 1000).toISOString(),
      });
    }
    const advisories = detectFraudPatterns(expenses);
    const freq = advisories.filter((a) => a.signal === 'unusual_frequency');
    expect(freq).toEqual([]);
  });
});

describe('detectFraudPatterns — unusual_merchant', () => {
  const baseline: UserBaseline = {
    averageAmountMinor: 5000,
    stdDevAmountMinor: 2000,
    knownMerchants: ['STARBUCKS'],
  };

  it('flags a new merchant with an above-average amount', () => {
    const advisories = detectFraudPatterns(
      makeExpenses([
        { amountMinor: 20_000, date: NOW, merchantName: 'UnknownMerchant' },
      ]),
      baseline,
    );
    const unusual = advisories.filter((a) => a.signal === 'unusual_merchant');
    expect(unusual.length).toBeGreaterThan(0);
  });

  it('does NOT flag a known merchant', () => {
    const advisories = detectFraudPatterns(
      makeExpenses([
        { amountMinor: 20_000, date: NOW, merchantName: 'Starbucks' },
      ]),
      baseline,
    );
    const unusual = advisories.filter((a) => a.signal === 'unusual_merchant');
    expect(unusual).toEqual([]);
  });
});

describe('detectFraudPatterns — unusual_time', () => {
  it('flags expenses at 3-5 AM UTC', () => {
    const advisories = detectFraudPatterns(
      makeExpenses([{ date: '2026-07-15T03:30:00.000Z' }]),
    );
    const time = advisories.filter((a) => a.signal === 'unusual_time');
    expect(time.length).toBeGreaterThan(0);
  });

  it('does NOT flag expenses during normal hours', () => {
    const advisories = detectFraudPatterns(
      makeExpenses([{ date: '2026-07-15T14:30:00.000Z' }]),
    );
    const time = advisories.filter((a) => a.signal === 'unusual_time');
    expect(time).toEqual([]);
  });
});

describe('detectFraudPatterns — duplicate_pattern', () => {
  it('flags two expenses with same amount + merchant within 1 hour', () => {
    const advisories = detectFraudPatterns(
      makeExpenses([
        { amountMinor: 5000, date: NOW, merchantName: 'Starbucks' },
        { amountMinor: 5000, date: new Date(Date.parse(NOW) + 30 * 60 * 1000).toISOString(), merchantName: 'Starbucks' },
      ]),
    );
    const dup = advisories.filter((a) => a.signal === 'duplicate_pattern');
    expect(dup.length).toBeGreaterThan(0);
  });

  it('does NOT flag two expenses with same amount + merchant more than 1 hour apart', () => {
    const advisories = detectFraudPatterns(
      makeExpenses([
        { amountMinor: 5000, date: NOW, merchantName: 'Starbucks' },
        { amountMinor: 5000, date: new Date(Date.parse(NOW) + 2 * 60 * 60 * 1000).toISOString(), merchantName: 'Starbucks' },
      ]),
    );
    const dup = advisories.filter((a) => a.signal === 'duplicate_pattern');
    expect(dup).toEqual([]);
  });
});

describe('CRITICAL: fraud detection NEVER blocks transactions', () => {
  it('every advisory recommendation uses "review" language', () => {
    const advisories = detectFraudPatterns(
      makeExpenses([
        { amountMinor: 1_000_000, date: NOW, merchantName: 'UnknownX' },
        { amountMinor: 1_000_000, date: NOW, merchantName: 'UnknownX' },
        { date: '2026-07-15T03:30:00.000Z' },
      ]),
      {
        averageAmountMinor: 1000,
        stdDevAmountMinor: 500,
        knownMerchants: ['KNOWN'],
      },
    );
    expect(advisories.length).toBeGreaterThan(0);
    for (const a of advisories) {
      expect(a.recommendation.toLowerCase()).toContain('review');
      expect(a.recommendation.toLowerCase()).not.toContain('block');
      expect(a.recommendation.toLowerCase()).not.toContain('reject');
      expect(a.recommendation.toLowerCase()).not.toContain('refund');
      expect(a.recommendation.toLowerCase()).not.toContain('cancel');
      expect(a.recommendation.toLowerCase()).not.toContain('decline');
    }
  });

  it('every advisory has a non-empty description (explainable)', () => {
    const advisories = detectFraudPatterns(
      makeExpenses([{ amountMinor: 1_000_000, date: NOW }]),
      {
        averageAmountMinor: 1000,
        stdDevAmountMinor: 500,
        knownMerchants: [],
      },
    );
    for (const a of advisories) {
      expect(typeof a.description).toBe('string');
      expect(a.description.length).toBeGreaterThan(20);
    }
  });

  it('every advisory has a confidence between 0 and 1', () => {
    const advisories = detectFraudPatterns(
      makeExpenses([{ amountMinor: 1_000_000, date: NOW }]),
      {
        averageAmountMinor: 1000,
        stdDevAmountMinor: 500,
        knownMerchants: [],
      },
    );
    for (const a of advisories) {
      expect(a.confidence).toBeGreaterThanOrEqual(0);
      expect(a.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('returns a frozen array of frozen advisories', () => {
    const advisories = detectFraudPatterns(
      makeExpenses([{ amountMinor: 1_000_000, date: NOW }]),
      {
        averageAmountMinor: 1000,
        stdDevAmountMinor: 500,
        knownMerchants: [],
      },
    );
    expect(Object.isFrozen(advisories)).toBe(true);
    for (const a of advisories) {
      expect(Object.isFrozen(a)).toBe(true);
    }
  });
});

describe('isAdvisorySafe', () => {
  const safeAdvisory: FraudAdvisory = {
    signal: 'unusual_amount',
    confidence: 0.85,
    description: 'Unusual amount detected.',
    recommendation: 'Please review this expense.',
    severity: 'medium',
  };

  it('returns true for an advisory that uses "review" language', () => {
    expect(isAdvisorySafe(safeAdvisory)).toBe(true);
  });

  it('returns false for an advisory containing "block"', () => {
    expect(
      isAdvisorySafe({
        ...safeAdvisory,
        recommendation: 'Please block this expense.',
      }),
    ).toBe(false);
  });

  it('returns false for an advisory containing "reject"', () => {
    expect(
      isAdvisorySafe({
        ...safeAdvisory,
        recommendation: 'Please reject this expense.',
      }),
    ).toBe(false);
  });

  it('returns false for an advisory containing "refund"', () => {
    expect(
      isAdvisorySafe({
        ...safeAdvisory,
        recommendation: 'Please refund this expense.',
      }),
    ).toBe(false);
  });

  it('returns false for an advisory that does NOT contain "review"', () => {
    expect(
      isAdvisorySafe({
        ...safeAdvisory,
        recommendation: 'Please take action on this expense.',
      }),
    ).toBe(false);
  });
});

describe('filterSafeAdvisories', () => {
  it('filters out unsafe advisories', () => {
    const mixed: FraudAdvisory[] = [
      {
        signal: 'unusual_amount',
        confidence: 0.85,
        description: 'Safe',
        recommendation: 'Please review this expense.',
        severity: 'medium',
      },
      {
        signal: 'unusual_amount',
        confidence: 0.85,
        description: 'Unsafe',
        recommendation: 'Please block this expense.',
        severity: 'high',
      },
    ];
    const filtered = filterSafeAdvisories(mixed);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.recommendation).toContain('review');
  });

  it('returns a frozen array', () => {
    const filtered = filterSafeAdvisories([]);
    expect(Object.isFrozen(filtered)).toBe(true);
  });
});

describe('sortAdvisoriesBySeverity', () => {
  it('sorts by severity: high > medium > low', () => {
    const advisories: FraudAdvisory[] = [
      {
        signal: 'unusual_time',
        confidence: 0.4,
        description: 'Low',
        recommendation: 'review',
        severity: 'low',
      },
      {
        signal: 'unusual_amount',
        confidence: 0.85,
        description: 'High',
        recommendation: 'review',
        severity: 'high',
      },
      {
        signal: 'duplicate_pattern',
        confidence: 0.80,
        description: 'Medium',
        recommendation: 'review',
        severity: 'medium',
      },
    ];
    const sorted = sortAdvisoriesBySeverity(advisories);
    expect(sorted[0]?.severity).toBe('high');
    expect(sorted[1]?.severity).toBe('medium');
    expect(sorted[2]?.severity).toBe('low');
  });
});

describe('edge cases', () => {
  it('returns an empty array for an empty expense list', () => {
    expect(detectFraudPatterns([])).toEqual([]);
  });

  it('returns an empty array for non-array input', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(detectFraudPatterns(null as any)).toEqual([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(detectFraudPatterns(undefined as any)).toEqual([]);
  });

  it('handles expenses without a baseline', () => {
    const advisories = detectFraudPatterns(
      makeExpenses([{ date: '2026-07-15T03:30:00.000Z' }]),
    );
    // unusual_time should still fire without a baseline.
    expect(advisories.some((a) => a.signal === 'unusual_time')).toBe(true);
  });
});
