/**
 * Growth funnel tests.
 *
 * Phase 10 Prompt 95.
 */

import { describe, expect, it } from '@jest/globals';

import {
  FUNNEL_STAGE_ORDER,
  computeFunnel,
  getStageIndex,
  hasReachedStage,
  identifyBottleneck,
  type FunnelStageInput,
} from '../growth-funnel';

function makeStages(users: number[]): readonly FunnelStageInput[] {
  if (users.length !== FUNNEL_STAGE_ORDER.length) {
    throw new Error(
      `makeStages expects ${FUNNEL_STAGE_ORDER.length} entries, got ${users.length}`,
    );
  }
  return FUNNEL_STAGE_ORDER.map((stage, i) => ({
    stage,
    users: users[i] ?? 0,
  }));
}

describe('computeFunnel', () => {
  it('computes conversion + dropoff for each stage', () => {
    const funnel = computeFunnel(
      makeStages([1000, 800, 600, 400, 200, 100, 80, 60, 20]),
    );
    expect(funnel).toHaveLength(9);
    // First stage: conversionRate = 1 (no predecessor).
    expect(funnel[0]?.conversionRate).toBe(1);
    expect(funnel[0]?.dropoffRate).toBe(0);
    // Second stage: 800/1000 = 0.8 conversion, 0.2 dropoff.
    expect(funnel[1]?.conversionRate).toBeCloseTo(0.8, 5);
    expect(funnel[1]?.dropoffRate).toBeCloseTo(0.2, 5);
    // Third stage: 600/800 = 0.75 conversion, 0.25 dropoff.
    expect(funnel[2]?.conversionRate).toBeCloseTo(0.75, 5);
  });

  it('returns an empty list for empty input', () => {
    expect(computeFunnel([])).toEqual([]);
  });

  it('clamps conversionRate to 1 when users increase (impossible funnel)', () => {
    const funnel = computeFunnel(
      makeStages([100, 200, 100, 50, 25, 10, 5, 2, 1]),
    );
    expect(funnel[1]?.conversionRate).toBe(1);
    expect(funnel[1]?.dropoffRate).toBe(0);
  });

  it('handles a stage with 0 users (conversionRate = 0 from previous>0)', () => {
    const funnel = computeFunnel(
      makeStages([100, 100, 0, 0, 0, 0, 0, 0, 0]),
    );
    expect(funnel[2]?.conversionRate).toBe(0);
    expect(funnel[2]?.dropoffRate).toBe(1);
  });

  it('handles a stage with 0 users after a 0-user stage (conversionRate = 0)', () => {
    const funnel = computeFunnel(
      makeStages([100, 0, 0, 0, 0, 0, 0, 0, 0]),
    );
    expect(funnel[1]?.conversionRate).toBe(0);
    expect(funnel[2]?.conversionRate).toBe(0);
  });

  it('throws when stages are out of canonical order', () => {
    const wrong = [...FUNNEL_STAGE_ORDER].reverse().map((stage, i) => ({
      stage,
      users: 100 - i * 10,
    }));
    expect(() => computeFunnel(wrong)).toThrow(
      /stage at index 0 must be "app_download"/,
    );
  });

  it('throws when a stage is missing', () => {
    // Bypass makeStages (which requires all 9) and build a partial list manually.
    const partial: FunnelStageInput[] = [
      { stage: 'app_download', users: 100 },
      { stage: 'guest_signup', users: 80 },
      { stage: 'first_group', users: 60 },
      { stage: 'first_expense', users: 40 },
      { stage: 'first_receipt_scan', users: 20 },
      { stage: 'first_settlement', users: 10 },
      { stage: 'account_created', users: 5 },
      { stage: 'returning_user', users: 2 },
    ];
    expect(() => computeFunnel(partial)).toThrow(
      /stages must contain all 9 stages/,
    );
  });

  it('throws on a non-integer users count', () => {
    const bad = makeStages([100, 80, 60, 60.5, 40, 20, 10, 5, 2]);
    expect(() => computeFunnel(bad)).toThrow(
      /users for stage "first_expense" must be a non-negative integer/,
    );
  });

  it('throws on a negative users count', () => {
    const bad = makeStages([100, -5, 60, 40, 20, 10, 5, 2, 1]);
    expect(() => computeFunnel(bad)).toThrow(
      /users for stage "guest_signup" must be a non-negative integer/,
    );
  });

  it('returns a frozen array of frozen objects', () => {
    const funnel = computeFunnel(makeStages([100, 80, 60, 40, 20, 10, 5, 2, 1]));
    expect(Object.isFrozen(funnel)).toBe(true);
    for (const stage of funnel) {
      expect(Object.isFrozen(stage)).toBe(true);
    }
  });
});

