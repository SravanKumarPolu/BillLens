/**
 * SQLite-backed implementation of the `ExpenseRepository` contract —
 * the write side of the app's core financial record.
 *
 * ATOMICITY (the contract's headline requirement): `save()` persists
 * the expense row AND its full payers/splits set in ONE transaction.
 * The payers/splits arrays REPLACE whatever was stored before
 * (delete-then-insert of the dependent rows), matching the contract's
 * "full replacement" semantics. If any statement fails, the whole
 * aggregate write rolls back.
 *
 * Every mutation also enqueues an `expense` sync operation inside the
 * same transaction. The operation's payload is the complete aggregate
 * snapshot (expense + payers + splits), so the cloud worker can apply
 * the aggregate as a unit without dependency-ordering child rows.
 */


import type { Expense } from '@domain/entities/expense';
import type { ExpensePayer } from '@domain/entities/expense-payer';
import type { ExpenseSplit } from '@domain/entities/expense-split';
import type { ExpenseRepository } from '@domain/repositories/expense.repository';
import type {
  DeleteMetadata,
  PaginatedResult,
  Pagination,
  SoftDeleteResult,
} from '@domain/repositories/repository-contracts';
import { asDateTime, asVersionNumber } from '@domain/value-objects';
import type { DateTime } from '@domain/value-objects/date-time';
import type { ExpenseId, GroupId, MemberId, ReceiptId } from '@shared-types/index';

import type { DatabaseConnection, SqlRow } from './database-connection';
import { DatabaseError } from './database-connection';
import {
  mapExpensePayerRow,
  mapExpenseRow,
  mapExpenseSplitRow,
  paginateRows,
  parseOffsetCursor,
} from './row-mappers';
import { assertGroupWritableDb } from './group-write-guard';
import { enqueueSyncOpWithin, syncIdempotencyKey } from './sync-op-writer';

const EXPENSE_COLUMNS = `
  id, group_id, title, amount_minor, currency_code, expense_date,
  split_type, receipt_id, note, category, created_by, created_at,
  updated_at, deleted_at, version, line_items_json, item_charges_json
`;

