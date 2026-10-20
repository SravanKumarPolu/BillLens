/**
 * Review prompt guard.
 *
 * CRITICAL: BillLens NEVER interrupts a financial task with an App Store
 * review prompt. The financial integrity of a settlement, expense, UPI
 * payment, backup/restore, or conflict-resolution flow is more important
 * than any review prompt.
 *
 * The guard returns `true` (prompt the user) ONLY when ALL of:
 *   - The current task is NOT a financial task (or there is no current
 *     task).
 *   - The user has 30+ days of usage since first launch.
 *   - The user has created 10+ expenses.
 *   - The user has submitted an NPS score of 9 or 10.
 *   - No review prompt has been shown to this user within the last 180
 *     days.
 *
 * Otherwise the guard returns `false` — do NOT prompt.
 */

// ---------------------------------------------------------------------------
// Financial tasks — NEVER interrupted by a review prompt
// ---------------------------------------------------------------------------

export type FinancialTask =
  | 'settlement_confirmation'
  | 'expense_creation'
  | 'expense_editing'
  | 'upi_payment'
  | 'backup_restore'
  | 'conflict_resolution';

const FINANCIAL_TASKS: readonly FinancialTask[] = [
  'settlement_confirmation',
  'expense_creation',
  'expense_editing',
  'upi_payment',
  'backup_restore',
  'conflict_resolution',
];

export function isFinancialTask(task: unknown): task is FinancialTask {
  return typeof task === 'string' && (FINANCIAL_TASKS as readonly string[]).includes(task);
}

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

export interface ReviewEligibility {
  /** Days since the user first launched the app. */
  readonly daysSinceFirstLaunch: number;
  /** Total expenses created by the user (all-time). */
  readonly totalExpensesCreated: number;
  /** Latest NPS score the user submitted, or null if none. */
  readonly latestNpsScore: number | null;
  /** ISO date-time when the user was last prompted for a review, or null. */
  readonly lastPromptedAt: string | null;
  /** ISO date-time "now" — defaults to the current time when the use case runs. */
  readonly nowIso: string;
}

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

export const MIN_DAYS_SINCE_LAUNCH = 30;
export const MIN_EXPENSES_CREATED = 10;
export const MIN_NPS_SCORE_FOR_REVIEW = 9;
export const PROMPT_COOLDOWN_DAYS = 180;
export const PROMPT_COOLDOWN_MS = PROMPT_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Guard
// ---------------------------------------------------------------------------

/**
 * Returns `true` if it is appropriate to prompt the user for an App
 * Store review now.
 *
 * CRITICAL RULES (any one of these makes the function return `false`):
 *   1. `currentTask` is a financial task — NEVER interrupt financial
 *      flows (especially settlement_confirmation).
 *   2. The user has fewer than `MIN_DAYS_SINCE_LAUNCH` (30) days of use.
 *   3. The user has created fewer than `MIN_EXPENSES_CREATED` (10)
 *      expenses.
 *   4. The user's latest NPS score is below
 *      `MIN_NPS_SCORE_FOR_REVIEW` (9), or they haven't submitted NPS.
 *   5. The user has been prompted for a review within the last
 *      `PROMPT_COOLDOWN_DAYS` (180) days.
 */
export function shouldPromptForReview(
  currentTask: FinancialTask | null,
  eligibility: ReviewEligibility,
): boolean {
  // 1. NEVER interrupt financial tasks.
  if (currentTask !== null && isFinancialTask(currentTask)) {
    return false;
  }

  // 2. Minimum days of use.
  if (eligibility.daysSinceFirstLaunch < MIN_DAYS_SINCE_LAUNCH) {
    return false;
  }

  // 3. Minimum expenses created.
  if (eligibility.totalExpensesCreated < MIN_EXPENSES_CREATED) {
    return false;
  }

  // 4. Latest NPS >= 9.
  if (
    eligibility.latestNpsScore === null ||
    eligibility.latestNpsScore < MIN_NPS_SCORE_FOR_REVIEW
  ) {
    return false;
  }

  // 5. Validate nowIso early (fail closed on unparseable timestamps).
  const nowMs = Date.parse(eligibility.nowIso);
  if (!Number.isFinite(nowMs)) {
    return false;
  }

  // 6. Cooldown — no prompt within the last 180 days.
  if (eligibility.lastPromptedAt !== null) {
    const lastMs = Date.parse(eligibility.lastPromptedAt);
    if (!Number.isFinite(lastMs)) {
      // Unparseable lastPromptedAt — fail closed.
      return false;
    }
    if (nowMs - lastMs < PROMPT_COOLDOWN_MS) {
      return false;
    }
  }

  return true;
}

/**
 * Returns the next time the user MAY be prompted for a review, based on
 * the cooldown. Returns `null` if the user has never been prompted (i.e.
 * they may be prompted now, subject to the other eligibility rules).
 */
export function nextEligiblePromptTime(eligibility: ReviewEligibility): string | null {
  if (eligibility.lastPromptedAt === null) return null;
  const lastMs = Date.parse(eligibility.lastPromptedAt);
  if (!Number.isFinite(lastMs)) return null;
  return new Date(lastMs + PROMPT_COOLDOWN_MS).toISOString();
}
