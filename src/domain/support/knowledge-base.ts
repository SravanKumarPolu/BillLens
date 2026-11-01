/**
 * Knowledge base — FAQ articles with search + helpfulness tracking.
 *
 * Articles are operator-authored content (no PII). Each article has:
 *   - A stable slug (URL-safe identifier).
 *   - A title + body (Markdown).
 *   - A category (free-form, no PII).
 *   - A list of tags.
 *   - Helpful / unhelpful vote counts (user-submitted).
 *   - A published / draft status.
 *
 * `searchArticles()` performs a simple case-insensitive substring
 * search across the title + body + tags. Production deployments MAY
 * replace this with a full-text search backend; the domain contract
 * is the same.
 *
 * `markArticleHelpful()` / `markArticleUnhelpful()` are idempotent —
 * a user can vote only once per article. The article carries a set
 * of voter IDs to enforce this.
 *
 * See `docs/customer-support-operations.md`.
 */

// ---------------------------------------------------------------------------
// Article status
// ---------------------------------------------------------------------------

export type ArticleStatus = 'draft' | 'published' | 'archived';

export const ARTICLE_STATUSES: readonly ArticleStatus[] = [
  'draft',
  'published',
  'archived',
] as const;

export function isArticleStatus(value: unknown): value is ArticleStatus {
  return (
    typeof value === 'string' &&
    (ARTICLE_STATUSES as readonly string[]).includes(value)
  );
}

// ---------------------------------------------------------------------------
// Article entity
// ---------------------------------------------------------------------------

export interface KnowledgeArticle {
  /** Stable slug (URL-safe, e.g. "how-to-settle-an-expense"). */
  readonly slug: string;
  /** Title (max 200 chars). */
  readonly title: string;
  /** Body in Markdown (max 10000 chars). */
  readonly body: string;
  /** Category (free-form, no PII). */
  readonly category: string;
  /** Tags (max 10, each max 50 chars). */
  readonly tags: readonly string[];
  /** Published / draft / archived status. */
  readonly status: ArticleStatus;
  /** ISO date-time the article was created. */
  readonly createdAt: string;
  /** ISO date-time the article was last updated. */
  readonly updatedAt: string;
  /** Helpful vote count. */
  readonly helpfulCount: number;
  /** Unhelpful vote count. */
  readonly unhelpfulCount: number;
  /** IDs of users who have voted (to prevent duplicate votes). */
  readonly voterIds: readonly string[];
  /** Schema version. */
  readonly version: number;
}

export interface KnowledgeArticleInput {
  readonly slug: string;
  readonly title: string;
  readonly body: string;
  readonly category: string;
  readonly tags?: readonly string[];
  readonly status?: ArticleStatus;
  readonly createdAt: string;
  readonly updatedAt?: string;
  readonly helpfulCount?: number;
  readonly unhelpfulCount?: number;
  readonly voterIds?: readonly string[];
  readonly version?: number;
}

export const ARTICLE_TITLE_MAX_LENGTH = 200;
export const ARTICLE_BODY_MAX_LENGTH = 10000;
export const ARTICLE_MAX_TAGS = 10;
export const ARTICLE_MAX_TAG_LENGTH = 50;
export const DEFAULT_ARTICLE_VERSION = 1;

const SLUG_RE = /^[a-z0-9-]+$/;

