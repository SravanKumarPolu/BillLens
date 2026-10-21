/**
 * Recurring schedule arithmetic (date-only, UTC).
 *
 * Month-end is anchored to the template's start day: a series starting on
 * the 31st produces Feb 28/29 and then Mar 31, never "Mar 3". This matches
 * how rent/subscription dates are understood by users.
 */

export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface RecurrenceRule {
  readonly frequency: RecurrenceFrequency;
  /** Every N units; 1 = every day/week/month. */
  readonly intervalCount: number;
  /** First occurrence, inclusive, `YYYY-MM-DD`. */
  readonly startDate: string;
  /** Last occurrence, inclusive; undefined = open-ended. */
  readonly endDate?: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateOnly(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parse(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function format(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function validateRule(rule: RecurrenceRule): void {
  if (!isDateOnly(rule.startDate)) throw new Error('Start date must be YYYY-MM-DD.');
  if (rule.endDate !== undefined) {
    if (!isDateOnly(rule.endDate)) throw new Error('End date must be YYYY-MM-DD.');
    if (rule.endDate < rule.startDate) throw new Error('End date cannot be before the start date.');
  }
  if (!Number.isInteger(rule.intervalCount) || rule.intervalCount < 1 || rule.intervalCount > 365) {
    throw new Error('Repeat interval must be between 1 and 365.');
  }
}

/** The occurrence after `date`, preserving the anchor day for monthly rules. */
export function advanceOccurrence(
  date: string,
  rule: Pick<RecurrenceRule, 'frequency' | 'intervalCount' | 'startDate'>,
): string {
  const current = parse(date);
  switch (rule.frequency) {
    case 'daily': {
      current.setUTCDate(current.getUTCDate() + rule.intervalCount);
      return format(current);
    }
    case 'weekly': {
      current.setUTCDate(current.getUTCDate() + 7 * rule.intervalCount);
      return format(current);
    }
    case 'monthly':
    case 'yearly': {
      const anchorDay = parse(rule.startDate).getUTCDate();
      const months = rule.frequency === 'yearly' ? 12 : 1;
      const targetMonth = current.getUTCMonth() + months * rule.intervalCount;
      const year = current.getUTCFullYear() + Math.floor(targetMonth / 12);
      const month = ((targetMonth % 12) + 12) % 12;
      const day = Math.min(anchorDay, daysInMonth(year, month));
      return format(new Date(Date.UTC(year, month, day)));
    }
  }
}

/**
 * Dates that are due on/before `today`, starting at `nextDate`.
 * Bounded so a corrupt/old template cannot spawn an unbounded batch.
 */
export function dueOccurrences(
  nextDate: string,
  rule: RecurrenceRule,
  today: string,
  max = 50,
): readonly string[] {
  if (!isDateOnly(nextDate) || !isDateOnly(today)) return [];
  const out: string[] = [];
  let cursor = nextDate;
  while (cursor <= today && out.length < max) {
    if (rule.endDate !== undefined && cursor > rule.endDate) break;
    out.push(cursor);
    cursor = advanceOccurrence(cursor, rule);
  }
  return out;
}