export class SqliteExpenseRepository implements ExpenseRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async findById(id: ExpenseId): Promise<Expense | null> {
    const row = await this.db.get<SqlRow>(
      `select ${EXPENSE_COLUMNS} from expenses where id = ?`,
      [id],
    );
    return row ? mapExpenseRow(row) : null;
  }

  async listByGroup(groupId: GroupId, pagination: Pagination): Promise<PaginatedResult<Expense>> {
    const offset = parseOffsetCursor(pagination.cursor);
    const rows = await this.db.all<SqlRow>(
      `select ${EXPENSE_COLUMNS} from expenses
       where group_id = ? and deleted_at is null
       order by expense_date desc
       limit ? offset ?`,
      [groupId, pagination.limit + 1, offset],
    );
    return paginateRows(rows.map(mapExpenseRow), pagination.limit, offset);
  }

  async listUpdatedSince(
    groupId: GroupId,
    since: DateTime,
    pagination: Pagination,
  ): Promise<PaginatedResult<Expense>> {
    const offset = parseOffsetCursor(pagination.cursor);
    const rows = await this.db.all<SqlRow>(
      `select ${EXPENSE_COLUMNS} from expenses
       where group_id = ? and updated_at > ?
       order by updated_at asc
       limit ? offset ?`,
      [groupId, since as string, pagination.limit + 1, offset],
    );
    return paginateRows(rows.map(mapExpenseRow), pagination.limit, offset);
  }

  async listByReceipt(receiptId: ReceiptId): Promise<readonly Expense[]> {
    const rows = await this.db.all<SqlRow>(
      `select ${EXPENSE_COLUMNS} from expenses
       where receipt_id = ? and deleted_at is null
       order by expense_date desc`,
      [receiptId],
    );
    return rows.map(mapExpenseRow);
  }

  async listPayers(expenseId: ExpenseId): Promise<readonly ExpensePayer[]> {
    const rows = await this.db.all<SqlRow>(
      `select * from expense_payers where expense_id = ? and deleted_at is null`,
      [expenseId],
    );
    return rows.map((row) => mapExpensePayerRow(row, expenseId));
  }

  async listSplits(expenseId: ExpenseId): Promise<readonly ExpenseSplit[]> {
    const rows = await this.db.all<SqlRow>(
      `select * from expense_splits where expense_id = ? and deleted_at is null`,
      [expenseId],
    );
    return rows.map((row) => mapExpenseSplitRow(row, expenseId));
  }

  async save(
    expense: Expense,
    payers: readonly ExpensePayer[],
    splits: readonly ExpenseSplit[],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const existing = await tx.get<SqlRow>(`select id from expenses where id = ?`, [
        expense.id,
      ]);
      const isCreate = !existing;

      if (isCreate) {
        await tx.run(
          `insert into expenses (
             id, group_id, title, amount_minor, currency_code, expense_date,
             split_type, receipt_id, note, category, created_by, created_at,
             updated_at, deleted_at, version, last_modified_by,
             client_created_at, client_updated_at, line_items_json, item_charges_json
           ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            expense.id,
            expense.groupId,
            expense.title,
            expense.amountMinor,
            expense.currencyCode,
            expense.expenseDate as string,
            expense.splitType,
            expense.receiptId ?? null,
            expense.note ?? null,
            expense.category ?? null,
            expense.createdBy,
            expense.createdAt as string,
            expense.updatedAt as string,
            expense.deletedAt ? (expense.deletedAt as string) : null,
            expense.version as number,
            expense.createdBy,
            expense.createdAt as string,
            expense.updatedAt as string,
            expense.lineItems !== undefined ? JSON.stringify(expense.lineItems) : null,
            expense.itemCharges !== undefined ? JSON.stringify(expense.itemCharges) : null,
          ],
        );
      } else {
        await tx.run(
          `update expenses set
             group_id = ?, title = ?, amount_minor = ?, currency_code = ?,
             expense_date = ?, split_type = ?, receipt_id = ?, note = ?,
             category = ?, created_by = ?, created_at = ?, updated_at = ?,
             deleted_at = ?, version = ?, line_items_json = ?, item_charges_json = ?
           where id = ?`,
          [
            expense.groupId,
            expense.title,
            expense.amountMinor,
            expense.currencyCode,
            expense.expenseDate as string,
            expense.splitType,
            expense.receiptId ?? null,
            expense.note ?? null,
            expense.category ?? null,
            expense.createdBy,
            expense.createdAt as string,
            expense.updatedAt as string,
            expense.deletedAt ? (expense.deletedAt as string) : null,
            expense.version as number,
            expense.lineItems !== undefined ? JSON.stringify(expense.lineItems) : null,
            expense.itemCharges !== undefined ? JSON.stringify(expense.itemCharges) : null,
            expense.id,
          ],
        );
      }

      // Dependent rows are REPLACED wholesale (contract semantics), so a
      // hard delete of the old set precedes the fresh insert. The ON
      // DELETE CASCADE foreign keys keep orphan rows impossible.
      await tx.run(`delete from expense_payers where expense_id = ?`, [expense.id]);
      await tx.run(`delete from expense_splits where expense_id = ?`, [expense.id]);

      for (const payer of payers) {
        await tx.run(
          `insert into expense_payers (
             id, expense_id, member_id, amount_minor, deleted_at,
             created_at, updated_at, version, created_by, last_modified_by,
             client_created_at, client_updated_at
           ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            payer.id,
            payer.expenseId,
            payer.memberId,
            payer.amountMinor,
            payer.deletedAt ? (payer.deletedAt as string) : null,
            payer.createdAt as string,
            payer.updatedAt as string,
            payer.version as number,
            expense.createdBy,
            expense.createdBy,
            payer.createdAt as string,
            payer.updatedAt as string,
          ],
        );
      }

      for (const split of splits) {
        await tx.run(
          `insert into expense_splits (
             id, expense_id, member_id, amount_minor, percentage_basis_points,
             share_units, deleted_at, created_at, updated_at, version,
             created_by, last_modified_by, client_created_at, client_updated_at
           ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            split.id,
            split.expenseId,
            split.memberId,
            split.amountMinor,
            split.percentageBasisPoints ?? null,
            split.shareUnits ?? null,
            split.deletedAt ? (split.deletedAt as string) : null,
            split.createdAt as string,
            split.updatedAt as string,
            split.version as number,
            expense.createdBy,
            expense.createdBy,
            split.createdAt as string,
            split.updatedAt as string,
          ],
        );
      }

      await enqueueSyncOpWithin(tx, {
        entityType: 'expense',
        entityId: expense.id as string,
        operation: isCreate ? 'create' : 'update',
        payload: expenseAggregatePayload(expense, payers, splits),
        idempotencyKey: syncIdempotencyKey(
          'expense',
          expense.id as string,
          isCreate ? 'create' : 'update',
          expense.version as number,
        ),
        baseVersion: isCreate ? 0 : (expense.version as number) - 1,
        localVersion: expense.version as number,
      });
    });
  }

  async softDelete(id: ExpenseId, metadata: DeleteMetadata): Promise<SoftDeleteResult> {
    const existingExpense = await this.db.get<{ group_id: string }>(
      'select group_id from expenses where id = ?',
      [id],
    );
    if (existingExpense !== null) {
      await assertGroupWritableDb(this.db, existingExpense.group_id);
    }
    return this.db.transaction(async (tx) => {
      const row = await tx.get<SqlRow>(
        `select ${EXPENSE_COLUMNS} from expenses where id = ?`,
        [id],
      );
      if (!row) {
        throw new DatabaseError(`Expense ${id} not found`, { code: 'NOT_FOUND' });
      }
      const currentDeletedAt = row['deleted_at'] as string | null;
      if (currentDeletedAt) {
        // Idempotent replay.
        return {
          id: id as string,
          deletedAt: asDateTime(currentDeletedAt),
          version: asVersionNumber(row['version'] as number),
        };
      }
      const deletedAt = metadata.deletedAt;
      const newVersion = asVersionNumber((row['version'] as number) + 1);
      await tx.run(
        `update expenses set deleted_at = ?, updated_at = ?, version = ? where id = ?`,
        [deletedAt as string, deletedAt as string, newVersion as number, id],
      );
      await enqueueSyncOpWithin(tx, {
        entityType: 'expense',
        entityId: id as string,
        operation: 'delete',
        payload: { id, deletedAt, reason: metadata.reason ?? null },
        idempotencyKey: syncIdempotencyKey('expense', id as string, 'delete', newVersion as number),
        baseVersion: row['version'] as number,
        localVersion: newVersion as number,
      });
      return { id: id as string, deletedAt, version: newVersion };
    });
  }

  async countByPayer(payerId: MemberId): Promise<number> {
    // Two-step count keeps the SQL join-free (works identically on the
    // production engine and the in-memory test double): collect the
    // member's active payer rows, then count how many reference a
    // non-deleted expense.
    const payerRows = await this.db.all<SqlRow>(
      `select expense_id from expense_payers where member_id = ? and deleted_at is null`,
      [payerId],
    );
    const expenseIds = Array.from(
      new Set(payerRows.map((r) => r['expense_id'] as string).filter((v) => v !== null)),
    );
    if (expenseIds.length === 0) return 0;
    const placeholders = expenseIds.map(() => '?').join(', ');
    const row = await this.db.get<SqlRow>(
      `select count(*) as cnt from expenses where id in (${placeholders}) and deleted_at is null`,
      expenseIds,
    );
    return row ? (row['cnt'] as number) : 0;
  }
}

/** Cloud-upload payload: the complete aggregate as one unit. */
function expenseAggregatePayload(
  expense: Expense,
  payers: readonly ExpensePayer[],
  splits: readonly ExpenseSplit[],
): Record<string, unknown> {
  return {
    expense: {
      id: expense.id,
      group_id: expense.groupId,
      title: expense.title,
      amount_minor: expense.amountMinor,
      currency_code: expense.currencyCode,
      expense_date: expense.expenseDate,
      split_type: expense.splitType,
      receipt_id: expense.receiptId ?? null,
      note: expense.note ?? null,
      category: expense.category ?? null,
      created_by: expense.createdBy,
      created_at: expense.createdAt,
      updated_at: expense.updatedAt,
      deleted_at: expense.deletedAt ?? null,
      version: expense.version,
    },
    payers: payers.map((p) => ({
      id: p.id,
      expense_id: p.expenseId,
      member_id: p.memberId,
      amount_minor: p.amountMinor,
      version: p.version,
      // v2.6.0 COMPLETENESS FIX: client_created_at / client_updated_at
      // are NOT NULL without defaults in the cloud schema — the previous
      // partial child payloads failed every expense aggregate upload
      // (23502) after the main row landed, leaving the aggregate
      // half-synced. Values mirror this repository's child INSERTs.
      deleted_at: p.deletedAt ?? null,
      created_at: p.createdAt,
      updated_at: p.updatedAt,
      created_by: expense.createdBy,
      last_modified_by: expense.createdBy,
      client_created_at: p.createdAt,
      client_updated_at: p.updatedAt,
    })),
    splits: splits.map((s) => ({
      id: s.id,
      expense_id: s.expenseId,
      member_id: s.memberId,
      amount_minor: s.amountMinor,
      percentage_basis_points: s.percentageBasisPoints ?? null,
      share_units: s.shareUnits ?? null,
      version: s.version,
      deleted_at: s.deletedAt ?? null,
      created_at: s.createdAt,
      updated_at: s.updatedAt,
      created_by: expense.createdBy,
      last_modified_by: expense.createdBy,
      client_created_at: s.createdAt,
      client_updated_at: s.updatedAt,
    })),
  };
}
