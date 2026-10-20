/**
 * Personalised insights — advisory spending insights.
 *
 * Phase 10 Prompt 96: AI Evolution.
 *
 * CRITICAL CONSTRAINTS:
 *   - Insights are ADVISORY ONLY. They NEVER auto-execute.
 *   - Every insight has a `description` (explainable).
 *   - Every insight has a `severity` (info / suggestion / warning).
 *   - Insights with `actionable: true` MAY include an `actionLabel` (a
 *     button label). Clicking the button performs a user-initiated action
 *     (e.g. navigate to the relevant screen) — NOT an automatic change.
 *   - Insights may have an `expiresAt` field; expired insights are filtered
 *     out by the application layer before display.
 *
 * This module is PURE: insights are computed from a privacy-safe spending
 * summary (aggregated category totals + trend). No individual expense data.
 *
 * See `docs/ai-evolution.md`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InsightType =
  | 'spending_trend'
  | 'category_increase'
  | 'duplicate_warning'
  | 'settlement_reminder'
  | 'budget_suggestion'
  | 'saving_opportunity';

export type InsightSeverity = 'info' | 'suggestion' | 'warning';

export interface Insight {
  readonly id: string;
  readonly type: InsightType;
  readonly title: string;
  readonly description: string;
  readonly severity: InsightSeverity;
  readonly actionable: boolean;
  readonly actionLabel?: string;
  readonly expiresAt?: string;
}

// ---------------------------------------------------------------------------
// Input shape — privacy-safe spending summary
// ---------------------------------------------------------------------------

export interface CategoryTotal {
  readonly category: string;
  readonly thisMonthMinor: number;
  readonly lastMonthMinor: number;
  readonly monthlyAverageMinor: number;
}

export interface SpendingSummary {
  readonly categories: readonly CategoryTotal[];
  readonly thisMonthTotalMinor: number;
  readonly lastMonthTotalMinor: number;
  readonly hasPendingSettlements?: boolean;
  readonly hasPotentialDuplicates?: boolean;
  readonly hasUnusedCategories?: readonly string[];
}

// ---------------------------------------------------------------------------
// Insight generation
// ---------------------------------------------------------------------------

/**
 * Generates personalised insights from a privacy-safe spending summary.
 *
 * Insights are generated based on the following rules:
 *
 *   1. **spending_trend** — overall spending went up/down by > 15% vs last
 *      month. Severity: warning (up) or info (down).
 *
 *   2. **category_increase** — a single category went up by > 50% vs last
 *      month. Severity: warning.
 *
 *   3. **duplicate_warning** — there are potential duplicate expenses to
 *      review. Severity: warning. Actionable: yes, "Review duplicates".
 *
 *   4. **settlement_reminder** — there are pending settlements awaiting
 *      confirmation. Severity: suggestion. Actionable: yes, "Review
 *      settlements".
 *
 *   5. **budget_suggestion** — a category exceeds the user's average
 *      monthly spend by > 30%. Severity: suggestion. Actionable: yes,
 *      "Set a budget".
 *
 *   6. **saving_opportunity** — a category the user spent on last month
 *      has zero spend this month (potential saving). Severity: info.
 *
 * CRITICAL: every insight is ADVISORY. The user decides whether to act.
 */
