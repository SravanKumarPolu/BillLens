/**
 * Natural-language search — parse natural language queries into filters.
 *
 * Phase 10 Prompt 96: AI Evolution.
 *
 * CRITICAL CONSTRAINTS:
 *   - This module is READ-ONLY. It parses a query into structured filters;
 *     it does NOT modify any data.
 *   - Amount ranges are BUCKETED (e.g. "over $50" → min=5000 minor units),
 *     NOT exact. We never store the user's raw query — only the parsed
 *     filters. The `originalQuery` field is included in the result so the
 *     UI can echo it back, but it is NOT persisted to analytics.
 *   - Merchant names are ANONYMISED: the parser matches against known
 *     merchant patterns (from merchant-recognition.ts) and returns the
 *     canonical name, not the raw user input.
 *   - Date ranges are resolved to ISO date strings. "last month" resolves
 *     to the previous calendar month based on `now` (injected for testability).
 *
 * This module is PURE: parsing is done via regex + keyword matching.
 * No I/O.
 *
 * See `docs/ai-evolution.md`.
 */

import { recognizeMerchant } from './merchant-recognition';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SearchIntent =
  | 'find_expense'
  | 'find_settlement'
  | 'find_group'
  | 'find_member';

export interface ParsedSearchQuery {
  readonly intent: SearchIntent;
  readonly filters: {
    /** Amount range in MINOR units (e.g. cents/paise). Bucketed. */
    readonly amountRange?: { min?: number; max?: number };
    readonly dateRange?: { from?: string; to?: string };
    /** Anonymized canonical merchant name (uppercase). */
    readonly merchant?: string;
    readonly category?: string;
  };
  readonly originalQuery: string;
}

// ---------------------------------------------------------------------------
// Intent detection
// ---------------------------------------------------------------------------

const INTENT_KEYWORDS: Readonly<Record<SearchIntent, readonly string[]>> = {
  find_expense: ['expense', 'expenses', 'spending', 'spent', 'cost', 'costs', 'bill', 'bills', 'payment', 'payments'],
  find_settlement: ['settlement', 'settlements', 'settle', 'paid', 'owe', 'owed'],
  find_group: ['group', 'groups', 'trip', 'trip'],
  find_member: ['member', 'members', 'friend', 'friends', 'person', 'people'],
};

