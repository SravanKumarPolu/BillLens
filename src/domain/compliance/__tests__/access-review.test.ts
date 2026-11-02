/**
 * Access review tests.
 *
 * Phase 10 Prompt 97.
 */

import { describe, expect, it } from '@jest/globals';

import {
  type AccessReview,
  computeReviewCompletionRate,
  getOverdueReviews,
  getReviewStatusCounts,
  isReviewOverdue,
} from '../access-review';

const NOW = '2026-07-15T00:00:00.000Z';
const PAST = '2026-06-01T00:00:00.000Z';
const FUTURE = '2026-12-31T00:00:00.000Z';

function makeReview(overrides: Partial<AccessReview>): AccessReview {
  return {
    id: 'rev-1',
    reviewerId: 'user-1',
    revieweeId: 'user-2',
    resourceType: 'group',
    resourceId: 'group-1',
    accessLevel: 'member',
    status: 'pending',
    nextReviewDue: FUTURE,
    ...overrides,
  };
}

describe('isReviewOverdue', () => {
  it('returns true when due date is in the past and status is pending', () => {
    const review = makeReview({ status: 'pending', nextReviewDue: PAST });
    expect(isReviewOverdue(review, NOW)).toBe(true);
  });

  it('returns false when due date is in the future and status is pending', () => {
    const review = makeReview({ status: 'pending', nextReviewDue: FUTURE });
    expect(isReviewOverdue(review, NOW)).toBe(false);
  });

  it('returns false when status is completed even if due date is in the past', () => {
    const review = makeReview({
      status: 'completed',
      nextReviewDue: PAST,
      decision: 'retain',
    });
    expect(isReviewOverdue(review, NOW)).toBe(false);
  });

  it('returns false when status is already overdue (idempotent — caller may flag it)', () => {
    const review = makeReview({ status: 'overdue', nextReviewDue: PAST });
    expect(isReviewOverdue(review, NOW)).toBe(false);
  });

  it('returns false at the exact due date (boundary — due date is the deadline)', () => {
    const review = makeReview({ status: 'pending', nextReviewDue: NOW });
    expect(isReviewOverdue(review, NOW)).toBe(false);
  });

  it('returns true one millisecond after the due date', () => {
    const oneMsAfter = '2026-07-15T00:00:00.001Z';
    const review = makeReview({ status: 'pending', nextReviewDue: NOW });
    expect(isReviewOverdue(review, oneMsAfter)).toBe(true);
  });

  it('returns false when now is invalid', () => {
    const review = makeReview({ status: 'pending', nextReviewDue: PAST });
    expect(isReviewOverdue(review, 'not-a-date')).toBe(false);
  });

  it('returns false when nextReviewDue is invalid', () => {
    const review = makeReview({
      status: 'pending',
      nextReviewDue: 'not-a-date',
    });
    expect(isReviewOverdue(review, NOW)).toBe(false);
  });

  it('works for admin_panel reviews', () => {
    const review = makeReview({
      resourceType: 'admin_panel',
      resourceId: 'admin-panel',
      accessLevel: 'full_admin',
      status: 'pending',
      nextReviewDue: PAST,
    });
    expect(isReviewOverdue(review, NOW)).toBe(true);
  });

  it('works for api_key reviews', () => {
    const review = makeReview({
      resourceType: 'api_key',
      resourceId: 'bl_live_xxx',
      accessLevel: 'read_write',
      status: 'pending',
      nextReviewDue: PAST,
    });
    expect(isReviewOverdue(review, NOW)).toBe(true);
  });

  it('works for database reviews', () => {
    const review = makeReview({
      resourceType: 'database',
      resourceId: 'supabase-prod',
      accessLevel: 'read_only',
      status: 'pending',
      nextReviewDue: PAST,
    });
    expect(isReviewOverdue(review, NOW)).toBe(true);
  });

  it('works for org reviews', () => {
    const review = makeReview({
      resourceType: 'org',
      resourceId: 'org-1',
      accessLevel: 'org_admin',
      status: 'pending',
      nextReviewDue: PAST,
    });
    expect(isReviewOverdue(review, NOW)).toBe(true);
  });
});

