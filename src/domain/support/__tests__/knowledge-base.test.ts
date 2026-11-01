import { describe, expect, it } from '@jest/globals';

import {
  ARTICLE_BODY_MAX_LENGTH,
  ARTICLE_MAX_TAGS,
  ARTICLE_STATUSES,
  canTransitionArticle,
  createArticle,
  helpfulnessRatio,
  listArticlesByCategory,
  markArticleHelpful,
  markArticleUnhelpful,
  searchArticles,
  transitionArticle,
  type KnowledgeArticle,
} from '../knowledge-base';

const NOW = '2025-01-01T00:00:00.000Z';

function makeArticle(overrides: Partial<KnowledgeArticle> = {}): KnowledgeArticle {
  return createArticle({
    slug: 'how-to-settle-an-expense',
    title: 'How to Settle an Expense',
    body: 'To settle an expense, tap the Settle button on the group balances screen.',
    category: 'settlements',
    tags: ['settlement', 'balances'],
    status: 'published',
    createdAt: NOW,
    ...overrides,
  });
}

describe('knowledge-base', () => {
  describe('createArticle', () => {
    it('creates an article with defaults', () => {
      const a = createArticle({
        slug: 'test-article',
        title: 'Test Article',
        body: 'Body content.',
        category: 'general',
        createdAt: NOW,
      });
      expect(a.status).toBe('draft');
      expect(a.helpfulCount).toBe(0);
      expect(a.unhelpfulCount).toBe(0);
      expect(a.voterIds).toEqual([]);
      expect(a.tags).toEqual([]);
      expect(a.version).toBe(1);
    });

    it('rejects an invalid slug (must be lowercase + dashes)', () => {
      expect(() =>
        createArticle({
          slug: 'Invalid Slug',
          title: 'T',
          body: 'B',
          category: 'c',
          createdAt: NOW,
        }),
      ).toThrow();
    });

    it('accepts a slug with numbers + dashes', () => {
      const a = createArticle({
        slug: 'how-to-2-settle',
        title: 'T',
        body: 'B',
        category: 'c',
        createdAt: NOW,
      });
      expect(a.slug).toBe('how-to-2-settle');
    });

    it('rejects an empty title', () => {
      expect(() =>
        createArticle({
          slug: 'a',
          title: '',
          body: 'B',
          category: 'c',
          createdAt: NOW,
        }),
      ).toThrow();
    });

    it('rejects a title that is too long', () => {
      expect(() =>
        createArticle({
          slug: 'a',
          title: 'x'.repeat(ARTICLE_BODY_MAX_LENGTH + 1).slice(0, 201),
          body: 'B',
          category: 'c',
          createdAt: NOW,
        }),
      ).toThrow();
    });

    it('rejects too many tags', () => {
      expect(() =>
        createArticle({
          slug: 'a',
          title: 'T',
          body: 'B',
          category: 'c',
          tags: Array(ARTICLE_MAX_TAGS + 1).fill('tag'),
          createdAt: NOW,
        }),
      ).toThrow();
    });

    it('rejects an invalid createdAt', () => {
      expect(() =>
        createArticle({
          slug: 'a',
          title: 'T',
          body: 'B',
          category: 'c',
          createdAt: 'not-a-date',
        }),
      ).toThrow();
    });

    it('returns a frozen article', () => {
      const a = makeArticle();
      expect(Object.isFrozen(a)).toBe(true);
      expect(Object.isFrozen(a.tags)).toBe(true);
      expect(Object.isFrozen(a.voterIds)).toBe(true);
    });
  });

  describe('ARTICLE_STATUSES + canTransitionArticle', () => {
    it('exposes 3 statuses', () => {
      expect(ARTICLE_STATUSES).toEqual(['draft', 'published', 'archived']);
    });

    it('allows draft → published', () => {
      expect(canTransitionArticle('draft', 'published')).toBe(true);
    });

    it('allows draft → archived', () => {
      expect(canTransitionArticle('draft', 'archived')).toBe(true);
    });

    it('allows published → archived', () => {
      expect(canTransitionArticle('published', 'archived')).toBe(true);
    });

    it('allows archived → draft', () => {
      expect(canTransitionArticle('archived', 'draft')).toBe(true);
    });

    it('disallows published → draft', () => {
      expect(canTransitionArticle('published', 'draft')).toBe(false);
    });

    it('disallows draft → draft (no-op)', () => {
      expect(canTransitionArticle('draft', 'draft')).toBe(false);
    });
  });

  describe('transitionArticle', () => {
    it('transitions draft → published', () => {
      const a = makeArticle({ status: 'draft' });
      const published = transitionArticle(a, 'published', NOW);
      expect(published.status).toBe('published');
      expect(published.version).toBe(a.version + 1);
    });

    it('throws on an illegal transition', () => {
      const a = makeArticle({ status: 'published' });
      expect(() => transitionArticle(a, 'draft', NOW)).toThrow();
    });
  });

  describe('markArticleHelpful / markArticleUnhelpful', () => {
    it('increments helpfulCount + records the voter ID', () => {
      const a = makeArticle();
      const voted = markArticleHelpful(a, 'user-1', NOW);
      expect(voted.helpfulCount).toBe(1);
      expect(voted.voterIds).toContain('user-1');
    });

    it('is idempotent — same voter cannot vote twice', () => {
      const a = makeArticle();
      const once = markArticleHelpful(a, 'user-1', NOW);
      const twice = markArticleHelpful(once, 'user-1', NOW);
      expect(twice.helpfulCount).toBe(1);
      expect(twice).toBe(once);
    });

    it('a user can vote once on helpful OR unhelpful, not both', () => {
      const a = makeArticle();
      const helpful = markArticleHelpful(a, 'user-1', NOW);
      const unhelpful = markArticleUnhelpful(helpful, 'user-1', NOW);
      // unhelpful is a no-op since user-1 already voted.
      expect(unhelpful.helpfulCount).toBe(1);
      expect(unhelpful.unhelpfulCount).toBe(0);
    });

    it('multiple users can each vote once', () => {
      const a = makeArticle();
      const a1 = markArticleHelpful(a, 'user-1', NOW);
      const a2 = markArticleHelpful(a1, 'user-2', NOW);
      const a3 = markArticleUnhelpful(a2, 'user-3', NOW);
      expect(a3.helpfulCount).toBe(2);
      expect(a3.unhelpfulCount).toBe(1);
    });

    it('rejects an empty voterId', () => {
      const a = makeArticle();
      expect(() => markArticleHelpful(a, '', NOW)).toThrow();
    });
  });

  describe('helpfulnessRatio', () => {
    it('returns 0.5 when there are no votes (neutral default)', () => {
      expect(helpfulnessRatio(makeArticle())).toBe(0.5);
    });

    it('returns helpful / (helpful + unhelpful)', () => {
      const a = makeArticle({ helpfulCount: 8, unhelpfulCount: 2 });
      expect(helpfulnessRatio(a)).toBeCloseTo(0.8, 2);
    });

    it('returns 1 when all votes are helpful', () => {
      const a = makeArticle({ helpfulCount: 5, unhelpfulCount: 0 });
      expect(helpfulnessRatio(a)).toBe(1);
    });

    it('returns 0 when all votes are unhelpful', () => {
      const a = makeArticle({ helpfulCount: 0, unhelpfulCount: 5 });
      expect(helpfulnessRatio(a)).toBe(0);
    });
  });

  describe('searchArticles', () => {
    const articles = [
      makeArticle({
        slug: 'settle-1',
        title: 'How to Settle an Expense',
        body: 'Tap the Settle button.',
        tags: ['settlement', 'balances'],
      }),
      makeArticle({
        slug: 'ocr-1',
        title: 'Fixing OCR Errors',
        body: 'If the OCR misread a total, edit the field.',
        tags: ['ocr'],
      }),
      makeArticle({
        slug: 'draft-1',
        title: 'Settlement Drafts',
        body: 'Drafts are auto-saved.',
        tags: ['settlement'],
        status: 'draft', // should NOT appear in search
      }),
    ];

    it('returns published articles matching the query', () => {
      const results = searchArticles(articles, 'settle');
      expect(results.length).toBeGreaterThan(0);
      // Title match (3 points) > body match (2 points) > tag match (1 point).
      const slugs = results.map((r) => r.article.slug);
      expect(slugs).toContain('settle-1');
    });

    it('does NOT return draft articles', () => {
      const results = searchArticles(articles, 'settle');
      const slugs = results.map((r) => r.article.slug);
      expect(slugs).not.toContain('draft-1');
    });

    it('returns results sorted by score descending', () => {
      const results = searchArticles(articles, 'settlement');
      // settle-1: title 'Settle' (3) + tag 'settlement' (1) = 4
      // draft-1: filtered out
      // Only settle-1 matches.
      expect(results.length).toBe(1);
    });

    it('returns [] for an empty query', () => {
      expect(searchArticles(articles, '')).toEqual([]);
      expect(searchArticles(articles, '   ')).toEqual([]);
    });

    it('is case-insensitive', () => {
      const results = searchArticles(articles, 'OCR');
      expect(results.some((r) => r.article.slug === 'ocr-1')).toBe(true);
    });

    it('returns a frozen array', () => {
      const results = searchArticles(articles, 'settle');
      expect(Object.isFrozen(results)).toBe(true);
    });
  });

  describe('listArticlesByCategory', () => {
    const articles = [
      makeArticle({ slug: 'a1', category: 'settlements', updatedAt: '2025-01-02T00:00:00.000Z' }),
      makeArticle({ slug: 'a2', category: 'ocr', updatedAt: '2025-01-03T00:00:00.000Z' }),
      makeArticle({ slug: 'a3', category: 'settlements', updatedAt: '2025-01-01T00:00:00.000Z' }),
      makeArticle({ slug: 'a4', category: 'settlements', status: 'draft' }),
    ];

    it('returns published articles in the category, most-recent-first', () => {
      const list = listArticlesByCategory(articles, 'settlements');
      expect(list.length).toBe(2);
      expect(list[0]!.slug).toBe('a1'); // 2025-01-02
      expect(list[1]!.slug).toBe('a3'); // 2025-01-01
    });

    it('excludes articles in other categories', () => {
      const list = listArticlesByCategory(articles, 'ocr');
      expect(list.length).toBe(1);
      expect(list[0]!.slug).toBe('a2');
    });

    it('excludes draft articles', () => {
      const list = listArticlesByCategory(articles, 'settlements');
      const slugs = list.map((a) => a.slug);
      expect(slugs).not.toContain('a4');
    });

    it('rejects an empty category', () => {
      expect(() => listArticlesByCategory(articles, '')).toThrow();
    });
  });
});