export function generateInsights(
  spendingData: Readonly<Record<string, unknown>>,
): readonly Insight[] {
  // Validate input shape minimally.
  if (!spendingData || typeof spendingData !== 'object') {
    return Object.freeze([]);
  }
  const summary = spendingData as unknown as SpendingSummary;
  if (!Array.isArray(summary.categories)) {
    return Object.freeze([]);
  }

  const insights: Insight[] = [];
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

  // 1. Overall spending trend.
  if (
    Number.isFinite(summary.thisMonthTotalMinor) &&
    Number.isFinite(summary.lastMonthTotalMinor) &&
    summary.lastMonthTotalMinor > 0
  ) {
    const changePct =
      (summary.thisMonthTotalMinor - summary.lastMonthTotalMinor) /
      summary.lastMonthTotalMinor;
    if (Math.abs(changePct) > 0.15) {
      const isUp = changePct > 0;
      insights.push({
        id: 'spending_trend_overall',
        type: 'spending_trend',
        title: isUp
          ? 'Your spending is up this month'
          : 'Your spending is down this month',
        description:
          `Total spending this month is ${Math.abs(changePct * 100).toFixed(0)}% ` +
          `${isUp ? 'higher' : 'lower'} than last month. ` +
          `Reasoning: comparing this month's total (${summary.thisMonthTotalMinor} minor units) ` +
          `against last month's (${summary.lastMonthTotalMinor} minor units).`,
        severity: isUp ? 'warning' : 'info',
        actionable: false,
        expiresAt,
      });
    }
  }

  // 2. Per-category increase.
  for (const cat of summary.categories) {
    if (
      !Number.isFinite(cat.thisMonthMinor) ||
      !Number.isFinite(cat.lastMonthMinor) ||
      cat.lastMonthMinor === 0
    ) {
      continue;
    }
    const changePct =
      (cat.thisMonthMinor - cat.lastMonthMinor) / cat.lastMonthMinor;
    if (changePct > 0.50) {
      insights.push({
        id: `category_increase_${cat.category}`,
        type: 'category_increase',
        title: `${cat.category} spending increased significantly`,
        description:
          `Your ${cat.category} spending is up ${Math.abs(changePct * 100).toFixed(0)}% ` +
          `vs last month. Reasoning: comparing this month's ${cat.thisMonthMinor} minor units ` +
          `against last month's ${cat.lastMonthMinor} minor units. Consider reviewing this category.`,
        severity: 'warning',
        actionable: true,
        actionLabel: 'View category',
        expiresAt,
      });
    }
  }

  // 3. Duplicate warning.
  if (summary.hasPotentialDuplicates) {
    insights.push({
      id: 'duplicate_warning',
      type: 'duplicate_warning',
      title: 'Potential duplicate expenses detected',
      description:
        'Some expenses look like they might be duplicates. Reasoning: based on title, amount, date, and merchant similarity. Please review and decide whether to keep, merge, or delete.',
      severity: 'warning',
      actionable: true,
      actionLabel: 'Review duplicates',
      expiresAt,
    });
  }

  // 4. Settlement reminder.
  if (summary.hasPendingSettlements) {
    insights.push({
      id: 'settlement_reminder',
      type: 'settlement_reminder',
      title: 'You have pending settlements',
      description:
        'There are settlements awaiting your confirmation. Reasoning: pending settlements were found in your groups. Confirming them keeps balances accurate.',
      severity: 'suggestion',
      actionable: true,
      actionLabel: 'Review settlements',
      expiresAt,
    });
  }

  // 5. Budget suggestion.
  for (const cat of summary.categories) {
    if (
      !Number.isFinite(cat.thisMonthMinor) ||
      !Number.isFinite(cat.monthlyAverageMinor) ||
      cat.monthlyAverageMinor === 0
    ) {
      continue;
    }
    const diff = cat.thisMonthMinor - cat.monthlyAverageMinor;
    if (diff > cat.monthlyAverageMinor * 0.30) {
      insights.push({
        id: `budget_suggestion_${cat.category}`,
        type: 'budget_suggestion',
        title: `Consider setting a budget for ${cat.category}`,
        description:
          `Your ${cat.category} spending this month (${cat.thisMonthMinor} minor units) is ` +
          `${((diff / cat.monthlyAverageMinor) * 100).toFixed(0)}% above your monthly average ` +
          `(${cat.monthlyAverageMinor} minor units). Reasoning: setting a budget could help you ` +
          `keep this category in check. This is a suggestion — you decide whether to set a budget.`,
        severity: 'suggestion',
        actionable: true,
        actionLabel: 'Set a budget',
        expiresAt,
      });
    }
  }

  // 6. Saving opportunity.
  for (const cat of summary.categories) {
    if (
      Number.isFinite(cat.lastMonthMinor) &&
      cat.lastMonthMinor > 0 &&
      Number.isFinite(cat.thisMonthMinor) &&
      cat.thisMonthMinor === 0
    ) {
      insights.push({
        id: `saving_opportunity_${cat.category}`,
        type: 'saving_opportunity',
        title: `You didn't spend on ${cat.category} this month`,
        description:
          `You spent ${cat.lastMonthMinor} minor units on ${cat.category} last month, ` +
          `but nothing this month. Reasoning: this might be a saving — or it might mean you ` +
          `forgot to log an expense. Worth double-checking.`,
        severity: 'info',
        actionable: false,
        expiresAt,
      });
    }
  }

  return Object.freeze(insights);
}

/**
 * Filters out expired insights.
 *
 * The application layer calls this before display.
 */
export function filterExpiredInsights(
  insights: readonly Insight[],
  now: string,
): readonly Insight[] {
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) {
    return Object.freeze([...insights]);
  }
  return Object.freeze(
    insights.filter((i) => {
      if (i.expiresAt === undefined) return true;
      const expMs = Date.parse(i.expiresAt);
      if (!Number.isFinite(expMs)) return true;
      return expMs > nowMs;
    }),
  );
}

/**
 * Sorts insights by severity (warning > suggestion > info).
 */
export function sortInsightsBySeverity(
  insights: readonly Insight[],
): readonly Insight[] {
  const rank: Record<InsightSeverity, number> = {
    warning: 0,
    suggestion: 1,
    info: 2,
  };
  return Object.freeze(
    [...insights].sort((a, b) => rank[a.severity] - rank[b.severity]),
  );
}
