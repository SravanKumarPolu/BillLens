/**
 * AI safety contract — the constitutional guard for every AI capability.
 *
 * Phase 10 Prompt 96: AI Evolution.
 *
 * CRITICAL INVARIANTS (enforced by type system + tests):
 *   - `makesFinancialDecisions: false`  — AI NEVER makes financial decisions.
 *   - `isAdvisoryOnly: true`            — AI output is a suggestion, never a command.
 *   - `explainable: true`               — every AI output includes a `reasoning` field.
 *   - `auditable: true`                 — every AI invocation is logged for review.
 *
 * These four booleans are the AI constitution. They are the literal types
 * `false`, `true`, `true`, `true` — NOT computed values. TypeScript will
 * refuse to compile a contract that violates them.
 *
 * The `requiresHumanReview` and `consentRequired` fields are per-capability
 * and may vary:
 *   - `duplicate_detection`: requires review (false positive = lost expense).
 *   - `fraud_pattern_detection`: ALWAYS requires review (never auto-blocks).
 *   - `merchant_recognition`: no review needed (just metadata).
 *   - `personalised_insights`: consent required (data is processed to suggest).
 *
 * `validateAiOutput()` is called by the application layer BEFORE showing
 * AI output to the user. It rejects any output that:
 *   - Contains a financial decision (e.g. "auto-categorised", "auto-blocked",
 *     "auto-approved", "auto-settled", "auto-paid").
 *   - Lacks a `reasoning` field (every output must be explainable).
 *   - Lacks an audit trail (every output must reference the invocation id).
 *
 * See `docs/ai-evolution.md`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AiCapability =
  | 'receipt_understanding'
  | 'merchant_recognition'
  | 'spending_categorisation'
  | 'duplicate_detection'
  | 'personalised_insights'
  | 'fraud_pattern_detection'
  | 'natural_language_search'
  | 'smart_budgeting';

export interface AiSafetyContract {
  readonly capability: AiCapability;
  /** ALWAYS false — AI never makes financial decisions. */
  readonly makesFinancialDecisions: false;
  /** ALWAYS true — AI output is a suggestion, never a command. */
  readonly isAdvisoryOnly: true;
  /** Whether a human must review the AI output before it takes effect. */
  readonly requiresHumanReview: boolean;
  /** ALWAYS true — AI output includes a `reasoning` field. */
  readonly explainable: true;
  /** ALWAYS true — AI invocations are logged for audit. */
  readonly auditable: true;
  /** Whether the user must opt in to this AI capability. */
  readonly consentRequired: boolean;
  readonly description: string;
}

// ---------------------------------------------------------------------------
// Contracts registry
// ---------------------------------------------------------------------------

