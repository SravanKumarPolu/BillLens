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

import { getUserTimezone } from '../i18n/timezone-handler';

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
/**
 * Returns the UTC instant (ISO string) at which the current period of
 * `period` began.
 *
 * Period boundaries are CALENDAR boundaries in the user's timezone, not
 * UTC boundaries: a "monthly" limit for someone in Asia/Kolkata must
 * reset at their local midnight on the 1st, otherwise the reset lands at
 * 05:30 on the 1st and the last few hours of every month are counted
 * twice (or missed entirely). Pass `timeZone` explicitly to make the
 * result deterministic — tests and server-side policy evaluation should.
 *
 * Weeks start on Sunday, matching the historical behaviour of this
 * function.
 */
export function getPeriodStart(
  period: SpendingPeriod,
  now: Date = new Date(),
  timeZone: string = getUserTimezone(),
): string {
  const { year, month, day } = getZonedDateParts(now, timeZone);

  switch (period) {
    case 'daily':
      return startOfZonedDay(year, month, day, timeZone);
    case 'weekly': {
      // getUTCDay() on a UTC-midnight date is the weekday of that
      // calendar day, independent of the runtime timezone.
      const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
      const weekStart = new Date(Date.UTC(year, month - 1, day - weekday));
      return startOfZonedDay(
        weekStart.getUTCFullYear(),
        weekStart.getUTCMonth() + 1,
        weekStart.getUTCDate(),
        timeZone,
      );
    }
    case 'monthly':
      return startOfZonedDay(year, month, 1, timeZone);
    case 'quarterly':
      return startOfZonedDay(
        year,
        Math.floor((month - 1) / 3) * 3 + 1,
        1,
        timeZone,
      );
    case 'yearly':
      return startOfZonedDay(year, 1, 1, timeZone);
  }
}

// ---------------------------------------------------------------------------
// Timezone arithmetic
// ---------------------------------------------------------------------------

interface ZonedDateParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    // `hourCycle: 'h23'` avoids the "24:00" that some ICU versions emit
    // for midnight when `hour12: false` is used.
    hourCycle: 'h23',
  });
  formatterCache.set(timeZone, formatter);
  return formatter;
}

/**
 * Wall-clock components of `instant` in `timeZone`. Falls back to UTC
 * when the runtime does not know the zone (invalid IANA name).
 */
function getZonedDateParts(instant: Date, timeZone: string): ZonedDateParts {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = formatterFor(timeZone);
  } catch {
    formatter = formatterFor('UTC');
  }
  const parts = formatter.formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((p) => p.type === type);
    return part ? Number(part.value) : 0;
  };
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  };
}

/**
 * Offset (ms) of `timeZone` from UTC at the given instant: positive east
 * of Greenwich. Derived from the zone's own wall clock, so it is correct
 * across DST transitions without a timezone database of our own.
 */
function offsetMsAt(instantMs: number, timeZone: string): number {
  const whole = instantMs - (((instantMs % 1000) + 1000) % 1000);
  const p = getZonedDateParts(new Date(whole), timeZone);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asIfUtc - whole;
}

/**
 * UTC ISO instant of local midnight on the given calendar day in
 * `timeZone`.
 *
 * Two passes: the first resolves the offset using the naive guess, the
 * second re-checks it at the resolved instant so days that straddle a DST
 * change still land on the right boundary.
 */
function startOfZonedDay(
  year: number,
  month: number,
  day: number,
  timeZone: string,
): string {
  const naive = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  let resolved = naive - offsetMsAt(naive, timeZone);
  const corrected = naive - offsetMsAt(resolved, timeZone);
  if (corrected !== resolved) resolved = corrected;
  return new Date(resolved).toISOString();
}