export function createArticle(input: KnowledgeArticleInput): KnowledgeArticle {
  if (typeof input.slug !== 'string' || !SLUG_RE.test(input.slug)) {
    throw new Error(
      `Article slug must be lowercase alphanumeric + dashes, got: ${input.slug}`,
    );
  }
  if (input.title.trim().length === 0) {
    throw new Error('Article title must not be empty');
  }
  if (input.title.length > ARTICLE_TITLE_MAX_LENGTH) {
    throw new Error(
      `Article title too long: ${input.title.length} > ${ARTICLE_TITLE_MAX_LENGTH}`,
    );
  }
  if (input.body.length > ARTICLE_BODY_MAX_LENGTH) {
    throw new Error(
      `Article body too long: ${input.body.length} > ${ARTICLE_BODY_MAX_LENGTH}`,
    );
  }
  if (input.category.trim().length === 0) {
    throw new Error('Article category must not be empty');
  }
  const tags = input.tags ?? [];
  if (tags.length > ARTICLE_MAX_TAGS) {
    throw new Error(
      `Article has too many tags: ${tags.length} > ${ARTICLE_MAX_TAGS}`,
    );
  }
  for (const tag of tags) {
    if (typeof tag !== 'string' || tag.length === 0 || tag.length > ARTICLE_MAX_TAG_LENGTH) {
      throw new Error(
        `Article tag must be a non-empty string of at most ${ARTICLE_MAX_TAG_LENGTH} chars, got: ${tag}`,
      );
    }
  }
  if (!isArticleStatus(input.status ?? 'draft')) {
    throw new Error(`Unknown article status: ${input.status ?? 'draft'}`);
  }
  if (Number.isNaN(Date.parse(input.createdAt))) {
    throw new Error('createdAt must be a valid ISO date-time');
  }
  const updatedAt = input.updatedAt ?? input.createdAt;
  if (Number.isNaN(Date.parse(updatedAt))) {
    throw new Error('updatedAt must be a valid ISO date-time');
  }
  return Object.freeze({
    slug: input.slug,
    title: input.title,
    body: input.body,
    category: input.category,
    tags: Object.freeze([...tags]),
    status: input.status ?? 'draft',
    createdAt: input.createdAt,
    updatedAt,
    helpfulCount: input.helpfulCount ?? 0,
    unhelpfulCount: input.unhelpfulCount ?? 0,
    voterIds: Object.freeze([...(input.voterIds ?? [])]),
    version: input.version ?? DEFAULT_ARTICLE_VERSION,
  });
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * Allowed status transitions:
 *   draft → published | archived
 *   published → archived
 *   archived → draft
 */
const ARTICLE_TRANSITIONS: Readonly<Record<ArticleStatus, readonly ArticleStatus[]>> = Object.freeze({
  draft: ['published', 'archived'],
  published: ['archived'],
  archived: ['draft'],
});

export function canTransitionArticle(from: ArticleStatus, to: ArticleStatus): boolean {
  const allowed = ARTICLE_TRANSITIONS[from];
  return allowed !== undefined && (allowed as readonly string[]).includes(to);
}

export function transitionArticle(
  article: KnowledgeArticle,
  to: ArticleStatus,
  nowIso: string,
): KnowledgeArticle {
  if (!canTransitionArticle(article.status, to)) {
    throw new Error(`Illegal article transition: ${article.status} → ${to}`);
  }
  if (Number.isNaN(Date.parse(nowIso))) {
    throw new Error('nowIso must be a valid ISO date-time');
  }
  return Object.freeze({
    ...article,
    status: to,
    updatedAt: nowIso,
    version: article.version + 1,
  });
}

// ---------------------------------------------------------------------------
// Helpfulness tracking
// ---------------------------------------------------------------------------

/**
 * Mark an article as helpful. Idempotent: a user can vote only once.
 * Returns the article unchanged if the user has already voted.
 */
export function markArticleHelpful(
  article: KnowledgeArticle,
  voterId: string,
  nowIso: string,
): KnowledgeArticle {
  if (voterId.trim().length === 0) {
    throw new Error('voterId must not be empty');
  }
  if (Number.isNaN(Date.parse(nowIso))) {
    throw new Error('nowIso must be a valid ISO date-time');
  }
  if (article.voterIds.includes(voterId)) {
    return article;
  }
  return Object.freeze({
    ...article,
    helpfulCount: article.helpfulCount + 1,
    voterIds: Object.freeze([...article.voterIds, voterId]),
    updatedAt: nowIso,
    version: article.version + 1,
  });
}

/**
 * Mark an article as unhelpful. Idempotent: a user can vote only once.
 * Returns the article unchanged if the user has already voted.
 */
export function markArticleUnhelpful(
  article: KnowledgeArticle,
  voterId: string,
  nowIso: string,
): KnowledgeArticle {
  if (voterId.trim().length === 0) {
    throw new Error('voterId must not be empty');
  }
  if (Number.isNaN(Date.parse(nowIso))) {
    throw new Error('nowIso must be a valid ISO date-time');
  }
  if (article.voterIds.includes(voterId)) {
    return article;
  }
  return Object.freeze({
    ...article,
    unhelpfulCount: article.unhelpfulCount + 1,
    voterIds: Object.freeze([...article.voterIds, voterId]),
    updatedAt: nowIso,
    version: article.version + 1,
  });
}

/**
 * Returns the helpfulness ratio: helpful / (helpful + unhelpful).
 * Returns 0.5 when there are no votes (neutral default).
 */
export function helpfulnessRatio(article: KnowledgeArticle): number {
  const total = article.helpfulCount + article.unhelpfulCount;
  if (total === 0) return 0.5;
  return article.helpfulCount / total;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export interface ArticleSearchResult {
  readonly article: KnowledgeArticle;
  readonly score: number;
}

/**
 * Search articles by a case-insensitive substring query across the
 * title + body + tags. Only `published` articles are searched.
 *
 * The score is the count of matches across the three fields. Results
 * are sorted by score descending.
 */
export function searchArticles(
  articles: readonly KnowledgeArticle[],
  query: string,
): readonly ArticleSearchResult[] {
  if (typeof query !== 'string' || query.trim().length === 0) {
    return Object.freeze([]);
  }
  const q = query.trim().toLowerCase();
  const results: ArticleSearchResult[] = [];
  for (const article of articles) {
    if (article.status !== 'published') continue;
    let score = 0;
    if (article.title.toLowerCase().includes(q)) score += 3;
    if (article.body.toLowerCase().includes(q)) score += 2;
    for (const tag of article.tags) {
      if (tag.toLowerCase().includes(q)) score += 1;
    }
    if (score > 0) {
      results.push(Object.freeze({ article, score }));
    }
  }
  results.sort((a, b) => b.score - a.score);
  return Object.freeze(results);
}

/**
 * List published articles in a given category. Sorted by `updatedAt`
 * descending.
 */
export function listArticlesByCategory(
  articles: readonly KnowledgeArticle[],
  category: string,
): readonly KnowledgeArticle[] {
  if (typeof category !== 'string' || category.trim().length === 0) {
    throw new Error('category must be a non-empty string');
  }
  return Object.freeze(
    articles
      .filter((a) => a.status === 'published' && a.category === category)
      .slice()
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
  );
}