describe('getOverdueReviews', () => {
  it('returns only the overdue reviews, preserving order', () => {
    const reviews: readonly AccessReview[] = [
      makeReview({ id: 'a', status: 'pending', nextReviewDue: FUTURE }),
      makeReview({ id: 'b', status: 'pending', nextReviewDue: PAST }),
      makeReview({ id: 'c', status: 'completed', nextReviewDue: PAST }),
      makeReview({ id: 'd', status: 'pending', nextReviewDue: PAST }),
    ];
    const overdue = getOverdueReviews(reviews, NOW);
    expect(overdue.map((r) => r.id)).toEqual(['b', 'd']);
  });

  it('returns an empty list when there are no overdue reviews', () => {
    const reviews: readonly AccessReview[] = [
      makeReview({ id: 'a', status: 'pending', nextReviewDue: FUTURE }),
      makeReview({ id: 'b', status: 'completed', nextReviewDue: PAST }),
    ];
    expect(getOverdueReviews(reviews, NOW)).toEqual([]);
  });

  it('returns an empty list when input is empty', () => {
    expect(getOverdueReviews([], NOW)).toEqual([]);
  });
});

describe('computeReviewCompletionRate', () => {
  it('returns 0 for an empty list', () => {
    expect(computeReviewCompletionRate([])).toBe(0);
  });

  it('returns 100 when all reviews are completed', () => {
    const reviews: readonly AccessReview[] = [
      makeReview({ status: 'completed', decision: 'retain' }),
      makeReview({ status: 'completed', decision: 'revoke' }),
    ];
    expect(computeReviewCompletionRate(reviews)).toBe(100);
  });

  it('returns 0 when no reviews are completed', () => {
    const reviews: readonly AccessReview[] = [
      makeReview({ status: 'pending' }),
      makeReview({ status: 'overdue' }),
    ];
    expect(computeReviewCompletionRate(reviews)).toBe(0);
  });

  it('returns 50 when half are completed', () => {
    const reviews: readonly AccessReview[] = [
      makeReview({ status: 'completed', decision: 'retain' }),
      makeReview({ status: 'pending' }),
    ];
    expect(computeReviewCompletionRate(reviews)).toBe(50);
  });

  it('returns 33.3 when 1 of 3 is completed (1 decimal place)', () => {
    const reviews: readonly AccessReview[] = [
      makeReview({ status: 'completed', decision: 'retain' }),
      makeReview({ status: 'pending' }),
      makeReview({ status: 'overdue' }),
    ];
    expect(computeReviewCompletionRate(reviews)).toBe(33.3);
  });

  it('counts overdue as not-completed', () => {
    const reviews: readonly AccessReview[] = [
      makeReview({ status: 'completed', decision: 'retain' }),
      makeReview({ status: 'overdue' }),
      makeReview({ status: 'overdue' }),
      makeReview({ status: 'overdue' }),
    ];
    expect(computeReviewCompletionRate(reviews)).toBe(25);
  });
});

describe('getReviewStatusCounts', () => {
  it('returns counts of each status', () => {
    const reviews: readonly AccessReview[] = [
      makeReview({ id: '1', status: 'pending' }),
      makeReview({ id: '2', status: 'pending' }),
      makeReview({ id: '3', status: 'completed', decision: 'retain' }),
      makeReview({ id: '4', status: 'overdue' }),
      makeReview({ id: '5', status: 'overdue' }),
      makeReview({ id: '6', status: 'overdue' }),
    ];
    const counts = getReviewStatusCounts(reviews);
    expect(counts.pending).toBe(2);
    expect(counts.completed).toBe(1);
    expect(counts.overdue).toBe(3);
  });

  it('returns all zeros for an empty list', () => {
    const counts = getReviewStatusCounts([]);
    expect(counts).toEqual({ pending: 0, completed: 0, overdue: 0 });
  });

  it('returns a frozen object', () => {
    const counts = getReviewStatusCounts([]);
    expect(Object.isFrozen(counts)).toBe(true);
  });
});
