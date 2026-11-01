/**
 * Team expense policies — declarative rules evaluated against expenses.
 *
 * Phase 10 Prompt 92: Enterprise Features.
 *
 * CRITICAL FINANCIAL SAFETY: `evaluatePolicy` does NOT alter split
 * calculations. It only produces a `PolicyEvaluationResult` that the
 * application layer consults BEFORE persisting an expense. The
 * split-engine continues to enforce zero-sum + payer-total invariants
 * independently of policy outcomes.
 *
 * See `docs/enterprise-features.md` and `docs/money-and-rounding.md`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PolicyRuleType =
  | 'spending_limit'
  | 'receipt_required'
  | 'approval_required'
  | 'category_restriction'
  | 'time_restriction';

export type PolicyAction = 'block' | 'warn' | 'require_approval';

export type PolicyAppliesTo = 'all' | 'department' | 'cost_centre';

export interface PolicyRule {
  readonly type: PolicyRuleType;
  /**
   * Condition expression. Format depends on `type`:
   *  - spending_limit:       '{"amountMinor":{"gt":5000}}'
   *  - receipt_required:     '{"amountMinor":{"gt":5000}}'
   *  - approval_required:    '{"amountMinor":{"gt":25000}}'
   *  - category_restriction: '{"category":{"in":["alcohol","gifts"]}}'
   *  - time_restriction:     '{"hour":{"in":[22,23,0,1,2,3]}}'
   */
  readonly condition: string;
  readonly action: PolicyAction;
  /** Optional numeric threshold (mirrors amountMinor in condition). */
  readonly threshold?: number;
}

export interface ExpensePolicy {
  readonly id: string;
  readonly orgId: string;
  readonly name: string;
  readonly rules: readonly PolicyRule[];
  readonly appliesTo: PolicyAppliesTo;
  /** Department or cost-centre ID when appliesTo is not 'all'. */
  readonly targetId?: string;
}

export interface PolicyEvaluationInput {
  readonly amountMinor: number;
  readonly hasReceipt: boolean;
  readonly category: string;
  readonly costCentreId?: string;
  readonly departmentId?: string;
  /** Hour of day 0-23 (for time_restriction). Optional. */
  readonly hour?: number;
}

export type PolicyEvaluationOutcome = 'allow' | 'warn' | 'require_approval' | 'block';

export interface PolicyEvaluation {
  readonly rule: PolicyRule;
  readonly matched: boolean;
  readonly outcome: PolicyEvaluationOutcome;
}

export interface PolicyEvaluationResult {
  readonly policyId: string;
  readonly policyName: string;
  readonly outcome: PolicyEvaluationOutcome;
  readonly evaluations: readonly PolicyEvaluation[];
  /** Human-readable list of reasons for the outcome. */
  readonly reasons: readonly string[];
}

// ---------------------------------------------------------------------------
// Condition parsing (defensive — never throws; returns false on parse error)
// ---------------------------------------------------------------------------

interface ParsedCondition {
  readonly amountMinorGt?: number;
  readonly categoryIn?: readonly string[];
  readonly hourIn?: readonly number[];
}

