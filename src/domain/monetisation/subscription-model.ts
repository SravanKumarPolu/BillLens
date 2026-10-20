/**
 * Subscription lifecycle model.
 *
 * Phase 10 Prompt 98: Revenue and Monetisation.
 *
 * Tracks a user's subscription state: plan tier, billing cycle,
 * current period boundaries, trial status, cancellation flags, and
 * seat count (for team/enterprise).
 *
 * This module is PURE: it computes lifecycle states from a snapshot.
 * No I/O, no payment provider calls. The actual billing integration
 * (Stripe, Razorpay, Apple IAP, Google Play) lives in the application
 * layer.
 *
 * See `docs/revenue-monetisation.md`.
 */

import type { BillingCycle, PlanTier } from './plan-model';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'expired'
  | 'paused';

export interface Subscription {
  /** Stable unique identifier. */
  readonly id: string;
  /** Owning user ID. */
  readonly userId: string;
  /** Current plan tier. */
  readonly planTier: PlanTier;
  /** Billing cycle. */
  readonly billingCycle: BillingCycle;
  /** Current lifecycle status. */
  readonly status: SubscriptionStatus;
  /** ISO date when the current billing period started. */
  readonly currentPeriodStart: string;
  /** ISO date when the current billing period ends (renewal date). */
  readonly currentPeriodEnd: string;
  /** ISO date when the trial ends (optional, only for trialing). */
  readonly trialEnd?: string;
  /** Whether the subscription is set to cancel at period end. */
  readonly cancelAtPeriodEnd: boolean;
  /** Number of seats (for team/enterprise; 1 for free/premium). */
  readonly seats: number;
  /** ISO date when the subscription was created. */
  readonly createdAt: string;
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when the subscription is "active" for billing purposes.
 *
 * A subscription is active when:
 *   - status is 'trialing' or 'active', AND
 *   - the current period has not ended (currentPeriodEnd > now), AND
 *   - cancelAtPeriodEnd is false (or the period has not ended yet)
 *
 * A subscription set to cancel at period end is STILL active until the
 * period ends — the user retains access until then.
 */
export function isSubscriptionActive(sub: Subscription, now: string): boolean {
  if (sub.status !== 'trialing' && sub.status !== 'active') {
    return false;
  }
  const nowMs = parseStrict(now);
  const endMs = parseStrict(sub.currentPeriodEnd);
  if (nowMs === null || endMs === null) {
    return false;
  }
  return nowMs < endMs;
}

/**
 * Returns true when the subscription is in trial.
 *
 * A subscription is in trial when:
 *   - status === 'trialing', AND
 *   - trialEnd is set and in the future (now < trialEnd)
 *
 * If the trial end date has passed (even if status hasn't been
 * updated yet), this returns false.
 */
export function isInTrial(sub: Subscription, now: string): boolean {
  if (sub.status !== 'trialing') {
    return false;
  }
  if (sub.trialEnd === undefined) {
    return false;
  }
  const nowMs = parseStrict(now);
  const trialEndMs = parseStrict(sub.trialEnd);
  if (nowMs === null || trialEndMs === null) {
    return false;
  }
  return nowMs < trialEndMs;
}

/**
 * Returns true when the subscription is past due (payment failed but
 * grace period not yet expired).
 *
 * The application layer typically grants a 7-day grace period during
 * which the user retains access. After the grace period, the
 * subscription transitions to 'expired' or 'canceled'.
 */
export function isPastDue(sub: Subscription): boolean {
  return sub.status === 'past_due';
}

/**
 * Returns the number of days until the subscription renews.
 *
 * Returns:
 *   - Positive number when renewal is in the future.
 *   - 0 when renewal is today.
 *   - Negative number when renewal is in the past (overdue).
 *   - 0 when subscription is canceled/expired/paused (no renewal).
 *
 * Rounds DOWN to the nearest day.
 */
export function getDaysUntilRenewal(sub: Subscription, now: string): number {
  if (
    sub.status === 'canceled' ||
    sub.status === 'expired' ||
    sub.status === 'paused'
  ) {
    return 0;
  }
  const nowMs = parseStrict(now);
  const endMs = parseStrict(sub.currentPeriodEnd);
  if (nowMs === null || endMs === null) {
    return 0;
  }
  const msPerDay = 24 * 60 * 60 * 1000;
  const diffMs = endMs - nowMs;
  return Math.floor(diffMs / msPerDay);
}

/**
 * Returns true when the subscription will cancel at period end.
 *
 * This is the same as `sub.cancelAtPeriodEnd` but also requires the
 * subscription to still be active (a canceled subscription can't
 * "cancel at period end" — it's already canceled).
 */
export function isPendingCancellation(
  sub: Subscription,
  now: string,
): boolean {
  if (!isSubscriptionActive(sub, now)) {
    return false;
  }
  return sub.cancelAtPeriodEnd;
}

/**
 * Returns the seat utilization ratio (seats used / seats total).
 *
 * The application layer tracks how many seats are occupied. This
 * helper computes the utilization — 1.0 means all seats are taken,
 * 0.0 means none are. Useful for upgrade prompts ("you're at 80%
 * seat capacity — consider adding seats").
 */
export function getSeatUtilization(
  sub: Subscription,
  seatsUsed: number,
): number {
  if (sub.seats <= 0) {
    return 0;
  }
  if (seatsUsed < 0) {
    return 0;
  }
  return Math.min(seatsUsed / sub.seats, 1);
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
