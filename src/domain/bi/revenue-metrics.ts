/**
 * Revenue metrics — privacy-safe revenue analytics.
 *
 * Phase 10 Prompt 95: Business Intelligence.
 *
 * CRITICAL PRIVACY CONSTRAINTS:
 *   - Revenue metrics use AGGREGATED data only. `RevenueSnapshot.payingUsers`
 *     is a COUNT of paying users — never a list of user ids or emails.
 *   - `arpu` (Average Revenue Per User) is a derived average — it does NOT
 *     leak individual payment amounts.
 *   - No payment instrument data (card BINs, UPI IDs, bank references)
 *     ever enters this module.
 *
 * This module is PURE: it computes snapshots from inputs; no I/O.
 *
 * See `docs/business-intelligence.md`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RevenueSnapshot {
  /** Period identifier, e.g. '2026-07'. */
  readonly period: string;
  /** Monthly Recurring Revenue (sum of active subscription prices). */
  readonly mrr: number;
  /** Annual Recurring Revenue (MRR * 12). */
  readonly arr: number;
  /** Average Revenue Per User (total revenue / total users). */
  readonly arpu: number;
  readonly payingUsers: number;
  readonly freeUsers: number;
  /**
   * Conversion rate (payingUsers / (payingUsers + freeUsers)).
   * Expressed as a fraction 0-1.
   */
  readonly conversionRate: number;
  /**
   * Churn rate (churned / startedWith). Expressed as a fraction 0-1.
   */
  readonly churnRate: number;
  /** Lifetime Value (arpu / churnRate, or infinity when churnRate=0). */
  readonly ltv: number;
}

export interface ActiveSubscription {
  readonly plan: string;
  /** Monthly price in major currency units (e.g. dollars, rupees). */
  readonly price: number;
}

// ---------------------------------------------------------------------------
// MRR
// ---------------------------------------------------------------------------

/**
 * Computes Monthly Recurring Revenue (MRR) from a list of active subscriptions.
 *
 * MRR is the sum of the monthly price of every active subscription. Annual
 * plans are normalised to monthly by dividing by 12 (the caller is
 * responsible for providing the per-month price — this function does NOT
 * know about plan cadence).
 *
 * Throws on a negative price.
 */
export function computeMrr(
  activeSubscriptions: readonly ActiveSubscription[],
): number {
  if (!Array.isArray(activeSubscriptions)) {
    throw new Error('activeSubscriptions must be an array');
  }
  let mrr = 0;
  for (const sub of activeSubscriptions) {
    if (!Number.isFinite(sub.price)) {
      throw new Error(`subscription price must be finite, got ${sub.price}`);
    }
    if (sub.price < 0) {
      throw new Error(`subscription price must be non-negative, got ${sub.price}`);
    }
    mrr += sub.price;
  }
  return mrr;
}

// ---------------------------------------------------------------------------
// Churn rate
// ---------------------------------------------------------------------------

/**
 * Computes the churn rate for a period.
 *
 *   churnRate = churned / startedWith
 *
 * Throws when `startedWith` is 0 (division by zero) or when `churned` is
 * greater than `startedWith` (impossible).
 *
 * The result is a fraction 0-1 (multiply by 100 for a percentage).
 */
export function computeChurnRate(startedWith: number, churned: number): number {
  if (!Number.isFinite(startedWith) || !Number.isFinite(churned)) {
    throw new Error(
      `startedWith and churned must be finite, got ${startedWith}, ${churned}`,
    );
  }
  if (!Number.isInteger(startedWith) || !Number.isInteger(churned)) {
    throw new Error(
      `startedWith and churned must be integers, got ${startedWith}, ${churned}`,
    );
  }
  if (startedWith <= 0) {
    throw new Error(`startedWith must be positive, got ${startedWith}`);
  }
  if (churned < 0) {
    throw new Error(`churned must be non-negative, got ${churned}`);
  }
  if (churned > startedWith) {
    throw new Error(
      `churned (${churned}) cannot exceed startedWith (${startedWith})`,
    );
  }
  return churned / startedWith;
}

// ---------------------------------------------------------------------------
// LTV
// ---------------------------------------------------------------------------

/**
 * Computes Lifetime Value (LTV) from ARPU and churn rate.
 *
 *   LTV = arpu / churnRate
 *
 * Returns `Number.POSITIVE_INFINITY` when `churnRate` is 0 (no churn →
 * infinite lifetime). The dashboard UI is responsible for displaying
 * this gracefully (e.g. "∞" or "N/A").
 *
 * Throws on a negative `arpu` or `churnRate`.
 */
