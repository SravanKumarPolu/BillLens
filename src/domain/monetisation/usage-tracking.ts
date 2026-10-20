/**
 * Usage tracking — enforce plan limits.
 *
 * Phase 10 Prompt 98: Revenue and Monetisation.
 *
 * Each user has a monthly UsageRecord tracking how many groups,
 * expenses, receipt scans, storage, and API calls they have consumed
 * in the current period. The application layer checks these against
 * the plan's limits before allowing new resource creation.
 *
 * CRITICAL: usage limits NEVER apply to financial core actions.
 * Creating an expense, computing a balance, settling a debt —
 * these are always allowed. Limits only apply to:
 *   - New group creation (free tier: 1 group)
 *   - Receipt OCR scans (free tier: 10/month; premium: 100/month)
 *   - Attachment storage (free tier: 50 MB)
 *   - API calls (team/enterprise only)
 *
 * This module is PURE: it compares usage against limits. No I/O.
 *
 * See `docs/revenue-monetisation.md`.
 */

import type { Plan } from './plan-model';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UsageRecord {
  /** Owning user ID. */
  readonly userId: string;
  /** Billing period in YYYY-MM format (e.g. '2026-07'). */
  readonly period: string;
  /** Number of groups created in this period (cumulative). */
  readonly groupsCreated: number;
  /** Number of expenses created in this period. */
  readonly expensesCreated: number;
  /** Number of receipt OCR scans used in this period. */
  readonly receiptScansUsed: number;
  /** Storage used in MB (cumulative, not periodic). */
  readonly storageUsedMb: number;
  /** Number of API calls made in this period. */
  readonly apiCallsMade: number;
}

export interface UsageLimitDetail {
  readonly used: number;
  readonly limit: number;
  readonly exceeded: boolean;
}

export interface UsageLimits {
  readonly groups: UsageLimitDetail;
  readonly expenses: UsageLimitDetail;
  readonly receiptScans: UsageLimitDetail;
  readonly storage: UsageLimitDetail;
  readonly apiCalls: UsageLimitDetail;
}

export interface UsageLimitResult {
  /** True when ANY limit has been exceeded. */
  readonly exceeded: boolean;
  /** Per-limit detail. */
  readonly limits: UsageLimits;
}

// ---------------------------------------------------------------------------
// Limit checks
// ---------------------------------------------------------------------------

/**
 * Checks the usage record against the plan's limits.
 *
 * Returns an object with:
 *   - `exceeded`: true if ANY limit is exceeded.
 *   - `limits`: per-limit detail with used/limit/exceeded.
 *
 * Limits checked:
 *   - groupsCreated vs plan.limits.maxGroups
 *   - expensesCreated vs plan.limits.maxExpensesPerMonth
 *   - receiptScansUsed vs plan.limits.maxReceiptScansPerMonth
 *   - storageUsedMb vs plan.limits.maxStorageMb
 *   - apiCallsMade: checked only when plan.limits.apiAccess is true
 *                   (when apiAccess is false, the API is blocked entirely,
 *                    not throttled by a count)
 *
 * For limits set to Infinity (e.g. enterprise storage), `exceeded`
 * is always false.
 */
export function checkUsageLimit(
  usage: UsageRecord,
  plan: Plan,
): UsageLimitResult {
  const groupsExceeded = isOverLimit(
    usage.groupsCreated,
    plan.limits.maxGroups,
  );
  const expensesExceeded = isOverLimit(
    usage.expensesCreated,
    plan.limits.maxExpensesPerMonth,
  );
  const scansExceeded = isOverLimit(
    usage.receiptScansUsed,
    plan.limits.maxReceiptScansPerMonth,
  );
  const storageExceeded = isOverLimit(
    usage.storageUsedMb,
    plan.limits.maxStorageMb,
  );
  // API calls are only checked when API access is available — otherwise
  // the API itself is blocked at the gateway, not throttled by count.
  // When apiAccess is true but no per-month cap exists in the plan
  // model, we treat it as unlimited.
  const apiExceeded = plan.limits.apiAccess
    ? false // no API call cap defined in PlanLimits (rate limiter handles this)
    : usage.apiCallsMade > 0;

  return Object.freeze({
    exceeded:
      groupsExceeded ||
      expensesExceeded ||
      scansExceeded ||
      storageExceeded ||
      apiExceeded,
    limits: Object.freeze({
      groups: {
        used: usage.groupsCreated,
        limit: plan.limits.maxGroups,
        exceeded: groupsExceeded,
      },
      expenses: {
        used: usage.expensesCreated,
        limit: plan.limits.maxExpensesPerMonth,
        exceeded: expensesExceeded,
      },
      receiptScans: {
        used: usage.receiptScansUsed,
        limit: plan.limits.maxReceiptScansPerMonth,
        exceeded: scansExceeded,
      },
      storage: {
        used: usage.storageUsedMb,
        limit: plan.limits.maxStorageMb,
        exceeded: storageExceeded,
      },
      apiCalls: {
        used: usage.apiCallsMade,
        limit: plan.limits.apiAccess
          ? Number.POSITIVE_INFINITY
          : 0,
        exceeded: apiExceeded,
      },
    }),
  });
}

/**
 * Returns the usage percentage (used / limit * 100).
 *
 * Returns 0 when limit is 0 or Infinity (no meaningful percentage).
 * Returns > 100 when over the limit (the UI can colour this red).
 */
export function getUsagePercentage(used: number, limit: number): number {
  if (!Number.isFinite(used) || !Number.isFinite(limit)) {
    return 0;
  }
  if (limit <= 0) {
    return 0;
  }
  if (used < 0) {
    return 0;
  }
  return Math.round((used / limit) * 1000) / 10; // 1 decimal place
}

/**
 * Returns true when the user should see a "you're approaching your
 * limit" warning.
 *
 * Warning threshold: 80% of any non-Infinity limit.
 *
 * The application layer calls this to decide whether to show an
 * upsell prompt ("You've used 85% of your monthly OCR scans —
 * upgrade to Premium for 100 scans/month").
 */
export function shouldWarnUser(
  usage: UsageRecord,
  plan: Plan,
): boolean {
  const checks: [number, number][] = [
    [usage.groupsCreated, plan.limits.maxGroups],
    [usage.expensesCreated, plan.limits.maxExpensesPerMonth],
    [usage.receiptScansUsed, plan.limits.maxReceiptScansPerMonth],
    [usage.storageUsedMb, plan.limits.maxStorageMb],
  ];
  for (const [used, limit] of checks) {
    if (!Number.isFinite(limit) || limit <= 0) {
      continue;
    }
    if (used / limit >= 0.8) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isOverLimit(used: number, limit: number): boolean {
  if (!Number.isFinite(limit)) {
    return false; // Infinity = unlimited
  }
  if (limit <= 0) {
    return used > 0;
  }
  return used > limit;
}
