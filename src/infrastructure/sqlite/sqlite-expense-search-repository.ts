/**
 * SQLite expense search adapter.
 *
 * Text matching is a case-insensitive LIKE over title/note/category. LIKE
 * wildcards in user input are escaped, so a literal `%` does not match
 * everything. Group ids are always constrained, which keeps the
 * `idx_expenses_group_date` index in play for the common date filters.
 */

import type {
  ExpenseSearchCriteria,
  ExpenseSearchRepository,
  ExpenseSearchResult,
} from '@domain/repositories/expense-search.repository';

import type { DatabaseConnection, SqlRow } from './database-connection';
import { mapExpenseRow } from './row-mappers';

const COLUMNS = `
  e.id, e.group_id, e.title, e.amount_minor, e.currency_code, e.expense_date,
  e.split_type, e.receipt_id, e.note, e.category, e.created_by, e.created_at,
  e.updated_at, e.deleted_at, e.version
`;

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export class SqliteExpenseSearchRepository implements ExpenseSearchRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async search(criteria: ExpenseSearchCriteria): Promise<ExpenseSearchResult> {
    if (criteria.groupIds.length === 0) return { hits: [], hasMore: false };

    const conditions: string[] = ['e.deleted_at is null'];
    const params: (string | number)[] = [];

    conditions.push(`e.group_id in (${criteria.groupIds.map(() => '?').join(', ')})`);
    params.push(...criteria.groupIds);

    if (criteria.text !== undefined) {
      const pattern = `%${escapeLike(criteria.text)}%`;
      conditions.push(
        `(e.title like ? escape '\\' or ifnull(e.note, '') like ? escape '\\' or ifnull(e.category, '') like ? escape '\\')`,
      );
      params.push(pattern, pattern, pattern);
    }
    if (criteria.fromDate !== undefined) {
      conditions.push('e.expense_date >= ?');
      params.push(criteria.fromDate);
    }
    if (criteria.toDate !== undefined) {
      conditions.push('e.expense_date <= ?');
      params.push(criteria.toDate);
    }
    if (criteria.minAmountMinor !== undefined) {
      conditions.push('e.amount_minor >= ?');
      params.push(criteria.minAmountMinor);
    }
    if (criteria.maxAmountMinor !== undefined) {
      conditions.push('e.amount_minor <= ?');
      params.push(criteria.maxAmountMinor);
    }

    const rows = await this.db.all<SqlRow>(
      `select ${COLUMNS}, g.name as group_name
       from expenses e
       join groups g on g.id = e.group_id
       where ${conditions.join(' and ')}
       order by e.expense_date desc, e.created_at desc
       limit ? offset ?`,
      [...params, criteria.limit + 1, criteria.offset],
    );

    const hasMore = rows.length > criteria.limit;
    const page = hasMore ? rows.slice(0, criteria.limit) : rows;
    return {
      hits: page.map((row) => ({
        expense: mapExpenseRow(row),
        groupName: String(row.group_name ?? ''),
      })),
      hasMore,
    };
  }
}