export function computeLtv(arpu: number, churnRate: number): number {
  if (!Number.isFinite(arpu)) {
    throw new Error(`arpu must be finite, got ${arpu}`);
  }
  if (arpu < 0) {
    throw new Error(`arpu must be non-negative, got ${arpu}`);
  }
  if (!Number.isFinite(churnRate)) {
    throw new Error(`churnRate must be finite, got ${churnRate}`);
  }
  if (churnRate < 0) {
    throw new Error(`churnRate must be non-negative, got ${churnRate}`);
  }
  if (churnRate > 1) {
    throw new Error(`churnRate must be at most 1, got ${churnRate}`);
  }
  if (churnRate === 0) {
    return Number.POSITIVE_INFINITY;
  }
  return arpu / churnRate;
}

// ---------------------------------------------------------------------------
// ARPU + conversion rate
// ---------------------------------------------------------------------------

/**
 * Computes Average Revenue Per User (ARPU).
 *
 *   arpu = totalRevenue / totalUsers
 *
 * Returns 0 when `totalUsers` is 0.
 */
export function computeArpu(totalRevenue: number, totalUsers: number): number {
  if (!Number.isFinite(totalRevenue) || !Number.isFinite(totalUsers)) {
    throw new Error(
      `totalRevenue and totalUsers must be finite, got ${totalRevenue}, ${totalUsers}`,
    );
  }
  if (totalRevenue < 0) {
    throw new Error(`totalRevenue must be non-negative, got ${totalRevenue}`);
  }
  if (totalUsers < 0) {
    throw new Error(`totalUsers must be non-negative, got ${totalUsers}`);
  }
  if (totalUsers === 0) return 0;
  return totalRevenue / totalUsers;
}

/**
 * Computes the free-to-paid conversion rate.
 *
 *   conversionRate = payingUsers / (payingUsers + freeUsers)
 *
 * Returns 0 when there are no users at all.
 */
export function computeConversionRate(
  payingUsers: number,
  freeUsers: number,
): number {
  if (!Number.isFinite(payingUsers) || !Number.isFinite(freeUsers)) {
    throw new Error(
      `payingUsers and freeUsers must be finite, got ${payingUsers}, ${freeUsers}`,
    );
  }
  if (!Number.isInteger(payingUsers) || !Number.isInteger(freeUsers)) {
    throw new Error('payingUsers and freeUsers must be integers');
  }
  if (payingUsers < 0 || freeUsers < 0) {
    throw new Error('payingUsers and freeUsers must be non-negative');
  }
  const total = payingUsers + freeUsers;
  if (total === 0) return 0;
  return payingUsers / total;
}

// ---------------------------------------------------------------------------
// Snapshot construction
// ---------------------------------------------------------------------------

export interface RevenueSnapshotInput {
  readonly period: string;
  readonly activeSubscriptions: readonly ActiveSubscription[];
  readonly totalRevenue: number;
  readonly payingUsers: number;
  readonly freeUsers: number;
  readonly startedWith: number;
  readonly churned: number;
}

/**
 * Constructs a `RevenueSnapshot` from raw inputs. Computes MRR, ARR, ARPU,
 * conversionRate, churnRate, and LTV automatically.
 *
 * The snapshot is frozen and ready to render in the BI dashboard.
 */
export function createRevenueSnapshot(
  input: RevenueSnapshotInput,
): RevenueSnapshot {
  if (typeof input.period !== 'string' || input.period.length === 0) {
    throw new Error('period must be a non-empty string');
  }
  const mrr = computeMrr(input.activeSubscriptions);
  const arr = mrr * 12;
  const totalUsers = input.payingUsers + input.freeUsers;
  const arpu = computeArpu(input.totalRevenue, totalUsers);
  const conversionRate = computeConversionRate(input.payingUsers, input.freeUsers);
  const churnRate = computeChurnRate(input.startedWith, input.churned);
  const ltv = computeLtv(arpu, churnRate);
  return Object.freeze({
    period: input.period,
    mrr,
    arr,
    arpu,
    payingUsers: input.payingUsers,
    freeUsers: input.freeUsers,
    conversionRate,
    churnRate,
    ltv,
  });
}
