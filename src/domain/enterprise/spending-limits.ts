/**
 * Spending limits — period-scoped spend caps.
 *
 * Phase 10 Prompt 92: Enterprise Features.
 *
 * CRITICAL FINANCIAL SAFETY: spending limits are EVALUATIVE only —
 * they return `{ exceeded, remaining, action }`. They do NOT mutate
 * the expense, alter splits, or block settlements. The application
 * layer is responsible for acting on the returned `action`.
 *
 * See `docs/enterprise-features.md` and `docs/money-and-rounding.md`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SpendingScope =
  | 'org'
  | 'department'
  | 'cost_centre'
  | 'user';

export type SpendingPeriod =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'yearly';

export type SpendingAction = 'block' | 'warn' | 'require_approval';

export interface SpendingLimit {
  readonly orgId: string;
  readonly scope: SpendingScope;
  /** ID of the org/department/cost-centre/user this limit applies to. */
  readonly scopeId: string;
  readonly period: SpendingPeriod;
  readonly limitMinor: number;
  readonly currencyCode: string;
  readonly action: SpendingAction;
}

export interface SpendingLimitCheck {
  readonly exceeded: boolean;
  /** Remaining capacity in minor units (0 when exceeded; can be negative
   *  if currentSpend > limit). */
  readonly remaining: number;
  readonly action: SpendingAction;
  readonly utilisationPercent: number;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Checks current spend against a single limit.
 *
 * - exceeded=true when currentSpend > limitMinor
 * - remaining = limitMinor - currentSpend (can be negative)
 * - utilisationPercent = (currentSpend / limitMinor) * 100, clamped to >= 0
 * - action = the limit's configured action when exceeded, else 'allow'
 *   is returned via the `action` field equal to the limit's action
 *   property (NOT changed to 'allow' — callers should consult
 *   `exceeded` to decide whether to act).
 *
 * Inputs are in minor units (integers). We use Math.trunc to ensure
 * no floating-point leakage from callers.
 */
export function checkSpendingLimit(
  currentSpend: number,
  limit: SpendingLimit,
): SpendingLimitCheck {
  if (!Number.isFinite(currentSpend) || !Number.isFinite(limit.limitMinor)) {
    return {
      exceeded: false,
      remaining: limit.limitMinor,
      action: limit.action,
      utilisationPercent: 0,
    };
  }
  const safeCurrent = Math.trunc(currentSpend < 0 ? 0 : currentSpend);
  const safeLimit = Math.trunc(
    limit.limitMinor < 0 ? 0 : limit.limitMinor,
  );
  const remaining = safeLimit - safeCurrent;
  const exceeded = safeCurrent > safeLimit;
  const utilisation =
    safeLimit > 0 ? (safeCurrent / safeLimit) * 100 : exceeded ? 100 : 0;
  return {
    exceeded,
    remaining,
    action: limit.action,
    utilisationPercent: Math.round(utilisation * 100) / 100,
  };
}

/**
 * Returns the limit that is most exceeded (highest utilisation) from
 * a list. Ties broken by action severity (block > require_approval > warn).
 *
 * Returns null when the list is empty.
 */
export function getMostExceededLimit(
  currentSpend: number,
  limits: readonly SpendingLimit[],
): SpendingLimitCheck | null {
  if (limits.length === 0) {
    return null;
  }
  const checks = limits.map((l) => ({ limit: l, check: checkSpendingLimit(currentSpend, l) }));
  const severity: Record<SpendingAction, number> = {
    warn: 1,
    require_approval: 2,
    block: 3,
  };
  let best: { limit: SpendingLimit; check: SpendingLimitCheck } | null = null;
  for (const c of checks) {
    if (best === null) {
      best = c;
      continue;
    }
    if (c.check.exceeded && !best.check.exceeded) {
      best = c;
    } else if (c.check.exceeded === best.check.exceeded) {
      if (c.check.utilisationPercent > best.check.utilisationPercent) {
        best = c;
      } else if (
        c.check.utilisationPercent === best.check.utilisationPercent &&
        severity[c.limit.action] > severity[best.limit.action]
      ) {
        best = c;
      }
    }
  }
  return best!.check;
}

/**
 * Returns the start-of-period timestamp (ISO) for a given period,
 * computed from `now`. Used by the application layer to scope
 * spend-aggregation queries.
 */
export function getPeriodStart(
  period: SpendingPeriod,
  now: Date = new Date(),
): string {
  const d = new Date(now);
  switch (period) {
    case 'daily':
      d.setHours(0, 0, 0, 0);
      break;
    case 'weekly':
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - d.getDay());
      break;
    case 'monthly':
      d.setHours(0, 0, 0, 0);
      d.setDate(1);
      break;
    case 'quarterly':
      d.setHours(0, 0, 0, 0);
      d.setDate(1);
      d.setMonth(Math.floor(d.getMonth() / 3) * 3);
      break;
    case 'yearly':
      d.setHours(0, 0, 0, 0);
      d.setMonth(0, 1);
      break;
  }
  return d.toISOString();
}
