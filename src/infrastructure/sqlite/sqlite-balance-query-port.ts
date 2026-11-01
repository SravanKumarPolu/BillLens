/**
 * SqliteBalanceQueryPort — concrete implementation of BalanceQueryPort.
 *
 * Loads all expenses, payers, splits, settlements, and members for a
 * group from the local SQLite database in a single round trip.
 *
 * The query uses simple SELECT statements joined in TypeScript (the
 * in-memory database doesn't support JOINs). The production
 * expo-sqlite implementation would use SQL JOINs.
 */

import type { BalanceQueryPort, BalanceQueryResult } from '@application/balances/balance-query.port';
import type { Expense } from '@domain/entities/expense';
import type { ExpensePayer } from '@domain/entities/expense-payer';
import type { ExpenseSplit } from '@domain/entities/expense-split';
import type { GroupMember } from '@domain/entities/group-member';
import type { Settlement } from '@domain/entities/settlement';
import type { GroupId, MemberId } from '@shared-types/index';

import type { DatabaseConnection, SqlRow } from '../sqlite/database-connection';

export class SqliteBalanceQueryPort implements BalanceQueryPort {
  constructor(private readonly db: DatabaseConnection) {}

  async loadGroupBalanceInput(
    groupId: GroupId,
  ): Promise<BalanceQueryResult | null> {
    const gid = groupId as string;

    // Load active members
    const memberRows = await this.db.all<SqlRow>(
      `select * from group_members where group_id = ? and left_at is null order by joined_at asc`,
      [gid],
    );
    if (memberRows.length === 0) return null;

    const members: GroupMember[] = memberRows.map(this.rowToMember);

    // Load active expenses
    const expenseRows = await this.db.all<SqlRow>(
      `select * from expenses where group_id = ? and deleted_at is null order by expense_date desc`,
      [gid],
    );
    const expenses: Expense[] = expenseRows.map(this.rowToExpense);

    // Load payers for these expenses
    const expenseIds = expenses.map((e) => e.id as string);
    const payers: ExpensePayer[] = [];
    const splits: ExpenseSplit[] = [];
    for (const eid of expenseIds) {
      const payerRows = await this.db.all<SqlRow>(
        `select * from expense_payers where expense_id = ? and deleted_at is null`,
        [eid],
      );
      payers.push(...payerRows.map(this.rowToPayer));
      const splitRows = await this.db.all<SqlRow>(
        `select * from expense_splits where expense_id = ? and deleted_at is null`,
        [eid],
      );
      splits.push(...splitRows.map(this.rowToSplit));
    }

    // Load active settlements
    const settlementRows = await this.db.all<SqlRow>(
      `select * from settlements where group_id = ? and deleted_at is null order by settlement_date desc`,
      [gid],
    );
    const settlements: Settlement[] = settlementRows.map(this.rowToSettlement);

    return {
      members,
      expenses,
      payers,
      splits,
      settlements,
    };
  }

  private rowToMember(row: SqlRow): GroupMember {
    return {
      id: row['id'] as MemberId,
      groupId: row['group_id'] as never,
      ...(row['user_id'] !== null ? { userId: row['user_id'] as never } : {}),
      displayName: row['display_name'] as never,
      role: row['role'] as 'owner' | 'admin' | 'member',
      joinedAt: row['joined_at'] as never,
      updatedAt: row['updated_at'] as never,
      ...(row['left_at'] !== null ? { leftAt: row['left_at'] as never } : {}),
      version: row['version'] as never,
    };
  }

  private rowToExpense(row: SqlRow): Expense {
    return {
      id: row['id'] as never,
      groupId: row['group_id'] as never,
      title: row['title'] as string,
      amountMinor: row['amount_minor'] as number,
      currencyCode: row['currency_code'] as never,
      expenseDate: row['expense_date'] as never,
      splitType: row['split_type'] as never,
      createdBy: row['created_by'] as never,
      createdAt: row['created_at'] as never,
      updatedAt: row['updated_at'] as never,
      ...(row['deleted_at'] !== null ? { deletedAt: row['deleted_at'] as never } : {}),
      version: row['version'] as never,
    };
  }

  private rowToPayer(row: SqlRow): ExpensePayer {
    return {
      id: row['id'] as never,
      expenseId: row['expense_id'] as never,
      memberId: row['member_id'] as never,
      amountMinor: row['amount_minor'] as number,
      createdAt: (row['created_at'] ?? row['created_at'] ?? '') as never,
      updatedAt: (row['updated_at'] ?? row['updated_at'] ?? '') as never,
      ...(row['deleted_at'] !== null && row['deleted_at'] !== undefined
        ? { deletedAt: row['deleted_at'] as never }
        : {}),
      version: (row['version'] ?? 1) as never,
    };
  }

  private rowToSplit(row: SqlRow): ExpenseSplit {
    return {
      id: row['id'] as never,
      expenseId: row['expense_id'] as never,
      memberId: row['member_id'] as never,
      amountMinor: row['amount_minor'] as number,
      createdAt: (row['created_at'] ?? row['created_at'] ?? '') as never,
      updatedAt: (row['updated_at'] ?? row['updated_at'] ?? '') as never,
      ...(row['deleted_at'] !== null && row['deleted_at'] !== undefined
        ? { deletedAt: row['deleted_at'] as never }
        : {}),
      version: (row['version'] ?? 1) as never,
    };
  }

  private rowToSettlement(row: SqlRow): Settlement {
    return {
      id: row['id'] as never,
      groupId: row['group_id'] as never,
      fromMemberId: row['from_member_id'] as never,
      toMemberId: row['to_member_id'] as never,
      amountMinor: row['amount_minor'] as number,
      currencyCode: row['currency_code'] as never,
      method: row['method'] as never,
      settlementDate: row['settlement_date'] as never,
      ...(row['note'] !== null ? { note: row['note'] as string } : {}),
      createdBy: row['created_by'] as never,
      createdAt: row['created_at'] as never,
      updatedAt: row['updated_at'] as never,
      ...(row['deleted_at'] !== null ? { deletedAt: row['deleted_at'] as never } : {}),
      version: row['version'] as never,
      ...(row['reverses_settlement_id'] !== null
        ? { reversesSettlementId: row['reverses_settlement_id'] as never }
        : {}),
      ...(row['reversal_of_settlement_id'] !== null
        ? { reversalOfSettlementId: row['reversal_of_settlement_id'] as never }
        : {}),
      ...(row['status'] !== null ? { status: row['status'] as never } : {}),
      ...(row['confirmed_by_member_id'] !== null
        ? { confirmedByMemberId: row['confirmed_by_member_id'] as never }
        : {}),
      ...(row['confirmed_at'] !== null ? { confirmedAt: row['confirmed_at'] as never } : {}),
      ...(row['payment_reference_hash'] !== null
        ? { paymentReferenceHash: row['payment_reference_hash'] as string }
        : {}),
      ...(row['operation_id'] !== null ? { operationId: row['operation_id'] as string } : {}),
      ...(row['evidence_hash'] !== null ? { evidenceHash: row['evidence_hash'] as string } : {}),
      ...(row['dispute_reason'] !== null ? { disputeReason: row['dispute_reason'] as never } : {}),
      ...(row['dispute_note'] !== null ? { disputeNote: row['dispute_note'] as string } : {}),
    };
  }
}
