/**
 * Spending categorisation — suggest expense categories (advisory).
 *
 * Phase 10 Prompt 96: AI Evolution.
 *
 * CRITICAL CONSTRAINTS:
 *   - This module returns SUGGESTIONS only. The user picks the category;
 *     the AI NEVER auto-categorises an expense.
 *   - Every suggestion includes a `reasoning` field (explainable).
 *   - Every suggestion includes a `source` field indicating where the
 *     suggestion came from (merchant, amount, title, or manual).
 *   - The `confidence` field is 0-1; values below 0.5 are still returned
 *     but flagged as low-confidence.
 *
 * This module is PURE: pattern matching is done against static rules
 * derived from merchant category + amount heuristics + title keywords.
 *
 * See `docs/ai-evolution.md`.
 */

import { getMerchantCategory, recognizeMerchant } from './merchant-recognition';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExpenseCategory =
  | 'food_dining'
  | 'groceries'
  | 'transport'
  | 'shopping'
  | 'entertainment'
  | 'utilities'
  | 'healthcare'
  | 'travel'
  | 'education'
  | 'other';

export type CategorySuggestionSource = 'merchant' | 'amount' | 'title' | 'manual';

export interface CategorySuggestion {
  readonly category: ExpenseCategory;
  readonly confidence: number; // 0-1
  readonly reasoning: string;
  readonly source: CategorySuggestionSource;
}

export interface ExpenseInput {
  readonly title: string;
  readonly merchantName?: string;
  /** Amount in minor units (e.g. paise). */
  readonly amountMinor: number;
}

// ---------------------------------------------------------------------------
// Category mapping
// ---------------------------------------------------------------------------

/**
 * Maps merchant-category slugs to ExpenseCategory.
 *
 * Merchant categories (from merchant-recognition.ts) are more granular than
 * ExpenseCategory — we collapse them here. For example, 'coffee_shops',
 * 'fast_food', and 'food_delivery' all collapse to 'food_dining'.
 */
const MERCHANT_CATEGORY_MAP: Readonly<Record<string, ExpenseCategory>> = {
  coffee_shops: 'food_dining',
  fast_food: 'food_dining',
  food_delivery: 'food_dining',
  groceries: 'groceries',
  transport: 'transport',
  shopping: 'shopping',
  entertainment: 'entertainment',
  utilities: 'utilities',
  healthcare: 'healthcare',
  travel: 'travel',
};

// ---------------------------------------------------------------------------
// Title keyword map
// ---------------------------------------------------------------------------

interface TitleRule {
  readonly keywords: readonly string[];
  readonly category: ExpenseCategory;
}

const TITLE_RULES: readonly TitleRule[] = Object.freeze([
  {
    keywords: ['lunch', 'dinner', 'breakfast', 'restaurant', 'cafe', 'coffee', 'pizza', 'burger', 'food', 'snack', 'meal'],
    category: 'food_dining',
  },
  {
    keywords: ['grocery', 'groceries', 'supermarket', 'vegetables', 'fruits', 'milk', 'bread'],
    category: 'groceries',
  },
  {
    keywords: ['uber', 'ola', 'taxi', 'cab', 'fuel', 'petrol', 'diesel', 'gas', 'bus', 'train', 'metro', 'parking'],
    category: 'transport',
  },
  {
    keywords: ['amazon', 'flipkart', 'clothes', 'shoes', 'electronics', 'mall', 'store'],
    category: 'shopping',
  },
  {
    keywords: ['movie', 'ticket', 'concert', 'netflix', 'spotify', 'game', 'show'],
    category: 'entertainment',
  },
  {
    keywords: ['electric', 'water', 'gas bill', 'internet', 'broadband', 'mobile', 'phone bill', 'recharge'],
    category: 'utilities',
  },
  {
    keywords: ['doctor', 'pharmacy', 'medicine', 'hospital', 'clinic', 'medical'],
    category: 'healthcare',
  },
  {
    keywords: ['flight', 'hotel', 'airbnb', 'booking', 'vacation', 'trip'],
    category: 'travel',
  },
  {
    keywords: ['course', 'tuition', 'school', 'college', 'book', 'exam', 'fee'],
    category: 'education',
  },
]);

// ---------------------------------------------------------------------------
// Amount heuristics
// ---------------------------------------------------------------------------

interface AmountRule {
  readonly minMinor: number; // inclusive
  readonly maxMinor: number; // exclusive
  readonly category: ExpenseCategory;
  readonly reasoning: string;
  readonly confidence: number;
}

// Amount thresholds in minor units (assuming INR: 100 = ₹1, 100000 = ₹1000).
// These are deliberately conservative — amount alone is a weak signal.
const AMOUNT_RULES: readonly AmountRule[] = Object.freeze([
  {
    minMinor: 0,
    maxMinor: 5_00, // < ₹5
    category: 'food_dining',
    reasoning: 'Small amount typical of a coffee or snack',
    confidence: 0.30,
  },
  {
    minMinor: 5_00,
    maxMinor: 50_00, // ₹5 - ₹50
    category: 'food_dining',
    reasoning: 'Small amount typical of a meal or snack',
    confidence: 0.35,
  },
  {
    minMinor: 50_000,
    maxMinor: 500_000, // ₹500 - ₹5000
    category: 'shopping',
    reasoning: 'Mid-range amount typical of shopping',
    confidence: 0.30,
  },
  {
    minMinor: 500_000,
    maxMinor: Number.MAX_SAFE_INTEGER, // > ₹5000
    category: 'travel',
    reasoning: 'Large amount typical of travel or major purchase',
    confidence: 0.30,
  },
]);

