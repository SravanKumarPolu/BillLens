/** SQLite adapter for recurring templates and occurrence receipts. */

import type {
  RecurringAllocation,
  RecurringExpense,
  RecurringExpenseRepository,
  RecurringOccurrence,
} from '@domain/repositories/recurring-expense.repository';
import type { RecurrenceFrequency } from '@domain/recurring/schedule';

import type { DatabaseConnection, SqlRow } from './database-connection';

function encode(allocations: readonly RecurringAllocation[]): string {
  return JSON.stringify(allocations);
}

function decode(value: unknown): readonly RecurringAllocation[] {
  if (typeof value !== 'string') return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      if (typeof entry !== 'object' || entry === null) return [];
      const record = entry as Record<string, unknown>;
      if (typeof record.memberId !== 'string' || typeof record.amountMinor !== 'number') return [];
      return [{ memberId: record.memberId, amountMinor: record.amountMinor }];
    });
  } catch {
    return [];
  }
}

function map(row: SqlRow): RecurringExpense {
  return {
    id: String(row.id),
    groupId: String(row.group_id),
    title: String(row.title),
    amountMinor: Number(row.amount_minor),
    currencyCode: String(row.currency_code),
    ...(typeof row.note === 'string' && row.note.length > 0 ? { note: row.note } : {}),
    payers: decode(row.payers_json),
    splits: decode(row.splits_json),
    frequency: String(row.frequency) as RecurrenceFrequency,
    intervalCount: Number(row.interval_count),
    startDate: String(row.start_date),
    ...(typeof row.end_date === 'string' ? { endDate: row.end_date } : {}),
    nextOccurrenceDate: String(row.next_occurrence_date),
    ...(typeof row.last_materialized_date === 'string'
      ? { lastMaterializedDate: row.last_materialized_date }
      : {}),
    paused: Number(row.paused) === 1,
    createdBy: String(row.created_by),
    createdAt: String(row.client_created_at ?? row.created_at),
    updatedAt: String(row.client_updated_at ?? row.updated_at),
    ...(typeof row.deleted_at === 'string' ? { deletedAt: row.deleted_at } : {}),
    version: Number(row.version),
  };
}

export class SqliteRecurringExpenseRepository implements RecurringExpenseRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async save(template: RecurringExpense): Promise<void> {
    await this.db.run(
      `insert into recurring_expenses (
         id, group_id, title, amount_minor, currency_code, note, payers_json, splits_json,
         frequency, interval_count, start_date, end_date, next_occurrence_date,
         last_materialized_date, paused, created_by, created_at, updated_at, deleted_at, version,
         client_created_at, client_updated_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       on conflict(id) do update set
         title = excluded.title,
         amount_minor = excluded.amount_minor,
         currency_code = excluded.currency_code,
         note = excluded.note,
         payers_json = excluded.payers_json,
         splits_json = excluded.splits_json,
         frequency = excluded.frequency,
         interval_count = excluded.interval_count,
         start_date = excluded.start_date,
         end_date = excluded.end_date,
         next_occurrence_date = excluded.next_occurrence_date,
         last_materialized_date = excluded.last_materialized_date,
         paused = excluded.paused,
         updated_at = excluded.updated_at,
         deleted_at = excluded.deleted_at,
         version = excluded.version,
         client_updated_at = excluded.client_updated_at`,
      [
        template.id,
        template.groupId,
        template.title,
        template.amountMinor,
        template.currencyCode,
        template.note ?? null,
        encode(template.payers),
        encode(template.splits),
        template.frequency,
        template.intervalCount,
        template.startDate,
        template.endDate ?? null,
        template.nextOccurrenceDate,
        template.lastMaterializedDate ?? null,
        template.paused ? 1 : 0,
        template.createdBy,
        template.createdAt,
        template.updatedAt,
        template.deletedAt ?? null,
        template.version,
        template.createdAt,
        template.updatedAt,
      ],
    );
  }

  async findById(id: string): Promise<RecurringExpense | null> {
    const row = await this.db.get<SqlRow>('select * from recurring_expenses where id = ?', [id]);
    return row ? map(row) : null;
  }

  async listByGroups(groupIds: readonly string[]): Promise<readonly RecurringExpense[]> {
    if (groupIds.length === 0) return [];
    const rows = await this.db.all<SqlRow>(
      `select * from recurring_expenses
       where deleted_at is null and group_id in (${groupIds.map(() => '?').join(', ')})
       order by paused asc, next_occurrence_date asc`,
      [...groupIds],
    );
    return rows.map(map);
  }

  async listDue(
    groupIds: readonly string[],
    today: string,
    limit: number,
  ): Promise<readonly RecurringExpense[]> {
    if (groupIds.length === 0) return [];
    const rows = await this.db.all<SqlRow>(
      `select * from recurring_expenses
       where deleted_at is null and paused = 0 and group_id in (${groupIds.map(() => '?').join(', ')})
         and next_occurrence_date <= ?
       order by next_occurrence_date asc
       limit ?`,
      [...groupIds, today, limit],
    );
    return rows.map(map);
  }

  async findOccurrence(
    recurringId: string,
    occurrenceDate: string,
  ): Promise<RecurringOccurrence | null> {
    const row = await this.db.get<SqlRow>(
      'select * from recurring_occurrences where recurring_id = ? and occurrence_date = ?',
      [recurringId, occurrenceDate],
    );
    return row
      ? {
          recurringId: String(row.recurring_id),
          occurrenceDate: String(row.occurrence_date),
          expenseId: String(row.expense_id),
          createdAt: String(row.created_at),
        }
      : null;
  }

  async recordOccurrence(occurrence: RecurringOccurrence): Promise<void> {
    await this.db.run(
      `insert or ignore into recurring_occurrences (recurring_id, occurrence_date, expense_id, created_at)
       values (?, ?, ?, ?)`,
      [occurrence.recurringId, occurrence.occurrenceDate, occurrence.expenseId, occurrence.createdAt],
    );
  }

  async setPaused(id: string, paused: boolean, now: string): Promise<void> {
    await this.db.run(
      'update recurring_expenses set paused = ?, updated_at = ?, client_updated_at = ?, version = version + 1 where id = ?',
      [paused ? 1 : 0, now, now, id],
    );
  }

  async softDelete(id: string, now: string): Promise<void> {
    await this.db.run(
      'update recurring_expenses set deleted_at = ?, updated_at = ?, client_updated_at = ?, version = version + 1 where id = ? and deleted_at is null',
      [now, now, now, id],
    );
  }
}
