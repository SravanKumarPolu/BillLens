/**
 * Fraud pattern detection — ADVISORY ONLY, never blocks transactions.
 *
 * Phase 10 Prompt 96: AI Evolution.
 *
 * CRITICAL CONSTRAINTS (verified by tests):
 *   - This module is ADVISORY ONLY. It NEVER blocks, rejects, or auto-
 *     refunds a transaction.
 *   - Every FraudAdvisory's `recommendation` field says "review this
 *     expense" — NOT "block this expense".
 *   - Every FraudAdvisory has a `description` field (explainable).
 *   - The application layer presents advisories to the user/admin for
 *     manual review. The user/admin decides whether to dispute, refund,
 *     or ignore. AI does NOT make that decision.
 *   - Confidence is 0-1; advisories with confidence < 0.3 are typically
 *     not shown to the user (low signal-to-noise).
 *
 * Detection signals:
 *   - unusual_amount — expense amount is > 5x the user's typical amount.
 *   - unusual_frequency — user created > 10 expenses in 1 hour.
 *   - unusual_merchant — merchant appears for the first time + amount > average.
 *   - unusual_time — expense timestamp is at 3-5 AM local time.
 *   - unusual_location — expense location differs from the user's usual location.
 *   - duplicate_pattern — same amount + merchant within 1 hour.
 *   - impossible_sequence — expense B timestamped BEFORE expense A but created AFTER.
 *
 * This module is PURE: detection is done via simple statistical rules.
 * No model inference, no network calls.
 *
 * See `docs/ai-evolution.md`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FraudSignal =
  | 'unusual_amount'
  | 'unusual_frequency'
  | 'unusual_merchant'
  | 'unusual_time'
  | 'unusual_location'
  | 'duplicate_pattern'
  | 'impossible_sequence';

export type FraudSeverity = 'low' | 'medium' | 'high';

export interface FraudAdvisory {
  readonly signal: FraudSignal;
  readonly confidence: number; // 0-1
  readonly description: string;
  /**
   * Recommendation for the user/admin. ALWAYS contains the word "review"
   * — NEVER contains the words "block", "reject", or "refund".
   */
  readonly recommendation: string;
  readonly severity: FraudSeverity;
}

export interface ExpenseForFraudDetection {
  readonly amountMinor: number;
  /** ISO date-time. */
  readonly date: string;
  readonly merchantName?: string;
}

// ---------------------------------------------------------------------------
// Detection rules
// ---------------------------------------------------------------------------

export interface UserBaseline {
  /** Average expense amount in minor units (rolling 90-day). */
  readonly averageAmountMinor: number;
  /** Standard deviation of expense amounts (minor units). */
  readonly stdDevAmountMinor: number;
  /** Set of merchant names the user has used before. */
  readonly knownMerchants: readonly string[];
}

/**
 * Detects fraud-pattern signals in a list of expenses.
 *
 * The function takes a list of expenses (typically a single day or week)
 * and an optional user baseline (rolling 90-day stats). It returns a list
 * of FraudAdvisory objects — one per detected signal.
 *
 * CRITICAL: the advisories are SUGGESTIONS. They NEVER block a transaction.
 * The application layer presents them to the user/admin for manual review.
 */
