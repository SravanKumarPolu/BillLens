/**
 * AI safety contract tests.
 *
 * Phase 10 Prompt 96.
 *
 * CRITICAL: verifies that AI NEVER makes financial decisions. Every
 * capability's contract MUST have makesFinancialDecisions=false,
 * isAdvisoryOnly=true, explainable=true, auditable=true.
 *
 * Also verifies that validateAiOutput() rejects any output containing
 * financial-decision language or missing the reasoning field.
 */

import { describe, expect, it } from '@jest/globals';

import {
  AI_CAPABILITIES,
  AI_SAFETY_CONTRACTS,
  getSafetyContract,
  isAiCapability,
  isCapabilitySafe,
  isConsentRequired,
  requiresHumanReview,
  validateAiOutput,
  type AiCapability,
} from '../ai-safety-contract';

describe('AI safety contracts registry', () => {
  it('contains a contract for every capability', () => {
    for (const capability of AI_CAPABILITIES) {
      const contract = AI_SAFETY_CONTRACTS[capability];
      expect(contract).toBeDefined();
      expect(contract.capability).toBe(capability);
    }
  });

  it('exposes all 8 capabilities', () => {
    expect(AI_CAPABILITIES).toHaveLength(8);
    expect(AI_CAPABILITIES).toContain('receipt_understanding');
    expect(AI_CAPABILITIES).toContain('merchant_recognition');
    expect(AI_CAPABILITIES).toContain('spending_categorisation');
    expect(AI_CAPABILITIES).toContain('duplicate_detection');
    expect(AI_CAPABILITIES).toContain('personalised_insights');
    expect(AI_CAPABILITIES).toContain('fraud_pattern_detection');
    expect(AI_CAPABILITIES).toContain('natural_language_search');
    expect(AI_CAPABILITIES).toContain('smart_budgeting');
  });
});

describe('AI constitutional invariants (CRITICAL)', () => {
  it.each(AI_CAPABILITIES)(
    '%s contract has makesFinancialDecisions=false',
    (capability: AiCapability) => {
      const contract = getSafetyContract(capability);
      expect(contract.makesFinancialDecisions).toBe(false);
    },
  );

  it.each(AI_CAPABILITIES)(
    '%s contract has isAdvisoryOnly=true',
    (capability: AiCapability) => {
      const contract = getSafetyContract(capability);
      expect(contract.isAdvisoryOnly).toBe(true);
    },
  );

  it.each(AI_CAPABILITIES)(
    '%s contract has explainable=true',
    (capability: AiCapability) => {
      const contract = getSafetyContract(capability);
      expect(contract.explainable).toBe(true);
    },
  );

  it.each(AI_CAPABILITIES)(
    '%s contract has auditable=true',
    (capability: AiCapability) => {
      const contract = getSafetyContract(capability);
      expect(contract.auditable).toBe(true);
    },
  );

  it.each(AI_CAPABILITIES)(
    'isCapabilitySafe(%s) returns true',
    (capability: AiCapability) => {
      expect(isCapabilitySafe(capability)).toBe(true);
    },
  );

  it.each(AI_CAPABILITIES)(
    '%s contract has a non-empty description',
    (capability: AiCapability) => {
      const contract = getSafetyContract(capability);
      expect(typeof contract.description).toBe('string');
      expect(contract.description.length).toBeGreaterThan(20);
    },
  );
});

