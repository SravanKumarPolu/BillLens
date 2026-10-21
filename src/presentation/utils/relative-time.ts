/**
 * Relative-time labels for lists (activity feed, drafts inbox).
 *
 * Uses `Intl.RelativeTimeFormat` so the wording follows the platform
 * locale instead of shipping English-only strings in every screen.
 */

const RELATIVE_TIME_UNITS: readonly {
  readonly unit: Intl.RelativeTimeFormatUnit;
  readonly seconds: number;
}[] = [
  { unit: 'year', seconds: 31_536_000 },
  { unit: 'month', seconds: 2_592_000 },
  { unit: 'week', seconds: 604_800 },
  { unit: 'day', seconds: 86_400 },
  { unit: 'hour', seconds: 3_600 },
  { unit: 'minute', seconds: 60 },
];

/**
 * Format an ISO date-time as a compact "2 hours ago" / "5 days ago" label.
 *
 * Falls back to "Just now" for anything less than a minute ago, and to
 * the raw ISO date for anything older than a year.
 */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const secondsAgo = Math.max(0, Math.floor((now.getTime() - then.getTime()) / 1000));
  if (secondsAgo < 60) return 'Just now';
  for (const { unit, seconds } of RELATIVE_TIME_UNITS) {
    if (secondsAgo >= seconds) {
      const value = Math.floor(secondsAgo / seconds);
      return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(-value, unit);
    }
  }
  return then.toISOString().slice(0, 10);
}
