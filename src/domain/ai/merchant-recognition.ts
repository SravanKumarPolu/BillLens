/**
 * Merchant recognition — anonymized pattern-based recognition.
 *
 * Phase 10 Prompt 96: AI Evolution.
 *
 * CRITICAL CONSTRAINTS:
 *   - This module operates on EXTRACTED TEXT (already produced by OCR), not
 *     on raw receipt images. We do NOT upload images to a third-party
 *     merchant-recognition API.
 *   - Merchant names are canonicalised (e.g. "STARBUCKS #12345" →
 *     "STARBUCKS"). The raw extracted text is NOT persisted in the
 *     MerchantInfo result — only the canonical name + category + confidence.
 *   - The `matchedPattern` field is an anonymized token (e.g. "starbucks*"
 *     or "coffee*"), NOT the raw text. This protects PII while still
 *     letting the developer-portal UI show what triggered the match.
 *   - Confidence is 0-1; values below 0.5 are NOT auto-applied (the user
 *     is shown a "merchant not recognised" prompt instead).
 *
 * This module is PURE: pattern matching is done against a static in-memory
 * table of known merchants. No network calls, no model inference.
 *
 * See `docs/ai-evolution.md`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MerchantInfo {
  /** Canonical uppercase name (e.g. 'STARBUCKS'). */
  readonly canonicalName: string;
  /** Category slug (e.g. 'coffee_shops'). */
  readonly category: string;
  /** Confidence 0-1. */
  readonly confidence: number;
  /** Anonymized pattern that matched (e.g. 'starbucks*'). */
  readonly matchedPattern: string;
}

// ---------------------------------------------------------------------------
// Merchant registry (static, in-memory)
// ---------------------------------------------------------------------------

interface MerchantPattern {
  readonly canonicalName: string;
  readonly category: string;
  /** Lowercase substrings that indicate this merchant. */
  readonly patterns: readonly string[];
}

/**
 * Static merchant pattern table.
 *
 * In production this would be loaded from a config file or remote config.
 * The patterns are deliberately conservative: we only match when the
 * extracted text contains a distinctive substring. This avoids false
 * positives on common words.
 *
 * Categories follow the standard ExpenseCategory taxonomy (see
 * `spending-categorisation.ts`).
 */
const MERCHANT_PATTERNS: readonly MerchantPattern[] = Object.freeze([
  {
    canonicalName: 'STARBUCKS',
    category: 'coffee_shops',
    patterns: ['starbucks', 'starbuck'],
  },
  {
    canonicalName: 'MCCAFE',
    category: 'coffee_shops',
    patterns: ['mccafe', 'mc cafe'],
  },
  {
    canonicalName: 'COSTA_COFFEE',
    category: 'coffee_shops',
    patterns: ['costa coffee', 'costa'],
  },
  {
    canonicalName: 'MCDONALDS',
    category: 'fast_food',
    patterns: ['mcdonald', 'mc donald', "mc donald's", 'mcd'],
  },
  {
    canonicalName: 'BURGER_KING',
    category: 'fast_food',
    patterns: ['burger king', 'bk'],
  },
  {
    canonicalName: 'KFC',
    category: 'fast_food',
    patterns: ['kfc', 'kentucky fried'],
  },
  {
    canonicalName: 'SUBWAY',
    category: 'fast_food',
    patterns: ['subway'],
  },
  {
    canonicalName: 'DOMINOS',
    category: 'fast_food',
    patterns: ['dominos', "domino's pizza"],
  },
  {
    canonicalName: 'PIZZA_HUT',
    category: 'fast_food',
    patterns: ['pizza hut'],
  },
  {
    canonicalName: 'AMAZON',
    category: 'shopping',
    patterns: ['amazon'],
  },
  {
    canonicalName: 'FLIPKART',
    category: 'shopping',
    patterns: ['flipkart'],
  },
  {
    canonicalName: 'WALMART',
    category: 'groceries',
    patterns: ['walmart', 'wal-mart'],
  },
  {
    canonicalName: 'BIG_BAZAAR',
    category: 'groceries',
    patterns: ['big bazaar', 'bigbazaar'],
  },
  {
    canonicalName: 'DMART',
    category: 'groceries',
    patterns: ['dmart', 'd-mart'],
  },
  {
    canonicalName: 'UBER',
    category: 'transport',
    patterns: ['uber'],
  },
  {
    canonicalName: 'OLA',
    category: 'transport',
    patterns: ['ola cabs', 'olacabs', 'ola '],
  },
  {
    canonicalName: 'LYFT',
    category: 'transport',
    patterns: ['lyft'],
  },
  {
    canonicalName: 'SWIGGY',
    category: 'food_delivery',
    patterns: ['swiggy'],
  },
  {
    canonicalName: 'ZOMATO',
    category: 'food_delivery',
    patterns: ['zomato'],
  },
  {
    canonicalName: 'UBER_EATS',
    category: 'food_delivery',
    patterns: ['uber eats', 'ubereats'],
  },
  {
    canonicalName: 'NETFLIX',
    category: 'entertainment',
    patterns: ['netflix'],
  },
  {
    canonicalName: 'SPOTIFY',
    category: 'entertainment',
    patterns: ['spotify'],
  },
  {
    canonicalName: 'AMAZON_PRIME',
    category: 'entertainment',
    patterns: ['amazon prime', 'prime video'],
  },
  {
    canonicalName: 'BOOKMYSHOW',
    category: 'entertainment',
    patterns: ['bookmyshow', 'book my show'],
  },
  {
    canonicalName: 'AIRTEL',
    category: 'utilities',
    patterns: ['airtel', 'bharti airtel'],
  },
  {
    canonicalName: 'JIO',
    category: 'utilities',
    patterns: ['jio', 'reliance jio'],
  },
  {
    canonicalName: 'VI',
    category: 'utilities',
    patterns: ['vi ', 'vodafone idea'],
  },
  {
    canonicalName: 'BPCL',
    category: 'transport',
    patterns: ['bharat petroleum', 'bpcl'],
  },
  {
    canonicalName: 'HPCL',
    category: 'transport',
    patterns: ['hindustan petroleum', 'hpcl'],
  },
  {
    canonicalName: 'INDIAN_OIL',
    category: 'transport',
    patterns: ['indian oil', 'iocl'],
  },
  {
    canonicalName: 'APOLLO_PHARMACY',
    category: 'healthcare',
    patterns: ['apollo pharmacy', 'apollo medical'],
  },
  {
    canonicalName: 'MEDPLUS',
    category: 'healthcare',
    patterns: ['medplus'],
  },
  {
    canonicalName: 'BOOKING_COM',
    category: 'travel',
    patterns: ['booking.com', 'booking com'],
  },
  {
    canonicalName: 'MAKEMYTRIP',
    category: 'travel',
    patterns: ['makemytrip', 'make my trip'],
  },
  {
    canonicalName: 'CLEARTRIP',
    category: 'travel',
    patterns: ['cleartrip', 'clear trip'],
  },
  {
    canonicalName: 'IRCTC',
    category: 'travel',
    patterns: ['irctc'],
  },
]);

