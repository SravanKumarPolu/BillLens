/**
 * Timezone handling — UTC ↔ user timezone conversions.
 *
 * Phase 10 Prompt 93: International Expansion.
 *
 * All timestamps in BillLens storage are UTC ISO strings. This module
 * converts UTC → the user's local timezone for display only — it never
 * mutates stored timestamps.
 *
 * The user's timezone is obtained from `Intl.DateTimeFormat().resolvedOptions().timeZone`,
 * which is supported in React Native and returns the IANA timezone of
 * the device (e.g. 'America/New_York').
 *
 * See `docs/international-expansion.md`.
 */

// ---------------------------------------------------------------------------
// User timezone
// ---------------------------------------------------------------------------

/**
 * Returns the device's IANA timezone (e.g. 'America/New_York').
 *
 * Falls back to 'UTC' when the platform does not expose the API
 * (should not happen on React Native ≥ 0.60, but defensive).
 *
 * This function is impure (reads from the runtime) — callers should
 * treat it as the entry point for "current user timezone".
 */
export function getUserTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (typeof tz === 'string' && tz.length > 0) {
      return tz;
    }
  } catch {
    // fall through
  }
  return 'UTC';
}

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

/**
 * Converts a UTC ISO string into the user's timezone and returns
 * the result as an ISO string with the timezone offset applied.
 *
 * Example:
 *   convertToUserTimezone('2026-01-01T12:00:00.000Z', 'America/New_York')
 *   → '2026-01-01T07:00:00.000-05:00'
 *
 * Returns the original string on parse failure.
 */
export function convertToUserTimezone(
  utcTime: string,
  userTimezone: string,
): string {
  const t = Date.parse(utcTime);
  if (!Number.isFinite(t)) {
    return utcTime;
  }
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: userTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZoneName: 'shortOffset',
    });
    const parts = dtf.formatToParts(new Date(t));
    const get = (type: string): string => {
      const p = parts.find((x) => x.type === type);
      return p ? p.value : '';
    };
    const year = get('year');
    const month = get('month');
    const day = get('day');
    const hour = get('hour') === '24' ? '00' : get('hour');
    const minute = get('minute');
    const second = get('second');
    const offset = get('timeZoneName');
    if (!year || !month || !day || !hour || !minute || !second) {
      return utcTime;
    }
    // Normalise offset: Intl returns 'GMT-5' or 'GMT' — convert to ±HH:MM.
    const normalisedOffset = normaliseOffset(offset);
    return `${year}-${month}-${day}T${hour}:${minute}:${second}.000${normalisedOffset}`;
  } catch {
    return utcTime;
  }
}

/**
 * Formats a UTC ISO time in the given timezone using a simple format
 * string. The format string supports these tokens:
 *   YYYY — 4-digit year
 *   MM   — 2-digit month
 *   DD   — 2-digit day
 *   HH   — 2-digit hour (24h)
 *   mm   — 2-digit minute
 *   ss   — 2-digit second
 *
 * Example:
 *   formatInTimezone('2026-01-01T12:00:00.000Z', 'Asia/Kolkata', 'YYYY-MM-DD HH:mm')
 *   → '2026-01-01 17:30'
 *
 * Returns the original string on parse failure.
 */
export function formatInTimezone(
  time: string,
  timezone: string,
  format: string,
): string {
  const t = Date.parse(time);
  if (!Number.isFinite(t)) {
    return time;
  }
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const parts = dtf.formatToParts(new Date(t));
    const get = (type: string): string => {
      const p = parts.find((x) => x.type === type);
      return p ? p.value : '';
    };
    const hour = get('hour') === '24' ? '00' : get('hour');
    let result = format;
    result = result.replace('YYYY', get('year'));
    result = result.replace('MM', get('month'));
    result = result.replace('DD', get('day'));
    result = result.replace('HH', hour);
    result = result.replace('mm', get('minute'));
    result = result.replace('ss', get('second'));
    return result;
  } catch {
    return time;
  }
}

/**
 * Returns the timezone offset (in minutes) for the given timezone
 * at the given date. Positive offset means behind UTC (e.g. New York
 * at -300 minutes = UTC-5).
 *
 * Returns 0 when the timezone is unknown or the date is invalid.
 */
export function getTimezoneOffset(
  timezone: string,
  date: string,
): number {
  const t = Date.parse(date);
  if (!Number.isFinite(t)) {
    return 0;
  }
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const parts = dtf.formatToParts(new Date(t));
    const get = (type: string): string => {
      const p = parts.find((x) => x.type === type);
      return p ? p.value : '';
    };
    const y = Number(get('year'));
    const mo = Number(get('month')) - 1;
    const d = Number(get('day'));
    const h = Number(get('hour') === '24' ? '0' : get('hour'));
    const mi = Number(get('minute'));
    const s = Number(get('second'));
    const asUTC = Date.UTC(y, mo, d, h, mi, s);
    return Math.round((asUTC - t) / 60_000);
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

/**
 * Normalises an Intl short-offset string ('GMT', 'GMT+0', 'GMT-5',
 * 'GMT+5:30', 'GMT+0530') into an ISO 8601 offset ('Z', '-05:00',
 * '+05:30').
 *
 * Returns 'Z' when the offset is zero (UTC) — this matches ISO 8601
 * convention and is what most consumers expect.
 */
function normaliseOffset(intlOffset: string): string {
  if (!intlOffset) {
    return 'Z';
  }
  const trimmed = intlOffset.trim();
  if (trimmed === 'GMT' || trimmed === 'UTC' || trimmed === 'GMT+0' || trimmed === 'GMT-0') {
    return 'Z';
  }
  // Accept both 'GMT+5:30' and 'GMT+530' and 'GMT+05:30'.
  const match = /^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(trimmed);
  if (!match) {
    return 'Z';
  }
  const sign = match[1]!;
  const hours = Number(match[2]);
  const minutes = match[3] ? Number(match[3]) : 0;
  if (hours === 0 && minutes === 0) {
    return 'Z';
  }
  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  return `${sign}${hh}:${mm}`;
}