describe('requiresHumanReview', () => {
  it('returns true for duplicate_detection (false positive = lost expense)', () => {
    expect(requiresHumanReview('duplicate_detection')).toBe(true);
  });

  it('returns true for fraud_pattern_detection (ALWAYS review, never auto-block)', () => {
    expect(requiresHumanReview('fraud_pattern_detection')).toBe(true);
  });

  it('returns true for spending_categorisation (user picks the category)', () => {
    expect(requiresHumanReview('spending_categorisation')).toBe(true);
  });

  it('returns true for smart_budgeting (user sets the budget)', () => {
    expect(requiresHumanReview('smart_budgeting')).toBe(true);
  });

  it('returns true for receipt_understanding (user reviews extracted fields)', () => {
    expect(requiresHumanReview('receipt_understanding')).toBe(true);
  });

  it('returns false for merchant_recognition (just metadata)', () => {
    expect(requiresHumanReview('merchant_recognition')).toBe(false);
  });

  it('returns false for natural_language_search (read-only)', () => {
    expect(requiresHumanReview('natural_language_search')).toBe(false);
  });
});

describe('isConsentRequired', () => {
  it('returns true for personalised_insights (processes user data)', () => {
    expect(isConsentRequired('personalised_insights')).toBe(true);
  });

  it('returns true for receipt_understanding (OCR data processed by AI)', () => {
    expect(isConsentRequired('receipt_understanding')).toBe(true);
  });

  it('returns false for merchant_recognition', () => {
    expect(isConsentRequired('merchant_recognition')).toBe(false);
  });
});

describe('getSafetyContract', () => {
  it('returns the contract for a known capability', () => {
    const contract = getSafetyContract('fraud_pattern_detection');
    expect(contract.capability).toBe('fraud_pattern_detection');
    expect(contract.requiresHumanReview).toBe(true);
  });

  it('throws on an unknown capability', () => {
    expect(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getSafetyContract('unknown_capability' as any),
    ).toThrow('Unknown AI capability');
  });
});

describe('isAiCapability', () => {
  it('returns true for known capabilities', () => {
    expect(isAiCapability('fraud_pattern_detection')).toBe(true);
    expect(isAiCapability('merchant_recognition')).toBe(true);
  });

  it('returns false for unknown capabilities', () => {
    expect(isAiCapability('unknown')).toBe(false);
    expect(isAiCapability('')).toBe(false);
    expect(isAiCapability(null)).toBe(false);
    expect(isAiCapability(123)).toBe(false);
  });
});