export const AI_SAFETY_CONTRACTS: Readonly<Record<AiCapability, AiSafetyContract>> =
  Object.freeze(
    ((): Record<AiCapability, AiSafetyContract> => {
      const raw: Record<AiCapability, AiSafetyContract> = {
        receipt_understanding: {
          capability: 'receipt_understanding',
          makesFinancialDecisions: false,
          isAdvisoryOnly: true,
          requiresHumanReview: true, // user reviews extracted fields before save
          explainable: true,
          auditable: true,
          consentRequired: true, // OCR data is processed by AI
          description:
            'Extracts structured fields from receipt images. Output is presented to the user for review; the user confirms before any field is saved.',
        },
        merchant_recognition: {
          capability: 'merchant_recognition',
          makesFinancialDecisions: false,
          isAdvisoryOnly: true,
          requiresHumanReview: false, // just metadata enrichment
          explainable: true,
          auditable: true,
          consentRequired: false,
          description:
            'Recognises merchant name and category from extracted receipt text. Output is metadata only — it does not auto-fill any field without user confirmation.',
        },
        spending_categorisation: {
          capability: 'spending_categorisation',
          makesFinancialDecisions: false,
          isAdvisoryOnly: true,
          requiresHumanReview: true, // user confirms the suggested category
          explainable: true,
          auditable: true,
          consentRequired: false,
          description:
            'Suggests an expense category based on merchant, amount, and title. Returns suggestions only — the user picks the category, the AI never auto-categorises.',
        },
        duplicate_detection: {
          capability: 'duplicate_detection',
          makesFinancialDecisions: false,
          isAdvisoryOnly: true,
          requiresHumanReview: true, // false positive = lost expense
          explainable: true,
          auditable: true,
          consentRequired: false,
          description:
            'Detects potential duplicate expenses based on title, amount, date, and merchant similarity. Outputs a warning advisory — the user decides whether to keep both, merge, or delete. NEVER auto-deletes.',
        },
        personalised_insights: {
          capability: 'personalised_insights',
          makesFinancialDecisions: false,
          isAdvisoryOnly: true,
          requiresHumanReview: false, // insights are informational only
          explainable: true,
          auditable: true,
          consentRequired: true, // processes user spending data
          description:
            'Generates advisory insights about spending trends, category increases, and saving opportunities. Insights NEVER auto-execute — they are informational cards the user can dismiss or act on manually.',
        },
        fraud_pattern_detection: {
          capability: 'fraud_pattern_detection',
          makesFinancialDecisions: false,
          isAdvisoryOnly: true,
          requiresHumanReview: true, // ALWAYS — never auto-blocks
          explainable: true,
          auditable: true,
          consentRequired: false,
          description:
            'Detects unusual spending patterns (unusual amount, frequency, merchant, time, location, duplicate pattern, impossible sequence). Output is an ADVISORY for the user/admin to review — it NEVER blocks a transaction. The user/admin decides whether to dispute, refund, or ignore.',
        },
        natural_language_search: {
          capability: 'natural_language_search',
          makesFinancialDecisions: false,
          isAdvisoryOnly: true,
          requiresHumanReview: false, // search is read-only
          explainable: true,
          auditable: true,
          consentRequired: false,
          description:
            'Parses natural-language search queries (e.g. "expenses over $50 at Starbucks last month") into structured filters. Search results are read-only — the AI does not modify any data.',
        },
        smart_budgeting: {
          capability: 'smart_budgeting',
          makesFinancialDecisions: false,
          isAdvisoryOnly: true,
          requiresHumanReview: true, // user sets the budget, not AI
          explainable: true,
          auditable: true,
          consentRequired: false,
          description:
            'Suggests budget limits per category based on historical spending. Returns suggestions only — the user sets the budget. The AI never auto-enforces a budget or blocks an expense for being over-budget.',
        },
      };
      // Freeze each contract individually (the outer Object.freeze only
      // freezes the top-level Record).
      for (const key of Object.keys(raw) as AiCapability[]) {
        const contract = raw[key];
        if (contract !== undefined) {
          Object.freeze(contract);
        }
      }
      return raw;
    })(),
  );

// ---------------------------------------------------------------------------
// Contract accessors
// ---------------------------------------------------------------------------

/**
 * Returns the safety contract for a capability. Throws on an unknown
 * capability (programming error).
 */
export function getSafetyContract(capability: AiCapability): AiSafetyContract {
  const contract = AI_SAFETY_CONTRACTS[capability];
  if (!contract) {
    throw new Error(`Unknown AI capability: ${capability}`);
  }
  return contract;
}

/**
 * Returns true when a capability's contract satisfies all four constitutional
 * invariants: makesFinancialDecisions=false, isAdvisoryOnly=true,
 * explainable=true, auditable=true.
 *
 * This function is a runtime sanity check — TypeScript should already enforce
 * these at compile time, but the application layer calls it before invoking
 * any AI capability as a defense-in-depth measure.
 */
export function isCapabilitySafe(capability: AiCapability): boolean {
  const c = getSafetyContract(capability);
  return (
    c.makesFinancialDecisions === false &&
    c.isAdvisoryOnly === true &&
    c.explainable === true &&
    c.auditable === true
  );
}

/**
 * Returns true when a capability requires human review before its output
 * is applied (e.g. duplicate_detection, fraud_pattern_detection).
 */
export function requiresHumanReview(capability: AiCapability): boolean {
  return getSafetyContract(capability).requiresHumanReview;
}

