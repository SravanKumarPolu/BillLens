import {
  evaluatePolicy,
  evaluateRule,
  isPolicyApplicable,
  type ExpensePolicy,
  type PolicyRule,
} from '../expense-policy';

const baseRule: PolicyRule = {
  type: 'spending_limit',
  condition: '{"amountMinor":{"gt":5000}}',
  action: 'warn',
  threshold: 5000,
};

const basePolicy: ExpensePolicy = {
  id: 'policy_1',
  orgId: 'org_1',
  name: 'Default policy',
  rules: [baseRule],
  appliesTo: 'all',
};

describe('enterprise / expense-policy', () => {
  describe('isPolicyApplicable', () => {
    it('returns true when appliesTo=all', () => {
      expect(
        isPolicyApplicable(basePolicy, {
          amountMinor: 100,
          hasReceipt: false,
          category: 'food',
        }),
      ).toBe(true);
    });
    it('returns true for appliesTo=department when departmentId matches targetId', () => {
      const policy: ExpensePolicy = {
        ...basePolicy,
        appliesTo: 'department',
        targetId: 'dept_1',
      };
      expect(
        isPolicyApplicable(policy, {
          amountMinor: 100,
          hasReceipt: false,
          category: 'food',
          departmentId: 'dept_1',
        }),
      ).toBe(true);
    });
    it('returns false for appliesTo=department when departmentId does NOT match', () => {
      const policy: ExpensePolicy = {
        ...basePolicy,
        appliesTo: 'department',
        targetId: 'dept_1',
      };
      expect(
        isPolicyApplicable(policy, {
          amountMinor: 100,
          hasReceipt: false,
          category: 'food',
          departmentId: 'dept_2',
        }),
      ).toBe(false);
    });
    it('returns false for appliesTo=cost_centre when targetId is undefined', () => {
      const policy: ExpensePolicy = {
        ...basePolicy,
        appliesTo: 'cost_centre',
      };
      expect(
        isPolicyApplicable(policy, {
          amountMinor: 100,
          hasReceipt: false,
          category: 'food',
          costCentreId: 'cc_1',
        }),
      ).toBe(false);
    });
  });

  describe('evaluateRule', () => {
    it('returns matched=false when condition is empty string', () => {
      const rule: PolicyRule = {
        type: 'spending_limit',
        condition: '',
        action: 'block',
      };
      const result = evaluateRule(rule, {
        amountMinor: 1000,
        hasReceipt: false,
        category: 'food',
      });
      expect(result.matched).toBe(false);
      expect(result.outcome).toBe('allow');
    });
    it('returns matched=false when condition is invalid JSON', () => {
      const rule: PolicyRule = {
        type: 'spending_limit',
        condition: 'not json',
        action: 'block',
      };
      const result = evaluateRule(rule, {
        amountMinor: 1000,
        hasReceipt: false,
        category: 'food',
      });
      expect(result.matched).toBe(false);
    });
    it('matches spending_limit when amount > threshold', () => {
      const result = evaluateRule(baseRule, {
        amountMinor: 6000,
        hasReceipt: false,
        category: 'food',
      });
      expect(result.matched).toBe(true);
      expect(result.outcome).toBe('warn');
    });
    it('does NOT match spending_limit when amount == threshold', () => {
      const result = evaluateRule(baseRule, {
        amountMinor: 5000,
        hasReceipt: false,
        category: 'food',
      });
      expect(result.matched).toBe(false);
    });
    it('falls back to rule.threshold when condition.amountMinor.gt missing', () => {
      const rule: PolicyRule = {
        type: 'spending_limit',
        condition: '{}',
        action: 'block',
        threshold: 1000,
      };
      expect(
        evaluateRule(rule, {
          amountMinor: 500,
          hasReceipt: false,
          category: 'food',
        }).matched,
      ).toBe(false);
      expect(
        evaluateRule(rule, {
          amountMinor: 1001,
          hasReceipt: false,
          category: 'food',
        }).matched,
      ).toBe(true);
    });
    it('matches category_restriction when category is in list', () => {
      const rule: PolicyRule = {
        type: 'category_restriction',
        condition: '{"category":{"in":["alcohol","gifts"]}}',
        action: 'block',
      };
      expect(
        evaluateRule(rule, {
          amountMinor: 100,
          hasReceipt: false,
          category: 'alcohol',
        }).matched,
      ).toBe(true);
      expect(
        evaluateRule(rule, {
          amountMinor: 100,
          hasReceipt: false,
          category: 'food',
        }).matched,
      ).toBe(false);
    });
    it('matches time_restriction when hour is in list', () => {
      const rule: PolicyRule = {
        type: 'time_restriction',
        condition: '{"hour":{"in":[22,23,0,1,2,3]}}',
        action: 'warn',
      };
      expect(
        evaluateRule(rule, {
          amountMinor: 100,
          hasReceipt: false,
          category: 'food',
          hour: 23,
        }).matched,
      ).toBe(true);
      expect(
        evaluateRule(rule, {
          amountMinor: 100,
          hasReceipt: false,
          category: 'food',
          hour: 12,
        }).matched,
      ).toBe(false);
    });
    it('does NOT match time_restriction when hour undefined', () => {
      const rule: PolicyRule = {
        type: 'time_restriction',
        condition: '{"hour":{"in":[22,23]}}',
        action: 'warn',
      };
      expect(
        evaluateRule(rule, {
          amountMinor: 100,
          hasReceipt: false,
          category: 'food',
        }).matched,
      ).toBe(false);
    });
  });

  describe('evaluatePolicy', () => {
    it('returns allow when policy not applicable', () => {
      const policy: ExpensePolicy = {
        ...basePolicy,
        appliesTo: 'department',
        targetId: 'dept_1',
      };
      const result = evaluatePolicy(policy, {
        amountMinor: 10000,
        hasReceipt: false,
        category: 'food',
        departmentId: 'dept_2',
      });
      expect(result.outcome).toBe('allow');
      expect(result.reasons).toContain('policy_not_applicable');
    });
    it('returns allow when no rules match', () => {
      const result = evaluatePolicy(basePolicy, {
        amountMinor: 1000,
        hasReceipt: false,
        category: 'food',
      });
      expect(result.outcome).toBe('allow');
      expect(result.reasons).toContain('no_rules_matched');
    });
    it('returns warn when a warn rule matches', () => {
      const result = evaluatePolicy(basePolicy, {
        amountMinor: 6000,
        hasReceipt: false,
        category: 'food',
      });
      expect(result.outcome).toBe('warn');
    });
    it('returns block when a block rule matches (worst wins)', () => {
      const policy: ExpensePolicy = {
        ...basePolicy,
        rules: [
          baseRule, // warn @ 5000
          {
            type: 'spending_limit',
            condition: '{"amountMinor":{"gt":8000}}',
            action: 'block',
            threshold: 8000,
          },
        ],
      };
      const result = evaluatePolicy(policy, {
        amountMinor: 9000,
        hasReceipt: false,
        category: 'food',
      });
      expect(result.outcome).toBe('block');
    });
    it('require_approval ranks between warn and block', () => {
      const policy: ExpensePolicy = {
        ...basePolicy,
        rules: [
          { type: 'spending_limit', condition: '{"amountMinor":{"gt":5000}}', action: 'warn', threshold: 5000 },
          { type: 'approval_required', condition: '{"amountMinor":{"gt":8000}}', action: 'require_approval', threshold: 8000 },
        ],
      };
      const result = evaluatePolicy(policy, {
        amountMinor: 9000,
        hasReceipt: false,
        category: 'food',
      });
      expect(result.outcome).toBe('require_approval');
    });
    it('returns per-rule evaluations', () => {
      const policy: ExpensePolicy = {
        ...basePolicy,
        rules: [
          baseRule,
          {
            type: 'category_restriction',
            condition: '{"category":{"in":["alcohol"]}}',
            action: 'block',
          },
        ],
      };
      const result = evaluatePolicy(policy, {
        amountMinor: 6000,
        hasReceipt: false,
        category: 'food',
      });
      expect(result.evaluations).toHaveLength(2);
      expect(result.evaluations[0]!.matched).toBe(true);
      expect(result.evaluations[1]!.matched).toBe(false);
    });
    it('result is frozen', () => {
      const result = evaluatePolicy(basePolicy, {
        amountMinor: 6000,
        hasReceipt: false,
        category: 'food',
      });
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.evaluations)).toBe(true);
      expect(Object.isFrozen(result.reasons)).toBe(true);
    });
  });
});