// Build a lookup table from category → merchants for getMerchantCategory.
const MERCHANT_TO_CATEGORY: ReadonlyMap<string, string> = (() => {
  const m = new Map<string, string>();
  for (const merchant of MERCHANT_PATTERNS) {
    m.set(merchant.canonicalName, merchant.category);
  }
  return m;
})();

// ---------------------------------------------------------------------------
// Recognition
// ---------------------------------------------------------------------------

/**
 * Recognises the merchant from extracted receipt text.
 *
 * The function lowercases the extracted text and looks for the FIRST
 * merchant pattern that appears as a substring. If multiple merchants
 * match, the one with the longest matching pattern wins (more specific).
 *
 * Returns `null` when no merchant is recognised.
 *
 * The returned `MerchantInfo.matchedPattern` is the anonymized pattern
 * (e.g. 'starbucks*'), NOT the raw extracted text — this protects PII.
 *
 * Confidence is heuristic:
 *   - 0.95 when the pattern is unambiguous (only one merchant matches).
 *   - 0.85 when multiple merchants match but one has a longer pattern.
 *   - 0.75 when the pattern is short (≤ 4 chars) — more likely to be a
 *     false positive.
 */
export function recognizeMerchant(extractedText: string): MerchantInfo | null {
  if (typeof extractedText !== 'string' || extractedText.length === 0) {
    return null;
  }
  const lower = extractedText.toLowerCase();
  const matches: { merchant: MerchantPattern; pattern: string }[] = [];
  for (const merchant of MERCHANT_PATTERNS) {
    for (const pattern of merchant.patterns) {
      if (lower.includes(pattern)) {
        matches.push({ merchant, pattern });
      }
    }
  }
  if (matches.length === 0) return null;

  // Pick the match with the longest pattern (most specific).
  matches.sort((a, b) => b.pattern.length - a.pattern.length);
  const best = matches[0];
  if (!best) return null;

  // Confidence heuristic.
  let confidence: number;
  if (matches.length === 1) {
    confidence = best.pattern.length <= 4 ? 0.75 : 0.95;
  } else {
    confidence = best.pattern.length <= 4 ? 0.65 : 0.85;
  }

  // Anonymized pattern: lowercase pattern + '*'.
  const matchedPattern = `${best.pattern}*`;

  return Object.freeze({
    canonicalName: best.merchant.canonicalName,
    category: best.merchant.category,
    confidence,
    matchedPattern,
  });
}

/**
 * Returns the category for a canonical merchant name.
 *
 * Returns `'other'` when the merchant is not in the registry.
 */
export function getMerchantCategory(merchantName: string): string {
  if (typeof merchantName !== 'string' || merchantName.length === 0) {
    return 'other';
  }
  const upper = merchantName.toUpperCase();
  return MERCHANT_TO_CATEGORY.get(upper) ?? 'other';
}

/**
 * Returns all known canonical merchant names.
 *
 * Useful for the developer-portal's merchant-recognition coverage page.
 */
export function getKnownMerchants(): readonly string[] {
  return Object.freeze(MERCHANT_PATTERNS.map((m) => m.canonicalName));
}

/**
 * Returns all known merchant categories.
 */
export function getKnownCategories(): readonly string[] {
  const set = new Set<string>();
  for (const m of MERCHANT_PATTERNS) {
    set.add(m.category);
  }
  return Object.freeze([...set].sort());
}
