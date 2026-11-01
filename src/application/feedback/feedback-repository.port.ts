/**
 * Repository port for feedback persistence.
 *
 * Implementations MUST only persist already-redacted feedback bodies.
 * The use case redacts BEFORE calling the port; this port contract is
 * defense-in-depth.
 */

import type { Feedback } from '@domain/feedback';

export interface FeedbackRepository {
  /** Persist a feedback record. Idempotent by `id`. */
  save(feedback: Feedback): Promise<void>;

  /** Fetch a feedback record by id. Returns null if not found. */
  findById(id: string): Promise<Feedback | null>;

  /** Return the most recent NPS score submitted by the user, or null. */
  findLatestNpsScore(userId: string): Promise<number | null>;

  /** Return all NPS submissions for the user (used by dashboards). */
  findNpsSubmissions(userId: string, limit: number): Promise<readonly Feedback[]>;
}

/**
 * Port for recording that a review prompt was shown. The guard itself is
 * a pure function — it consults `lastPromptedAt` from the eligibility
 * input. This port lets the use case persist the new `lastPromptedAt`
 * after a successful prompt.
 */
export interface ReviewPromptLedger {
  /** Record that the user was prompted for a review at the given time. */
  recordPrompt(userId: string, promptedAt: string): Promise<void>;

  /** Read the last time the user was prompted for a review, or null. */
  getLastPromptedAt(userId: string): Promise<string | null>;
}