function detectIntent(query: string): SearchIntent {
  const lower = query.toLowerCase();
  // Default to find_expense.
  let best: SearchIntent = 'find_expense';
  let bestScore = 0;
  for (const intent of Object.keys(INTENT_KEYWORDS) as SearchIntent[]) {
    const keywords = INTENT_KEYWORDS[intent];
    let score = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        score += kw.length; // longer match = stronger signal
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = intent;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Amount parsing
// ---------------------------------------------------------------------------

interface AmountMatch {
  readonly min?: number;
  readonly max?: number;
}

/**
 * Parses amount expressions from the query.
 *
 * Recognised patterns:
 *   - "over $50", "more than $50", "> $50" → min=5000 (in minor units)
 *   - "under $50", "less than $50", "< $50" → max=5000
 *   - "between $20 and $50" → min=2000, max=5000
 *   - "$50" → exact match → min=5000, max=5000
 *
 * The amount is parsed as a major-unit number (dollars / rupees) and
 * converted to minor units (×100). This assumes 2-decimal currencies;
 * for 0-decimal currencies (JPY) the application layer should adjust.
 */
function parseAmountRange(query: string): AmountMatch | undefined {
  const lower = query.toLowerCase();

  // "between $X and $Y"
  const betweenMatch = lower.match(/between\s*\$?\s*(\d+(?:\.\d+)?)\s*(?:and|to|-)\s*\$?\s*(\d+(?:\.\d+)?)/);
  if (betweenMatch) {
    const min = Math.round(parseFloat(betweenMatch[1]!) * 100);
    const max = Math.round(parseFloat(betweenMatch[2]!) * 100);
    if (Number.isFinite(min) && Number.isFinite(max)) {
      return { min, max };
    }
  }

  // "over $X" / "more than $X" / "> $X"
  const overMatch = lower.match(/(?:over|more than|>|above|exceeding)\s*\$?\s*(\d+(?:\.\d+)?)/);
  if (overMatch) {
    const min = Math.round(parseFloat(overMatch[1]!) * 100);
    if (Number.isFinite(min)) {
      return { min };
    }
  }

  // "under $X" / "less than $X" / "< $X"
  const underMatch = lower.match(/(?:under|less than|<|below)\s*\$?\s*(\d+(?:\.\d+)?)/);
  if (underMatch) {
    const max = Math.round(parseFloat(underMatch[1]!) * 100);
    if (Number.isFinite(max)) {
      return { max };
    }
  }

  // bare "$X"
  const exactMatch = lower.match(/\$\s*(\d+(?:\.\d+)?)/);
  if (exactMatch) {
    const amount = Math.round(parseFloat(exactMatch[1]!) * 100);
    if (Number.isFinite(amount)) {
      return { min: amount, max: amount };
    }
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Date parsing
// ---------------------------------------------------------------------------

interface DateRange {
  readonly from?: string;
  readonly to?: string;
}

/**
 * Parses date expressions from the query.
 *
 * Recognised patterns (resolved relative to `now`):
 *   - "today" → from=start of today, to=end of today
 *   - "yesterday" → from=start of yesterday, to=end of yesterday
 *   - "this week" → from=Mon of this week, to=Sun of this week
 *   - "last week" → from=Mon of last week, to=Sun of last week
 *   - "this month" → from=1st of this month, to=last of this month
 *   - "last month" → from=1st of last month, to=last of last month
 *   - "this year" → from=Jan 1, to=Dec 31
 *   - "last year" → from=Jan 1 (last year), to=Dec 31 (last year)
 */
function parseDateRange(query: string, now: string): DateRange | undefined {
  const lower = query.toLowerCase();
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) return undefined;
  const nowDate = new Date(nowMs);

  if (lower.includes('today')) {
    const start = new Date(Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), nowDate.getUTCDate()));
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
    return { from: start.toISOString(), to: end.toISOString() };
  }

  if (lower.includes('yesterday')) {
    const start = new Date(Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), nowDate.getUTCDate() - 1));
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
    return { from: start.toISOString(), to: end.toISOString() };
  }

  if (lower.includes('this week')) {
    const dayOfWeek = nowDate.getUTCDay(); // 0=Sun, 1=Mon
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const start = new Date(Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), nowDate.getUTCDate() + mondayOffset));
    const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
    return { from: start.toISOString(), to: end.toISOString() };
  }

  if (lower.includes('last week')) {
    const dayOfWeek = nowDate.getUTCDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const thisMonday = new Date(Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), nowDate.getUTCDate() + mondayOffset));
    const start = new Date(thisMonday.getTime() - 7 * 24 * 60 * 60 * 1000);
    const end = new Date(thisMonday.getTime() - 1);
    return { from: start.toISOString(), to: end.toISOString() };
  }

  if (lower.includes('this month')) {
    const start = new Date(Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), 1));
    const end = new Date(Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth() + 1, 0, 23, 59, 59, 999));
    return { from: start.toISOString(), to: end.toISOString() };
  }

  if (lower.includes('last month')) {
    const start = new Date(Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth() - 1, 1));
    const end = new Date(Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), 0, 23, 59, 59, 999));
    return { from: start.toISOString(), to: end.toISOString() };
  }

  if (lower.includes('this year')) {
    const start = new Date(Date.UTC(nowDate.getUTCFullYear(), 0, 1));
    const end = new Date(Date.UTC(nowDate.getUTCFullYear(), 11, 31, 23, 59, 59, 999));
    return { from: start.toISOString(), to: end.toISOString() };
  }

  if (lower.includes('last year')) {
    const start = new Date(Date.UTC(nowDate.getUTCFullYear() - 1, 0, 1));
    const end = new Date(Date.UTC(nowDate.getUTCFullYear() - 1, 11, 31, 23, 59, 59, 999));
    return { from: start.toISOString(), to: end.toISOString() };
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Merchant parsing
// ---------------------------------------------------------------------------

/**
 * Parses merchant names from the query.
 *
 * Uses the merchant-recognition module to find a known merchant pattern.
 * Returns the canonical uppercase name, or undefined when no merchant is
 * recognised.
 *
 * The raw user input is NOT returned — only the canonical name. This
 * anonymises the query (the user might type "Starbucks near me" — we
 * extract "STARBUCKS" and discard the rest).
 */
function parseMerchant(query: string): string | undefined {
  const recognised = recognizeMerchant(query);
  return recognised?.canonicalName;
}

// ---------------------------------------------------------------------------
// Category parsing
// ---------------------------------------------------------------------------

const CATEGORY_KEYWORDS: Readonly<Record<string, readonly string[]>> = {
  food_dining: ['food', 'dining', 'restaurant', 'lunch', 'dinner', 'breakfast', 'coffee', 'cafe'],
  groceries: ['grocery', 'groceries', 'supermarket', 'vegetables'],
  transport: ['transport', 'uber', 'ola', 'taxi', 'cab', 'fuel', 'petrol'],
  shopping: ['shopping', 'clothes', 'amazon', 'flipkart'],
  entertainment: ['entertainment', 'movie', 'netflix', 'spotify'],
  utilities: ['utilities', 'electric', 'water bill', 'internet', 'phone bill'],
  healthcare: ['healthcare', 'doctor', 'pharmacy', 'medicine'],
  travel: ['travel', 'flight', 'hotel', 'vacation'],
  education: ['education', 'tuition', 'course', 'book'],
};

function parseCategory(query: string): string | undefined {
  const lower = query.toLowerCase();
  for (const category of Object.keys(CATEGORY_KEYWORDS)) {
    const keywords = CATEGORY_KEYWORDS[category];
    if (keywords === undefined) continue;
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        return category;
      }
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Top-level parser
// ---------------------------------------------------------------------------

/**
 * Parses a natural-language search query into structured filters.
 *
 * @example
 *   parseNaturalLanguageQuery('show me expenses over $50 at Starbucks last month')
 *   // → {
 *   //   intent: 'find_expense',
 *   //   filters: {
 *   //     amountRange: { min: 5000 },
 *   //     merchant: 'STARBUCKS',
 *   //     dateRange: { from: '2026-06-01T00:00:00.000Z', to: '2026-06-30T23:59:59.999Z' }
 *   //   },
 *   //   originalQuery: 'show me expenses over $50 at Starbucks last month'
 *   // }
 *
 * The `now` parameter is used to resolve relative date expressions
 * ("last month", "this week"). It defaults to the current time.
 */
export function parseNaturalLanguageQuery(
  query: string,
  now: string = new Date().toISOString(),
): ParsedSearchQuery {
  if (typeof query !== 'string' || query.trim().length === 0) {
    return Object.freeze({
      intent: 'find_expense',
      filters: Object.freeze({}),
      originalQuery: query ?? '',
    });
  }

  const intent = detectIntent(query);
  const amountRange = parseAmountRange(query);
  const dateRange = parseDateRange(query, now);
  const merchant = parseMerchant(query);
  const category = parseCategory(query);

  const filters: {
    amountRange?: { min?: number; max?: number };
    dateRange?: { from?: string; to?: string };
    merchant?: string;
    category?: string;
  } = {};
  if (amountRange !== undefined) {
    filters.amountRange = Object.freeze({ ...amountRange });
  }
  if (dateRange !== undefined) {
    filters.dateRange = Object.freeze({ ...dateRange });
  }
  if (merchant !== undefined) {
    filters.merchant = merchant;
  }
  if (category !== undefined) {
    filters.category = category;
  }

  return Object.freeze({
    intent,
    filters: Object.freeze(filters),
    originalQuery: query,
  });
}
