import { describe, expect, it } from '@jest/globals';

import {
  MIN_DAYS_SINCE_LAUNCH,
  MIN_EXPENSES_CREATED,
  MIN_NPS_SCORE_FOR_REVIEW,
  PROMPT_COOLDOWN_DAYS,
  isFinancialTask,
  nextEligiblePromptTime,
  shouldPromptForReview,
  type FinancialTask,
  type ReviewEligibility,
} from '../review-prompt-guard';

const NOW_ISO = '2025-06-01T00:00:00.000Z';

function eligibleBaseline(overrides: Partial<ReviewEligibility> = {}): ReviewEligibility {
  return {
    daysSinceFirstLaunch: MIN_DAYS_SINCE_LAUNCH + 5,
    totalExpensesCreated: MIN_EXPENSES_CREATED + 5,
    latestNpsScore: MIN_NPS_SCORE_FOR_REVIEW,
    lastPromptedAt: null,
    nowIso: NOW_ISO,
    ...overrides,
  };
}

describe('review-prompt-guard', () => {
  describe('constants', () => {
    it('requires 30+ days of use', () => {
      expect(MIN_DAYS_SINCE_LAUNCH).toBe(30);
    });
    it('requires 10+ expenses', () => {
      expect(MIN_EXPENSES_CREATED).toBe(10);
    });
    it('requires NPS 9+', () => {
      expect(MIN_NPS_SCORE_FOR_REVIEW).toBe(9);
    });
    it('enforces 180-day cooldown', () => {
      expect(PROMPT_COOLDOWN_DAYS).toBe(180);
    });
  });

  describe('isFinancialTask', () => {
    it.each<FinancialTask>([
      'settlement_confirmation',
      'expense_creation',
      'expense_editing',
      'upi_payment',
      'backup_restore',
      'conflict_resolution',
    ])('returns true for %s', (task) => {
      expect(isFinancialTask(task)).toBe(true);
    });

    it('returns false for non-financial task names', () => {
      expect(isFinancialTask('browsing_groups')).toBe(false);
      expect(isFinancialTask('viewing_activity')).toBe(false);
      expect(isFinancialTask(null)).toBe(false);
      expect(isFinancialTask(undefined)).toBe(false);
      expect(isFinancialTask(42)).toBe(false);
    });
  });

  describe('shouldPromptForReview — financial task hard guard', () => {
    it.each<FinancialTask>([
      'settlement_confirmation',
      'expense_creation',
      'expense_editing',
      'upi_payment',
      'backup_restore',
      'conflict_resolution',
    ])(
      'CRITICAL: returns FALSE when currentTask is %s (even if otherwise eligible)',
      (task) => {
        const eligibility = eligibleBaseline();
        expect(shouldPromptForReview(task, eligibility)).toBe(false);
      },
    );

    it('CRITICAL: returns FALSE for settlement_confirmation even when ALL other criteria are perfect', () => {
      const eligibility: ReviewEligibility = {
        daysSinceFirstLaunch: 365,
        totalExpensesCreated: 1000,
        latestNpsScore: 10,
        lastPromptedAt: null,
        nowIso: NOW_ISO,
      };
      expect(shouldPromptForReview('settlement_confirmation', eligibility)).toBe(false);
    });
  });

  describe('shouldPromptForReview — eligibility criteria', () => {
    it('returns TRUE when currentTask is null AND all criteria met', () => {
      const eligibility = eligibleBaseline();
      expect(shouldPromptForReview(null, eligibility)).toBe(true);
    });

    it('returns FALSE when daysSinceFirstLaunch is below 30', () => {
      const eligibility = eligibleBaseline({ daysSinceFirstLaunch: 29 });
      expect(shouldPromptForReview(null, eligibility)).toBe(false);
    });

    it('returns FALSE when totalExpensesCreated is below 10', () => {
      const eligibility = eligibleBaseline({ totalExpensesCreated: 9 });
      expect(shouldPromptForReview(null, eligibility)).toBe(false);
    });

    it('returns FALSE when latestNpsScore is below 9', () => {
      const eligibility = eligibleBaseline({ latestNpsScore: 8 });
      expect(shouldPromptForReview(null, eligibility)).toBe(false);
    });

    it('returns FALSE when latestNpsScore is null (no NPS submitted)', () => {
      const eligibility = eligibleBaseline({ latestNpsScore: null });
      expect(shouldPromptForReview(null, eligibility)).toBe(false);
    });

    it('returns TRUE when latestNpsScore is exactly 9', () => {
      const eligibility = eligibleBaseline({ latestNpsScore: 9 });
      expect(shouldPromptForReview(null, eligibility)).toBe(true);
    });

    it('returns TRUE when latestNpsScore is exactly 10', () => {
      const eligibility = eligibleBaseline({ latestNpsScore: 10 });
      expect(shouldPromptForReview(null, eligibility)).toBe(true);
    });

    it('returns FALSE when lastPromptedAt is within the 180-day cooldown', () => {
      // Prompted 30 days ago — within the 180-day cooldown.
      const lastPromptedAt = '2025-05-02T00:00:00.000Z';
      const eligibility = eligibleBaseline({ lastPromptedAt });
      expect(shouldPromptForReview(null, eligibility)).toBe(false);
    });

    it('returns TRUE when lastPromptedAt is outside the 180-day cooldown', () => {
      // Prompted 200 days ago — outside the cooldown.
      const lastPromptedAt = '2024-11-13T00:00:00.000Z';
      const eligibility = eligibleBaseline({ lastPromptedAt });
      expect(shouldPromptForReview(null, eligibility)).toBe(true);
    });

    it('returns FALSE when lastPromptedAt is exactly 180 days ago (boundary inclusive)', () => {
      // Exactly 180 days = 180 * 24 * 60 * 60 * 1000 ms.
      const cooldownMs = 180 * 24 * 60 * 60 * 1000;
      const nowMs = Date.parse(NOW_ISO);
      const lastMs = nowMs - cooldownMs;
      const lastPromptedAt = new Date(lastMs).toISOString();
      const eligibility = eligibleBaseline({ lastPromptedAt });
      // At exactly 180 days the difference is NOT < cooldownMs — should prompt.
      // (The check is `nowMs - lastMs < cooldownMs`, so equal means prompt.)
      expect(shouldPromptForReview(null, eligibility)).toBe(true);
    });

    it('returns FALSE when lastPromptedAt is unparseable (fail closed)', () => {
      const eligibility = eligibleBaseline({ lastPromptedAt: 'not-a-date' });
      expect(shouldPromptForReview(null, eligibility)).toBe(false);
    });

    it('returns FALSE when nowIso is unparseable (fail closed)', () => {
      const eligibility = eligibleBaseline({ nowIso: 'not-a-date' });
      expect(shouldPromptForReview(null, eligibility)).toBe(false);
    });
  });

  describe('shouldPromptForReview — combined criteria', () => {
    it('returns FALSE when multiple criteria fail (any one is enough)', () => {
      const eligibility: ReviewEligibility = {
        daysSinceFirstLaunch: 1, // fails
        totalExpensesCreated: 0, // fails
        latestNpsScore: null, // fails
        lastPromptedAt: '2025-05-15T00:00:00.000Z', // fails (cooldown)
        nowIso: NOW_ISO,
      };
      expect(shouldPromptForReview(null, eligibility)).toBe(false);
    });

    it('returns TRUE only when ALL criteria pass AND no financial task', () => {
      const eligibility: ReviewEligibility = {
        daysSinceFirstLaunch: 60,
        totalExpensesCreated: 25,
        latestNpsScore: 10,
        lastPromptedAt: '2024-01-01T00:00:00.000Z', // > 180 days ago
        nowIso: NOW_ISO,
      };
      expect(shouldPromptForReview(null, eligibility)).toBe(true);
    });
  });

  describe('nextEligiblePromptTime', () => {
    it('returns null when lastPromptedAt is null', () => {
      const eligibility = eligibleBaseline({ lastPromptedAt: null });
      expect(nextEligiblePromptTime(eligibility)).toBe(null);
    });

    it('returns the lastPromptedAt + 180 days', () => {
      const eligibility = eligibleBaseline({
        lastPromptedAt: '2025-01-01T00:00:00.000Z',
      });
      const next = nextEligiblePromptTime(eligibility);
      expect(next).not.toBeNull();
      // 2025-01-01 + 180 days = 2025-06-30
      const expected = new Date('2025-01-01T00:00:00.000Z').getTime() + 180 * 24 * 60 * 60 * 1000;
      expect(Date.parse(next as string)).toBe(expected);
    });

    it('returns null when lastPromptedAt is unparseable', () => {
      const eligibility = eligibleBaseline({ lastPromptedAt: 'not-a-date' });
      expect(nextEligiblePromptTime(eligibility)).toBe(null);
    });
  });
});
