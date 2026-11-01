/**
 * Relative-time labels for lists (activity feed, drafts inbox).
 *
 * `Intl.RelativeTimeFormat` is an optional ECMA-402 API. Hermes ships only
 * `Intl.Collator`, `Intl.DateTimeFormat`, `Intl.NumberFormat` and
 * `getCanonicalLocales`; `RelativeTimeFormat`, `Segmenter` and `DisplayNames`
 * are absent, so `new Intl.RelativeTimeFormat(...)` throws
 * "undefined cannot be used as a constructor" on Android Hermes builds.
 *
 * Strategy:
 *   - Probe once per runtime through the cached constructor reference.
 *   - Format through Intl when the constructor exists and works.
 *   - Otherwise use the English fallback documented below. Calendar dates
 *     still follow the device locale through `Date.toLocaleDateString()`.
 *
 * Fallback wording (English only, matching the Intl `numeric: 'auto'` shape):
 *   "Just now" | "In a few seconds" | "N minute(s) ago" | "In N minute(s)"
 *   "N hour(s) ago" | "In N hour(s)" | "Yesterday" | "Tomorrow"
 *   "N days ago" | "In N days" | device-locale calendar date for older rows.
 *
 * The fallback is deliberately part of the supported product behaviour, not a
 * temporary shim: it keeps the activity feed readable on runtimes that cannot
 * provide translated relative strings.
 */

type RelativeTimeUnit = Intl.RelativeTimeFormatUnit;

/** A constructor compatible with `Intl.RelativeTimeFormat`. */
type RelativeTimeFormatConstructor = new (
  locales?: string | string[],
  options?: Intl.RelativeTimeFormatOptions,
) => Intl.RelativeTimeFormat;

const MINUTE_SECONDS = 60;
const HOUR_SECONDS = 3_600;
const DAY_MS = 86_400_000;
/** Days rendered as "N days ago"; older rows fall back to a calendar date. */
const RELATIVE_DAY_LIMIT = 6;

let cachedConstructor: RelativeTimeFormatConstructor | null = null;
let cachedFormatter: Intl.RelativeTimeFormat | null = null;

function resetFormatterCache(): void {
  cachedConstructor = null;
  cachedFormatter = null;
}

/**
 * Return a formatter for the current runtime, or `null` when the runtime has
 * no usable `Intl.RelativeTimeFormat`.
 *
 * The cache is keyed on the constructor itself: if the global is missing,
 * replaced or polyfilled later (as tests do), the stale formatter is dropped
 * instead of being reused.
 */
function resolveConstructor(): RelativeTimeFormatConstructor | null {
  try {
    if (typeof Intl === 'undefined') return null;
    const candidate = Intl.RelativeTimeFormat as unknown;
    return typeof candidate === 'function' ? (candidate as RelativeTimeFormatConstructor) : null;
  } catch {
    // A throwing/hostile getter must not reach the render path.
    return null;
  }
}

function getRelativeTimeFormatter(): Intl.RelativeTimeFormat | null {
  const constructor = resolveConstructor();
  if (constructor === null) {
    resetFormatterCache();
    return null;
  }
  if (cachedFormatter !== null && cachedConstructor === constructor) {
    return cachedFormatter;
  }
  resetFormatterCache();
  try {
    const formatter = new constructor(undefined, { numeric: 'auto' });
    cachedConstructor = constructor;
    cachedFormatter = formatter;
    return formatter;
  } catch {
    // Partial implementations can expose the constructor yet throw on use.
    return null;
  }
}

function formatRelativeUnit(value: number, unit: RelativeTimeUnit, fallback: string): string {
  const formatter = getRelativeTimeFormatter();
  if (formatter === null) return fallback;
  try {
    return formatter.format(value, unit);
  } catch {
    // A formatter that fails once is not trusted again; use the fallback.
    resetFormatterCache();
    return fallback;
  }
}

/** Local calendar day index, so DST shifts do not skew the day count. */
function calendarDayNumber(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS);
}

function formatCalendarDate(date: Date): string {
  try {
    return date.toLocaleDateString();
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function formatDayFallback(dayDifference: number): string {
  if (dayDifference === -1) return 'Yesterday';
  if (dayDifference === 1) return 'Tomorrow';
  const days = Math.abs(dayDifference);
  return dayDifference < 0 ? `${days} days ago` : `In ${days} days`;
}

function formatUnitFallback(value: number, unit: 'minute' | 'hour'): string {
  const quantity = Math.abs(value);
  const unitLabel = quantity === 1 ? unit : `${unit}s`;
  return value < 0 ? `${quantity} ${unitLabel} ago` : `In ${quantity} ${unitLabel}`;
}

/**
 * Format an already-validated timestamp. `now` and `then` are finite.
 */
function formatValidRelativeTime(then: Date, now: Date): string {
  const differenceSeconds = (then.getTime() - now.getTime()) / 1000;
  const absoluteSeconds = Math.abs(differenceSeconds);
  if (absoluteSeconds < MINUTE_SECONDS) {
    return differenceSeconds <= 0 ? 'Just now' : 'In a few seconds';
  }

  const dayDifference = calendarDayNumber(then) - calendarDayNumber(now);
  if (dayDifference !== 0) {
    // Older rows are easier to place on a calendar than to count in days.
    if (dayDifference < -RELATIVE_DAY_LIMIT) return formatCalendarDate(then);
    return formatRelativeUnit(dayDifference, 'day', formatDayFallback(dayDifference));
  }

  const direction = differenceSeconds < 0 ? -1 : 1;
  if (absoluteSeconds < HOUR_SECONDS) {
    const minutes = Math.max(1, Math.floor(absoluteSeconds / MINUTE_SECONDS));
    return formatRelativeUnit(
      direction * minutes,
      'minute',
      formatUnitFallback(direction * minutes, 'minute'),
    );
  }

  const hours = Math.max(1, Math.floor(absoluteSeconds / HOUR_SECONDS));
  return formatRelativeUnit(
    direction * hours,
    'hour',
    formatUnitFallback(direction * hours, 'hour'),
  );
}

/**
 * Format an ISO date-time as a compact relative label such as
 * "Just now", "5 minutes ago", "Yesterday" or "12 days ago".
 *
 * Invalid timestamps (or an invalid reference time) return an empty string so
 * one malformed activity row renders a blank label instead of crashing the
 * screen. The function never throws, whatever the runtime passes in.
 */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  try {
    // SQLite rows and deep links can hand us null/undefined despite the type.
    if (typeof iso !== 'string' || iso.trim() === '') return '';
    const then = new Date(iso);
    if (
      !Number.isFinite(then.getTime()) ||
      !(now instanceof Date) ||
      !Number.isFinite(now.getTime())
    ) {
      return '';
    }
    return formatValidRelativeTime(then, now);
  } catch {
    return '';
  }
}