// ---------------------------------------------------------------------------
// Suggestion engine
// ---------------------------------------------------------------------------

/**
 * Returns a list of category suggestions for the given expense.
 *
 * The list is sorted by confidence descending. The caller (UI) presents
 * the top suggestion as the default and offers the others as alternatives.
 *
 * IMPORTANT: the AI does NOT auto-categorise. The user picks the category.
 * Even the top suggestion must be confirmed by the user.
 *
 * Sources:
 *   1. **merchant** — if the expense has a recognised merchant, the
 *      merchant's category is the strongest signal (confidence 0.85+).
 *   2. **title** — keywords in the title are a moderate signal
 *      (confidence 0.55-0.75 depending on match strength).
 *   3. **amount** — amount heuristics are a weak signal (confidence 0.30).
 *
 * Multiple sources may agree on the same category — the engine combines
 * them and boosts confidence when sources agree.
 */
export function suggestCategory(
  expense: ExpenseInput,
): readonly CategorySuggestion[] {
  if (!expense || typeof expense.title !== 'string') {
    return Object.freeze([]);
  }

  const suggestions: CategorySuggestion[] = [];

  // 1. Merchant signal.
  if (typeof expense.merchantName === 'string' && expense.merchantName.length > 0) {
    const recognised = recognizeMerchant(expense.merchantName);
    if (recognised !== null) {
      const mapped = MERCHANT_CATEGORY_MAP[recognised.category];
      if (mapped !== undefined) {
        suggestions.push({
          category: mapped,
          confidence: recognised.confidence,
          reasoning: `Merchant "${recognised.canonicalName}" is in the ${recognised.category} category, which maps to ${mapped}`,
          source: 'merchant',
        });
      }
    } else {
      // Merchant name provided but not recognised — try the category lookup.
      const category = getMerchantCategory(expense.merchantName);
      if (category !== 'other') {
        const mapped = MERCHANT_CATEGORY_MAP[category];
        if (mapped !== undefined) {
          suggestions.push({
            category: mapped,
            confidence: 0.60,
            reasoning: `Merchant category "${category}" maps to ${mapped}`,
            source: 'merchant',
          });
        }
      }
    }
  }

  // 2. Title signal.
  const titleLower = expense.title.toLowerCase();
  for (const rule of TITLE_RULES) {
    for (const keyword of rule.keywords) {
      if (titleLower.includes(keyword)) {
        // Stronger match if the keyword IS the title (whole word).
        const isWholeWord = titleLower === keyword;
        const confidence = isWholeWord ? 0.75 : 0.55;
        suggestions.push({
          category: rule.category,
          confidence,
          reasoning: `Title contains keyword "${keyword}" which suggests ${rule.category}`,
          source: 'title',
        });
        break; // one match per rule
      }
    }
  }

  // 3. Amount signal.
  for (const rule of AMOUNT_RULES) {
    if (expense.amountMinor >= rule.minMinor && expense.amountMinor < rule.maxMinor) {
      suggestions.push({
        category: rule.category,
        confidence: rule.confidence,
        reasoning: rule.reasoning,
        source: 'amount',
      });
      break; // one amount rule
    }
  }

  // Combine: if multiple sources agree on the same category, boost confidence.
  const byCategory = new Map<ExpenseCategory, CategorySuggestion[]>();
  for (const s of suggestions) {
    const list = byCategory.get(s.category) ?? [];
    list.push(s);
    byCategory.set(s.category, list);
  }
  const combined: CategorySuggestion[] = [];
  for (const [category, list] of byCategory) {
    if (list.length === 1) {
      combined.push(list[0]!);
    } else {
      // Multiple sources agree — combine confidences (probabilistic OR).
      // combined = 1 - product(1 - c_i)
      let disagree = 1;
      let topConfidence = 0;
      const sources: string[] = [];
      for (const s of list) {
        disagree *= (1 - s.confidence);
        if (s.confidence > topConfidence) topConfidence = s.confidence;
        if (!sources.includes(s.source)) sources.push(s.source);
      }
      const combinedConfidence = Math.min(0.95, 1 - disagree);
      combined.push({
        category,
        confidence: combinedConfidence,
        reasoning: `Multiple signals (${sources.join(' + ')}) suggest ${category}. Strongest single signal: ${topConfidence.toFixed(2)} confidence.`,
        source: list[0]!.source, // primary source
      });
    }
  }

  // Sort by confidence descending.
  combined.sort((a, b) => b.confidence - a.confidence);
  // Freeze each suggestion so callers cannot mutate the explanation.
  return Object.freeze(combined.map((s) => Object.freeze({ ...s })));
}

/**
 * Returns the top suggestion (highest confidence) or `null` when no
 * suggestion is available.
 *
 * The caller should present this as the default category in the UI but
 * MUST still require user confirmation — the AI does not auto-categorise.
 */
export function getTopSuggestion(
  expense: ExpenseInput,
): CategorySuggestion | null {
  const suggestions = suggestCategory(expense);
  return suggestions[0] ?? null;
}

/**
 * Returns true when at least one suggestion has confidence >= 0.5.
 *
 * Low-confidence suggestions are still returned (so the UI can offer them
 * as alternatives), but the engine reports `hasHighConfidenceSuggestion=false`
 * when none of them clear the 0.5 threshold.
 */
export function hasHighConfidenceSuggestion(
  expense: ExpenseInput,
): boolean {
  const suggestions = suggestCategory(expense);
  return suggestions.some((s) => s.confidence >= 0.5);
}
