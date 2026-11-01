/**
 * Access review model — periodic access recertification.
 *
 * Phase 10 Prompt 97: Compliance and Governance.
 *
 * Larger customers require periodic access reviews: every quarter
 * (or whatever cadence they choose), each reviewer must verify that
 * every reviewee's access to a resource is still required. Stale
 * access is the most common audit finding.
 *
 * This module is PURE: it computes overdue/completion statistics
 * from a list of access reviews. No I/O, no state mutation.
 *
 * See `docs/compliance-governance.md`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReviewStatus = 'pending' | 'completed' | 'overdue';

export type ReviewDecision = 'retain' | 'revoke' | 'modify';

export type ReviewableResourceType =
  | 'org'
  | 'group'
  | 'api_key'
  | 'admin_panel'
  | 'database';

export interface AccessReview {
  /** Stable unique identifier. */
  readonly id: string;
  /** User ID of the reviewer (must have authority over the resource). */
  readonly reviewerId: string;
  /** User ID of the reviewee whose access is being reviewed. */
  readonly revieweeId: string;
  /** Kind of resource under review. */
  readonly resourceType: ReviewableResourceType;
  /** Resource identifier (org id, group id, api key id, etc.). */
  readonly resourceId: string;
  /** Human-readable access level (e.g. 'admin', 'member', 'read_only'). */
  readonly accessLevel: string;
  /** Current lifecycle status of the review task. */
  readonly status: ReviewStatus;
  /** ISO date when the review was last completed (optional). */
  readonly lastReviewedAt?: string;
  /** ISO date by which the next review must be completed. */
  readonly nextReviewDue: string;
  /** Reviewer's decision (only set when status === 'completed'). */
  readonly decision?: ReviewDecision;
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when the review is overdue as of `now`.
 *
 * A review is overdue when its `nextReviewDue` date is in the past
 * AND its status is still 'pending'. Completed reviews are NEVER
 * overdue (even if completed after the due date — that's tracked
 * separately as "late completion"). Reviews already flagged with
 * status='overdue' return false — this is an idempotency guarantee
 * so the background job that flags overdue reviews does not re-flag
 * them on every run.
 *
 * `now` MUST be a valid ISO date string.
 */
export function isReviewOverdue(review: AccessReview, now: string): boolean {
  // Only 'pending' reviews can transition to overdue. Reviews already
  // flagged 'overdue', or completed, are left alone.
  if (review.status !== 'pending') {
    return false;
  }
  const nowMs = parseStrict(now);
  if (nowMs === null) {
    return false;
  }
  const dueMs = parseStrict(review.nextReviewDue);
  if (dueMs === null) {
    return false;
  }
  return nowMs > dueMs;
}

/**
 * Returns the subset of reviews that are overdue as of `now`.
 *
 * Order is preserved from the input list.
 */
export function getOverdueReviews(
  reviews: readonly AccessReview[],
  now: string,
): readonly AccessReview[] {
  return reviews.filter((r) => isReviewOverdue(r, now));
}

/**
 * Returns the completion rate as a percentage in [0, 100].
 *
 *   completed / total * 100
 *
 * Returns 0 when there are no reviews. Pending (not yet overdue) and
 * overdue reviews both count as "not completed" — only status==='completed'
 * counts. This is intentionally strict: auditors care about how many
 * reviews were actually closed, not how many are "in progress".
 */
export function computeReviewCompletionRate(
  reviews: readonly AccessReview[],
): number {
  if (reviews.length === 0) {
    return 0;
  }
  const completed = reviews.filter((r) => r.status === 'completed').length;
  return Math.round((completed / reviews.length) * 1000) / 10; // 1 decimal place
}

/**
 * Returns the count of reviews grouped by status.
 *
 * Useful for dashboard widgets ("12 pending, 3 overdue, 45 completed").
 */
export function getReviewStatusCounts(
  reviews: readonly AccessReview[],
): Readonly<Record<ReviewStatus, number>> {
  const counts: Record<ReviewStatus, number> = {
    pending: 0,
    completed: 0,
    overdue: 0,
  };
  for (const r of reviews) {
    counts[r.status] += 1;
  }
  return Object.freeze(counts);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function parseStrict(iso: string): number | null {
  if (typeof iso !== 'string' || iso.trim() === '') {
    return null;
  }
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}
