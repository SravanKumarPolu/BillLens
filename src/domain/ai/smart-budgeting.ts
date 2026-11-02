/**
 * Smart budgeting — suggest budget limits per category (advisory).
 *
 * Phase 10 Prompt 96: AI Evolution.
 *
 * CRITICAL CONSTRAINTS:
 *   - This module returns SUGGESTIONS only. The user sets the budget;
 *     the AI NEVER auto-enforces a budget.
 *   - The AI NEVER blocks an expense for being over-budget. Over-budget
 *     expenses trigger an advisory warning (via personalised-insights),
 *     not a block.
 *   - Every suggestion includes a `reasoning` field (explainable).
 *   - Suggestions are based on `basedOnMonths` months of historical data;
 *     the field records how much data was used so the UI can show a
 *     "low confidence — only 1 month of data" warning when appropriate.
 *
 * This module is PURE: averages are computed from the historical data
 * via arithmetic. No I/O.
 *
 * See `docs/ai-evolution.md`.
 */

import type { ExpenseCategory } from './spending-categorisation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BudgetSuggestion {
  readonly category: ExpenseCategory;
  readonly suggestedLimitMinor: number;
  readonly currentAverageMinor: number;
  readonly reasoning: string;
  /** How many months of historical data the suggestion is based on. */
  readonly basedOnMonths: number;
}

export interface HistoricalSpendingEntry {
  readonly category: string;
  readonly amountMinor: number;
  /** Month identifier, e.g. '2026-07'. */
  readonly month: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) {
    sum += v;
  }
  return sum / values.length;
}

function standardDeviation(values: readonly number[], meanValue: number): number {
  if (values.length === 0) return 0;
  let sumSqDiff = 0;
  for (const v of values) {
    const diff = v - meanValue;
    sumSqDiff += diff * diff;
  }
  return Math.sqrt(sumSqDiff / values.length);
}

/**
 * Buckets a free-form category string into an ExpenseCategory.
 *
 * Unknown categories map to 'other'.
 */
function bucketCategory(rawCategory: string): ExpenseCategory {
  const lower = rawCategory.toLowerCase();
  if (['food', 'dining', 'restaurant', 'lunch', 'dinner'].some((k) => lower.includes(k))) {
    return 'food_dining';
  }
  if (['grocery', 'groceries', 'supermarket'].some((k) => lower.includes(k))) {
    return 'groceries';
  }
  if (['transport', 'uber', 'ola', 'fuel', 'petrol', 'taxi'].some((k) => lower.includes(k))) {
    return 'transport';
  }
  if (['shopping', 'clothes', 'amazon', 'flipkart'].some((k) => lower.includes(k))) {
    return 'shopping';
  }
  if (['entertainment', 'movie', 'netflix', 'spotify'].some((k) => lower.includes(k))) {
    return 'entertainment';
  }
  if (['utilities', 'electric', 'water', 'internet', 'phone'].some((k) => lower.includes(k))) {
    return 'utilities';
  }
  if (['healthcare', 'doctor', 'pharmacy', 'medicine'].some((k) => lower.includes(k))) {
    return 'healthcare';
  }
  if (['travel', 'flight', 'hotel', 'vacation'].some((k) => lower.includes(k))) {
    return 'travel';
  }
  if (['education', 'tuition', 'course', 'book'].some((k) => lower.includes(k))) {
    return 'education';
  }
  return 'other';
}

// ---------------------------------------------------------------------------
// Suggestion engine
// ---------------------------------------------------------------------------

/**
 * Generates budget suggestions from historical spending data.
 *
 * Algorithm per category:
 *   1. Group historical entries by month.
 *   2. Compute the mean monthly spend.
 *   3. Compute the standard deviation.
 *   4. Suggested limit = mean + 1σ (so the user can absorb one "high"
 *      month without going over-budget).
 *   5. Round to the nearest 1000 minor units (e.g. nearest ₹10) for a
 *      clean number.
 *
 * Categories with only 1 month of data get a low-confidence flag in the
 * reasoning text ("based on only 1 month of data — consider revising
 * after 3 months").
 *
 * Categories with 0 historical spend are NOT suggested (no budget needed
 * for a category the user never spends on).
 *
 * CRITICAL: the function returns SUGGESTIONS only. The user sets the
 * actual budget.
 */
export function generateBudgetSuggestions(
  historicalSpending: readonly HistoricalSpendingEntry[],
): readonly BudgetSuggestion[] {
  if (!Array.isArray(historicalSpending)) {
    return Object.freeze([]);
  }

  // Group by bucketed category → month → sum.
  const byCategory = new Map<ExpenseCategory, Map<string, number>>();
  const allMonths = new Set<string>();

  for (const entry of historicalSpending) {
    if (!entry || typeof entry.category !== 'string' || typeof entry.month !== 'string') {
      continue;
    }
    if (!Number.isFinite(entry.amountMinor) || entry.amountMinor < 0) {
      continue;
    }
    const bucket = bucketCategory(entry.category);
    const monthMap = byCategory.get(bucket) ?? new Map<string, number>();
    monthMap.set(entry.month, (monthMap.get(entry.month) ?? 0) + entry.amountMinor);
    byCategory.set(bucket, monthMap);
    allMonths.add(entry.month);
  }

  const totalMonths = allMonths.size;
  const suggestions: BudgetSuggestion[] = [];

  for (const [category, monthMap] of byCategory) {
    if (monthMap.size === 0) continue;
    const monthlyTotals = [...monthMap.values()];
    const avg = mean(monthlyTotals);
    const stdDev = standardDeviation(monthlyTotals, avg);

    // Suggested limit = avg + 1σ (capped at 1.5x avg to avoid runaway budgets).
    const rawSuggestion = avg + stdDev;
    const cappedSuggestion = Math.min(rawSuggestion, avg * 1.5);
    // Round to nearest 1000 minor units (e.g. nearest ₹10 / $0.10).
    const rounded = Math.max(1000, Math.round(cappedSuggestion / 1000) * 1000);

    const lowConfidenceNote =
      monthMap.size < 3
        ? ` Note: this suggestion is based on only ${monthMap.size} month(s) of data — consider revising after 3 months.`
        : '';

    suggestions.push({
      category,
      suggestedLimitMinor: rounded,
      currentAverageMinor: Math.round(avg),
      reasoning:
        `Based on ${monthMap.size} month(s) of historical data, your average monthly spend ` +
        `on ${category} is ${Math.round(avg)} minor units (std dev ${Math.round(stdDev)}). ` +
        `The suggested limit is avg + 1σ = ${Math.round(rawSuggestion)}, capped at 1.5× avg, ` +
        `rounded to the nearest 1000 minor units. ` +
        `This is a SUGGESTION — you set the actual budget.` +
        lowConfidenceNote,
      basedOnMonths: monthMap.size,
    });
  }

  // Sort by suggested limit descending (largest budget first).
  suggestions.sort((a, b) => b.suggestedLimitMinor - a.suggestedLimitMinor);

  // Total months used (for the UI's "based on N months" indicator).
  void totalMonths; // used implicitly via per-suggestion basedOnMonths

  return Object.freeze(suggestions);
}

/**
 * Returns the total number of unique months in the historical data.
 *
 * Useful for the UI's "based on N months" header.
 */
export function countUniqueMonths(
  historicalSpending: readonly HistoricalSpendingEntry[],
): number {
  const months = new Set<string>();
  for (const entry of historicalSpending) {
    if (entry && typeof entry.month === 'string') {
      months.add(entry.month);
    }
  }
  return months.size;
}