describe('validateAiOutput', () => {
  it('accepts a valid output with a reasoning field', () => {
    const result = validateAiOutput('merchant_recognition', {
      reasoning: 'Matched on the substring "starbucks" with 95% confidence.',
      canonicalName: 'STARBUCKS',
      category: 'coffee_shops',
      confidence: 0.95,
    });
    expect(result.valid).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('rejects output without a reasoning field (explainability)', () => {
    const result = validateAiOutput('merchant_recognition', {
      canonicalName: 'STARBUCKS',
      category: 'coffee_shops',
      confidence: 0.95,
    });
    expect(result.valid).toBe(false);
    expect(result.violations).toContain(
      'output must include a non-empty "reasoning" field (explainability)',
    );
  });

  it('rejects output with an empty reasoning field', () => {
    const result = validateAiOutput('merchant_recognition', {
      reasoning: '',
      canonicalName: 'STARBUCKS',
    });
    expect(result.valid).toBe(false);
  });

  it('rejects null/undefined output', () => {
    expect(validateAiOutput('merchant_recognition', null).valid).toBe(false);
    expect(validateAiOutput('merchant_recognition', undefined).valid).toBe(false);
  });

  it('rejects non-object output', () => {
    expect(validateAiOutput('merchant_recognition', 'string').valid).toBe(false);
    expect(validateAiOutput('merchant_recognition', 123).valid).toBe(false);
  });

  it('rejects output containing "auto-categorised"', () => {
    const result = validateAiOutput('spending_categorisation', {
      reasoning: 'The expense was auto-categorised as food_dining.',
      category: 'food_dining',
    });
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes('auto-categorised'))).toBe(true);
  });

  it('rejects output containing "auto-blocked"', () => {
    const result = validateAiOutput('fraud_pattern_detection', {
      reasoning: 'The transaction was auto-blocked due to unusual amount.',
      signal: 'unusual_amount',
    });
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes('auto-blocked'))).toBe(true);
  });

  it('rejects output containing "auto-settled"', () => {
    const result = validateAiOutput('duplicate_detection', {
      reasoning: 'The expense was auto-settled.',
    });
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes('auto-settled'))).toBe(true);
  });

  it('rejects output containing "blocked transaction"', () => {
    const result = validateAiOutput('fraud_pattern_detection', {
      reasoning: 'This was a blocked transaction.',
    });
    expect(result.valid).toBe(false);
  });

  it('rejects output containing "executed payment"', () => {
    const result = validateAiOutput('fraud_pattern_detection', {
      reasoning: 'The system executed payment for review.',
    });
    expect(result.valid).toBe(false);
  });

  it('rejects output with a truthy "decision" field', () => {
    const result = validateAiOutput('duplicate_detection', {
      reasoning: 'A decision was made.',
      decision: 'merge',
    });
    expect(result.valid).toBe(false);
    expect(result.violations).toContain(
      'output must not contain a truthy "decision" field',
    );
  });

  it('rejects output with autoExecute=true', () => {
    const result = validateAiOutput('spending_categorisation', {
      reasoning: 'The system auto-executed the categorisation.',
      autoExecute: true,
    });
    expect(result.valid).toBe(false);
    expect(result.violations).toContain('output must not have autoExecute=true');
  });

  it('rejects output with blockTransaction=true', () => {
    const result = validateAiOutput('fraud_pattern_detection', {
      reasoning: 'The transaction was flagged for review.',
      blockTransaction: true,
    });
    expect(result.valid).toBe(false);
    expect(result.violations).toContain('output must not have blockTransaction=true');
  });

  it('rejects output with executeAction=true', () => {
    const result = validateAiOutput('smart_budgeting', {
      reasoning: 'Budget was applied.',
      executeAction: true,
    });
    expect(result.valid).toBe(false);
    expect(result.violations).toContain('output must not have executeAction=true');
  });

  it('rejects fraud output containing "block this expense" (must say "review")', () => {
    const result = validateAiOutput('fraud_pattern_detection', {
      reasoning: 'Recommendation: block this expense immediately.',
    });
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes('"review this expense"'))).toBe(true);
  });

  it('rejects fraud output containing "reject this expense"', () => {
    const result = validateAiOutput('fraud_pattern_detection', {
      reasoning: 'Recommendation: reject this expense.',
    });
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes('"review this expense"'))).toBe(true);
  });

  it('accepts fraud output that uses "review" language', () => {
    const result = validateAiOutput('fraud_pattern_detection', {
      reasoning: 'Unusual amount detected. Recommendation: review this expense to confirm it is legitimate.',
      signal: 'unusual_amount',
      confidence: 0.85,
      recommendation: 'Please review this expense.',
      severity: 'medium',
    });
    expect(result.valid).toBe(true);
  });

  it('returns a frozen violations array', () => {
    const result = validateAiOutput('merchant_recognition', {
      // missing reasoning
    });
    expect(Object.isFrozen(result.violations)).toBe(true);
  });

  it('accumulates multiple violations', () => {
    const result = validateAiOutput('fraud_pattern_detection', {
      reasoning: 'auto-blocked and reject this expense',
      decision: 'block',
      autoExecute: true,
      blockTransaction: true,
    });
    expect(result.valid).toBe(false);
    expect(result.violations.length).toBeGreaterThanOrEqual(5);
  });
});

describe('AI contracts are immutable', () => {
  it('the AI_SAFETY_CONTRACTS object is frozen', () => {
    expect(Object.isFrozen(AI_SAFETY_CONTRACTS)).toBe(true);
  });

  it('each contract is frozen', () => {
    for (const capability of AI_CAPABILITIES) {
      expect(Object.isFrozen(AI_SAFETY_CONTRACTS[capability])).toBe(true);
    }
  });
});
