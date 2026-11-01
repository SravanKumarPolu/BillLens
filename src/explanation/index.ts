/**
 * Explanation module barrel.
 *
 * Aggregates explanation-engine-related code from the domain layer.
 * The Explanation Engine is a PURE domain service — it depends only on
 * balance engine output and verified financial records. It does NOT
 * use uncontrolled AI/LLMs.
 *
 * ARCHITECTURE RULE: Explanation logic must remain independent from UI.
 * The presentation layer calls application use cases which call the
 * explanation engine; screens never import explanation functions directly.
 */

// Explanation types
export type {
  BalanceExplanation,
  ExpenseContribution,
  SettlementExplanation,
  RoundingExplanation,
} from '@domain/explanations/explanation-types';

// Explanation services
export {
  explainMemberBalance,
} from '@domain/explanations/balance-explanation-service';

export {
  buildSettlementExplanations,
} from '@domain/explanations/settlement-explanation-builder';

export {
  buildRoundingExplanations,
} from '@domain/explanations/rounding-explanation-builder';