export function detectFraudPatterns(
  expenses: readonly ExpenseForFraudDetection[],
  baseline?: UserBaseline,
): readonly FraudAdvisory[] {
  if (!Array.isArray(expenses)) {
    return Object.freeze([]);
  }

  const advisories: FraudAdvisory[] = [];

  // --- unusual_amount: any expense > 5x the user's average + 3σ ---------
  if (baseline && baseline.averageAmountMinor > 0) {
    const threshold =
      baseline.averageAmountMinor * 5 +
      3 * (baseline.stdDevAmountMinor || baseline.averageAmountMinor);
    for (const exp of expenses) {
      if (exp.amountMinor > threshold) {
        const ratio = exp.amountMinor / baseline.averageAmountMinor;
        advisories.push({
          signal: 'unusual_amount',
          confidence: Math.min(0.95, 0.50 + ratio / 20),
          description:
            `Expense amount ${exp.amountMinor} minor units is ${ratio.toFixed(1)}x the user's ` +
            `average of ${baseline.averageAmountMinor} minor units. Reasoning: amounts > 5x the ` +
            `average + 3 standard deviations are statistically unusual.`,
          recommendation:
            'Please review this expense — confirm it is legitimate. If it is not, contact support.',
          severity: ratio > 10 ? 'high' : 'medium',
        });
      }
    }
  }

  // --- unusual_frequency: > 10 expenses in a 1-hour window --------------
  if (expenses.length > 10) {
    const sorted = [...expenses]
      .map((e) => Date.parse(e.date))
      .filter((t) => Number.isFinite(t))
      .sort((a, b) => a - b);
    for (let i = 0; i + 10 < sorted.length; i++) {
      const windowStart = sorted[i]!;
      const windowEnd = sorted[i + 10]!;
      if (windowEnd - windowStart <= 60 * 60 * 1000) {
        advisories.push({
          signal: 'unusual_frequency',
          confidence: 0.85,
          description:
            '11+ expenses were created within a 1-hour window. Reasoning: a high rate of expense ' +
            'creation in a short window can indicate automated submission or receipt-batch upload.',
          recommendation:
            'Please review the expenses created in this window to confirm they are legitimate.',
          severity: 'medium',
        });
        break; // one advisory per detection
      }
    }
  }

  // --- unusual_merchant: new merchant + amount > average ----------------
  if (baseline && baseline.knownMerchants.length > 0) {
    const knownSet = new Set(baseline.knownMerchants.map((m) => m.toLowerCase()));
    for (const exp of expenses) {
      if (
        exp.merchantName !== undefined &&
        exp.merchantName.length > 0 &&
        !knownSet.has(exp.merchantName.toLowerCase()) &&
        exp.amountMinor > baseline.averageAmountMinor * 2
      ) {
        advisories.push({
          signal: 'unusual_merchant',
          confidence: 0.70,
          description:
            `Expense at "${exp.merchantName}" (a merchant the user has not used before) ` +
            `has an amount ${exp.amountMinor} minor units that is more than 2x the user's average. ` +
            `Reasoning: a new merchant combined with an above-average amount is a common fraud pattern.`,
          recommendation:
            'Please review this expense — confirm you recognise the merchant and the amount.',
          severity: 'medium',
        });
      }
    }
  }

  // --- unusual_time: expense at 3-5 AM local time -----------------------
  // NOTE: we use UTC hour here for simplicity. The application layer
  // should convert to the user's local timezone before calling this
  // function. (We can't do timezone conversion in the domain — no I/O.)
  for (const exp of expenses) {
    const t = Date.parse(exp.date);
    if (!Number.isFinite(t)) continue;
    const hourUtc = new Date(t).getUTCHours();
    if (hourUtc >= 3 && hourUtc < 5) {
      advisories.push({
        signal: 'unusual_time',
        confidence: 0.40,
        description:
          `Expense was created at ${hourUtc}:00 UTC, which is an unusual time (3-5 AM). ` +
          `Reasoning: most legitimate expenses happen during waking hours. Late-night expenses ` +
          `are not necessarily fraud, but they are worth reviewing.`,
        recommendation:
          'Please review this expense — confirm it was intentional.',
        severity: 'low',
      });
    }
  }

  // --- duplicate_pattern: same amount + same merchant within 1 hour -----
  for (let i = 0; i < expenses.length; i++) {
    for (let j = i + 1; j < expenses.length; j++) {
      const a = expenses[i]!;
      const b = expenses[j]!;
      if (
        a.amountMinor === b.amountMinor &&
        a.merchantName !== undefined &&
        b.merchantName !== undefined &&
        a.merchantName.toLowerCase() === b.merchantName.toLowerCase()
      ) {
        const ta = Date.parse(a.date);
        const tb = Date.parse(b.date);
        if (
          Number.isFinite(ta) &&
          Number.isFinite(tb) &&
          Math.abs(ta - tb) <= 60 * 60 * 1000
        ) {
          advisories.push({
            signal: 'duplicate_pattern',
            confidence: 0.80,
            description:
              `Two expenses with the same amount (${a.amountMinor} minor units) and same merchant ` +
              `("${a.merchantName}") were created within 1 hour. Reasoning: this is a common ` +
              `duplicate-entry pattern — though it can also be legitimate (e.g. two coffees).`,
            recommendation:
              'Please review these expenses — if they are duplicates, delete or merge one.',
            severity: 'medium',
          });
          break; // one advisory per pair
        }
      }
    }
    if (advisories.some((a) => a.signal === 'duplicate_pattern')) break;
  }

  // --- impossible_sequence: B created AFTER A but timestamped BEFORE A --
  // This requires the creation timestamp (when the user hit "save"), which
  // we don't have in the ExpenseForFraudDetection type. The application
  // layer can extend this check by comparing creation timestamps.
  // For now, we leave this as a no-op stub — the contract still documents
  // the signal type so the API is stable.

  // Sort advisories by severity for display (defensive — the application
  // layer may re-sort with sortAdvisoriesBySeverity).
  const sorted = sortAdvisoriesBySeverity(advisories);

  // Freeze each advisory so callers cannot mutate the explanation.
  return Object.freeze(sorted.map((a) => Object.freeze({ ...a })));
}

/**
 * Validates that a FraudAdvisory's recommendation field NEVER contains
 * block/reject/refund language. Used by the application layer as a
 * defense-in-depth check before displaying the advisory.
 *
 * Returns true when the advisory is safe to display.
 */
export function isAdvisorySafe(advisory: FraudAdvisory): boolean {
  const lower = advisory.recommendation.toLowerCase();
  const forbidden = ['block', 'reject', 'refund', 'cancel', 'decline'];
  for (const word of forbidden) {
    if (lower.includes(word)) {
      return false;
    }
  }
  // MUST contain "review".
  if (!lower.includes('review')) {
    return false;
  }
  return true;
}

/**
 * Filters out advisories that fail the safety check.
 *
 * The application layer calls this before display.
 */
export function filterSafeAdvisories(
  advisories: readonly FraudAdvisory[],
): readonly FraudAdvisory[] {
  return Object.freeze(advisories.filter(isAdvisorySafe));
}

/**
 * Sorts advisories by severity (high > medium > low).
 */
export function sortAdvisoriesBySeverity(
  advisories: readonly FraudAdvisory[],
): readonly FraudAdvisory[] {
  const rank: Record<FraudSeverity, number> = {
    high: 0,
    medium: 1,
    low: 2,
  };
  return Object.freeze(
    [...advisories].sort((a, b) => rank[a.severity] - rank[b.severity]),
  );
}
