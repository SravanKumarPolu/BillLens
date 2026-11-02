/**
 * Search indexing strategy.
 *
 * Phase 10 Prompt 91: Scalability Architecture.
 *
 * Defines the search indexes used by BillLens (expenses, groups,
 * members, activity, settlements FTS) and provides a sanitiser that
 * converts user input into a safe SQLite FTS5 query string.
 *
 * SECURITY: `generateSearchQuery` is the ONLY sanctioned way to turn
 * user input into an FTS query. It strips FTS5 special characters,
 * escapes quotes, and lowers input — preventing query-injection via
 * the search box.
 *
 * See `docs/scalability-architecture.md`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SearchIndex =
  | 'expenses_fts'
  | 'groups_fts'
  | 'members_fts'
  | 'activity_fts'
  | 'settlements_fts';

export type SearchTokenizer = 'standard' | 'ngram' | 'whitespace';

export interface SearchIndexConfig {
  readonly name: SearchIndex;
  readonly indexedFields: readonly string[];
  readonly tokenizer: SearchTokenizer;
  readonly filters: readonly string[];
  readonly updatedAt: string;
}

// ---------------------------------------------------------------------------
// Search index registry
// ---------------------------------------------------------------------------

export const SEARCH_INDEXES: Readonly<Record<SearchIndex, SearchIndexConfig>> =
  Object.freeze({
    expenses_fts: Object.freeze({
      name: 'expenses_fts',
      indexedFields: ['description', 'merchant_name', 'note', 'category'],
      tokenizer: 'standard',
      filters: ['lowercase', 'stopwords'],
      updatedAt: '2026-01-01T00:00:00.000Z',
    }),
    groups_fts: Object.freeze({
      name: 'groups_fts',
      indexedFields: ['name', 'description'],
      tokenizer: 'standard',
      filters: ['lowercase', 'stopwords'],
      updatedAt: '2026-01-01T00:00:00.000Z',
    }),
    members_fts: Object.freeze({
      name: 'members_fts',
      indexedFields: ['display_name', 'email', 'phone'],
      tokenizer: 'standard',
      filters: ['lowercase'],
      updatedAt: '2026-01-01T00:00:00.000Z',
    }),
    activity_fts: Object.freeze({
      name: 'activity_fts',
      indexedFields: ['event_type', 'summary', 'actor_name'],
      tokenizer: 'whitespace',
      filters: ['lowercase'],
      updatedAt: '2026-01-01T00:00:00.000Z',
    }),
    settlements_fts: Object.freeze({
      name: 'settlements_fts',
      indexedFields: ['payer_name', 'payee_name', 'note'],
      tokenizer: 'standard',
      filters: ['lowercase', 'stopwords'],
      updatedAt: '2026-01-01T00:00:00.000Z',
    }),
  });

// ---------------------------------------------------------------------------
// Query sanitiser — the ONLY sanctioned way to build an FTS5 query
// ---------------------------------------------------------------------------

/**
 * FTS5 special characters that must be neutralised. These include:
 *  - double-quote (used for phrase queries)
 *  - asterisk (prefix queries)
 *  - column specifier `:`
 *  - boolean operators (NOT, AND, OR, NEAR) — handled separately
 *  - parentheses (grouping)
 *  - caret (boost) — FTS5 doesn't support but harmless
 */
const FTS5_SPECIAL_CHARS = /["*():^]/g;

/**
 * Stopwords that FTS5 strips by default. We pre-filter them to avoid
 * empty-token errors.
 */
const FTS5_STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for',
  'if', 'in', 'into', 'is', 'it', 'no', 'not', 'of', 'on', 'or',
  'such', 'that', 'the', 'their', 'then', 'there', 'these', 'they',
  'this', 'to', 'was', 'will', 'with',
]);

/**
 * Converts raw user input into a safe SQLite FTS5 query string.
 *
 * Strategy:
 *  1. Trim + collapse whitespace.
 *  2. Strip FTS5 special characters from each token.
 *  3. Drop empty tokens and English stopwords.
 *  4. Wrap each remaining token in double-quotes (phrase of length 1)
 *     so that no token can ever be interpreted as an FTS5 operator.
 *  5. Join with implicit AND (space-separated, the FTS5 default).
 *
 * Returns the empty string when no usable tokens remain — callers
 * should treat this as "no query" and short-circuit the search.
 *
 * Example:
 *   generateSearchQuery('  coffee AND shop* ') → '"coffee" "shop"'
 *   generateSearchQuery('the OR a')            → ''
 *   generateSearchQuery('starbucks')           → '"starbucks"'
 */
export function generateSearchQuery(userInput: string): string {
  if (typeof userInput !== 'string') {
    return '';
  }
  const trimmed = userInput.trim();
  if (trimmed.length === 0) {
    return '';
  }
  if (trimmed.length > 256) {
    // Cap input length to keep queries bounded.
    return '';
  }

  const rawTokens = trimmed.split(/\s+/);
  const safeTokens: string[] = [];
  for (const raw of rawTokens) {
    // Strip FTS5 specials but keep word characters, digits, and hyphens.
    const stripped = raw.replace(FTS5_SPECIAL_CHARS, '');
    if (stripped.length === 0) {
      continue;
    }
    const lowered = stripped.toLowerCase();
    if (FTS5_STOPWORDS.has(lowered)) {
      continue;
    }
    // Escape any embedded double-quote (defence in depth — we already
    // stripped them above, but be paranoid).
    const escaped = lowered.replace(/"/g, '');
    if (escaped.length > 0) {
      safeTokens.push(`"${escaped}"`);
    }
  }

  return safeTokens.join(' ');
}

/**
 * Returns the search index config for a given name. Throws on unknown
 * index — a programming error.
 */
export function getSearchIndexConfig(name: SearchIndex): SearchIndexConfig {
  const cfg = SEARCH_INDEXES[name];
  if (!cfg) {
    throw new Error(`Unknown search index: ${name}`);
  }
  return cfg;
}

/**
 * Returns true when the user input would produce a non-empty FTS5
 * query. Useful for short-circuiting UI affordances.
 */
export function hasSearchableInput(userInput: string): boolean {
  return generateSearchQuery(userInput).length > 0;
}