function parseCondition(condition: string): ParsedCondition | null {
  if (typeof condition !== 'string' || condition.length === 0) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(condition);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }
  const obj = parsed as Record<string, unknown>;
  const result: {
    amountMinorGt?: number;
    categoryIn?: readonly string[];
    hourIn?: readonly number[];
  } = {};
  const amountMinor = obj['amountMinor'];
  if (amountMinor && typeof amountMinor === 'object') {
    const gt = (amountMinor as Record<string, unknown>)['gt'];
    if (typeof gt === 'number' && Number.isFinite(gt)) {
      result.amountMinorGt = gt;
    }
  }
  const category = obj['category'];
  if (category && typeof category === 'object') {
    const inList = (category as Record<string, unknown>)['in'];
    if (Array.isArray(inList)) {
      result.categoryIn = inList.filter((x) => typeof x === 'string') as string[];
    }
  }
  const hour = obj['hour'];
  if (hour && typeof hour === 'object') {
    const inList = (hour as Record<string, unknown>)['in'];
    if (Array.isArray(inList)) {
      result.hourIn = inList.filter((x) => typeof x === 'number') as number[];
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Rule evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluates a single policy rule against the input. Returns whether
 * the rule MATCHED (i.e. the condition was true) and the outcome that
 * should apply if matched.
 *
 * - spending_limit: matches when amountMinor > threshold (or condition.amountMinor.gt)
 * - receipt_required: matches when amountMinor > threshold (or condition.amountMinor.gt)
 * - approval_required: matches when amountMinor > threshold (or condition.amountMinor.gt)
 * - category_restriction: matches when category is in the condition.category.in list
 * - time_restriction: matches when input.hour is in condition.hour.in list
 *
 * When the rule does not match, outcome is 'allow'.
 */
export function evaluateRule(
  rule: PolicyRule,
  input: PolicyEvaluationInput,
): PolicyEvaluation {
  const parsed = parseCondition(rule.condition);
  let matched = false;
  if (parsed) {
    switch (rule.type) {
      case 'spending_limit':
      case 'receipt_required':
      case 'approval_required': {
        const threshold =
          parsed.amountMinorGt ?? rule.threshold ?? Number.POSITIVE_INFINITY;
        matched = input.amountMinor > threshold;
        break;
      }
      case 'category_restriction': {
        if (parsed.categoryIn) {
          matched = parsed.categoryIn.includes(input.category);
        }
        break;
      }
      case 'time_restriction': {
        if (parsed.hourIn && typeof input.hour === 'number') {
          matched = parsed.hourIn.includes(input.hour);
        }
        break;
      }
    }
  }
  const outcome: PolicyEvaluationOutcome = matched ? rule.action : 'allow';
  return { rule, matched, outcome };
}

/**
 * Returns true when the policy applies to the given input.
 *
 * A policy with appliesTo='all' always applies.
 * A policy with appliesTo='department' applies only when input.departmentId
 *   equals policy.targetId.
 * A policy with appliesTo='cost_centre' applies only when input.costCentreId
 *   equals policy.targetId.
 */
export function isPolicyApplicable(
  policy: ExpensePolicy,
  input: PolicyEvaluationInput,
): boolean {
  if (policy.appliesTo === 'all') {
    return true;
  }
  if (!policy.targetId) {
    return false;
  }
  if (policy.appliesTo === 'department') {
    return input.departmentId === policy.targetId;
  }
  if (policy.appliesTo === 'cost_centre') {
    return input.costCentreId === policy.targetId;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Policy evaluation
// ---------------------------------------------------------------------------

const OUTCOME_RANK: Readonly<Record<PolicyEvaluationOutcome, number>> = {
  allow: 0,
  warn: 1,
  require_approval: 2,
  block: 3,
};

/**
 * Evaluates an entire policy against an expense input.
 *
 * Aggregation rule: the worst outcome across all matching rules wins.
 * If no rules match, outcome is 'allow'.
 *
 * The result is FROZEN and contains a per-rule breakdown for audit.
 *
 * This function does NOT mutate the input, does NOT alter splits, and
 * does NOT persist anything. It is a pure decision function.
 */
export function evaluatePolicy(
  policy: ExpensePolicy,
  input: PolicyEvaluationInput,
): PolicyEvaluationResult {
  if (!isPolicyApplicable(policy, input)) {
    return Object.freeze({
      policyId: policy.id,
      policyName: policy.name,
      outcome: 'allow',
      evaluations: [],
      reasons: ['policy_not_applicable'],
    });
  }
  const evaluations: PolicyEvaluation[] = [];
  let worstOutcome: PolicyEvaluationOutcome = 'allow';
  const reasons: string[] = [];
  for (const rule of policy.rules) {
    const evaluation = evaluateRule(rule, input);
    evaluations.push(evaluation);
    if (evaluation.matched) {
      if (OUTCOME_RANK[evaluation.outcome] > OUTCOME_RANK[worstOutcome]) {
        worstOutcome = evaluation.outcome;
      }
      reasons.push(
        `rule_${rule.type}_matched_action_${evaluation.outcome}`,
      );
    }
  }
  if (reasons.length === 0) {
    reasons.push('no_rules_matched');
  }
  return Object.freeze({
    policyId: policy.id,
    policyName: policy.name,
    outcome: worstOutcome,
    evaluations: Object.freeze(evaluations),
    reasons: Object.freeze(reasons),
  });
}