describe('identifyBottleneck', () => {
  it('returns the stage with the highest drop-off', () => {
    const funnel = computeFunnel(
      makeStages([1000, 800, 600, 400, 200, 100, 80, 60, 20]),
    );
    // Drop-offs:
    //   guest_signup:      200 (20%)
    //   first_group:       200 (25%)
    //   first_expense:     200 (33.3%)
    //   first_receipt_scan:200 (50%)  ← worst
    //   first_settlement:  100 (50%)  ← tied; earliest wins
    //   account_created:    20 (20%)
    //   returning_user:     20 (25%)
    //   power_user:         40 (66.7%)
    // The highest drop-off rate is power_user at 66.7%.
    const bottleneck = identifyBottleneck(funnel);
    expect(bottleneck).toBe('power_user');
  });

  it('returns null when there is no drop-off', () => {
    const funnel = computeFunnel(makeStages([100, 100, 100, 100, 100, 100, 100, 100, 100]));
    expect(identifyBottleneck(funnel)).toBe(null);
  });

  it('returns null for an empty funnel', () => {
    expect(identifyBottleneck([])).toBe(null);
  });

  it('breaks ties by picking the EARLIEST stage (more impactful to fix)', () => {
    const funnel = computeFunnel(
      makeStages([100, 50, 50, 50, 50, 50, 50, 50, 50]),
    );
    // guest_signup has 50% drop-off; all other stages have 0%.
    expect(identifyBottleneck(funnel)).toBe('guest_signup');
  });

  it('returns the bottleneck stage NAME, not user data', () => {
    const funnel = computeFunnel(
      makeStages([1000, 800, 600, 400, 200, 100, 80, 60, 20]),
    );
    const bottleneck = identifyBottleneck(funnel);
    expect(typeof bottleneck).toBe('string');
    // No user counts in the result.
    expect(bottleneck).not.toMatch(/\d/);
  });
});

describe('getStageIndex / hasReachedStage', () => {
  it('returns the index of a stage', () => {
    expect(getStageIndex('app_download')).toBe(0);
    expect(getStageIndex('power_user')).toBe(8);
    expect(getStageIndex('first_settlement')).toBe(5);
  });

  it('returns true when stage is at or past the target', () => {
    expect(hasReachedStage('first_settlement', 'first_group')).toBe(true);
    expect(hasReachedStage('first_group', 'first_group')).toBe(true);
  });

  it('returns false when stage is before the target', () => {
    expect(hasReachedStage('first_group', 'first_settlement')).toBe(false);
    expect(hasReachedStage('app_download', 'guest_signup')).toBe(false);
  });
});

describe('FUNNEL_STAGE_ORDER', () => {
  it('contains 9 stages in the canonical order', () => {
    expect(FUNNEL_STAGE_ORDER).toHaveLength(9);
    expect(FUNNEL_STAGE_ORDER[0]).toBe('app_download');
    expect(FUNNEL_STAGE_ORDER[8]).toBe('power_user');
  });

  it('is frozen', () => {
    expect(Object.isFrozen(FUNNEL_STAGE_ORDER)).toBe(true);
  });
});