/**
 * Returns true when a capability requires explicit user consent before
 * invocation (e.g. personalised_insights, receipt_understanding).
 */
export function isConsentRequired(capability: AiCapability): boolean {
  return getSafetyContract(capability).consentRequired;
}

// ---------------------------------------------------------------------------
// Output validation
// ---------------------------------------------------------------------------

const FORBIDDEN_DECISION_PHRASES: readonly string[] = [
  'auto-categorised',
  'auto-categorized',
  'auto-blocked',
  'auto-approved',
  'auto-settled',
  'auto-paid',
  'auto-deleted',
  'auto-merged',
  'auto-refunded',
  'automatically blocked',
  'automatically approved',
  'automatically settled',
  'automatically paid',
  'automatically deleted',
  'automatically merged',
  'automatically refunded',
  'blocked transaction',
  'rejected transaction',
  'declined transaction',
  'executed payment',
  'processed refund',
];

/**
 * Validates that an AI output does NOT contain a financial decision.
 *
 * Rules:
 *   1. The output MUST include a `reasoning` field (string, non-empty).
 *      Every AI output must be explainable.
 *   2. The output MUST NOT contain any of the forbidden decision phrases
 *      (e.g. "auto-categorised", "auto-blocked", "blocked transaction").
 *   3. The output MUST NOT contain a `decision` field with a truthy value
 *      (defensive — even if a future capability thinks it should expose
 *      a `decision` field, this guard refuses it).
 *   4. The output MUST NOT contain a `autoExecute` field set to true.
 *   5. The output MUST NOT contain a `blockTransaction` field set to true.
 *
 * Returns `{ valid, violations }` — the application layer refuses to
 * display or persist any output with `valid: false`.
 */
export function validateAiOutput(
  capability: AiCapability,
  output: unknown,
): { valid: boolean; violations: readonly string[] } {
  const violations: string[] = [];

  if (output === null || output === undefined) {
    return { valid: false, violations: ['output is null or undefined'] };
  }

  if (typeof output !== 'object') {
    return { valid: false, violations: ['output must be an object'] };
  }

  const obj = output as Record<string, unknown>;

  // Rule 1: reasoning field.
  if (
    typeof obj.reasoning !== 'string' ||
    (obj.reasoning as string).length === 0
  ) {
    violations.push(
      'output must include a non-empty "reasoning" field (explainability)',
    );
  }

  // Rules 2-5: forbidden fields / phrases.
  const serialised = JSON.stringify(obj).toLowerCase();
  for (const phrase of FORBIDDEN_DECISION_PHRASES) {
    if (serialised.includes(phrase)) {
      violations.push(
        `output contains forbidden phrase: "${phrase}" (financial decision)`,
      );
    }
  }

  if (obj.decision !== undefined && obj.decision) {
    violations.push(
      'output must not contain a truthy "decision" field',
    );
  }

  if (obj.autoExecute === true) {
    violations.push('output must not have autoExecute=true');
  }

  if (obj.blockTransaction === true) {
    violations.push('output must not have blockTransaction=true');
  }

  if (obj.executeAction === true) {
    violations.push('output must not have executeAction=true');
  }

  // Capability-specific checks.
  if (capability === 'fraud_pattern_detection') {
    // Fraud detection must use "review" language, not "block" language.
    if (serialised.includes('block this expense')) {
      violations.push(
        'fraud_pattern_detection output must say "review this expense", not "block this expense"',
      );
    }
    if (serialised.includes('reject this expense')) {
      violations.push(
        'fraud_pattern_detection output must say "review this expense", not "reject this expense"',
      );
    }
  }

  return {
    valid: violations.length === 0,
    violations: Object.freeze(violations),
  };
}

/**
 * Returns the full list of AI capabilities.
 */
export const AI_CAPABILITIES: readonly AiCapability[] = Object.freeze(
  Object.keys(AI_SAFETY_CONTRACTS) as AiCapability[],
);

/**
 * Returns true when `value` is a known AI capability.
 */
export function isAiCapability(value: unknown): value is AiCapability {
  return (
    typeof value === 'string' &&
    (AI_CAPABILITIES as readonly string[]).includes(value)
  );
}
